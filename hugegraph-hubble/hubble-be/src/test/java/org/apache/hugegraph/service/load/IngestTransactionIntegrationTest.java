/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
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

import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import javax.sql.DataSource;

import org.junit.After;
import org.junit.Rule;
import org.junit.rules.TemporaryFolder;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mockito;
import org.mockito.MockedConstruction;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.controller.ingest.IngestController;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.test.util.ReflectionTestUtils;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.GraphConnection;
import org.apache.hugegraph.entity.enums.FileMappingStatus;
import org.apache.hugegraph.entity.enums.JobStatus;
import org.apache.hugegraph.entity.enums.LoadStatus;
import org.apache.hugegraph.entity.load.FileMapping;
import org.apache.hugegraph.entity.load.FileSetting;
import org.apache.hugegraph.entity.load.JobManager;
import org.apache.hugegraph.entity.load.ListFormat;
import org.apache.hugegraph.entity.load.LoadParameter;
import org.apache.hugegraph.entity.load.LoadTask;
import org.apache.hugegraph.handler.LoadTaskExecutor;
import org.apache.hugegraph.loader.executor.LoadOptions;
import org.apache.hugegraph.loader.HugeGraphLoader;
import org.apache.hugegraph.loader.executor.LoadContext;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.schema.EdgeLabelService;
import org.apache.hugegraph.service.schema.VertexLabelService;
import org.apache.hugegraph.testutil.Assert;
import org.apache.hugegraph.testutil.NativeCleanupTestSupport;

@RunWith(SpringRunner.class)
@SpringBootTest(classes = IngestTransactionIntegrationTest.TestConfiguration.class,
                webEnvironment = SpringBootTest.WebEnvironment.NONE,
                properties = {
                    "spring.datasource.url=jdbc:h2:mem:ingest-tx;DB_CLOSE_DELAY=-1",
                    "spring.datasource.driver-class-name=org.h2.Driver",
                    "spring.datasource.username=sa",
                    "spring.datasource.password=",
                    "spring.sql.init.schema-locations=" +
                    "classpath:database/ingest-transaction-schema.sql",
                    "spring.sql.init.mode=always",
                    "spring.datasource.hikari.maximum-pool-size=2",
                    "spring.autoconfigure.exclude=" +
                    "org.mybatis.spring.boot.autoconfigure.MybatisAutoConfiguration," +
                    "org.springframework.boot.autoconfigure.elasticsearch." +
                    "ElasticsearchClientAutoConfiguration," +
                    "org.springframework.boot.autoconfigure.elasticsearch." +
                    "ElasticsearchRestClientAutoConfiguration",
                    "mybatis-plus.configuration.map-underscore-to-camel-case=true",
                    "mybatis-plus.configuration.use-generated-keys=true",
                    "mybatis-plus.global-config.banner=false"
                })
public class IngestTransactionIntegrationTest {

    @Rule
    public TemporaryFolder nativeFolder = new TemporaryFolder();

    private static final String UPLOAD_ROOT =
            "/tmp/hubble-ingest-transaction-test";

    @Autowired
    private JobManagerService jobService;
    @Autowired
    private FileMappingService mappingService;
    @Autowired
    private TestLoadTaskService taskService;
    @Autowired
    private RecordingLoadTaskExecutor executor;
    @Autowired
    private DataSource dataSource;
    @Autowired
    private HugeConfig config;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @MockitoBean
    private VertexLabelService vertexLabelService;
    @MockitoBean
    private EdgeLabelService edgeLabelService;

    private JdbcTemplate jdbc;

    @Before
    public void setup() {
        this.jdbc = new JdbcTemplate(this.dataSource);
        this.cleanup();
        this.executor.reset();
        this.taskService.failTaskInsert(false);
        this.taskService.afterTaskSnapshot(null);
        this.taskService.afterStopCertificate(null);
        this.taskService.stubReconnect(false);
        this.taskService.beforeRestartRead(null);
        Mockito.when(this.config.get(HubbleOptions.UPLOAD_FILE_LOCATION))
               .thenReturn(UPLOAD_ROOT);
    }

    @After
    public void teardown() {
        this.cleanup();
    }

    @Test
    public void testConfirmedWriteMetricsPersistAcrossReads() {
        this.jobService.createIngestTask(this.job(), this.mapping(),
                                         this.connection(), this.client());
        LoadTask task = this.taskService.createdTask();
        task.setConfirmedVertexWrites(3L);
        task.setConfirmedEdgeWrites(1L);
        this.taskService.update(task);

        LoadTask persisted = this.taskService.get(task.getId());
        Assert.assertEquals(Long.valueOf(3L), persisted.getConfirmedVertexWrites());
        Assert.assertEquals(Long.valueOf(1L), persisted.getConfirmedEdgeWrites());
    }

    @Test
    public void testMappingInsertFailureRollsBackAllRowsAndDoesNotDispatch() {
        FileMapping mapping = this.mapping();
        mapping.setGraphSpace(null);

        Assert.assertThrows(RuntimeException.class, () -> {
            this.jobService.createIngestTask(this.job(), mapping,
                                             this.connection(), this.client());
        });

        this.assertTableCounts(0, 0, 0);
        Assert.assertEquals(0, this.executor.executions());
    }

    @Test
    public void testTaskInsertFailureRollsBackAllRowsAndDoesNotDispatch() {
        this.taskService.failTaskInsert(true);

        Throwable failure = Assert.assertThrows(RuntimeException.class, () -> {
            this.jobService.createIngestTask(this.job(), this.mapping(),
                                             this.connection(), this.client());
        });
        Throwable cause = failure;
        while (cause.getCause() != null) {
            cause = cause.getCause();
        }
        Assert.assertTrue("The task INSERT must reach the real H2 constraint", cause instanceof java.sql.SQLException);
        Assert.assertEquals("23502", ((java.sql.SQLException) cause).getSQLState());
        Assert.assertTrue(cause.getMessage().toLowerCase(java.util.Locale.ROOT).contains("file_id"));

        this.assertTableCounts(0, 0, 0);
        Assert.assertEquals(0, this.executor.executions());
    }

