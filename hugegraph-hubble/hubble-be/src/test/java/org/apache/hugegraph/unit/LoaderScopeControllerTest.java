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

import java.util.Collections;
import java.util.Arrays;

import org.apache.hugegraph.controller.load.FileMappingController;
import org.apache.hugegraph.controller.load.JobManagerController;
import org.apache.hugegraph.controller.load.LoadTaskController;
import org.apache.hugegraph.entity.load.FileMapping;
import org.apache.hugegraph.entity.load.JobManager;
import org.apache.hugegraph.entity.load.LoadTask;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.service.load.FileMappingService;
import org.apache.hugegraph.service.load.JobManagerService;
import org.apache.hugegraph.service.load.LoadTaskService;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

public class LoaderScopeControllerTest {

    @Test
    public void testJobCreateRejectsMissingNameAsParameterError() {
        JobManagerService service = Mockito.mock(JobManagerService.class);
        JobManagerController controller = new JobManagerController(service);

        try {
            controller.create("space-a", "graph-a", JobManager.builder().build());
            org.junit.Assert.fail("Expected a parameter error for missing job_name");
        } catch (ExternalException expected) {
            // Expected: the controller must not leak a NullPointerException.
        }
        Mockito.verifyZeroInteractions(service);
    }

    @Test
    public void testJobCreateNormalizesOptionalNullRemarks() {
        JobManagerService service = Mockito.mock(JobManagerService.class);
        JobManager entity = JobManager.builder().jobName("task_1").build();
        JobManagerController controller = new JobManagerController(service);

        controller.create("space-a", "graph-a", entity);

        org.junit.Assert.assertEquals("", entity.getJobRemarks());
        Mockito.verify(service).save(entity);
    }

    @Test
    public void testJobLookupUsesGraphScope() {
        JobManagerService service = Mockito.mock(JobManagerService.class);
        JobManager expected = new JobManager();
        Mockito.when(service.get("space-a", "graph-a", 7))
               .thenReturn(expected);

        JobManagerController controller = new JobManagerController(service);

        org.junit.Assert.assertSame(expected,
                                    controller.get("space-a", "graph-a", 7));
    }

    @Test
    public void testFileClearUsesNestedScope() {
        FileMappingService service = Mockito.mock(FileMappingService.class);
        FileMapping mapping = FileMapping.builder().id(11).build();
        Mockito.when(service.listByJob("space-a", "graph-a", 7))
               .thenReturn(Collections.singletonList(mapping));
        FileMappingController controller = new FileMappingController();
        ReflectionTestUtils.setField(controller, "service", service);

        controller.clear("space-a", "graph-a", 7);

        Mockito.verify(service).remove(11);
        Mockito.verify(service, Mockito.never()).listAll();
    }

    @Test
    public void testLoadTaskLookupUsesNestedScope() {
        LoadTaskService service = Mockito.mock(LoadTaskService.class);
        LoadTask expected = new LoadTask();
        Mockito.when(service.get("space-a", "graph-a", 7, 13))
               .thenReturn(expected);
        LoadTaskController controller = new LoadTaskController(service);

        org.junit.Assert.assertSame(expected,
                                    controller.get("space-a", "graph-a", 7,
                                                   13));
    }

    @Test
    public void testLoadTaskBatchLookupUsesNestedScope() {
        LoadTaskService service = Mockito.mock(LoadTaskService.class);
        LoadTaskController controller = new LoadTaskController(service);

        controller.list("space-a", "graph-a", 7, Arrays.asList(13, 14));

        Mockito.verify(service).list("space-a", "graph-a", 7,
                                     Arrays.asList(13, 14));
    }
}
