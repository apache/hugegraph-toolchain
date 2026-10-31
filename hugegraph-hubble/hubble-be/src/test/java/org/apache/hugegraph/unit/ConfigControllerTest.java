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

import java.util.Map;

import org.junit.Assert;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.controller.ConfigController;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.HugeClientPoolService;
import org.apache.hugegraph.service.auth.AuthModeService;

public class ConfigControllerTest {

    @Test
    public void testPdConfigUsesDiscoveredServerCapabilities() {
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        HugeClient client = Mockito.mock(HugeClient.class);
        AuthModeService authMode = Mockito.mock(AuthModeService.class);
        Mockito.when(client.isServerAuthEnabled()).thenReturn(false);
        Mockito.when(client.supportsGraphCreate()).thenReturn(false);
        Mockito.when(client.supportsSchemaClone()).thenReturn(true);
        Mockito.when(client.supportsCypher()).thenReturn(true);
        Mockito.when(authMode.update(false)).thenReturn(false);

        ConfigController controller = new ConfigController() {
            @Override
            protected HugeClient createUnauthClient() {
                return client;
            }
        };
        ReflectionTestUtils.setField(controller, "config", config);
        ReflectionTestUtils.setField(controller, "hugeClientPoolService",
                                     new HugeClientPoolService());
        ReflectionTestUtils.setField(controller, "authModeService", authMode);

        Map<String, Object> result = controller.getConfig();

        Assert.assertEquals(Map.of("pd_enabled", true,
                                   "server_capabilities_verified", true,
                                   "auth_enabled", false,
                                   "graph_create_enabled", false,
                                   "schema_clone_enabled", true,
                                   "cypher_enabled", true), result);
        Mockito.verify(client).close();
    }

    @Test
    public void testPdConfigRetriesAfterAuthProbeFailure() {
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        AuthModeService authMode = Mockito.mock(AuthModeService.class);
        ConfigController controller = new ConfigController() {
            @Override
            protected HugeClient createUnauthClient() {
                throw new IllegalStateException("server unavailable");
            }
        };
        ReflectionTestUtils.setField(controller, "config", config);
        ReflectionTestUtils.setField(controller, "hugeClientPoolService",
                                     new HugeClientPoolService());
        ReflectionTestUtils.setField(controller, "authModeService", authMode);

        Map<String, Object> result = controller.getConfig();

        Assert.assertEquals(Map.of("pd_enabled", true,
                                   "server_capabilities_verified", false,
                                   "auth_enabled", true,
                                   "graph_create_enabled", false,
                                   "schema_clone_enabled", false,
                                   "cypher_enabled", false), result);
    }

    @Test
    public void testBootstrapConfigDoesNotExposeBackendUrl() {
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        HugeClient client = Mockito.mock(HugeClient.class);
        AuthModeService authMode = Mockito.mock(AuthModeService.class);
        Mockito.when(client.isServerAuthEnabled()).thenReturn(false);
        Mockito.when(authMode.update(false)).thenReturn(false);

        ConfigController controller = new ConfigController() {
            @Override
            protected HugeClient createUnauthClient() {
                return client;
            }
        };
        ReflectionTestUtils.setField(controller, "config", config);
        ReflectionTestUtils.setField(controller, "hugeClientPoolService",
                                     new HugeClientPoolService());
        ReflectionTestUtils.setField(controller, "authModeService", authMode);

        Map<String, Object> result = controller.getConfig();

        Assert.assertEquals(Map.of("pd_enabled", false,
                                   "server_capabilities_verified", true,
                                   "auth_enabled", false,
                                   "graph_create_enabled", false,
                                   "schema_clone_enabled", false,
                                   "cypher_enabled", false), result);
        Mockito.verify(config, Mockito.never()).get(HubbleOptions.SERVER_URL);
        Mockito.verify(client).close();
    }

    @Test
    public void testStandaloneConfigExposesServerCapabilities() {
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        HugeClient client = Mockito.mock(HugeClient.class);
        AuthModeService authMode = Mockito.mock(AuthModeService.class);
        Mockito.when(client.isServerAuthEnabled()).thenReturn(true);
        Mockito.when(authMode.update(true)).thenReturn(true);
        Mockito.when(client.supportsGraphCreate()).thenReturn(true);
        Mockito.when(client.supportsSchemaClone()).thenReturn(true);
        Mockito.when(client.supportsCypher()).thenReturn(false);

        ConfigController controller = new ConfigController() {
            @Override
            protected HugeClient createUnauthClient() {
                return client;
            }
        };
        ReflectionTestUtils.setField(controller, "config", config);
        ReflectionTestUtils.setField(controller, "hugeClientPoolService",
                                     new HugeClientPoolService());
        ReflectionTestUtils.setField(controller, "authModeService", authMode);

        Map<String, Object> result = controller.getConfig();

        Assert.assertEquals(Map.of("pd_enabled", false,
                                   "server_capabilities_verified", true,
                                   "auth_enabled", true,
                                   "graph_create_enabled", true,
                                   "schema_clone_enabled", true,
                                   "cypher_enabled", false), result);
        Mockito.verify(client).close();
    }

    @Test
    public void testStandaloneConfigSurvivesCapabilityProbeFailure() {
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        AuthModeService authMode = Mockito.mock(AuthModeService.class);
        ConfigController controller = new ConfigController() {
            @Override
            protected HugeClient createUnauthClient() {
                throw new IllegalStateException("server unavailable");
            }
        };
        ReflectionTestUtils.setField(controller, "config", config);
        ReflectionTestUtils.setField(controller, "hugeClientPoolService",
                                     new HugeClientPoolService());
        ReflectionTestUtils.setField(controller, "authModeService", authMode);

        Map<String, Object> result = controller.getConfig();

        Assert.assertEquals(Map.of("pd_enabled", false,
                                   "server_capabilities_verified", false,
                                   "auth_enabled", true,
                                   "graph_create_enabled", false,
                                   "schema_clone_enabled", false,
                                   "cypher_enabled", false), result);
    }
}