    @Test
    public void testCommitDispatchesExactlyOnce() {
        LoadTask task = this.jobService.createIngestTask(
                this.job(), this.mapping(), this.connection(), this.client());

        this.assertTableCounts(1, 1, 1);
        Assert.assertEquals(1, this.executor.executions());
        Assert.assertEquals(LoadStatus.RUNNING, this.taskService.get(task.getId())
                                                             .getStatus());
        Assert.assertEquals(JobStatus.LOADING,
                            this.jobService.get(task.getJobId()).getJobStatus());
    }

    @Test
    public void testServerTokenIsNotPersistedInLoadOptions() {
        GraphConnection connection = this.connection();
        connection.setToken("canary-server-token");

        LoadTask task = this.jobService.createIngestTask(
                this.job(), this.mapping(), connection, this.client());

        String options = this.jdbc.queryForObject(
                         "SELECT options FROM load_task WHERE id = ?",
                         String.class, task.getId());
        Assert.assertFalse(options.contains("canary-server-token"));
        Assert.assertEquals("canary-server-token", task.getOptions().token);
    }

    @Test
    public void testCredentialsAreNotPersistedWhenLoadTaskIsUpdated() {
        LoadTask task = this.jobService.createIngestTask(
                this.job(), this.mapping(), this.connection(), this.client());
        task.getOptions().password = "canary-password";
        task.getOptions().token = "canary-server-token";
        task.getOptions().pdToken = "canary-pd-token";
        task.getOptions().trustStoreToken = "canary-truststore-token";

        this.taskService.update(task);

        String options = this.jdbc.queryForObject(
                         "SELECT options FROM load_task WHERE id = ?",
                         String.class, task.getId());
        Assert.assertFalse(options.contains("canary-"));
        Assert.assertEquals("canary-server-token", task.getOptions().token);
    }

    @Test
    public void testConcurrentQuotaChangesAreAtomic() throws Exception {
        JobManager job = this.job();
        job.setJobSize(0L);
        this.jobService.save(job);
        FileMapping first = this.persistedMapping(job.getId(), "first.csv");
        FileMapping second = this.persistedMapping(job.getId(), "second.csv");

        this.runConcurrently(
                () -> this.jobService.completeUpload(first),
                () -> this.jobService.completeUpload(second));

        Assert.assertEquals(16L, this.jobService.get(job.getId()).getJobSize());

        this.runConcurrently(
                () -> this.jobService.deleteMappings(
                        job.getId(), Collections.singletonList(first)),
                () -> this.jobService.deleteMappings(
                        job.getId(), Collections.singletonList(second)));

        Assert.assertEquals(0L, this.jobService.get(job.getId()).getJobSize());
        Assert.assertEquals(0, this.count("file_mapping"));
    }

    @Test
    public void testQuotaFailureRollsBackMappingDeletion() {
        FileMapping mapping = this.persistedMapping(999, "orphan.csv");

        Assert.assertThrows(RuntimeException.class, () ->
            this.jobService.deleteMappings(
                    999, Collections.singletonList(mapping)));

        Assert.assertEquals(1, this.count("file_mapping"));
    }

    @Test
    public void testQuotaFailureRollsBackUploadCompletion() {
        FileMapping mapping = this.mapping();
        mapping.setJobId(999);
        mapping.setFileStatus(FileMappingStatus.UPLOADING);
        this.mappingService.save(mapping);

        mapping.setFileStatus(FileMappingStatus.COMPLETED);
        Assert.assertThrows(RuntimeException.class, () ->
            this.jobService.completeUpload(mapping));

        Integer status = this.jdbc.queryForObject(
                         "SELECT file_status FROM file_mapping WHERE id = ?",
                         Integer.class, mapping.getId());
        Assert.assertEquals((int) FileMappingStatus.UPLOADING.getValue(),
                            status.intValue());
    }

    @Test
    public void testFailedMappingDeletionDoesNotReleaseCompletedQuota() {
        JobManager job = this.job();
        job.setJobSize(8L);
        this.jobService.save(job);
        this.persistedMapping(job.getId(), "completed.csv");
        FileMapping failed = this.persistedMapping(job.getId(), "failed.csv");
        failed.setFileStatus(FileMappingStatus.FAILURE);
        this.mappingService.update(failed);

        this.jobService.deleteMappings(
                job.getId(), Collections.singletonList(failed));

        Assert.assertEquals(8L, this.jobService.get(job.getId()).getJobSize());
    }

    @Test
    public void testFailedDiskCleanupLeavesRetryableOrphanRecord() {
        JobManager job = this.job();
        job.setJobSize(8L);
        this.jobService.save(job);
        FileMapping mapping = this.persistedMapping(job.getId(), "orphan.csv");
        mapping.setPath("/outside-upload-root/orphan.csv");
        this.mappingService.update(mapping);

        this.jobService.deleteMappings(
                job.getId(), Collections.singletonList(mapping));

        Assert.assertEquals(1, this.count("file_mapping"));
        Assert.assertEquals(-mapping.getId(),
                            this.jdbc.queryForObject(
                            "SELECT job_id FROM file_mapping WHERE id = ?",
                            Integer.class, mapping.getId()).intValue());

        this.jdbc.update("UPDATE file_mapping SET path = ? WHERE id = ?",
                         UPLOAD_ROOT + "/retry/orphan.csv", mapping.getId());
        this.mappingService.deleteOrphanedJobFiles();
        Assert.assertEquals(0, this.count("file_mapping"));
    }

    @Test
    public void testRejectedDispatchCommitsFailedTaskAndJobWithoutThrowing() {
        this.executor.reject(true);

        LoadTask task = this.jobService.createIngestTask(
                this.job(), this.mapping(), this.connection(), this.client());

        this.assertTableCounts(1, 1, 1);
        Assert.assertEquals(1, this.executor.executions());
        Assert.assertEquals(LoadStatus.FAILED, this.taskService.get(task.getId())
                                                            .getStatus());
        Assert.assertEquals(JobStatus.FAILED,
                            this.jobService.get(task.getJobId()).getJobStatus());
    }

