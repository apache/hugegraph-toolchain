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

package org.apache.hugegraph.unit;

import java.lang.reflect.Field;
import java.util.Collections;
import java.util.Arrays;

import org.junit.Test;
import org.mockito.Mockito;

import org.apache.hugegraph.entity.enums.JobStatus;
import org.apache.hugegraph.entity.enums.LoadStatus;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.GraphConnection;
import org.apache.hugegraph.entity.load.FileMapping;
import org.apache.hugegraph.entity.load.JobManager;
import org.apache.hugegraph.entity.load.LoadTask;
import org.apache.hugegraph.mapper.load.JobManagerMapper;
import org.apache.hugegraph.service.load.JobManagerService;
import org.apache.hugegraph.service.load.FileMappingService;
import org.apache.hugegraph.service.load.LoadTaskService;
import org.apache.hugegraph.testutil.Assert;

public class JobManagerServiceTest {

    @Test
    public void testListByIdsAppliesGraphScope() throws Exception {
        JobManagerService service = this.service();
        JobManagerMapper mapper = Mockito.mock(JobManagerMapper.class);
        this.setField(service, "mapper", mapper);

        service.list("space-a", "graph-a", Arrays.asList(1, 2));

        Mockito.verify(mapper).selectList(Mockito.any());
        Mockito.verify(mapper, Mockito.never()).selectBatchIds(Mockito.any());
    }

    @Test
    public void testRefreshStatusMarksSucceededWhenAllLoadTasksSucceed()
           throws Exception {
        JobManagerService service = this.service();
        LoadTaskService taskService = Mockito.mock(LoadTaskService.class);
        JobManagerMapper mapper = Mockito.mock(JobManagerMapper.class);
        this.setField(service, "taskService", taskService);
        this.setField(service, "mapper", mapper);

        JobManager job = JobManager.builder()
                                   .id(1)
                                   .jobStatus(JobStatus.LOADING)
                                   .build();
        LoadTask task = LoadTask.builder().status(LoadStatus.SUCCEED).build();
        Mockito.when(taskService.taskListByJob(1))
               .thenReturn(Collections.singletonList(task));
        Mockito.when(mapper.updateById(job)).thenReturn(1);

        service.refreshStatus(job);

        Assert.assertEquals(JobStatus.SUCCESS, job.getJobStatus());
        Mockito.verify(mapper).updateById(job);
    }

    @Test
    public void testRefreshStatusMarksFailedWhenAnyLoadTaskFails()
           throws Exception {
        JobManagerService service = this.service();
        LoadTaskService taskService = Mockito.mock(LoadTaskService.class);
        JobManagerMapper mapper = Mockito.mock(JobManagerMapper.class);
        this.setField(service, "taskService", taskService);
        this.setField(service, "mapper", mapper);

        JobManager job = JobManager.builder()
                                   .id(1)
                                   .jobStatus(JobStatus.LOADING)
                                   .build();
        LoadTask task = LoadTask.builder().status(LoadStatus.FAILED).build();
        Mockito.when(taskService.taskListByJob(1))
               .thenReturn(Collections.singletonList(task));
        Mockito.when(mapper.updateById(job)).thenReturn(1);

        service.refreshStatus(job);

        Assert.assertEquals(JobStatus.FAILED, job.getJobStatus());
        Mockito.verify(mapper).updateById(job);
    }

    @Test
    public void testRefreshStatusKeepsLoadingWhenAnyLoadTaskRuns()
           throws Exception {
        JobManagerService service = this.service();
        LoadTaskService taskService = Mockito.mock(LoadTaskService.class);
        JobManagerMapper mapper = Mockito.mock(JobManagerMapper.class);
        this.setField(service, "taskService", taskService);
        this.setField(service, "mapper", mapper);

        JobManager job = JobManager.builder()
                                   .id(1)
                                   .jobStatus(JobStatus.LOADING)
                                   .build();
        LoadTask task = LoadTask.builder().status(LoadStatus.RUNNING).build();
        Mockito.when(taskService.taskListByJob(1))
               .thenReturn(Collections.singletonList(task));

        service.refreshStatus(job);

        Assert.assertEquals(JobStatus.LOADING, job.getJobStatus());
        Mockito.verify(mapper, Mockito.never()).updateById(Mockito.any());
    }

    @Test
    public void testCreateIngestTaskPersistsOneAtomicUnit() throws Exception {
        JobManagerService service = this.service();
        JobManagerMapper mapper = Mockito.mock(JobManagerMapper.class);
        FileMappingService mappingService = Mockito.mock(FileMappingService.class);
        LoadTaskService taskService = Mockito.mock(LoadTaskService.class);
        this.setField(service, "mapper", mapper);
        this.setField(service, "fileMappingService", mappingService);
        this.setField(service, "taskService", taskService);

        JobManager job = JobManager.builder().id(7).build();
        FileMapping mapping = new FileMapping();
        GraphConnection connection = new GraphConnection();
        HugeClient client = Mockito.mock(HugeClient.class);
        LoadTask task = LoadTask.builder().id(9).build();
        Mockito.when(mapper.insert(job)).thenReturn(1);
        Mockito.when(taskService.start(connection, mapping, client))
               .thenReturn(task);

        Assert.assertSame(task, service.createIngestTask(job, mapping,
                                                        connection, client));
        Assert.assertEquals(7, mapping.getJobId().intValue());
        Mockito.verify(mapper).insert(job);
        Mockito.verify(mappingService).save(mapping);
        Mockito.verify(taskService).start(connection, mapping, client);
    }

    @Test
    public void testCreateIngestTaskPropagatesLoadBuildFailure()
           throws Exception {
        JobManagerService service = this.service();
        JobManagerMapper mapper = Mockito.mock(JobManagerMapper.class);
        FileMappingService mappingService = Mockito.mock(FileMappingService.class);
        LoadTaskService taskService = Mockito.mock(LoadTaskService.class);
        this.setField(service, "mapper", mapper);
        this.setField(service, "fileMappingService", mappingService);
        this.setField(service, "taskService", taskService);

        JobManager job = JobManager.builder().id(7).build();
        FileMapping mapping = new FileMapping();
        GraphConnection connection = new GraphConnection();
        HugeClient client = Mockito.mock(HugeClient.class);
        Mockito.when(mapper.insert(job)).thenReturn(1);
        Mockito.when(taskService.start(connection, mapping, client))
               .thenThrow(new IllegalArgumentException("invalid mapping"));

        Assert.assertThrows(IllegalArgumentException.class, () -> {
            service.createIngestTask(job, mapping, connection, client);
        });
        Mockito.verify(mappingService).save(mapping);
        Mockito.verify(taskService).start(connection, mapping, client);
    }

    private JobManagerService service() {
        return new JobManagerService();
    }

    private void setField(Object object, String name, Object value)
                          throws Exception {
        Field field = object.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(object, value);
    }
}
