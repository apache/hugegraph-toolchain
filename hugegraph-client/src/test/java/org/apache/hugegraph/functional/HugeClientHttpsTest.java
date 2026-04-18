/*
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

package org.apache.hugegraph.functional;

import java.util.Map;

import org.apache.hugegraph.driver.GraphManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.SchemaManager;
import org.apache.hugegraph.structure.constant.T;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.testutil.Assert;
import org.apache.hugegraph.util.CommonUtil;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import com.google.common.collect.ImmutableMap;

public class HugeClientHttpsTest extends BaseFuncTest {

    private static final String BASE_URL = "https://127.0.0.1:8443";
    private static final String GRAPHSPACE = "DEFAULT";
    private static final String GRAPH = "hugegraph";
    private static final String USERNAME = "admin";
    private static final String PASSWORD = "pa";
    private static final int TIMEOUT = 10;
    private static final int MAX_CONNS_PER_ROUTE = 10;
    private static final int MAX_CONNS = 10;
    private static final int IDLE_TIME = 30;
    private static final String TRUST_STORE_PATH = "src/test/resources/hugegraph.truststore";
    private static final String TRUST_STORE_PASSWORD = "hugegraph";

    private static HugeClient client;

    @Before
    public void initBaseFuncTest() {
        CommonUtil.downloadFileByUrl(CommonUtil.PREFIX + "hugegraph.truststore", TRUST_STORE_PATH);
    }

    @After
    public void teardown() throws Exception {
        Assert.assertNotNull("Client is not opened", client);
        client.close();
    }

    @Test
    public void testHttpsClientBuilderWithConnection() {
        client = HugeClient.builder(BASE_URL, GRAPHSPACE, GRAPH)
                           .configUser(USERNAME, PASSWORD)
                           .configSSL(TRUST_STORE_PATH, TRUST_STORE_PASSWORD)
                           .build();
        Assert.assertTrue(client.graphs().listGraph().contains("hugegraph"));
        this.addVertexAndCheckPropertyValue();
    }

    @Test
    public void testHttpsClientWithConnectionPoolNoUserParam() {
        client = HugeClient.builder(BASE_URL, GRAPHSPACE, GRAPH)
                           .configUser(USERNAME, PASSWORD)
                           .configConnectTimeout(3)
                           .configReadTimeout(10)
                           .configPool(MAX_CONNS, MAX_CONNS_PER_ROUTE)
                           .configSSL(TRUST_STORE_PATH, TRUST_STORE_PASSWORD)
                           .build();
        Assert.assertTrue(client.graphs().listGraph().contains("hugegraph"));
        this.addVertexAndCheckPropertyValue();
    }

    @Test
    public void testHttpsClientWithConnectionPoolNoTimeOutParam() {
        client = HugeClient.builder(BASE_URL, GRAPHSPACE, GRAPH)
                           .configUser(USERNAME, PASSWORD)
                           .configPool(MAX_CONNS, MAX_CONNS_PER_ROUTE)
                           .configSSL(TRUST_STORE_PATH, TRUST_STORE_PASSWORD)
                           .build();
        Assert.assertTrue(client.graphs().listGraph().contains("hugegraph"));
        this.addVertexAndCheckPropertyValue();
    }

    @Test
    public void testHttpsClientNewBuilderWithConnectionNoPoolParam() {
        client = HugeClient.builder(BASE_URL, GRAPHSPACE, GRAPH)
                           .configUser(USERNAME, PASSWORD)
                           .configTimeout(TIMEOUT)
                           .configSSL(TRUST_STORE_PATH, TRUST_STORE_PASSWORD)
                           .build();
        Assert.assertTrue(client.graphs().listGraph().contains("hugegraph"));
        this.addVertexAndCheckPropertyValue();
    }

    @Test
    public void testHttpsClientNewBuilderWithConnectionPool() {
        client = HugeClient.builder(BASE_URL, GRAPHSPACE, GRAPH)
                           .configUser(USERNAME, PASSWORD)
                           .configTimeout(TIMEOUT)
                           .configPool(MAX_CONNS, MAX_CONNS_PER_ROUTE)
                           .configSSL(TRUST_STORE_PATH, TRUST_STORE_PASSWORD)
                           .configIdleTime(IDLE_TIME)
                           .build();
        Assert.assertTrue(client.graphs().listGraph().contains("hugegraph"));
        this.addVertexAndCheckPropertyValue();
    }

    @Test
    public void testHttpsClientNewBuilderZeroPoolParam() {
        client = HugeClient.builder(BASE_URL, GRAPHSPACE, GRAPH)
                           .configUser(USERNAME, PASSWORD)
                           .configTimeout(TIMEOUT)
                           .configPool(0, 0)
                           .configSSL(TRUST_STORE_PATH, TRUST_STORE_PASSWORD)
                           .build();
        Assert.assertTrue(client.graphs().listGraph().contains("hugegraph"));
        this.addVertexAndCheckPropertyValue();
    }

    @Test
    public void testHttpsClientBuilderWithConnectionPoolNoParam() {
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            HugeClient.builder(BASE_URL, GRAPHSPACE, GRAPH)
                      .configUser(USERNAME, PASSWORD)
                      .configUrl(null)
                      .configGraph(null)
                      .configSSL("", "")
                      .build();
        }, e -> {
            Assert.assertContains("Expect a string value as the url parameter argument",
                                  e.getMessage());
        });
    }

    @Test
    public void testHttpsClientBuilderWithConnectionPoolNoGraphParam() {
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            HugeClient.builder(BASE_URL, GRAPHSPACE, GRAPH)
                      .configUser(USERNAME, PASSWORD)
                      .configGraph(null)
                      .configSSL("", "")
                      .build();
        }, e -> {
            Assert.assertContains("Expect a string value as the graph name parameter argument",
                                  e.getMessage());
        });
    }

    @Test
    public void testHttpsClientBuilderWithConnectionPoolZeroIdleTimeParam() {
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            HugeClient.builder(BASE_URL, GRAPHSPACE, GRAPH)
                      .configUser(USERNAME, PASSWORD)
                      .configIdleTime(0)
                      .build();
        }, e -> {
            Assert.assertContains("The idleTime parameter must be > 0, but got",
                                  e.getMessage());
        });
    }

    private void addVertexAndCheckPropertyValue() {
        SchemaManager schema = client.schema();
        schema.propertyKey("name").asText().ifNotExist().create();
        schema.propertyKey("age").asInt().ifNotExist().create();
        schema.propertyKey("city").asText().ifNotExist().create();
        schema.vertexLabel("person")
              .properties("name", "age", "city")
              .primaryKeys("name")
              .ifNotExist()
              .create();
        GraphManager graph = client.graph();
        Vertex marko = graph.addVertex(T.LABEL, "person", "name", "marko",
                                       "age", 29, "city", "Beijing");
        Map<String, Object> props = ImmutableMap.of("name", "marko",
                                                    "age", 29,
                                                    "city", "Beijing");
        Assert.assertEquals(props, marko.properties());
    }
}