    @Test
    public void testUnscheduledLoadersCloseAfterSaveFailureRollbackAndRejection() {
        for (int outcome = 0; outcome < 3; outcome++) {
            this.cleanup();
            this.executor.reset();
            this.executor.reject(outcome == 2);
            JobManager job = this.job();
            this.jobService.save(job);
            FileMapping mapping = this.mapping();
            mapping.setJobId(job.getId());
            mapping.setPath(UPLOAD_ROOT + "/cleanup/people.csv");
            this.mappingService.save(mapping);
            TransactionTemplate transaction = new TransactionTemplate(this.transactionManager);
            if (outcome == 0) {
                this.jdbc.execute("ALTER TABLE load_task ADD CONSTRAINT reject_task CHECK (id < 0)");
            }
            final int result = outcome;
            try (MockedConstruction<HugeGraphLoader> construction = Mockito.mockConstruction(HugeGraphLoader.class)) {
                if (outcome == 0) {
                    Assert.assertThrows(RuntimeException.class, () -> transaction.execute(status ->
                            this.taskService.startLoader(this.connection(), mapping, this.client())));
                } else {
                    transaction.execute(status -> {
                        this.taskService.startLoader(this.connection(), mapping, this.client());
                        if (result == 1) {
                            status.setRollbackOnly();
                        }
                        return null;
                    });
                }
                Assert.assertEquals(1, construction.constructed().size());
                Mockito.verify(construction.constructed().get(0)).shutdown();
                if (outcome != 0) {
                    Assert.assertTrue(this.taskService.createdTask().isFinished());
                }
                Assert.assertEquals(outcome == 2 ? 1 : 0, this.count("load_task"));
                Assert.assertEquals(outcome == 2 ? 1 : 0, this.executor.executions());
            } finally {
                if (outcome == 0) {
                    this.jdbc.execute("ALTER TABLE load_task DROP CONSTRAINT reject_task");
                }
            }
        }
    }

    @Test
    public void testDeleteJobAcceptsCompletionAfterActualDatabaseSnapshot() throws Exception {
        this.deleteAfterSnapshot(false);
    }

    @Test
    public void testDeleteJobRetainsRowsAfterIndependentCleanupFailure() throws Exception {
        this.deleteAfterSnapshot(true);
    }

    private void deleteAfterSnapshot(boolean cleanupFailure) throws Exception {
        FileMapping mapping = this.mapping();
        mapping.setPath(UPLOAD_ROOT + "/delete-race-" + UUID.randomUUID() + "/people.csv");
        LoadTask task = this.jobService.createIngestTask(this.job(), mapping,
                                                       this.connection(), this.client());
        HugeGraphLoader loader = Mockito.mock(HugeGraphLoader.class);
        LoadContext context = Mockito.mock(LoadContext.class, Mockito.RETURNS_DEEP_STUBS);
        Mockito.when(loader.context()).thenReturn(context);
        Mockito.when(loader.load()).thenReturn(!cleanupFailure);
        if (cleanupFailure) {
            Mockito.doThrow(new IllegalStateException("release failed")).when(loader).shutdown();
        }
        task.setLoader(loader);
        ExecutorService runner = Executors.newSingleThreadExecutor();
        this.taskService.afterTaskSnapshot(() -> {
            try {
                // Independent thread uses the real Spring/MyBatis callback path
                // after the deletion transaction reads its RUNNING snapshot.
                runner.submit(() -> {
                    task.run();
                    this.executor.complete(task);
                }).get(5, TimeUnit.SECONDS);
            } catch (Exception e) {
                throw new AssertionError(e);
            }
        });
        try {
            if (cleanupFailure) {
                Assert.assertThrows(RuntimeException.class, () -> this.jobService.deleteJob(task.getJobId()));
                this.assertTableCounts(1, 1, 1);
                Assert.assertEquals(LoadStatus.FAILED, this.taskService.get(task.getId()).getStatus());
            } else {
                this.jobService.deleteJob(task.getJobId());
                Assert.assertEquals(0, this.count("job_manager"));
                Assert.assertEquals(0, this.count("load_task"));
            }
            Mockito.verify(loader).shutdown();
            Assert.assertTrue(task.isFinished());
        } finally {
            runner.shutdownNow();
            Assert.assertTrue(runner.awaitTermination(5, TimeUnit.SECONDS));
        }
    }

