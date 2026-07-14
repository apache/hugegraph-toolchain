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

import java.io.OutputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import com.sun.net.httpserver.HttpServer;
import org.junit.Assert;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.controller.algorithm.VermeerAlgoController;
import org.apache.hugegraph.exception.ServerCapabilityUnavailableException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.space.VermeerService;

public class VermeerCredentialSafetyTest {

    @Test
    public void testVermeerStatusUsesServerToken() throws Exception {
        AtomicReference<String> authorization = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1",
                                                                    0), 0);
        server.createContext("/api/v1.0/memt_clu/config/getsyscfg", exchange -> {
            authorization.set(exchange.getRequestHeaders()
                                      .getFirst("Authorization"));
            byte[] body = "{\"data\":{\"cfgvalue\":\"true\"}}".getBytes(
                          StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(body);
            }
        });
        server.start();
        try {
            HugeConfig config = Mockito.mock(HugeConfig.class);
            Mockito.when(config.get(HubbleOptions.DASHBOARD_ADDRESS))
                   .thenReturn("127.0.0.1:" + server.getAddress().getPort());
            Mockito.when(config.get(HubbleOptions.SERVER_PROTOCOL))
                   .thenReturn("http");
            VermeerService service = new VermeerService();
            ReflectionTestUtils.setField(service, "config", config);

            Map<String, Object> status = service.getVermeer("server-token",
                                                            true);

            Assert.assertEquals(Boolean.TRUE, status.get("enable"));
            Assert.assertEquals("Bearer server-token", authorization.get());
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void testVermeerComputeFailsBeforeBuildingPasswordParams()
           throws Exception {
        Method method = VermeerAlgoController.class.getDeclaredMethods()[0];
        for (Method candidate : VermeerAlgoController.class.getDeclaredMethods()) {
            if ("olapView".equals(candidate.getName())) {
                method = candidate;
                break;
            }
        }

        try {
            method.invoke(new VermeerAlgoController(), "DEFAULT", "hugegraph",
                          null);
            Assert.fail("Expected unavailable token-auth capability");
        } catch (InvocationTargetException e) {
            Assert.assertTrue(e.getCause() instanceof
                              ServerCapabilityUnavailableException);
        }
    }
}
