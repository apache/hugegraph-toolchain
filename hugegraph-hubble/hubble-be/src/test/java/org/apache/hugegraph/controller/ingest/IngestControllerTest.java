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

package org.apache.hugegraph.controller.ingest;

import java.io.File;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.After;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.common.Response;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.config.ProxyServletConfiguration;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.enums.FileMappingStatus;
import org.apache.hugegraph.entity.enums.JobStatus;
import org.apache.hugegraph.entity.enums.LoadStatus;
import org.apache.hugegraph.entity.GraphConnection;
import org.apache.hugegraph.entity.load.Datasource;
import org.apache.hugegraph.entity.load.FileMapping;
import org.apache.hugegraph.entity.load.JobManager;
import org.apache.hugegraph.entity.load.LoadTask;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.load.DatasourceService;
import org.apache.hugegraph.service.load.FileMappingService;
import org.apache.hugegraph.service.load.JobManagerService;
import org.apache.hugegraph.service.load.LoadTaskService;
import org.apache.hugegraph.testutil.Assert;

public class IngestControllerTest {

    @After
    public void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    public void testCreateFileTaskSavesMappingAndStartsLoader()
           throws Exception {
        Path uploadRoot = Files.createTempDirectory("hubble-ingest-root");
        Path dataFile = uploadRoot.resolve("data.csv");
        Files.write(dataFile, Collections.singletonList("marko"));

        TestIngestController controller = new TestIngestController();
        HugeConfig config = this.mockConfig(uploadRoot);
        DatasourceService datasourceService = Mockito.mock(DatasourceService.class);
        JobManagerService jobService = Mockito.mock(JobManagerService.class);
        FileMappingService fileMappingService = Mockito.mock(FileMappingService.class);
        LoadTaskService loadTaskService = Mockito.mock(LoadTaskService.class);
        this.setField(controller, "config", config);
        this.setField(controller, "datasourceService", datasourceService);
        this.setField(controller, "jobManagerService", jobService);
        this.setField(controller, "fileMappingService", fileMappingService);
        this.setField(controller, "loadTaskService", loadTaskService);

        Datasource datasource = new Datasource();
        datasource.setId(1);
        datasource.setDatasourceName("local");
        Map<String, Object> datasourceConfig = new HashMap<>();
        datasourceConfig.put("type", "FILE");
        datasourceConfig.put("path", dataFile.toString());
        datasourceConfig.put("format", "CSV");
        datasourceConfig.put("header", Collections.singletonList("name"));
        datasource.setDatasourceConfig(datasourceConfig);
        Mockito.when(datasourceService.get(1)).thenReturn(datasource);
        Mockito.when(fileMappingService.requirePathUnderUploadRoot(
                dataFile.toString())).thenReturn(dataFile.toFile());
        Mockito.when(jobService.createIngestTask(
                Mockito.any(JobManager.class), Mockito.any(FileMapping.class),
                Mockito.any(GraphConnection.class), Mockito.any(HugeClient.class)))
               .thenAnswer(invocation -> {
                   JobManager job = invocation.getArgument(0);
                   FileMapping mapping = invocation.getArgument(1);
                   job.setId(7);
                   mapping.setJobId(7);
                   mapping.setId(8);
                   return LoadTask.builder().id(9).build();
               });
        this.bindRequestSession("alice");

        Response response = controller.createTask(this.request(dataFile));

        Assert.assertEquals(Constant.STATUS_OK, response.getStatus());
        ArgumentCaptor<JobManager> jobCaptor =
                ArgumentCaptor.forClass(JobManager.class);
        ArgumentCaptor<FileMapping> mappingCaptor =
                ArgumentCaptor.forClass(FileMapping.class);
        Mockito.verify(jobService).createIngestTask(
                jobCaptor.capture(), mappingCaptor.capture(),
                Mockito.any(GraphConnection.class), Mockito.any(HugeClient.class));
        FileMapping mapping = mappingCaptor.getValue();
        Assert.assertEquals(7, mapping.getJobId().intValue());
        Assert.assertEquals(FileMappingStatus.COMPLETED,
                            mapping.getFileStatus());
        Assert.assertEquals(Collections.singletonList("name"),
                            mapping.getFileSetting().getColumnNames());
        Assert.assertEquals(Collections.singletonList("name"),
                            mapping.getVertexMappings().iterator().next()
                                   .getIdFields());
        Assert.assertEquals(JobStatus.LOADING, jobCaptor.getValue()
                                                        .getJobStatus());
    }

    @Test
    public void testCreateFileTaskRejectsEmptyMappingBeforePersistence()
           throws Exception {
        Path uploadRoot = Files.createTempDirectory("hubble-ingest-empty");
        Path dataFile = uploadRoot.resolve("data.csv");
        Files.write(dataFile, Collections.singletonList("marko"));

        TestIngestController controller = new TestIngestController();
        DatasourceService datasourceService = Mockito.mock(DatasourceService.class);
        JobManagerService jobService = Mockito.mock(JobManagerService.class);
        FileMappingService fileMappingService = Mockito.mock(FileMappingService.class);
        this.setField(controller, "config", this.mockConfig(uploadRoot));
        this.setField(controller, "datasourceService", datasourceService);
        this.setField(controller, "jobManagerService", jobService);
        this.setField(controller, "fileMappingService", fileMappingService);

        Datasource datasource = new Datasource();
        datasource.setId(1);
        Map<String, Object> datasourceConfig = new HashMap<>();
        datasourceConfig.put("type", "FILE");
        datasourceConfig.put("path", dataFile.toString());
        datasourceConfig.put("format", "CSV");
        datasourceConfig.put("header", Collections.singletonList("name"));
        datasource.setDatasourceConfig(datasourceConfig);
        Mockito.when(datasourceService.get(1)).thenReturn(datasource);
        Mockito.when(fileMappingService.requirePathUnderUploadRoot(
                dataFile.toString())).thenReturn(dataFile.toFile());

        IngestController.IngestTaskRequest request = this.request(dataFile);
        IngestController.IngestStruct struct =
                request.ingestionMapping.structs.get(0);
        struct.vertices = Collections.emptyList();

        Assert.assertThrows(ExternalException.class, () -> {
            controller.createTask(request);
        });
        Mockito.verify(jobService, Mockito.never()).createIngestTask(
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any());
    }

