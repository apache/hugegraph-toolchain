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

package org.apache.hugegraph.unit;

import java.lang.reflect.Method;
import java.lang.reflect.Field;
import java.util.Arrays;
import java.util.concurrent.ConcurrentHashMap;

import org.junit.Test;

import org.apache.hugegraph.entity.GraphConnection;
import org.apache.hugegraph.entity.load.FileMapping;
import org.apache.hugegraph.entity.load.LoadParameter;
import org.apache.hugegraph.entity.load.LoadTask;
import org.apache.hugegraph.handler.LoadTaskExecutor;
import org.apache.hugegraph.loader.executor.LoadOptions;
import org.apache.hugegraph.service.load.LoadTaskService;
import org.apache.hugegraph.mapper.load.LoadTaskMapper;
import org.apache.hugegraph.testutil.Assert;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;

public class LoadTaskServiceTest {

    @Test
    public void testListByIdsAppliesGraphScope() throws Exception {
        LoadTaskService service = new LoadTaskService();
        LoadTaskMapper mapper = Mockito.mock(LoadTaskMapper.class);
        Field field = LoadTaskService.class.getDeclaredField("mapper");
        field.setAccessible(true);
        field.set(service, mapper);

        service.list("space-a", "graph-a", 7, Arrays.asList(1, 2));

        ArgumentCaptor<QueryWrapper> query =
                ArgumentCaptor.forClass(QueryWrapper.class);
        Mockito.verify(mapper).selectList(query.capture());
        Assert.assertContains("job_id", query.getValue().getSqlSegment());
        Mockito.verify(mapper, Mockito.never()).selectBatchIds(Mockito.any());
    }

    @Test
    public void testLoadOptionsPreferBasicCredentialPassword()
           throws Exception {
        GraphConnection connection = this.connection("admin-pass",
                                                     "session-token");

        LoadOptions options = this.buildLoadOptions(connection);

        Assert.assertEquals("admin", options.username);
        Assert.assertEquals("admin-pass", options.password);
        Assert.assertNull(options.token);
    }

    @Test
    public void testLoadExecutionWaitsForOuterTransactionCommit()
           throws Exception {
        LoadTaskService service = new LoadTaskService();
        LoadTaskExecutor executor = Mockito.mock(LoadTaskExecutor.class);
        this.setField(service, "taskExecutor", executor);
        this.setField(service, "runningTaskContainer", new ConcurrentHashMap<>());
        LoadTask task = LoadTask.builder().id(9).build();
        Method method = LoadTaskService.class.getDeclaredMethod(
                "executeAfterCommit", LoadTask.class);
        method.setAccessible(true);

        TransactionSynchronizationManager.initSynchronization();
        try {
            method.invoke(service, task);
            Mockito.verify(executor, Mockito.never())
                   .execute(Mockito.any(), Mockito.any());

            TransactionSynchronization synchronization =
                    TransactionSynchronizationManager.getSynchronizations()
                                                     .get(0);
            synchronization.afterCommit();
            Mockito.verify(executor).execute(Mockito.eq(task), Mockito.any());
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    public void testLoadOptionsUseTokenWithoutCredentialPassword()
           throws Exception {
        GraphConnection connection = this.connection(null, "session-token");

        LoadOptions options = this.buildLoadOptions(connection);

        Assert.assertEquals("admin", options.username);
        Assert.assertNull(options.password);
        Assert.assertEquals("session-token", options.token);
    }

    @Test
    public void testLoadOptionsKeepPdRoutingWithoutHostPort()
           throws Exception {
        GraphConnection connection = this.pdConnection();

        LoadOptions options = this.buildLoadOptions(connection);

        Assert.assertEquals("analytics", options.graphSpace);
        Assert.assertEquals("hugegraph", options.graph);
        Assert.assertEquals("127.0.0.1:8686", options.pdPeers);
        Assert.assertEquals("cluster-a", options.cluster);
        Assert.assertEquals("BOTH", options.routeType);
        Assert.assertEquals("admin", options.username);
        Assert.assertEquals("admin-pass", options.password);
        Assert.assertNull(options.token);
        Assert.assertEquals("localhost", options.host);
        Assert.assertEquals(8080, options.port);
    }

    @Test
    public void testLoadOptionsPreferDirectServerOverPdPeers()
           throws Exception {
        GraphConnection connection = this.connection("admin-pass",
                                                     "session-token");
        connection.setCluster("cluster-a");
        connection.setRouteType("BOTH");
        connection.setPdPeers("127.0.0.1:8686");
        connection.setGraphSpace("DEFAULT");

        LoadOptions options = this.buildLoadOptions(connection);

        Assert.assertNull(options.pdPeers);
        Assert.assertEquals("127.0.0.1", options.host);
        Assert.assertEquals(8080, options.port);
        Assert.assertEquals("DEFAULT", options.graphSpace);
        Assert.assertEquals("hugegraph", options.graph);
        Assert.assertEquals("admin-pass", options.password);
    }

    private LoadOptions buildLoadOptions(GraphConnection connection)
            throws Exception {
        LoadTaskService service = new LoadTaskService();
        Method method = LoadTaskService.class.getDeclaredMethod(
                "buildLoadOptions", GraphConnection.class, FileMapping.class);
        method.setAccessible(true);
        return (LoadOptions) method.invoke(service, connection,
                                           this.fileMapping());
    }

    private void setField(Object object, String name, Object value)
                          throws Exception {
        Field field = object.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(object, value);
    }

    private GraphConnection connection(String password, String token) {
        GraphConnection connection = new GraphConnection();
        connection.setGraph("hugegraph");
        connection.setHost("127.0.0.1");
        connection.setPort(8080);
        connection.setUsername("admin");
        connection.setPassword(password);
        connection.setToken(token);
        connection.setProtocol("http");
        return connection;
    }

    private GraphConnection pdConnection() {
        GraphConnection connection = new GraphConnection();
        connection.setCluster("cluster-a");
        connection.setRouteType("BOTH");
        connection.setPdPeers("127.0.0.1:8686");
        connection.setGraphSpace("analytics");
        connection.setGraph("hugegraph");
        connection.setUsername("admin");
        connection.setPassword("admin-pass");
        connection.setToken("session-token");
        return connection;
    }

    private FileMapping fileMapping() {
        FileMapping fileMapping = new FileMapping();
        fileMapping.setPath("/tmp/hubble-loader/edges.csv");
        fileMapping.setLoadParameter(LoadParameter.builder()
                                                  .checkVertex(false)
                                                  .insertTimeout(60)
                                                  .maxParseErrors(1)
                                                  .maxInsertErrors(1)
                                                  .retryTimes(1)
                                                  .retryInterval(1)
                                                  .build());
        return fileMapping;
    }
}
