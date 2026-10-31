/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

package org.apache.hugegraph.service.load;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.google.common.collect.ImmutableList;
import lombok.extern.log4j.Log4j2;
import org.apache.commons.io.FileUtils;
import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.GraphConnection;
import org.apache.hugegraph.entity.enums.JobStatus;
import org.apache.hugegraph.entity.enums.LoadStatus;
import org.apache.hugegraph.entity.load.EdgeMapping;
import org.apache.hugegraph.entity.load.FileMapping;
import org.apache.hugegraph.entity.load.FileSetting;
import org.apache.hugegraph.entity.load.JobManager;
import org.apache.hugegraph.entity.load.ListFormat;
import org.apache.hugegraph.entity.load.LoadParameter;
import org.apache.hugegraph.entity.load.LoadTask;
import org.apache.hugegraph.entity.load.VertexMapping;
import org.apache.hugegraph.entity.schema.EdgeLabelEntity;
import org.apache.hugegraph.entity.schema.VertexLabelEntity;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.exception.InternalException;
import org.apache.hugegraph.handler.LoadTaskExecutor;
import org.apache.hugegraph.loader.HugeGraphLoader;
import org.apache.hugegraph.loader.executor.LoadContext;
import org.apache.hugegraph.loader.executor.LoadOptions;
import org.apache.hugegraph.loader.mapping.InputStruct;
import org.apache.hugegraph.loader.mapping.LoadMapping;
import org.apache.hugegraph.loader.source.file.FileFormat;
import org.apache.hugegraph.loader.source.file.FileSource;
import org.apache.hugegraph.loader.util.MappingUtil;
import org.apache.hugegraph.loader.util.Printer;
import org.apache.hugegraph.mapper.load.JobManagerMapper;
import org.apache.hugegraph.mapper.load.FileMappingMapper;
import org.apache.hugegraph.mapper.load.LoadTaskMapper;
import org.apache.hugegraph.service.schema.EdgeLabelService;
import org.apache.hugegraph.service.schema.VertexLabelService;
import org.apache.hugegraph.util.Ex;
import org.apache.hugegraph.util.HubbleUtil;
import org.apache.hugegraph.util.PageUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.File;
import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Collections;
import java.util.Objects;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReadWriteLock;

import com.google.common.util.concurrent.Striped;
import java.util.concurrent.RejectedExecutionException;

import org.apache.commons.lang3.StringUtils;

@Log4j2
@Service
public class LoadTaskService {

    public static final String NO_ERROR_FILE_REASON =
            "For some reason, the error file was not generated. " +
            "Please check the log for details";

    @Autowired
    private LoadTaskMapper mapper;
    @Autowired
    private FileMappingMapper fileMappingMapper;
    @Autowired
    private JobManagerMapper jobManagerMapper;
    @Autowired
    private VertexLabelService vlService;
    @Autowired
    private EdgeLabelService elService;
    @Autowired
    private LoadTaskExecutor taskExecutor;
    @Autowired
    private HugeConfig config;
    @Autowired
    private PlatformTransactionManager transactionManager;


    private Map<Integer, LoadTask> runningTaskContainer;
    private final Object admissionLock = new Object();
    private final Set<AcceptedRun> acceptedRuns = new HashSet<>();
    private boolean closing;
    private final Striped<Lock> taskControls = Striped.lock(Runtime.getRuntime().availableProcessors() << 2);

    private final Striped<ReadWriteLock> jobControls =
            Striped.readWriteLock(Runtime.getRuntime().availableProcessors() << 2);

    TaskReservation reserveJob(int id) {
        return this.reserve(Collections.singletonList(this.jobControls.get(id).writeLock()));
    }

    TaskReservation reserveUpload(int id) {
        return this.reserve(Collections.singletonList(this.jobControls.get(id).readLock()));
    }

    TaskReservation reserveTasks(List<Integer> ids) {
        return this.reserve(this.taskControls, ids);
    }

    private TaskReservation reserve(Striped<Lock> controls, List<Integer> ids) {
        List<Lock> locks = new ArrayList<>();
        // Guava orders by stripe identity, including colliding task IDs.
        controls.bulkGet(ids).forEach(locks::add);
        return this.reserve(locks);
    }

    private TaskReservation reserve(List<Lock> locks) {
        int acquired = 0;
        try {
            for (Lock lock : locks) {
                lock.lock();
                acquired++;
            }
            return new TaskReservation(locks);
        } catch (RuntimeException | Error failure) {
            for (int i = acquired - 1; i >= 0; i--) {
                locks.get(i).unlock();
            }
            throw failure;
        }
    }

    public final class TaskReservation implements AutoCloseable {

        private final List<Lock> locks;
        private boolean closed;

        private TaskReservation(List<Lock> locks) {
            this.locks = locks;
        }

        private void unlock() {
            for (int i = this.locks.size() - 1; i >= 0; i--) {
                this.locks.get(i).unlock();
            }
        }

