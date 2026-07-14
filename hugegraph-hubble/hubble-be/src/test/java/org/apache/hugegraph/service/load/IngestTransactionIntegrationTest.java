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
import java.util.concurrent.atomic.AtomicInteger;

import javax.sql.DataSource;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mockito;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import org.apache.hugegraph.config.HugeConfig;
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
import org.apache.hugegraph.service.schema.EdgeLabelService;
import org.apache.hugegraph.service.schema.VertexLabelService;
import org.apache.hugegraph.testutil.Assert;

@RunWith(SpringRunner.class)
@SpringBootTest(classes = IngestTransactionIntegrationTest.TestConfiguration.class,
                webEnvironment = SpringBootTest.WebEnvironment.NONE,
                properties = {
                    "spring.datasource.url=jdbc:h2:mem:ingest-tx;DB_CLOSE_DELAY=-1",
                    "spring.datasource.driver-class-name=org.h2.Driver",
                    "spring.datasource.username=sa",
                    "spring.datasource.password=",
                    "spring.datasource.schema=" +
                    "classpath:database/ingest-transaction-schema.sql",
                    "spring.datasource.initialization-mode=always",
                    "spring.datasource.hikari.maximum-pool-size=2",
                    "spring.autoconfigure.exclude=" +
                    "org.mybatis.spring.boot.autoconfigure.MybatisAutoConfiguration",
                    "mybatis.configuration.map-underscore-to-camel-case=true",
                    "mybatis.configuration.use-generated-keys=true",
                    "mybatis-plus.type-enums-package=org.apache.hugegraph.entity.enums"
                })
public class IngestTransactionIntegrationTest {

    @Autowired
    private JobManagerService jobService;
    @Autowired
    private TestLoadTaskService taskService;
    @Autowired
    private RecordingLoadTaskExecutor executor;
    @Autowired
    private DataSource dataSource;
    @MockBean
    private VertexLabelService vertexLabelService;
    @MockBean
    private EdgeLabelService edgeLabelService;

    private JdbcTemplate jdbc;

    @Before
    public void setup() {
        this.jdbc = new JdbcTemplate(this.dataSource);
        this.cleanup();
        this.executor.reset();
        this.taskService.failTaskInsert(false);
    }

    @After
    public void teardown() {
        this.cleanup();
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

        Assert.assertThrows(RuntimeException.class, () -> {
            this.jobService.createIngestTask(this.job(), this.mapping(),
                                             this.connection(), this.client());
        });

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

        public void failTaskInsert(boolean fail) {
            this.failTaskInsert = fail;
        }

        @Override
        public LoadTask start(GraphConnection connection, FileMapping mapping,
                              HugeClient client) {
            String graph = this.failTaskInsert ? null : connection.getGraph();
            LoadOptions options = new LoadOptions();
            options.token = connection.getToken();
            LoadTask task = LoadTask.builder()
                                    .graphSpace(connection.getGraphSpace())
                                    .graph(graph)
                                    .jobId(mapping.getJobId())
                                    .fileId(mapping.getId())
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
        private volatile boolean reject;

        @Override
        public void execute(LoadTask task, Runnable callback) {
            this.executions.incrementAndGet();
            if (this.reject) {
                throw new org.springframework.core.task.TaskRejectedException(
                        "test executor queue is full");
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
            this.reject = false;
        }
    }
}