    @Test(timeout = 15000)
    public void testDeleteCertificateReservesIdentityAgainstFreshRetry() throws Exception {
        FileMapping mapping = this.mapping();
        mapping.setPath(UPLOAD_ROOT + "/reserved-delete-" + UUID.randomUUID() + "/people.csv");
        LoadTask task = this.jobService.createIngestTask(this.job(), mapping,
                                                       this.connection(), this.client());
        HugeGraphLoader loader = Mockito.mock(HugeGraphLoader.class);
        Mockito.when(loader.context()).thenReturn(Mockito.mock(LoadContext.class, Mockito.RETURNS_DEEP_STUBS));
        task.setLoader(loader);
        this.taskService.stubReconnect(true);
        ExecutorService callbacks = Executors.newSingleThreadExecutor();
        this.taskService.afterTaskSnapshot(() -> {
            try {
                callbacks.submit(() -> {
                    task.run();
                    this.executor.complete(task);
                }).get(5, TimeUnit.SECONDS);
            } catch (Exception e) {
                throw new AssertionError(e);
            }
        });
        CountDownLatch certified = new CountDownLatch(1);
        CountDownLatch delete = new CountDownLatch(1);
        this.taskService.afterStopCertificate(() -> {
            certified.countDown();
            try {
                Assert.assertTrue(delete.await(5, TimeUnit.SECONDS));
            } catch (InterruptedException e) {
                throw new AssertionError(e);
            }
        });
        ExecutorService requests = Executors.newFixedThreadPool(2);
        try {
            Future<?> deleting = requests.submit(() -> this.jobService.deleteJob(task.getJobId()));
            Assert.assertTrue(certified.await(5, TimeUnit.SECONDS));
            CountDownLatch retryEntered = new CountDownLatch(1);
            Future<LoadTask> retry = requests.submit(() -> {
                retryEntered.countDown();
                return this.taskService.retry(task.getId(), "current-session-token");
            });
            Assert.assertTrue(retryEntered.await(5, TimeUnit.SECONDS));
            try {
                retry.get(300, TimeUnit.MILLISECONDS);
                Assert.fail("retry crossed the completed-cleanup deletion reservation");
            } catch (TimeoutException expected) {
                // Deletion owns the task identity through its transaction.
            }
            delete.countDown();
            deleting.get(5, TimeUnit.SECONDS);
            Throwable rejected = Assert.assertThrows(
                    java.util.concurrent.ExecutionException.class, () -> retry.get(5, TimeUnit.SECONDS));
            Assert.assertTrue(rejected.getCause() instanceof RuntimeException);
            Assert.assertEquals(1, this.executor.executions());
            Assert.assertEquals(0, this.count("job_manager"));
            Assert.assertEquals(0, this.count("load_task"));
        } finally {
            delete.countDown();
            requests.shutdownNow();
            callbacks.shutdownNow();
            Assert.assertTrue(requests.awaitTermination(5, TimeUnit.SECONDS));
            Assert.assertTrue(callbacks.awaitTermination(5, TimeUnit.SECONDS));
        }
    }

    @Test
    public void testNativeResetFailureCannotCertifyDeletionAfterLoadFailure() throws Exception {
        FileMapping mapping = this.mapping();
        mapping.setPath(UPLOAD_ROOT + "/native-delete-" + UUID.randomUUID() + "/people.csv");
        LoadTask task = this.jobService.createIngestTask(this.job(), mapping,
                                                       this.connection(), this.client());
        ExecutorService callback = Executors.newSingleThreadExecutor();
        try (NativeCleanupTestSupport nativeCleanup = new NativeCleanupTestSupport(
                task, this.nativeFolder.newFile("mode-reset.json").toPath(), true, LoadStatus.RUNNING)) {
            this.taskService.afterTaskSnapshot(() -> {
                try {
                    callback.submit(() -> {
                        task.run();
                        this.executor.complete(task);
                    }).get(5, TimeUnit.SECONDS);
                } catch (Exception e) {
                    throw new AssertionError(e);
                }
            });

            Assert.assertThrows(RuntimeException.class, () -> this.jobService.deleteJob(task.getJobId()));

            this.assertTableCounts(1, 1, 1);
            Assert.assertEquals(LoadStatus.FAILED, this.taskService.get(task.getId()).getStatus());
            Assert.assertTrue(task.isCleanupFailed());
            Assert.assertNotSame(nativeCleanup.original, nativeCleanup.shutdownFailure.get());
            Assert.assertEquals("LOADING", nativeCleanup.mode());
            nativeCleanup.assertResourcesClosed();
            try (MockedConstruction<HugeGraphLoader> replacements = Mockito.mockConstruction(HugeGraphLoader.class)) {
                Assert.assertThrows(RuntimeException.class,
                                    () -> this.taskService.retry(task.getId(), "current-session-token"));
                Assert.assertThrows(RuntimeException.class,
                                    () -> this.taskService.resume(task.getId(), "current-session-token"));
                Assert.assertTrue(replacements.constructed().isEmpty());
                Assert.assertSame(nativeCleanup.loader, task.getLoader());
                Assert.assertEquals(1, this.executor.executions());
            }
        } finally {
            callback.shutdownNow();
            Assert.assertTrue(callback.awaitTermination(5, TimeUnit.SECONDS));
        }
    }

    @Test(timeout = 15000)
    public void testDeletionReservationSurvivesOuterTransactionUntilCommit() throws Exception {
        this.reserveUntilOuterCompletion(false);
    }

    @Test(timeout = 15000)
    public void testDeletionRollbackRetainsRuntimeAndReleasesReservation() throws Exception {
        this.reserveUntilOuterCompletion(true);
    }

    @Test(timeout = 15000)
    public void testIngestDeleteReservationBlocksFreshRetryUntilOuterCommit() throws Exception {
        this.reserveUntilOuterCompletion(false, true);
    }

    private void reserveUntilOuterCompletion(boolean rollback) throws Exception {
        this.reserveUntilOuterCompletion(rollback, false);
    }