        @Override
        public void close() {
            if (this.closed) {
                return;
            }
            this.closed = true;
            if (TransactionSynchronizationManager.isActualTransactionActive() &&
                TransactionSynchronizationManager.isSynchronizationActive()) {
                try {
                    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                        @Override
                        public void afterCompletion(int status) {
                            unlock();
                        }
                    });
                    return;
                } catch (RuntimeException | Error failure) {
                    this.unlock();
                    throw failure;
                }
            }
            this.unlock();
        }
    }

    private void forgetRuntimeAfterCommit(int taskId, LoadTask retained) {
        Runnable forget = () -> {
            if (retained != null) {
                this.forgetRuntime(taskId, retained);
            }
        };
        if (TransactionSynchronizationManager.isActualTransactionActive() &&
            TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    forget.run();
                }
            });
        } else {
            forget.run();
        }
    }

    void ensureJobCleanupComplete(int jobId) {
        List<LoadTask> failures = new ArrayList<>();
        synchronized (this.admissionLock) {
            for (AcceptedRun run : this.acceptedRuns) {
                failures.add(run.task);
            }
        }
        failures.addAll(this.runningTaskContainer.values());
        for (LoadTask task : failures) {
            if (Objects.equals(task.getJobId(), jobId)) {
                Ex.check(!task.isCleanupFailed(),
                         "Task cleanup is incomplete; inspect graph mode and recover before deleting the job");
            }
        }
    }

    void ensureRuntimeCleanupComplete(int taskId) {
        LoadTask retained = this.runningTaskContainer.get(taskId);
        if (retained == null) {
            return;
        }
        retained.lock();
        try {
            Ex.check(retained.isFinished() && !retained.isCleanupFailed(),
                     "Task cleanup is incomplete; stop imports, inspect graph mode and recover before retrying");
        } finally {
            retained.unlock();
        }
    }

    public LoadTaskService() {
        this.runningTaskContainer = new ConcurrentHashMap<>();
    }

    public LoadTask get(int id) {
        return this.mapper.selectById(id);
    }

    public LoadTask get(String graphSpace, String graph, int jobId, int id) {
        QueryWrapper<LoadTask> query = Wrappers.query();
        query.eq("id", id)
             .eq("graphspace", graphSpace)
             .eq("graph", graph)
             .eq("job_id", jobId);
        return this.mapper.selectOne(query);
    }

    public List<LoadTask> listAll() {
        return this.mapper.selectList(null);
    }

    public IPage<LoadTask> list(String graphSpace, String graph, int jobId,
                                int pageNo, int pageSize) {
        QueryWrapper<LoadTask> query = Wrappers.query();
        query.eq("graphspace", graphSpace);
        query.eq("graph", graph);
        query.eq("job_id", jobId);
        query.orderByDesc("create_time");
        Page<LoadTask> page = new Page<>(pageNo,
                                         PageUtil.boundedSize(pageSize));
        return this.mapper.selectPage(page, query);
    }

    public List<LoadTask> list(String graphSpace, String graph, int jobId,
                               List<Integer> taskIds) {
        QueryWrapper<LoadTask> query = Wrappers.query();
        query.eq("graphspace", graphSpace)
             .eq("graph", graph)
             .eq("job_id", jobId)
             .in("id", taskIds);
        return this.mapper.selectList(query);
    }

    public int count() {
        return Math.toIntExact(this.mapper.selectCount(null));
    }

    public int taskCountByJob(int jobId) {
        QueryWrapper<LoadTask> query = Wrappers.query();
        query.eq("job_id", jobId);
        return Math.toIntExact(this.mapper.selectCount(query));
    }

    public List<LoadTask> taskListByJob(int jobId) {
        QueryWrapper<LoadTask> query = Wrappers.query();
        query.eq("job_id", jobId);
        return this.mapper.selectList(query);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void save(LoadTask entity) {
        Integer jobId = entity.getJobId();
        Ex.check(jobId != null, "Load task has no job id");
        try (TaskReservation reservation = this.reserveJob(jobId)) {
            this.ensureParentExists(jobId, entity.getGraphSpace(), entity.getGraph());
            this.insertTask(entity);
        }
    }

    private void ensureParentExists(int jobId, String graphSpace, String graph) {
        JobManager parent = this.jobManagerMapper.selectById(jobId);
        Ex.check(parent != null && Objects.equals(parent.getGraphSpace(), graphSpace) &&
                 Objects.equals(parent.getGraph(), graph), "job-manager.not-exist.id", jobId);
    }

    private void insertTask(LoadTask entity) {
        LoadOptions runtimeOptions = entity.getOptions();
        entity.setOptions(withoutCredentials(runtimeOptions));
        try {
            if (this.mapper.insert(entity) != 1) {
                throw new InternalException("entity.insert.failed");
            }
        } finally {
            entity.setOptions(runtimeOptions);
        }
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void update(LoadTask entity) {
        LoadOptions runtimeOptions = entity.getOptions();
        entity.setOptions(withoutCredentials(runtimeOptions));
        try {
            if (this.mapper.updateById(entity) != 1) {
                throw new InternalException("entity.update.failed");
            }
        } finally {
            entity.setOptions(runtimeOptions);
        }
    }

    private static LoadOptions withoutCredentials(LoadOptions options) {
        if (options == null) {
            return null;
        }
        try {
            LoadOptions persisted = (LoadOptions) options.clone();
            persisted.password = null;
            persisted.token = null;
            persisted.pdToken = null;
            persisted.trustStoreToken = null;
            return persisted;
        } catch (CloneNotSupportedException e) {
            throw new InternalException("Failed to prepare load task options",
                                        e);
        }
    }

    public void remove(int id) {
        try (TaskReservation reservation = this.reserveTasks(Collections.singletonList(id))) {
            this.checkCallbackWaitAllowed(id);
            LoadTask retained = this.runningTaskContainer.get(id);
            if (retained != null) {
                this.requestStopForDelete(retained);
            }
            this.awaitCallbacksForDelete(id);
            this.ensureRuntimeCleanupComplete(id);
            this.inDeleteTransaction(() -> {
                LoadTask task = this.get(id);
                if (task != null && (task.getStatus().inRunning() || task.getStatus() == LoadStatus.PAUSED)) {
                    this.stopForDelete(id);
                }
                if (this.mapper.deleteById(id) != 1) {
                    throw new InternalException("entity.delete.failed", id);
                }
                this.forgetRuntimeAfterCommit(id, retained);
            });
        }
    }

    private void inDeleteTransaction(Runnable action) {
        TransactionTemplate transaction = new TransactionTemplate(this.transactionManager);
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        transaction.executeWithoutResult(status -> action.run());
    }

    public List<LoadTask> batchTasks(int jobId) {
        QueryWrapper<LoadTask> query = Wrappers.query();
        query.eq("job_id", jobId);
        return this.mapper.selectList(query);
    }

    public LoadTask start(GraphConnection connection, FileMapping fileMapping,
                          HugeClient client) {
        synchronized (this.admissionLock) {
            this.checkAcceptingLoads();
        }
        Integer jobId = fileMapping.getJobId();
        Ex.check(jobId != null, "File mapping has no job id");
        try (TaskReservation reservation = this.reserveJob(jobId)) {
            this.ensureParentExists(jobId, connection.getGraphSpace(), connection.getGraph());
            Ex.check(Objects.equals(fileMapping.getGraphSpace(), connection.getGraphSpace()) &&
                     Objects.equals(fileMapping.getGraph(), connection.getGraph()),
                     "File mapping does not belong to the load task graph");
            FileMapping current = this.fileMappingMapper.selectById(fileMapping.getId());
            Ex.check(current != null && Objects.equals(current.getJobId(), jobId) &&
                     Objects.equals(current.getGraphSpace(), connection.getGraphSpace()) &&
                     Objects.equals(current.getGraph(), connection.getGraph()),
                     "File mapping does not belong to the load task job");
            synchronized (this.admissionLock) {
                this.checkAcceptingLoads();
                LoadTask task = this.buildLoadTask(connection, current, client);
                try {
                    this.insertTask(task);
                    this.executeAfterCommit(task);
                    return task;
                } catch (RuntimeException | Error failure) {
                    this.closeUnscheduled(task, failure);
                    throw failure;
                }
            }
        }
    }

    protected void executeAfterCommit(LoadTask task) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            this.executeSafely(task);
            return;
        }
        synchronized (this.admissionLock) {
            AcceptedRun run = this.accept(task);
            try {
                TransactionSynchronizationManager.registerSynchronization(
                        new TransactionSynchronization() {
                            @Override
                            public void afterCommit() {
                                dispatchCommitted(run);
                            }

                            @Override
                            public void afterCompletion(int status) {
                                if (status != STATUS_COMMITTED) {
                                    discardRolledBack(run);
                                }
                            }
                        });
            } catch (RuntimeException | Error failure) {
                this.release(run);
                this.forgetRuntime(task.getId(), task);
                throw failure;
            }
        }
    }

    private void executeSafely(LoadTask task) {
        try {
            this.execute(task);
        } catch (RuntimeException e) {
            // execute() already completed native cleanup and its failure marker.
            log.error("Failed to dispatch load task {}", task.getId(), e);
        }
    }

    private boolean markDispatchFailed(LoadTask task, Throwable cause) {
        log.error("Failed to dispatch load task {}, marking task and job " +
                  "as FAILED", task.getId(), cause);
        try {
            this.cleanupUnstarted(task);
        } catch (RuntimeException | Error cleanupFailure) {
            if (cause != cleanupFailure) {
                cause.addSuppressed(cleanupFailure);
            }
            log.warn("Failed to close undispatched load task {}", task.getId(), cleanupFailure);
        }
        task.setFinished(true);
        task.setStatus(LoadStatus.FAILED);
        if (task.isCleanupFailed()) {
            this.runningTaskContainer.putIfAbsent(task.getId(), task);
        } else {
            this.forgetRuntime(task.getId(), task);
        }

        try {
            TransactionTemplate transaction =
                    new TransactionTemplate(this.transactionManager);
            transaction.setPropagationBehavior(
                    TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            transaction.execute(status -> {
                int updated = this.mapper.update(
                        null, Wrappers.<LoadTask>update()
                                      .eq("id", task.getId())
                                      .set("load_status",
                                           LoadStatus.FAILED.getValue()));
                if (updated != 1) {
                    throw new InternalException("entity.update.failed", task);
                }
                if (task.getJobId() == null) {
                    return null;
                }
                JobManager job = this.jobManagerMapper.selectById(
                        task.getJobId());
                if (job == null) {
                    return null;
                }
                job.setJobStatus(JobStatus.FAILED);
                job.setUpdateTime(HubbleUtil.nowDate());
                if (this.jobManagerMapper.updateById(job) != 1) {
                    throw new InternalException("entity.update.failed", job);
                }
                return null;
            });
            // TransactionTemplate returns only after REQUIRES_NEW actually commits.
            return !task.isCleanupFailed();
        } catch (RuntimeException | Error e) {
            // The ingest transaction is already committed. Never turn a
            // dispatch failure into a retryable request failure.
            if (cause != e) {
                cause.addSuppressed(e);
            }
            log.error("Failed to persist dispatch failure for load task {}",
                      task.getId(), e);
            return false;
        }
    }

    private void execute(LoadTask task) {
        synchronized (this.admissionLock) {
            AcceptedRun run = this.accept(task);
            this.runningTaskContainer.put(task.getId(), task);
            try {
                this.taskExecutor.execute(task, () -> this.complete(run));
            } catch (RuntimeException | Error failure) {
                this.failDispatch(run, failure);
                throw failure;
            }
        }
    }

    private AcceptedRun accept(LoadTask task) {
        this.checkAcceptingLoads();
        AcceptedRun run = new AcceptedRun(task);
        this.acceptedRuns.add(run);
        return run;
    }

    private void cleanupUnstarted(LoadTask task) {
        task.lock();
        try {
            if (task.getLoader() != null) {
                try {
                    task.getLoader().shutdown();
                } catch (RuntimeException | Error failure) {
                    task.setCleanupFailed(true);
                    if (task.getCleanupFailure() == null) {
                        task.setCleanupFailure(failure);
                    }
                    throw failure;
                }
                // A repeated shutdown can return after context.close even when
                // an earlier owner release failed. Keep that recovery handle.
                if (!task.isCleanupFailed()) {
                    task.setLoader(null);
                }
            }
        } finally {
            task.unlock();
        }
    }

    private void updateAndExecute(LoadTask task) {
        try {
            this.update(task);
        } catch (RuntimeException | Error failure) {
            this.closeUnscheduled(task, failure);
            throw failure;
        }
        // Frontend resume/retry must preserve a synchronous dispatch failure.
        this.execute(task);
    }

    private void closeUnscheduled(LoadTask task, Throwable failure) {
        try {
            this.cleanupUnstarted(task);
        } catch (RuntimeException | Error cleanupFailure) {
            if (failure != cleanupFailure) {
                failure.addSuppressed(cleanupFailure);
            }
        } finally {
            task.setFinished(true);
        }
        if (!task.isCleanupFailed()) {
            // The persistence operation never admitted this run. Once its
            // native resources are closed, no shutdown responsibility remains.
            return;
        }
        task.setStatus(LoadStatus.FAILED);
        if (task.getId() != null) {
            this.runningTaskContainer.compute(task.getId(), (id, current) ->
                    current == null || (current.isFinished() && !current.isCleanupFailed()) ? task : current);
        }
        // A failed insert can have no id. Keep its unresolved native cleanup
        // in the same private ticket set without publishing a null map key.
        for (AcceptedRun accepted : this.acceptedRuns) {
            if (accepted.task == task) {
                return;
            }
        }
        AcceptedRun run = new AcceptedRun(task);
        run.completed.completeExceptionally(failure);
        this.acceptedRuns.add(run);
    }

    private void forgetRuntime(Integer taskId, LoadTask expected) {
        if (taskId != null) {
            this.runningTaskContainer.computeIfPresent(taskId, (id, current) -> current == expected ? null : current);
        }
    }

    private void discardRolledBack(AcceptedRun run) {
        try {
            this.cleanupUnstarted(run.task);
            run.task.setFinished(true);
            run.completed.complete(null);
        } catch (RuntimeException | Error failure) {
            run.task.setFinished(true);
            run.completed.completeExceptionally(failure);
            throw failure;
        } finally {
            this.forgetRuntime(run.task.getId(), run.task);
            this.release(run);
        }
    }

    private void dispatchCommitted(AcceptedRun run) {
        try {
            // This run was admitted before close. The pause hook keeps the
            // executor and metadata dependencies alive until its ticket ends.
            this.runningTaskContainer.put(run.task.getId(), run.task);
            this.taskExecutor.execute(run.task, () -> this.complete(run));
        } catch (RuntimeException | Error failure) {
            this.failDispatch(run, failure);
            if (failure instanceof Error) {
                throw (Error) failure;
            }
        }
    }

    private void failDispatch(AcceptedRun run, Throwable failure) {
        boolean resolved = false;
        try {
            resolved = this.markDispatchFailed(run.task, failure);
        } finally {
            if (resolved) {
                // The request still receives its dispatch error, but native
                // cleanup and its committed FAILED marker need no recovery.
                run.completed.complete(null);
            } else {
                run.completed.completeExceptionally(failure);
            }
            this.release(run);
        }
    }

    public LoadTask pause(int taskId) {
        try (TaskReservation reservation = this.reserveTasks(Collections.singletonList(taskId))) {
            /*
             * The in-memory container is not repopulated on startup, so a task
             * that was RUNNING before a restart is only visible in the database
             */
            LoadTask task = this.runningTaskContainer.get(taskId);
            boolean loading = task != null;
            if (!loading) {
                task = this.get(taskId);
            }
            Ex.check(task != null, "load.task.not-exist.id", taskId);
            Ex.check(task.getStatus() == LoadStatus.RUNNING,
                     "Can only pause the RUNNING task");
            // Mark status as paused, should set before context.stopLoading()
            task.setStatus(LoadStatus.PAUSED);
            if (loading) {
                // Let HugeGraphLoader stop
                task.stop();
            }

            task.lock();
            try {
                this.update(task);
                if (!task.isCleanupFailed()) {
                    this.forgetRuntime(taskId, task);
                }
            } finally {
                task.unlock();
            }
            return task;
        }
    }

    public LoadTask resume(int taskId, String token) {
        try (TaskReservation reservation = this.reserveTasks(Collections.singletonList(taskId))) {
            synchronized (this.admissionLock) {
                this.checkAcceptingLoads();
                this.ensureRuntimeCleanupComplete(taskId);
            }
            // A stopped native runner may still own its final metadata write.
            // Its callback does not take the task reservation; release admission
            // and the entity lock before joining, then read fresh state below.
            this.awaitTaskCallbacks(taskId);
            synchronized (this.admissionLock) {
                this.checkAcceptingLoads();
                this.ensureRuntimeCleanupComplete(taskId);
                LoadTask task = this.get(taskId);
                Ex.check(task != null, "load.task.not-exist.id", taskId);
                Ex.check(task.getStatus() == LoadStatus.PAUSED ||
                         task.getStatus() == LoadStatus.FAILED,
                         "Can only resume the PAUSED or FAILED task");
                task.lock();
                try {
                    // Set work mode in incrental mode, load from last breakpoint
                    task.getOptions().incrementalMode = true;
                    task.reconnect(token);
                    task.setStatus(LoadStatus.RUNNING);
                    this.updateAndExecute(task);
                } finally {
                    task.unlock();
                }
                return task;
            }
        }
    }

    public LoadTask stop(int taskId) {
        try (TaskReservation reservation = this.reserveTasks(Collections.singletonList(taskId))) {
            return this.stop(taskId, false);
        }
    }

    LoadTask stopForDelete(int taskId) {
        LoadTask retained = this.runningTaskContainer.get(taskId);
        if (retained != null) {
            this.requestStopForDelete(retained);
        }
        // Do not write the row while its callback still needs that same row.
        // Neither admission nor the task entity lock is held during this join.
        this.awaitCallbacksForDelete(taskId);
        if (retained != null && !retained.isFinished()) {
            // Retained work from callers predating ticket registration still
            // needs the native completion certificate before deletion.
            retained.stop();
        }
        return this.stop(taskId, true);
    }

    void requestJobStopForDelete(int jobId) {
        Set<LoadTask> tasks = Collections.newSetFromMap(new java.util.IdentityHashMap<>());
        synchronized (this.admissionLock) {
            for (AcceptedRun run : this.acceptedRuns) {
                if (Objects.equals(run.task.getJobId(), jobId)) {
                    tasks.add(run.task);
                }
            }
            for (LoadTask task : this.runningTaskContainer.values()) {
                if (Objects.equals(task.getJobId(), jobId)) {
                    tasks.add(task);
                }
            }
        }
        Throwable failure = null;
        for (LoadTask task : tasks) {
            try {
                this.requestStopForDelete(task);
            } catch (RuntimeException | Error stopFailure) {
                failure = collectFailure(failure, stopFailure);
            }
        }
        throwFailure(failure);
    }

    private void requestStopForDelete(LoadTask task) {
        task.lock();
        try {
            if (task.getStatus().inRunning() || task.getStatus() == LoadStatus.PAUSED) {
                task.setStatus(LoadStatus.STOPPED);
                if (task.getLoader() != null) {
                    task.context().stopLoading();
                }
            }
        } finally {
            task.unlock();
        }
    }

    void awaitCallbacksForDelete(int taskId) {
        this.awaitTaskCallbacks(taskId);
    }

    void checkCallbackWaitAllowed(int taskId) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            return;
        }
        synchronized (this.admissionLock) {
            for (AcceptedRun run : this.acceptedRuns) {
                Ex.check(!Objects.equals(run.task.getId(), taskId) || run.completed.isDone(),
                         "Task callbacks are still running; retry after the current transaction completes");
            }
        }
    }

    private void awaitTaskCallbacks(int taskId) {
        this.checkCallbackWaitAllowed(taskId);
        List<AcceptedRun> runs = new ArrayList<>();
        synchronized (this.admissionLock) {
            for (AcceptedRun run : this.acceptedRuns) {
                if (Objects.equals(run.task.getId(), taskId)) {
                    runs.add(run);
                }
            }
        }
        Throwable failure = null;
        for (AcceptedRun run : runs) {
            try {
                run.completed.join();
            } catch (CancellationException cancellation) {
                failure = collectFailure(failure, cancellation);
            } catch (CompletionException completion) {
                failure = collectFailure(failure, completion.getCause() == null ? completion : completion.getCause());
            }
        }
        throwFailure(failure);
    }

    private static void throwFailure(Throwable failure) {
        if (failure instanceof RuntimeException) {
            throw (RuntimeException) failure;
        }
        if (failure instanceof Error) {
            throw (Error) failure;
        }
        if (failure != null) {
            throw new CompletionException(failure);
        }
    }

    private LoadTask stop(int taskId, boolean deleting) {
        LoadTask task = this.runningTaskContainer.get(taskId);
        boolean loading = task != null;
        if (!loading) {
            task = this.get(taskId);
        }
        Ex.check(task != null, "load.task.not-exist.id", taskId);
        LoadStatus status;
        task.lock();
        try {
            status = task.getStatus();
            if (deleting && (status == LoadStatus.SUCCEED || status == LoadStatus.FAILED ||
                             status == LoadStatus.STOPPED)) {
                // Only a retained runtime task can certify completed cleanup.
                Ex.check(loading && task.isFinished() && !task.isCleanupFailed(),
                         "Task cleanup is not confirmed; check graph loading mode before deleting");
                return task;
            }
            if (!deleting && loading && status == LoadStatus.STOPPED &&
                task.isFinished() && !task.isCleanupFailed()) {
                // A failed deletion can roll metadata back after native stop.
                // Reuse that safe runtime; do not stop or close its Loader twice.
                LoadTask persisted = this.get(taskId);
                Ex.check(persisted != null &&
                         (persisted.getStatus() == LoadStatus.RUNNING ||
                          persisted.getStatus() == LoadStatus.PAUSED),
                         "Can only stop the RUNNING or PAUSED task");
                this.update(task);
                this.forgetRuntimeAfterCommit(taskId, task);
                return task;
            }
            Ex.check(status == LoadStatus.RUNNING || status == LoadStatus.PAUSED,
                     "Can only stop the RUNNING or PAUSED task");
            task.setStatus(LoadStatus.STOPPED);
        } finally {
            task.unlock();
        }
        /*
         * Only a task taken from the in-memory container owns a loader, one
         * restored from the database has nothing running to interrupt, so
         * just persist the terminal status for it
         */
        if (loading && status == LoadStatus.RUNNING) {
            task.stop();
        }

        task.lock();
        try {
            if (deleting && loading) {
                // stop() waits outside the lock used by the runner's final
                // publication; independent cleanup errors must retain evidence.
                Ex.check(task.isFinished() && !task.isCleanupFailed(),
                         "Task cleanup failed; check graph loading mode before deleting");
            }
            this.update(task);
            // Deletion may still roll back after native stop. Keep the real
            // terminal runtime until remove() observes transaction commit.
            if (!deleting && !task.isCleanupFailed()) {
                this.forgetRuntime(taskId, task);
            }
        } finally {
            task.unlock();
        }
        return task;
    }

    public LoadTask retry(int taskId, String token) {
        try (TaskReservation reservation = this.reserveTasks(Collections.singletonList(taskId))) {
            synchronized (this.admissionLock) {
                this.checkAcceptingLoads();
                this.ensureRuntimeCleanupComplete(taskId);
            }
            // A stopped native runner may still own its final metadata write.
            // Its callback does not take the task reservation; release admission
            // and the entity lock before joining, then read fresh state below.
            this.awaitTaskCallbacks(taskId);
            synchronized (this.admissionLock) {
                this.checkAcceptingLoads();
                this.ensureRuntimeCleanupComplete(taskId);
                LoadTask task = this.get(taskId);
                Ex.check(task != null, "load.task.not-exist.id", taskId);
                Ex.check(task.getStatus() == LoadStatus.FAILED ||
                         task.getStatus() == LoadStatus.STOPPED,
                         "Can only retry the FAILED or STOPPED task");
                task.lock();
                try {
                    // Set work mode in normal mode, load from begin
                    task.getOptions().incrementalMode = false;
                    task.reconnect(token);
                    task.setStatus(LoadStatus.RUNNING);
                    task.setLastDuration(0L);
                    task.setCurrDuration(0L);
                    this.updateAndExecute(task);
                } finally {
                    task.unlock();
                }
                return task;
            }
        }
    }

    public String readLoadFailedReason(FileMapping mapping) {
        if (mapping == null) {
            return NO_ERROR_FILE_REASON;
        }
        String path = mapping.getPath();
        File parentDir = FileUtils.getFile(path).getParentFile();
        File failureDataDir = FileUtils.getFile(parentDir, "mapping",
                                                "failure-data");
        // list error data file
        File[] errorFiles = failureDataDir.listFiles((dir, name) -> {
            return name.endsWith("error");
        });
        if (errorFiles == null || errorFiles.length == 0) {
            return NO_ERROR_FILE_REASON;
        }
        /*
         * A single run can legitimately produce both a parse error file and
         * an insert error file, report the contents of all of them
         */
        Arrays.sort(errorFiles, Comparator.comparing(File::getName));
        StringBuilder reason = new StringBuilder();
        for (File errorFile : errorFiles) {
            if (reason.length() > 0) {
                reason.append(System.lineSeparator());
            }
            try {
                reason.append(FileUtils.readFileToString(
                              errorFile, Charset.defaultCharset()));
            } catch (IOException e) {
                throw new InternalException("Failed to read error file %s",
                                            e, errorFile);
            }
        }
        return reason.toString();
    }

    public void pauseAllTasks() {
        List<AcceptedRun> runs;
        List<LoadTask> runtimeTasks;
        synchronized (this.admissionLock) {
            this.closing = true;
            runs = new ArrayList<>(this.acceptedRuns);
            runtimeTasks = new ArrayList<>(this.runningTaskContainer.values());
            for (AcceptedRun run : runs) {
                if (runtimeTasks.stream().noneMatch(task -> task == run.task)) {
                    runtimeTasks.add(run.task);
                }
            }
        }
        Set<Integer> runtimeIds = new HashSet<>();
        for (LoadTask task : runtimeTasks) {
            runtimeIds.add(task.getId());
        }
        Throwable failure = null;
        List<LoadTask> failedTasks = new ArrayList<>();
        // Signal every accepted runner before waiting: a queued runner needs
        // the active workers to finish before it can observe its stop intent.
        for (AcceptedRun run : runs) {
            try {
                this.requestPause(run.task);
            } catch (RuntimeException | Error e) {
                failure = collectFailure(failure, e);
            }
        }
        for (AcceptedRun run : runs) {
            try {
                // finished only covers LoadTask.run(); this ticket also covers
                // its async callback and the final metadata update.
                run.completed.join();
            } catch (CancellationException e) {
                failure = collectFailure(failure, e);
                failedTasks.add(run.task);
            } catch (CompletionException e) {
                Throwable cause = e.getCause() == null ? e : e.getCause();
                failure = collectFailure(failure, cause);
                failedTasks.add(run.task);
            }
        }
        for (LoadTask task : runtimeTasks) {
            boolean handled = failedTasks.stream().noneMatch(failed -> failed == task);
            try {
                // Always attempt native cleanup before dropping a handle,
                // including when a callback or earlier cleanup failed.
                this.cleanupUnstarted(task);
            } catch (RuntimeException | Error e) {
                failure = collectFailure(failure, e);
                handled = false;
            }
            if (task.isCleanupFailed() && handled) {
                Throwable cleanup = task.getCleanupFailure();
                failure = collectFailure(failure, cleanup);
                handled = false;
            }
            if (handled) {
                this.forgetRuntime(task.getId(), task);
            } else {
                // Keep the unpersisted runtime and exceptional ticket visible.
                if (task.getId() != null) {
                    this.runningTaskContainer.putIfAbsent(task.getId(), task);
                }
            }
        }
        try {
            // Rows surviving a restart have no accepted runtime or Loader.
            for (LoadTask task : this.listAll()) {
                if (task.getStatus().inRunning() &&
                    !runtimeIds.contains(task.getId())) {
                    try {
                        task.setStatus(LoadStatus.PAUSED);
                        this.update(task);
                    } catch (RuntimeException | Error e) {
                        failure = collectFailure(failure, e);
                    }
                }
            }
        } catch (RuntimeException | Error e) {
            failure = collectFailure(failure, e);
        }
        if (failure instanceof RuntimeException) {
            throw (RuntimeException) failure;
        }
        if (failure instanceof Error) {
            throw (Error) failure;
        }
        if (failure != null) {
            throw new CompletionException(failure);
        }
    }

    private void checkAcceptingLoads() {
        if (this.closing) {
            throw new RejectedExecutionException("Hubble is closing");
        }
    }

    private void complete(AcceptedRun run) {
        Throwable failure = run.task.getCleanupFailure();
        run.task.lock();
        try {
            // Native cleanup has already run in LoadTask.run(). Still attempt
            // metadata persistence when cleanup failed, retaining both causes.
            this.update(run.task);
        } catch (RuntimeException | Error metadataFailure) {
            if (failure == null) {
                failure = metadataFailure;
            } else if (failure != metadataFailure) {
                failure.addSuppressed(metadataFailure);
            }
        } finally {
            run.task.unlock();
        }
        if (failure == null) {
            run.completed.complete(null);
            this.release(run);
            return;
        }
        run.completed.completeExceptionally(failure);
        // Exceptional tickets remain registered even when the callback ended
        // before close, until their unresolved metadata/cleanup is reported.
        if (failure instanceof RuntimeException) {
            throw (RuntimeException) failure;
        }
        if (failure instanceof Error) {
            throw (Error) failure;
        }
        throw new CompletionException(failure);
    }

    private void release(AcceptedRun run) {
        synchronized (this.admissionLock) {
            if (!run.completed.isCompletedExceptionally()) {
                this.acceptedRuns.remove(run);
            }
        }
    }

    private void requestPause(LoadTask task) {
        task.lock();
        try {
            if (task.getStatus().inRunning()) {
                task.setStatus(LoadStatus.PAUSED);
                // Native stopLoading() only publishes a stop reason. It does
                // not wait for the queued/active runner or its callback.
                if (task.getLoader() != null) {
                    task.context().stopLoading();
                }
            }
        } finally {
            task.unlock();
        }
    }

    private static Throwable collectFailure(Throwable primary, Throwable failure) {
        if (primary == null) {
            return failure;
        }
        if (primary != failure) {
            primary.addSuppressed(failure);
        }
        return primary;
    }

    private static final class AcceptedRun {

        private final LoadTask task;
        private final CompletableFuture<Void> completed = new CompletableFuture<>();

        private AcceptedRun(LoadTask task) {
            this.task = task;
        }
    }

    /**
     * Update progress periodically
     */
    @Scheduled(fixedDelay = 1 * 1000, scheduler = "maintenanceScheduler")
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void updateLoadTaskProgress() {
        for (LoadTask task : this.runningTaskContainer.values()) {
            if (!task.getStatus().inRunning()) {
                continue;
            }
            task.lock();
            try {
                if (task.getStatus().inRunning()) {
                    LoadContext context = task.context();
                    long readLines = context.newProgress().totalInputRead();
                    if (readLines == 0L) {
                        readLines = context.oldProgress().totalInputRead();
                    }
                    task.setFileReadLines(readLines);
                    task.refreshConfirmedWrites();
                    task.setCurrDuration(context.summary().totalTime());
                    this.update(task);
                }
            } finally {
                task.unlock();
            }
        }
    }

    private LoadTask buildLoadTask(GraphConnection connection,
                                   FileMapping fileMapping, HugeClient client) {
        try {
            LoadOptions options = this.buildLoadOptions(connection, fileMapping);
            // NOTE: For simplicity, one file corresponds to one import task
            LoadMapping mapping = this.buildLoadMapping(connection, fileMapping,
                                                        client);
            this.bindMappingToOptions(options, mapping, fileMapping.getPath());
            return new LoadTask(options, connection, fileMapping);
        } catch (Exception e) {
            Throwable rootCause = Ex.rootCause(e);
            throw new ExternalException("load.build-task.failed", rootCause);
        }
    }

    private void bindMappingToOptions(LoadOptions options, LoadMapping mapping,
                                      String fileMappingPath) {
        String parentDir = new File(fileMappingPath).getParentFile()
                                                    .getAbsolutePath();
        String mappingPath = Paths.get(parentDir, Constant.MAPPING_FILE_NAME)
                                  .toString();
        MappingUtil.write(mapping, mappingPath);
        log.info("Convert mapping file successfuly, stored at {}", mappingPath);
        // NOTE: HugeGraphLoader need specified mapping file(on disk)
        options.file = mappingPath;
    }

    private LoadOptions buildLoadOptions(GraphConnection connection,
                                         FileMapping fileMapping) {
        LoadOptions options = new LoadOptions();
        // Connection params
        options.file = fileMapping.getPath();
        boolean directServer = StringUtils.isNotEmpty(connection.getHost()) ||
                               connection.getPort() != null;
        if (StringUtils.isNotEmpty(connection.getGraphSpace())) {
            options.graphSpace = connection.getGraphSpace();
        }
        if (StringUtils.isNotEmpty(connection.getGraph())) {
            options.graph = connection.getGraph();
        }
        if (!directServer && StringUtils.isNotEmpty(connection.getPdPeers())) {
            options.pdPeers = connection.getPdPeers();
        }
        if (StringUtils.isNotEmpty(connection.getCluster())) {
            options.cluster = connection.getCluster();
        }
        if (StringUtils.isNotEmpty(connection.getRouteType())) {
            options.routeType = connection.getRouteType();
        }
        if (StringUtils.isNotEmpty(connection.getHost())) {
            options.host = connection.getHost();
        }
        if (connection.getPort() != null) {
            options.port = connection.getPort();
        }
        options.username = connection.getUsername();
        options.password = null;
        options.token = connection.getToken();
        options.protocol = StringUtils.isNotEmpty(connection.getProtocol()) ?
                           connection.getProtocol() : "http";
        // Load parameters
        LoadParameter parameter = fileMapping.getLoadParameter();
        options.checkVertex = parameter.isCheckVertex();
        options.timeout = parameter.getInsertTimeout();
        options.maxReadErrors = parameter.getMaxParseErrors();
        options.maxParseErrors = parameter.getMaxParseErrors();
        options.maxInsertErrors = parameter.getMaxInsertErrors();
        options.retryTimes = parameter.getRetryTimes();
        options.retryInterval = parameter.getRetryInterval();
        // Optimized for hubble (conservative defaults)
        options.batchInsertThreads = 4;
        options.singleInsertThreads = 4;
        options.batchSize = 100;
        return options;
    }

    private LoadMapping buildLoadMapping(GraphConnection connection,
                                         FileMapping fileMapping,
                                         HugeClient client) {
        FileSource source = this.buildFileSource(fileMapping);
        log.info("Building load mapping for file: {}, vertices: {}, edges: {}",
                 fileMapping.getName(),
                 fileMapping.getVertexMappings().size(),
                 fileMapping.getEdgeMappings().size());

        List<org.apache.hugegraph.loader.mapping.VertexMapping> vMappings;
        vMappings = this.buildVertexMappings(connection, fileMapping, client);
        List<org.apache.hugegraph.loader.mapping.EdgeMapping> eMappings;
        eMappings = this.buildEdgeMappings(connection, fileMapping, client);

        InputStruct inputStruct = new InputStruct(vMappings, eMappings);
        inputStruct.id("1");
        inputStruct.input(source);
        log.info("Built InputStruct id={}, vertices={}, edges={}",
                 inputStruct.id(), inputStruct.vertices().size(), inputStruct.edges().size());
        return new LoadMapping(ImmutableList.of(inputStruct));
    }

    private FileSource buildFileSource(FileMapping fileMapping) {
        // Set input source
        FileSource source = new FileSource();
        source.path(fileMapping.getPath());

        FileSetting setting = fileMapping.getFileSetting();
        Ex.check(setting.getColumnNames() != null,
                 "Must do file setting firstly");
        source.header(setting.getColumnNames().toArray(new String[]{}));
        source.hasHeader(setting.isHasHeader());
        // NOTE: format and delimiter must be CSV and "," temporarily
        source.format(FileFormat.valueOf(setting.getFormat()));
        source.delimiter(setting.getDelimiter());
        source.charset(setting.getCharset());
        source.dateFormat(setting.getDateFormat());
        source.timeZone(setting.getTimeZone());
        source.skippedLine().regex(setting.getSkippedLine());
        // Set list format
        source.listFormat(new org.apache.hugegraph.loader.source.file.ListFormat());
        ListFormat listFormat = setting.getListFormat();
        source.listFormat().startSymbol(listFormat.getStartSymbol());
        source.listFormat().endSymbol(listFormat.getEndSymbol());
        source.listFormat().elemDelimiter(listFormat.getElemDelimiter());
        return source;
    }

    private List<org.apache.hugegraph.loader.mapping.VertexMapping>
            buildVertexMappings(GraphConnection connection,
                                FileMapping fileMapping, HugeClient client) {
        List<org.apache.hugegraph.loader.mapping.VertexMapping> vMappings =
                new ArrayList<>();
        for (VertexMapping mapping : fileMapping.getVertexMappings()) {
            VertexLabelEntity vl = this.vlService.get(mapping.getLabel(),
                                                      client);
            List<String> idFields = mapping.getIdFields();
            Map<String, String> fieldMappings = mapping.fieldMappingToMap();

            org.apache.hugegraph.loader.mapping.VertexMapping vMapping;
            if (vl.getIdStrategy().isCustomize()) {
                Ex.check(idFields.size() == 1,
                         "When the ID strategy is CUSTOMIZED, you must " +
                         "select a column in the file as the id");
                vMapping = new org.apache.hugegraph.loader.mapping.VertexMapping(
                        idFields.get(0), true);
            } else {
                Ex.check(vl.getIdStrategy().isPrimaryKey(),
                         "Unsupported vertex id strategy: %s",
                         vl.getIdStrategy());
                List<String> primaryKeys = vl.getPrimaryKeys();
                if (idFields == null || idFields.isEmpty()) {
                    idFields = this.inferPrimaryKeyFields(fieldMappings,
                                                          primaryKeys);
                }
                Ex.check(idFields.size() >= 1 &&
                         idFields.size() == primaryKeys.size(),
                         "When the ID strategy is PRIMARY_KEY, you must " +
                         "select at least one column in the file as the " +
                         "primary keys");
                boolean unfold = idFields.size() == 1;
                vMapping = new org.apache.hugegraph.loader.mapping.VertexMapping(
                        null, unfold);
                for (int i = 0; i < primaryKeys.size(); i++) {
                    fieldMappings.put(idFields.get(i), primaryKeys.get(i));
                }
            }
            // set label
            vMapping.label(mapping.getLabel());
            // set field_mapping
            vMapping.mappingFields(fieldMappings);
            // set value_mapping
            vMapping.mappingValues(mapping.valueMappingToMap());
            // set selected fields
            vMapping.selectedFields().addAll(idFields);
            vMapping.selectedFields().addAll(fieldMappings.keySet());
            // set null_values
            Set<Object> nullValues = new HashSet<>();
            nullValues.addAll(mapping.getNullValues().getChecked());
            nullValues.addAll(mapping.getNullValues().getCustomized());
            vMapping.nullValues(nullValues);

            vMappings.add(vMapping);
        }
        return vMappings;
    }

    private List<String> inferPrimaryKeyFields(Map<String, String> fieldMappings,
                                               List<String> primaryKeys) {
        List<String> idFields = new ArrayList<>();
        for (String primaryKey : primaryKeys) {
            for (Map.Entry<String, String> entry : fieldMappings.entrySet()) {
                if (primaryKey.equals(entry.getValue())) {
                    idFields.add(entry.getKey());
                    break;
                }
            }
        }
        return idFields;
    }

    private List<org.apache.hugegraph.loader.mapping.EdgeMapping>
            buildEdgeMappings(GraphConnection connection,
                              FileMapping fileMapping, HugeClient client) {
        List<org.apache.hugegraph.loader.mapping.EdgeMapping> eMappings =
                new ArrayList<>();
        for (EdgeMapping mapping : fileMapping.getEdgeMappings()) {
            List<String> sourceFields = mapping.getSourceFields();
            List<String> targetFields = mapping.getTargetFields();
            EdgeLabelEntity el = this.elService.get(mapping.getLabel(), client);
            VertexLabelEntity svl = this.vlService.get(el.getSourceLabel(), client);
            VertexLabelEntity tvl = this.vlService.get(el.getTargetLabel(), client);
            Map<String, String> fieldMappings = mapping.fieldMappingToMap();

            boolean unfoldSource = true;
            if (svl.getIdStrategy().isPrimaryKey()) {
                List<String> primaryKeys = svl.getPrimaryKeys();
                Ex.check(sourceFields.size() >= 1 &&
                         sourceFields.size() == primaryKeys.size(),
                         "When the source vertex ID strategy is PRIMARY_KEY, " +
                         "you must select at least one column in the file " +
                         "as the id");
                for (int i = 0; i < primaryKeys.size(); i++) {
                    fieldMappings.put(sourceFields.get(i), primaryKeys.get(i));
                }
                if (sourceFields.size() > 1) {
                    unfoldSource = false;
                }
            }
            boolean unfoldTarget = true;
            if (tvl.getIdStrategy().isPrimaryKey()) {
                List<String> primaryKeys = tvl.getPrimaryKeys();
                Ex.check(targetFields.size() >= 1 &&
                         targetFields.size() == primaryKeys.size(),
                         "When the target vertex ID strategy is PRIMARY_KEY, " +
                         "you must select at least one column in the file " +
                         "as the id");
                for (int i = 0; i < primaryKeys.size(); i++) {
                    fieldMappings.put(targetFields.get(i), primaryKeys.get(i));
                }
                if (targetFields.size() > 1) {
                    unfoldTarget = false;
                }
            }

            org.apache.hugegraph.loader.mapping.EdgeMapping eMapping =
                    new org.apache.hugegraph.loader.mapping.EdgeMapping(
                            sourceFields, unfoldSource, targetFields, unfoldTarget);
            // set label
            eMapping.label(mapping.getLabel());
            // set field_mapping
            eMapping.mappingFields(fieldMappings);
            // set value_mapping
            eMapping.mappingValues(mapping.valueMappingToMap());
            // set selected fields
            eMapping.selectedFields().addAll(sourceFields);
            eMapping.selectedFields().addAll(targetFields);
            eMapping.selectedFields().addAll(fieldMappings.keySet());
            // set null_values
            Set<Object> nullValues = new HashSet<>();
            nullValues.addAll(mapping.getNullValues().getChecked());
            nullValues.addAll(mapping.getNullValues().getCustomized());
            eMapping.nullValues(nullValues);

            eMappings.add(eMapping);
        }
        return eMappings;
    }

    public void startCovid19(GraphConnection connection,
                                 String graphSpace, String graph,
                                 HugeClient client) {
        FileMapping fileMapping =
                new FileMapping(graphSpace, graph, "covid19",
                                "example/covid19/struct.json");
        LoadParameter loadParameter = new LoadParameter();
        fileMapping.setLoadParameter(loadParameter);

        LoadOptions options = this.buildLoadOptions(connection, fileMapping);
        // options.direct = true;
        // options.pdPeers = connection.getPdPeers();
        options.schema = "example/covid19/schema.groovy";
        options.host = connection.getHost();
        options.port = connection.getPort();
        options.protocol = connection.getProtocol();
        loader(options);
    }

    public void loader(LoadOptions options) {
        HugeGraphLoader loader = null;
        Throwable failure = null;
        try {
            loader = new HugeGraphLoader(options);
            loader.load();
        } catch (Throwable e) {
            failure = e;
        } finally {
            if (loader != null) {
                try {
                    loader.shutdown();
                } catch (Throwable e) {
                    if (failure == null) {
                        failure = e;
                    } else if (failure != e) {
                        failure.addSuppressed(e);
                    }
                }
            }
        }
        if (failure != null) {
            Printer.printError("Failed to start loading", failure);
        }
    }
}