    @Test
    public void testOrdinaryAuthenticatedUserCanCreateDatasource()
            throws Exception {
        IngestController controller = new IngestController();
        DatasourceService datasourceService =
                Mockito.mock(DatasourceService.class);
        this.setField(controller, "datasourceService", datasourceService);
        Datasource datasource = new Datasource();
        datasource.setDatasourceName("alice-file");
        Mockito.doAnswer(invocation -> {
            invocation.getArgument(0, Datasource.class).setId(1);
            return null;
        }).when(datasourceService).save(Mockito.any(Datasource.class));
        this.bindRequestSession("alice");

        Response response = controller.datasourceCreate(datasource);

        Assert.assertEquals(Constant.STATUS_OK, response.getStatus());
        Mockito.verify(datasourceService).save(datasource);
    }

    @Test
    public void testProxyServletSkipsPlaceholderTarget() throws Exception {
        ProxyServletConfiguration proxy = new ProxyServletConfiguration();
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PROXY_SERVLET_URL))
               .thenReturn("/api/v1.3/ingest/*");
        Mockito.when(config.get(HubbleOptions.PROXY_TARGET_URL))
               .thenReturn("WhatURLAtHere");
        this.setField(proxy, "config", config);

        Assert.assertNull(proxy.servletRegistrationBean());
    }

    @Test
    public void testJobListRateDoesNotBecomeInfinityForSubSecondTask()
           throws Exception {
        TestIngestController controller = new TestIngestController();
        LoadTaskService loadTaskService = Mockito.mock(LoadTaskService.class);
        this.setField(controller, "loadTaskService", loadTaskService);

        LoadTask task = LoadTask.builder()
                                .id(9)
                                .jobId(7)
                                .status(LoadStatus.SUCCEED)
                                .fileReadLines(3L)
                                .lastDuration(63L)
                                .currDuration(0L)
                                .build();
        Mockito.when(loadTaskService.taskListByJob(7))
               .thenReturn(Collections.singletonList(task));

        Response response = controller.jobList(7, 1, 10);

        Assert.assertEquals(Constant.STATUS_OK, response.getStatus());
        @SuppressWarnings("unchecked")
        Map<String, Object> data = (Map<String, Object>) response.getData();
        @SuppressWarnings("unchecked")
        List<IngestController.JobVO> records =
                (List<IngestController.JobVO>) data.get("records");
        IngestController.JobMetricsVO metrics = records.get(0).jobMetrics;
        Assert.assertEquals(3, (int) metrics.avgRate);
        Assert.assertEquals(0, (int) metrics.curRate);
        Assert.assertEquals(63L, metrics.totalTime);
    }

    private IngestController.IngestTaskRequest request(Path dataFile) {
        IngestController.IngestTaskRequest request =
                new IngestController.IngestTaskRequest();
        request.taskName = "load-person";
        request.datasourceId = 1;
        request.taskScheduleType = "ONCE";
        request.ingestionOption = new IngestController.IngestionOption();
        request.ingestionOption.graphspace = "DEFAULT";
        request.ingestionOption.graph = "hugegraph";
        request.ingestionMapping = new IngestController.IngestionMapping();
        IngestController.IngestStruct struct =
                new IngestController.IngestStruct();
        struct.input = new HashMap<>();
        struct.input.put("path", dataFile.toString());
        struct.input.put("header", Collections.singletonList("name"));
        Map<String, Object> vertex = new HashMap<>();
        vertex.put("label", "person");
        vertex.put("id", "name");
        vertex.put("field_mapping", Map.of("name", "name"));
        vertex.put("null_values", Collections.singletonList(""));
        struct.vertices = Collections.singletonList(vertex);
        struct.edges = Collections.emptyList();
        request.ingestionMapping.structs = Collections.singletonList(struct);
        return request;
    }

    private HugeConfig mockConfig(Path uploadRoot) {
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.UPLOAD_FILE_LOCATION))
               .thenReturn(uploadRoot.toString());
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        Mockito.when(config.get(HubbleOptions.PD_CLUSTER)).thenReturn("");
        Mockito.when(config.get(HubbleOptions.ROUTE_TYPE)).thenReturn("");
        Mockito.when(config.get(HubbleOptions.PD_PEERS)).thenReturn("");
        Mockito.when(config.get(HubbleOptions.SERVER_URL))
               .thenReturn("http://127.0.0.1:8080");
        return config;
    }

    private void bindRequestSession(String username) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession().setAttribute(Constant.TOKEN_KEY, "token");
        request.getSession().setAttribute(Constant.USERNAME_KEY, username);
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(request));
    }

    private void setField(Object object, String name, Object value)
                          throws Exception {
        Class<?> type = object.getClass();
        while (type != null) {
            try {
                Field field = type.getDeclaredField(name);
                field.setAccessible(true);
                field.set(object, value);
                return;
            } catch (NoSuchFieldException ignored) {
                type = type.getSuperclass();
            }
        }
        throw new NoSuchFieldException(name);
    }

    private static class TestIngestController extends IngestController {

        @Override
        protected HugeClient authClient(String graphSpace, String graph) {
            return Mockito.mock(HugeClient.class);
        }
    }
}