    private void reserveUntilOuterCompletion(boolean rollback, boolean endpoint) throws Exception {
        FileMapping mapping = this.mapping();
        mapping.setPath(UPLOAD_ROOT + "/outer-delete-" + UUID.randomUUID() + "/people.csv");
        LoadTask task = this.jobService.createIngestTask(this.job(), mapping,
                                                       this.connection(), this.client());
        HugeGraphLoader loader = Mockito.mock(HugeGraphLoader.class);
        Mockito.when(loader.context()).thenReturn(Mockito.mock(LoadContext.class, Mockito.RETURNS_DEEP_STUBS));
        task.setLoader(loader);
        task.run();
        this.executor.complete(task);
        this.taskService.stubReconnect(true);
        CountDownLatch deleted = new CountDownLatch(1);
        CountDownLatch complete = new CountDownLatch(1);
        CountDownLatch restartRead = new CountDownLatch(1);
        ExecutorService requests = Executors.newFixedThreadPool(2);
        try {
            Future<?> deleting = requests.submit(() -> new TransactionTemplate(this.transactionManager)
                    .execute(status -> {
                        if (endpoint) {
                            try {
                                this.ingestEndpoint().perform(delete(org.apache.hugegraph.common.Constant.API_VERSION +
                                                                     "ingest/jobs/" + task.getId()))
                                                     .andExpect(status().isOk());
                            } catch (Exception e) {
                                throw new AssertionError(e);
                            }
                        } else {
                            this.jobService.deleteJob(task.getJobId());
                        }
                        deleted.countDown();
                        try {
                            Assert.assertTrue(complete.await(5, TimeUnit.SECONDS));
                        } catch (InterruptedException e) {
                            throw new AssertionError(e);
                        }
                        if (rollback) {
                            status.setRollbackOnly();
                        }
                        return null;
                    }));
            Assert.assertTrue(deleted.await(5, TimeUnit.SECONDS));
            // remove() now legitimately reads the task as well. Observe only
            // the fresh restart request after deletion has returned.
            this.taskService.beforeRestartRead(restartRead::countDown);
            Assert.assertSame(task, this.taskService.retainedTask(task.getId()));
            CountDownLatch retryEntered = new CountDownLatch(1);
            Future<LoadTask> retry = requests.submit(() -> {
                retryEntered.countDown();
                return this.taskService.retry(task.getId(), "current-session-token");
            });
            Assert.assertTrue(retryEntered.await(5, TimeUnit.SECONDS));
            Assert.assertFalse("restart read bypassed transaction reservation",
                               restartRead.await(300, TimeUnit.MILLISECONDS));
            complete.countDown();
            deleting.get(5, TimeUnit.SECONDS);
            if (rollback) {
                Assert.assertEquals(LoadStatus.RUNNING, retry.get(5, TimeUnit.SECONDS).getStatus());
                this.assertTableCounts(1, 1, 1);
                Assert.assertEquals(2, this.executor.executions());
            } else {
                Assert.assertThrows(java.util.concurrent.ExecutionException.class,
                                    () -> retry.get(5, TimeUnit.SECONDS));
                Assert.assertEquals(0, this.count("load_task"));
                Assert.assertEquals(endpoint ? 1 : 0, this.count("job_manager"));
                Assert.assertEquals(1, this.executor.executions());
            }
            Assert.assertTrue(restartRead.await(5, TimeUnit.SECONDS));
        } finally {
            complete.countDown();
            requests.shutdownNow();
            Assert.assertTrue(requests.awaitTermination(5, TimeUnit.SECONDS));
        }
    }

    @Test
    public void testIngestDeleteEndpointStopsActiveTaskBeforeRemovingRow() throws Exception {
        LoadTask task = this.jobService.createIngestTask(this.job(), this.mapping(),
                                                       this.connection(), this.client());
        HugeGraphLoader loader = this.stopOnNativeSignal(task);

        this.ingestEndpoint().perform(delete(org.apache.hugegraph.common.Constant.API_VERSION +
                                             "ingest/jobs/" + task.getId()))
                             .andExpect(status().isOk());

        Mockito.verify(loader).shutdown();
        Assert.assertTrue(task.isFinished());
        Assert.assertEquals(LoadStatus.STOPPED, task.getStatus());
        Assert.assertEquals(0, this.count("load_task"));
        Assert.assertNull(this.taskService.retainedTask(task.getId()));
    }

    @Test
    public void testTaskPageDeletionStopsActiveChildAndCleansMetadata() throws Exception {
        FileMapping mapping = this.mapping();
        mapping.setPath(UPLOAD_ROOT + "/legacy-delete-" + UUID.randomUUID() + "/people.csv");
        LoadTask task = this.jobService.createIngestTask(this.job(), mapping,
                                                       this.connection(), this.client());
        HugeGraphLoader loader = this.stopOnNativeSignal(task);
        this.ingestEndpoint().perform(delete(org.apache.hugegraph.common.Constant.API_VERSION +
                                             "ingest/tasks/" + task.getJobId()))
                             .andExpect(status().isOk());
        this.assertTableCounts(0, 0, 0);
        Assert.assertNull(this.taskService.retainedTask(task.getId()));
        Mockito.verify(loader).shutdown();
    }

    @Test
    public void testIngestDeleteEndpointRetainsNativeCleanupFailure() throws Exception {
        LoadTask task = this.jobService.createIngestTask(this.job(), this.mapping(),
                                                       this.connection(), this.client());
        try (NativeCleanupTestSupport nativeCleanup = new NativeCleanupTestSupport(
                task, this.nativeFolder.newFile("endpoint-reset.json").toPath(), true, LoadStatus.RUNNING)) {
            task.run();
            this.executor.complete(task);

            Assert.assertThrows(Exception.class, () -> this.ingestEndpoint().perform(
                    delete(org.apache.hugegraph.common.Constant.API_VERSION + "ingest/jobs/" + task.getId())));

            this.assertTableCounts(1, 1, 1);
            Assert.assertSame(task, this.taskService.retainedTask(task.getId()));
            Assert.assertTrue(task.isCleanupFailed());
            Assert.assertEquals("LOADING", nativeCleanup.mode());
            nativeCleanup.assertResourcesClosed();
        }
    }

    @Test
    public void testActiveStopDeletionFailureRollsBackAndKeepsRuntimeForDeletionRetry() {
        LoadTask task = this.jobService.createIngestTask(this.job(), this.mapping(),
                                                       this.connection(), this.client());
        HugeGraphLoader loader = this.stopOnNativeSignal(task);
        // Fail the later job-row DELETE after native stop and task removal,
        // using real H2 referential integrity rather than a mocked mapper.
        this.jdbc.execute("CREATE TABLE delete_guard (job_id INT REFERENCES job_manager(id))");
        try {
            this.jdbc.update("INSERT INTO delete_guard VALUES (?)", task.getJobId());
            Assert.assertThrows(RuntimeException.class, () -> this.jobService.deleteJob(task.getJobId()));
        } finally {
            this.jdbc.execute("DROP TABLE delete_guard");
        }

        this.assertTableCounts(1, 1, 1);
        // The final callback commits before the short deletion transaction.
        // A failed DELETE rolls back metadata removal, not that completed callback.
        Assert.assertEquals(LoadStatus.STOPPED, this.taskService.get(task.getId()).getStatus());
        Assert.assertSame(task, this.taskService.retainedTask(task.getId()));
        Assert.assertEquals(LoadStatus.STOPPED, task.getStatus());
        Assert.assertTrue(task.isFinished());
        Mockito.verify(loader).shutdown();
        // Periodic progress skips terminal runtimes; do not claim automatic
        // DB reconciliation. A later deletion can reuse the real certificate.
        this.jobService.deleteJob(task.getJobId());
        Assert.assertEquals(0, this.count("load_task"));
        Assert.assertEquals(0, this.count("job_manager"));
        Assert.assertNull(this.taskService.retainedTask(task.getId()));
        Mockito.verify(loader).shutdown();
    }

