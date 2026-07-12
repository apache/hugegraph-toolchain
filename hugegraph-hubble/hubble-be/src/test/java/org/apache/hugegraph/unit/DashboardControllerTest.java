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

import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.Map;

import com.sun.net.httpserver.HttpServer;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.controller.op.DashboardController;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.testutil.Assert;

public class DashboardControllerTest {

    @Test
    public void testReturnsConfiguredHealthyDashboard() throws IOException {
        HttpServer server = dashboardServer(204);
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.DASHBOARD_ADDRESS))
               .thenReturn("127.0.0.1:" + server.getAddress().getPort());
        Mockito.when(config.get(HubbleOptions.SERVER_PROTOCOL))
               .thenReturn("http");
        DashboardController controller = new DashboardController();
        ReflectionTestUtils.setField(controller, "config", config);

        Map<String, Object> result;
        try {
            result = controller.listOperations();
        } finally {
            server.stop(0);
        }

        Assert.assertEquals(true, result.get("configured"));
        Assert.assertEquals(true, result.get("available"));
        Assert.assertEquals("http", result.get("protocol"));
        Mockito.verify(config).get(HubbleOptions.DASHBOARD_ADDRESS);
        Mockito.verify(config).get(HubbleOptions.SERVER_PROTOCOL);
        Mockito.verifyNoMoreInteractions(config);
    }

    @Test
    public void testReportsHttpFailureAsUnavailable() throws IOException {
        HttpServer server = dashboardServer(500);
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.DASHBOARD_ADDRESS))
               .thenReturn("127.0.0.1:" + server.getAddress().getPort());
        Mockito.when(config.get(HubbleOptions.SERVER_PROTOCOL))
               .thenReturn("http");
        DashboardController controller = new DashboardController();
        ReflectionTestUtils.setField(controller, "config", config);

        Map<String, Object> result;
        try {
            result = controller.listOperations();
        } finally {
            server.stop(0);
        }

        Assert.assertEquals(true, result.get("configured"));
        Assert.assertEquals(false, result.get("available"));
    }

    @Test
    public void testReturnsUnconfiguredAsNormalCapabilityState() {
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.DASHBOARD_ADDRESS)).thenReturn("");
        DashboardController controller = new DashboardController();
        ReflectionTestUtils.setField(controller, "config", config);

        Map<String, Object> result = controller.listOperations();

        Assert.assertEquals(false, result.get("configured"));
        Assert.assertFalse(result.containsKey("address"));
        Assert.assertFalse(result.containsKey("protocol"));
        Mockito.verify(config).get(HubbleOptions.DASHBOARD_ADDRESS);
        Mockito.verifyNoMoreInteractions(config);
    }

    private static HttpServer dashboardServer(int status) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/", exchange -> {
            exchange.sendResponseHeaders(status, -1L);
            exchange.close();
        });
        server.start();
        return server;
    }
}
