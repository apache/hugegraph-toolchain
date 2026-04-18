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

import java.util.ArrayList;
import java.util.Date;
import java.util.List;

import org.apache.hugegraph.entity.enums.JobStatus;
import org.apache.hugegraph.entity.enums.LoadStatus;
import org.apache.hugegraph.entity.load.FileMapping;
import org.apache.hugegraph.entity.load.JobManager;
import org.apache.hugegraph.entity.load.LoadTask;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.exception.InternalException;
import org.apache.hugegraph.mapper.load.JobManagerMapper;
import org.apache.hugegraph.util.HubbleUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

import lombok.extern.log4j.Log4j2;

@Log4j2
@Service
public class JobManagerService {

    @Autowired
    private JobManagerMapper mapper;
    @Autowired
    private LoadTaskService taskService;
    @Autowired
    private FileMappingService fileMappingService;

    public int count() {
        return this.mapper.selectCount(null);
    }

    public JobManager get(int id) {
        return this.mapper.selectById(id);
    }

    public JobManager getTask(String jobName, int connId) {
        QueryWrapper<JobManager> query = Wrappers.query();
        query.eq("job_name", jobName);
        query.eq("conn_id", connId);
        return this.mapper.selectOne(query);
    }

    public List<JobManager> list(int connId, List<Integer> jobIds) {
        return this.mapper.selectBatchIds(jobIds);
    }

    public IPage<JobManager> list(int connId, int pageNo, int pageSize, String content) {
        QueryWrapper<JobManager> query = Wrappers.query();
        query.eq("conn_id", connId);
        if (!content.isEmpty()) {
            query.like("job_name", content);
        }
        query.orderByDesc("create_time");
        Page<JobManager> page = new Page<>(pageNo, pageSize);
        IPage<JobManager> list = this.mapper.selectPage(page, query);
        list.getRecords().forEach(task -> {
            if (task.getJobStatus() == JobStatus.LOADING) {
                List<LoadTask> tasks = this.taskService.taskListByJob(task.getId());
                JobStatus status = JobStatus.SUCCESS;
                for (LoadTask loadTask : tasks) {
                    if (loadTask.getStatus().inRunning() ||
                        loadTask.getStatus() == LoadStatus.PAUSED ||
                        loadTask.getStatus() == LoadStatus.STOPPED) {
                        status = JobStatus.LOADING;
                        break;
                    }
                    if (loadTask.getStatus() == LoadStatus.FAILED) {
                        status = JobStatus.FAILED;
                        break;
                    }
                }

                if (status == JobStatus.SUCCESS ||
                    status == JobStatus.FAILED) {
                    task.setJobStatus(status);
                    this.update(task);
                }
            }
            Date endDate = task.getJobStatus() == JobStatus.FAILED ||
                           task.getJobStatus() == JobStatus.SUCCESS ?
                           task.getUpdateTime() : HubbleUtil.nowDate();
            task.setJobDuration(endDate.getTime() - task.getCreateTime().getTime());
        });
        return list;
    }

    public List<JobManager> listAll() {
        return this.mapper.selectList(null);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void save(JobManager entity) {
        if (this.mapper.insert(entity) != 1) {
            throw new InternalException("entity.insert.failed", entity);
        }
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void update(JobManager entity) {
        if (this.mapper.updateById(entity) != 1) {
            throw new InternalException("entity.update.failed", entity);
        }
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void remove(int id) {
        if (this.mapper.deleteById(id) != 1) {
            throw new InternalException("entity.delete.failed", id);
        }
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void deleteJob(int id) {
        JobManager job = this.get(id);
        if (job == null) {
            throw new ExternalException("job.manager.not-exist.id", id);
        }

        List<LoadTask> loadTasks = this.taskService.taskListByJob(id);
        for (LoadTask loadTask : loadTasks) {
            if (loadTask.getStatus().inRunning() ||
                loadTask.getStatus() == LoadStatus.PAUSED) {
                this.taskService.stop(loadTask.getId());
            }
            this.taskService.remove(loadTask.getId());
        }

        List<FileMapping> mappings = this.fileMappingService.listByJob(id);
        this.remove(id);
        this.deleteDiskFilesAfterCommit(mappings);
    }

    private void deleteDiskFilesAfterCommit(List<FileMapping> mappings) {
        if (mappings.isEmpty()) {
            return;
        }

        List<FileMapping> copiedMappings = new ArrayList<>(mappings);
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            this.deleteDiskFiles(copiedMappings);
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        deleteDiskFiles(copiedMappings);
                    }
                });
    }

    private void deleteDiskFiles(List<FileMapping> mappings) {
        this.fileMappingService.cleanupMappings(mappings);
    }
}