    @Test
    public void testPublicStopRecoversRunningRowAfterDeletionRollback() throws Exception {
        this.assertPublicStopAfterDeletionRollback(LoadStatus.RUNNING);
    }

    @Test
    public void testPublicStopRecoversPausedRowAfterDeletionRollback() throws Exception {
        this.assertPublicStopAfterDeletionRollback(LoadStatus.PAUSED);
    }

    @Test
    public void testRecoveredStopRetainsRuntimeOnOuterRollback() throws Exception {
        this.assertPublicStopAfterDeletionRollback(LoadStatus.RUNNING, true);
    }

    private void assertPublicStopAfterDeletionRollback(LoadStatus persisted) throws Exception {
        this.assertPublicStopAfterDeletionRollback(persisted, false);
    }

    private void assertPublicStopAfterDeletionRollback(LoadStatus persisted, boolean rollback) throws Exception {
        LoadTask task = this.jobService.createIngestTask(this.job(), this.mapping(),
                                                       this.connection(), this.client());
        HugeGraphLoader loader = this.stopOnNativeSignal(task);
        this.jdbc.execute("CREATE TABLE stop_recovery_guard (job_id INT REFERENCES job_manager(id))");
        try {
            this.jdbc.update("INSERT INTO stop_recovery_guard VALUES (?)", task.getJobId());
            Assert.assertThrows(RuntimeException.class, () -> this.jobService.deleteJob(task.getJobId()));
        } finally {
            this.jdbc.execute("DROP TABLE stop_recovery_guard");
        }
        this.jdbc.update("UPDATE load_task SET load_status = ? WHERE id = ?", persisted.getValue(), task.getId());
        Assert.assertEquals(persisted, this.taskService.get(task.getId()).getStatus());
        Assert.assertSame(task, this.taskService.retainedTask(task.getId()));
        Assert.assertTrue(task.isFinished());
        Assert.assertEquals(LoadStatus.STOPPED, task.getStatus());

        task.setCleanupFailed(true);
        Assert.assertThrows(RuntimeException.class, () -> this.taskService.stop(task.getId()));
        Assert.assertEquals(persisted, this.taskService.get(task.getId()).getStatus());
        Assert.assertSame(task, this.taskService.retainedTask(task.getId()));
        task.setCleanupFailed(false);
        task.setFinished(false);
        Assert.assertThrows(RuntimeException.class, () -> this.taskService.stop(task.getId()));
        Assert.assertEquals(persisted, this.taskService.get(task.getId()).getStatus());
        task.setFinished(true);

        if (rollback) {
            new TransactionTemplate(this.transactionManager).execute(transaction -> {
                this.taskService.stop(task.getId());
                Assert.assertEquals(LoadStatus.STOPPED, this.taskService.get(task.getId()).getStatus());
                Assert.assertSame(task, this.taskService.retainedTask(task.getId()));
                transaction.setRollbackOnly();
                return null;
            });
            Assert.assertEquals(persisted, this.taskService.get(task.getId()).getStatus());
            Assert.assertSame(task, this.taskService.retainedTask(task.getId()));
        }

        String endpoint = org.apache.hugegraph.common.Constant.API_VERSION +
                          "graphspaces/DEFAULT/graphs/hugegraph/job-manager/" + task.getJobId() + "/load-tasks/stop";
        this.loadTaskEndpoint().perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                                          .post(endpoint)
                                          .param("task_id", task.getId().toString()))
                               .andExpect(status().isOk());
        Assert.assertEquals(LoadStatus.STOPPED, this.taskService.get(task.getId()).getStatus());
        Assert.assertNull(this.taskService.retainedTask(task.getId()));
        Mockito.verify(loader).shutdown();
        Assert.assertThrows(Exception.class, () -> this.loadTaskEndpoint().perform(
                org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(endpoint)
                   .param("task_id", task.getId().toString())));
        this.taskService.stubReconnect(true);
        int dispatched = this.executor.executions();
        this.taskService.retry(task.getId(), "fixture-current-token");
        Assert.assertEquals(dispatched + 1, this.executor.executions());
        Assert.assertEquals(LoadStatus.RUNNING, this.taskService.get(task.getId()).getStatus());
        Mockito.verify(loader).shutdown();
    }

    private MockMvc loadTaskEndpoint() {
        org.apache.hugegraph.controller.load.LoadTaskController controller =
                new org.apache.hugegraph.controller.load.LoadTaskController(this.taskService) {
                    @Override
                    protected HugeClient requireGraphSpaceWrite(String graphSpace) {
                        return null;
                    }
                };
        ReflectionTestUtils.setField(controller, "jobService", this.jobService);
        return MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    public void testRejectedDispatchNativeCleanupFailureRetainsRowsAndBlocksReplacement() throws Exception {
        this.executor.reject(true);
        AtomicReference<LoadTask> created = new AtomicReference<>();
        AtomicReference<NativeCleanupTestSupport> boundary =
                new AtomicReference<>();
        try {
            new TransactionTemplate(this.transactionManager).execute(status -> {
                LoadTask task = this.jobService.createIngestTask(this.job(), this.mapping(),
                                                               this.connection(), this.client());
                created.set(task);
                try {
                    NativeCleanupTestSupport nativeCleanup = new NativeCleanupTestSupport(
                            task, this.nativeFolder.newFile("dispatch-reset.json").toPath(), true, LoadStatus.RUNNING);
                    boundary.set(nativeCleanup);
                    nativeCleanup.loader.context().failLoading(nativeCleanup.original);
                } catch (Exception e) {
                    throw new AssertionError(e);
                }
                return null;
            });
            LoadTask task = created.get();
            NativeCleanupTestSupport nativeCleanup = boundary.get();
            Assert.assertTrue(task.isFinished());
            Assert.assertTrue(task.isCleanupFailed());
            Assert.assertEquals(LoadStatus.FAILED, task.getStatus());
            Assert.assertSame(task, this.taskService.retainedTask(task.getId()));
            this.assertTableCounts(1, 1, 1);
            Assert.assertEquals(LoadStatus.FAILED, this.taskService.get(task.getId()).getStatus());
            Assert.assertEquals("LOADING", nativeCleanup.mode());
            nativeCleanup.assertResourcesClosed();
            try (MockedConstruction<HugeGraphLoader> replacements = Mockito.mockConstruction(HugeGraphLoader.class)) {
                Assert.assertThrows(RuntimeException.class, () -> this.taskService.retry(task.getId(),
                        "current-token"));
                Assert.assertThrows(RuntimeException.class, () -> this.taskService.resume(task.getId(),
                        "current-token"));
                Assert.assertThrows(RuntimeException.class, () -> this.taskService.remove(task.getId()));
                Assert.assertTrue(replacements.constructed().isEmpty());
                this.assertTableCounts(1, 1, 1);
                Assert.assertEquals(1, this.executor.executions());
            }
        } finally {
            if (boundary.get() != null) {
                boundary.get().close();
            }
        }
    }

    @Test
    public void testMissingTaskDeletionKeepsExistingContracts() throws Exception {
        this.ingestEndpoint().perform(delete(org.apache.hugegraph.common.Constant.API_VERSION + "ingest/jobs/-1"))
                             .andExpect(status().isOk())
                             .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                                                           .jsonPath("$.status").value(404));
        Assert.assertThrows(org.apache.hugegraph.exception.InternalException.class,
                            () -> this.taskService.remove(-1));
        this.assertTableCounts(0, 0, 0);
    }

    private HugeGraphLoader stopOnNativeSignal(LoadTask task) {
        HugeGraphLoader loader = Mockito.mock(HugeGraphLoader.class);
        LoadContext context = Mockito.mock(LoadContext.class, Mockito.RETURNS_DEEP_STUBS);
        Mockito.when(loader.context()).thenReturn(context);
        Mockito.doAnswer(invocation -> {
            task.run();
            this.executor.complete(task);
            return null;
        }).when(context).stopLoading();
        task.setLoader(loader);
        return loader;
    }

    private MockMvc ingestEndpoint() {
        IngestController controller = new IngestController() {
            @Override
            protected HugeClient requireGraphSpaceWrite(String graphSpace) {
                // Only authentication is isolated: routing, controller, Spring
                // service proxy, transaction and MyBatis persistence are real.
                return null;
            }
        };
        ReflectionTestUtils.setField(controller, "loadTaskService", this.taskService);
        ReflectionTestUtils.setField(controller, "jobManagerService", this.jobService);
        return MockMvcBuilders.standaloneSetup(controller).build();
    }

    private JobManager job() {
        Date now = new Date();
        return JobManager.builder()
                         .graphSpace("DEFAULT")
                         .graph("hugegraph")
                         .jobName("tx-job")
                         .jobStatus(JobStatus.LOADING)
                         .createTime(now)
                         .updateTime(now)
                         .build();
    }

    private FileMapping mapping() {
        FileMapping mapping = new FileMapping();
        mapping.setGraphSpace("DEFAULT");
        mapping.setGraph("hugegraph");
        mapping.setName("people.csv");
        mapping.setPath("/tmp/people.csv");
        mapping.setTotalLines(1L);
        mapping.setTotalSize(8L);
        mapping.setFileStatus(FileMappingStatus.COMPLETED);
        mapping.setFileSetting(FileSetting.builder()
                                          .columnNames(Collections.singletonList("name"))
                                          .format("CSV")
                                          .delimiter(",")
                                          .charset("UTF-8")
                                          .dateFormat("yyyy-MM-dd HH:mm:ss")
                                          .timeZone("GMT+8")
                                          .skippedLine("(^#|^//).*")
                                          .listFormat(new ListFormat())
                                          .build());
        mapping.setVertexMappings(Collections.emptySet());
        mapping.setEdgeMappings(Collections.emptySet());
        mapping.setLoadParameter(new LoadParameter());
        mapping.setCreateTime(new Date());
        mapping.setUpdateTime(new Date());
        return mapping;
    }

    private FileMapping persistedMapping(int jobId, String name) {
        FileMapping mapping = this.mapping();
        mapping.setJobId(jobId);
        mapping.setName(name);
        mapping.setPath(UPLOAD_ROOT + "/" + name + "/" + name);
        this.mappingService.save(mapping);
        return mapping;
    }

    private void runConcurrently(Runnable first, Runnable second)
            throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            Future<?> firstFuture = pool.submit(
                    () -> runAfterSignal(first, ready, start));
            Future<?> secondFuture = pool.submit(
                    () -> runAfterSignal(second, ready, start));
            Assert.assertTrue(ready.await(5L, TimeUnit.SECONDS));
            start.countDown();
            firstFuture.get(10L, TimeUnit.SECONDS);
            secondFuture.get(10L, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
    }

    private static void runAfterSignal(Runnable action, CountDownLatch ready,
                                       CountDownLatch start) {
        ready.countDown();
        try {
            if (!start.await(5L, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Concurrent test start timed out");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Concurrent test interrupted", e);
        }
        action.run();
    }

    private GraphConnection connection() {
        GraphConnection connection = new GraphConnection();
        connection.setGraphSpace("DEFAULT");
        connection.setGraph("hugegraph");
        return connection;
    }

    private HugeClient client() {
        return Mockito.mock(HugeClient.class);
    }

    private void cleanup() {
        JdbcTemplate template = this.jdbc == null ?
                                new JdbcTemplate(this.dataSource) : this.jdbc;
        template.update("DELETE FROM load_task");
        template.update("DELETE FROM file_mapping");
        template.update("DELETE FROM job_manager");
    }

    private void assertTableCounts(int jobs, int mappings, int tasks) {
        Assert.assertEquals(jobs, this.count("job_manager"));
        Assert.assertEquals(mappings, this.count("file_mapping"));
        Assert.assertEquals(tasks, this.count("load_task"));
    }

    private int count(String table) {
        return this.jdbc.queryForObject("SELECT COUNT(*) FROM " + table,
                                        Integer.class);
    }

    @SpringBootConfiguration
    @EnableAutoConfiguration
    @EnableTransactionManagement
    @MapperScan("org.apache.hugegraph.mapper.load")
    public static class TestConfiguration {

        @Bean
        public JobManagerService jobManagerService() {
            return new JobManagerService();
        }

        @Bean
        public TestLoadTaskService loadTaskService() {
            return new TestLoadTaskService();
        }

        @Bean
        public FileMappingService fileMappingService() {
            return new FileMappingService();
        }

        @Bean
        public RecordingLoadTaskExecutor loadTaskExecutor() {
            return new RecordingLoadTaskExecutor();
        }

        @Bean
        public HugeConfig hugeConfig() {
            return Mockito.mock(HugeConfig.class);
        }

    }

    public static class TestLoadTaskService extends LoadTaskService {

        private boolean failTaskInsert;
        private LoadTask createdTask;
        private Runnable afterTaskSnapshot;
        private Runnable afterStopCertificate;
        private boolean stubReconnect;
        private Runnable beforeRestartRead;

        public LoadTask retainedTask(int id) {
            try {
                java.lang.reflect.Field field = LoadTaskService.class.getDeclaredField("runningTaskContainer");
                field.setAccessible(true);
                @SuppressWarnings("unchecked")
                java.util.Map<Integer, LoadTask> running = (java.util.Map<Integer, LoadTask>) field.get(this);
                return running.get(id);
            } catch (ReflectiveOperationException e) {
                throw new AssertionError(e);
            }
        }

        public void beforeRestartRead(Runnable action) {
            this.beforeRestartRead = action;
        }

        public void afterStopCertificate(Runnable action) {
            this.afterStopCertificate = action;
        }

        public void stubReconnect(boolean enabled) {
            this.stubReconnect = enabled;
        }

        @Override
        public LoadTask get(int id) {
            if (this.stubReconnect && this.beforeRestartRead != null) {
                this.beforeRestartRead.run();
            }
            LoadTask task = super.get(id);
            if (this.stubReconnect && task != null) {
                task = Mockito.spy(task);
                Mockito.doNothing().when(task).reconnect(Mockito.anyString());
            }
            return task;
        }

        @Override
        LoadTask stopForDelete(int id) {
            LoadTask task = super.stopForDelete(id);
            Runnable action = this.afterStopCertificate;
            this.afterStopCertificate = null;
            if (action != null) {
                action.run();
            }
            return task;
        }

        public void afterTaskSnapshot(Runnable action) {
            this.afterTaskSnapshot = action;
        }

        @Override
        public List<LoadTask> taskListByJob(int jobId) {
            List<LoadTask> snapshot = super.taskListByJob(jobId);
            Runnable action = this.afterTaskSnapshot;
            this.afterTaskSnapshot = null;
            if (action != null) {
                action.run();
            }
            return snapshot;
        }

        public void failTaskInsert(boolean fail) {
            this.failTaskInsert = fail;
        }

        public LoadTask startLoader(GraphConnection connection, FileMapping mapping, HugeClient client) {
            this.createdTask = super.start(connection, mapping, client);
            return this.createdTask;
        }

        @Override
        public void save(LoadTask task) {
            this.createdTask = task;
            super.save(task);
        }

        public LoadTask createdTask() {
            return this.createdTask;
        }

        @Override
        public LoadTask start(GraphConnection connection, FileMapping mapping,
                              HugeClient client) {
            LoadOptions options = new LoadOptions();
            options.token = connection.getToken();
            LoadTask task = LoadTask.builder()
                                    .graphSpace(connection.getGraphSpace())
                                    .graph(connection.getGraph())
                                    .jobId(mapping.getJobId())
                                    .fileId(this.failTaskInsert ? null : mapping.getId())
                                    .fileName(mapping.getName())
                                    .options(options)
                                    .vertices(Collections.emptySet())
                                    .edges(Collections.emptySet())
                                    .fileTotalLines(mapping.getTotalLines())
                                    .status(LoadStatus.RUNNING)
                                    .fileReadLines(0L)
                                    .lastDuration(0L)
                                    .currDuration(0L)
                                    .createTime(new Date())
                                    .build();
            this.save(task);
            this.executeAfterCommit(task);
            return task;
        }
    }

    public static class RecordingLoadTaskExecutor extends LoadTaskExecutor {

        private final AtomicInteger executions = new AtomicInteger();
        private final java.util.Map<LoadTask, Runnable> callbacks =
                Collections.synchronizedMap(new java.util.IdentityHashMap<>());
        private volatile boolean reject;

        @Override
        public void execute(LoadTask task, Runnable callback) {
            this.executions.incrementAndGet();
            if (this.reject) {
                throw new org.springframework.core.task.TaskRejectedException(
                        "test executor queue is full");
            }
            this.callbacks.put(task, callback);
        }

        public void complete(LoadTask task) {
            Runnable callback = this.callbacks.remove(task);
            Assert.assertNotNull("A recorded dispatch must run its actual service callback", callback);
            try {
                callback.run();
            } catch (RuntimeException | Error failure) {
                if (!task.isCleanupFailed()) {
                    throw failure;
                }
                Assert.assertSame(task.getCleanupFailure(), failure);
            }
        }

        public int executions() {
            return this.executions.get();
        }

        public void reject(boolean reject) {
            this.reject = reject;
        }

        public void reset() {
            this.executions.set(0);
            this.callbacks.clear();
            this.reject = false;
        }
    }
}
