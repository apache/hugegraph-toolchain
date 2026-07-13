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

package org.apache.hugegraph.controller.space;

import java.util.Map;

import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.AuthManager;
import org.apache.hugegraph.driver.GraphSpaceManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.space.GraphSpaceEntity;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.auth.UserService;
import org.apache.hugegraph.service.graphs.GraphsService;
import org.apache.hugegraph.service.space.GraphSpaceService;
import org.apache.hugegraph.structure.space.GraphSpace;
import org.apache.hugegraph.testutil.Assert;

public class GraphSpaceControllerTest {

    @Test
    public void testStandaloneDetailNeverContainsDataPlaneSecrets() {
        GraphSpaceController controller = new GraphSpaceController();
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        controller.config = config;
        ReflectionTestUtils.setField(controller, "graphSpaceService",
                                     new GraphSpaceService());

        @SuppressWarnings("unchecked")
        Map<String, Object> detail =
                (Map<String, Object>) controller.get("DEFAULT");

        Assert.assertEquals("DEFAULT", detail.get("name"));
        Assert.assertFalse(detail.containsKey("dp_username"));
        Assert.assertFalse(detail.containsKey("dp_password"));
        Assert.assertFalse(detail.containsKey("configs"));
    }

    @Test
    public void testPdDetailResponseNeverContainsDataPlaneSecrets() {
        HugeClient client = Mockito.mock(HugeClient.class);
        GraphSpaceManager manager = Mockito.mock(GraphSpaceManager.class);
        AuthManager auth = Mockito.mock(AuthManager.class);
        GraphsService graphsService = Mockito.mock(GraphsService.class);
        UserService userService = Mockito.mock(UserService.class);
        GraphSpace graphSpace = new GraphSpace("public");
        graphSpace.setDpUserName("dp-user");
        graphSpace.setDpPassWord("dp-secret");
        graphSpace.setConfigs(new java.util.HashMap<>());
        Mockito.when(client.graphSpace()).thenReturn(manager);
        Mockito.when(client.auth()).thenReturn(auth);
        Mockito.when(manager.getGraphSpace("public")).thenReturn(graphSpace);
        Mockito.when(auth.isSuperAdmin()).thenReturn(false);
        Mockito.when(graphsService.listGraphNames(client, "public", ""))
               .thenReturn(java.util.Collections.emptySet());

        GraphSpaceService service = new GraphSpaceService();
        ReflectionTestUtils.setField(service, "graphsService", graphsService);
        ReflectionTestUtils.setField(service, "userService", userService);
        TestGraphSpaceController controller =
                new TestGraphSpaceController(client);
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        controller.config = config;
        ReflectionTestUtils.setField(controller, "graphSpaceService", service);

        @SuppressWarnings("unchecked")
        Map<String, Object> detail =
                (Map<String, Object>) controller.get("public");

        Assert.assertEquals("public", detail.get("name"));
        Assert.assertFalse(detail.containsKey("dp_username"));
        Assert.assertFalse(detail.containsKey("dp_password"));
        Assert.assertFalse(detail.containsKey("configs"));
    }

    @Test
    public void testApplyDefaultsForOptionalResourceLimits() {
        GraphSpaceEntity graphSpace = new GraphSpaceEntity();

        GraphSpaceController.applyResourceDefaults(graphSpace);

        Assert.assertEquals(100, graphSpace.getMaxGraphNumber());
        Assert.assertEquals(100, graphSpace.getMaxRoleNumber());
        Assert.assertEquals(64, graphSpace.getCpuLimit());
        Assert.assertEquals(128, graphSpace.getMemoryLimit());
        Assert.assertEquals(64, graphSpace.getComputeCpuLimit());
        Assert.assertEquals(128, graphSpace.getComputeMemoryLimit());
        Assert.assertEquals(1000000, graphSpace.getStorageLimit());
    }

    @Test
    public void testApplyDefaultsPreservesExplicitResourceLimits() {
        GraphSpaceEntity graphSpace = new GraphSpaceEntity();
        graphSpace.setMaxGraphNumber(2);
        graphSpace.setMaxRoleNumber(3);
        graphSpace.setCpuLimit(4);
        graphSpace.setMemoryLimit(5);
        graphSpace.setComputeCpuLimit(6);
        graphSpace.setComputeMemoryLimit(7);
        graphSpace.setStorageLimit(8);

        GraphSpaceController.applyResourceDefaults(graphSpace);

        Assert.assertEquals(2, graphSpace.getMaxGraphNumber());
        Assert.assertEquals(3, graphSpace.getMaxRoleNumber());
        Assert.assertEquals(4, graphSpace.getCpuLimit());
        Assert.assertEquals(5, graphSpace.getMemoryLimit());
        Assert.assertEquals(6, graphSpace.getComputeCpuLimit());
        Assert.assertEquals(7, graphSpace.getComputeMemoryLimit());
        Assert.assertEquals(8, graphSpace.getStorageLimit());
    }

    private static class TestGraphSpaceController
            extends GraphSpaceController {

        private final HugeClient client;

        TestGraphSpaceController(HugeClient client) {
            this.client = client;
        }

        @Override
        protected HugeClient authClient(String graphSpace, String graph) {
            return this.client;
        }
    }
}
