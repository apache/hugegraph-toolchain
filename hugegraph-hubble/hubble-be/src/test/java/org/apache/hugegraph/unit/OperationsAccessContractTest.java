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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.controller.op.OperationsController;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.handler.ExceptionAdvisor;
import org.apache.hugegraph.handler.LoginInterceptor;
import org.apache.hugegraph.handler.MessageSourceHandler;
import org.apache.hugegraph.handler.ResponseAdvisor;
import org.apache.hugegraph.service.auth.UserService;
import org.apache.hugegraph.service.op.OperationsDataService;
import org.apache.hugegraph.service.op.OperationsNodeNotFoundException;
import org.junit.Before;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

public class OperationsAccessContractTest {

    private static final String NODE_ID = "store-0123456789ab";

    private MockMvc mvc;
    private HugeClient superClient;
    private HugeClient otherClient;

    @Before
    public void setup() {
        this.superClient = client("token-a");
        this.otherClient = client("token-b");
        UserService users = Mockito.mock(UserService.class);
        Mockito.when(users.userLevel(Mockito.any(), Mockito.anyString()))
               .thenAnswer(invocation -> level(invocation.getArgument(1)));
        OperationsDataService data = dataService();
        OperationsController controller = new OperationsController();
        ReflectionTestUtils.setField(controller, "userService", users);
        ReflectionTestUtils.setField(controller, "dataService", data);

        this.mvc = MockMvcBuilders.standaloneSetup(controller)
                .addInterceptors(new LoginInterceptor())
                .setControllerAdvice(advisor(), new ResponseAdvisor())
                .build();
    }

    @Test
    public void testAllDirectOperationsUrlsRequireAuthentication()
           throws Exception {
        for (String path : new String[]{"/api/v1.3/operations/capabilities",
                                        "/api/v1.3/operations/overview",
                                        "/api/v1.3/operations/nodes",
                                        "/api/v1.3/operations/nodes/" + NODE_ID}) {
            this.mvc.perform(get(path))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.status").value(401));
        }
    }

    @Test
    public void testCapabilitiesAreTrimmedForThreeRoles() throws Exception {
        this.mvc.perform(authGet("/api/v1.3/operations/capabilities",
                                 "superadmin", "token-a"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.capabilities.length()").value(3));
        this.mvc.perform(authGet("/api/v1.3/operations/capabilities",
                                 "spaceadmin", "token-space"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.capabilities.length()").value(0));
        this.mvc.perform(authGet("/api/v1.3/operations/capabilities",
                                 "ordinary", "token-user"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.capabilities.length()").value(0));
    }

    @Test
    public void testDirectUrlsEnforceRoleCapabilities() throws Exception {
        this.mvc.perform(authGet("/api/v1.3/operations/overview",
                                 "ordinary", "token-user"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));
        this.mvc.perform(authGet("/api/v1.3/operations/nodes",
                                 "spaceadmin", "token-space"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));
        this.mvc.perform(authGet("/api/v1.3/operations/nodes/" + NODE_ID,
                                 "spaceadmin", "token-space"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));
        this.mvc.perform(authGet("/api/v1.3/operations/overview",
                                 "spaceadmin", "token-space"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));
    }

    @Test
    public void testNodeIdsAreScopedAndRejectedSafely() throws Exception {
        this.mvc.perform(authGet("/api/v1.3/operations/nodes/" + NODE_ID,
                                 "superadmin", "token-a"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.node.id").value(NODE_ID));
        this.mvc.perform(authGet("/api/v1.3/operations/nodes/" + NODE_ID,
                                 "superadmin", "token-b"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value(
                           "operations_node_not_found"));
        this.mvc.perform(authGet(
                "/api/v1.3/operations/nodes/store-ffffffffffff",
                "superadmin", "token-a"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value(
                           "operations_node_not_found"));
        String invalid = this.mvc.perform(authGet(
                "/api/v1.3/operations/nodes/http:%2F%2Fsecret-canary@host",
                "superadmin", "token-a"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andReturn().getResponse().getContentAsString();
        org.apache.hugegraph.testutil.Assert.assertFalse(
                invalid.contains("secret-canary"));
        org.apache.hugegraph.testutil.Assert.assertFalse(
                invalid.contains("host"));
    }

    @Test
    public void testSuccessfulPayloadDoesNotExposeInfrastructureCanaries()
           throws Exception {
        String content = this.mvc.perform(authGet("/api/v1.3/operations/nodes",
                                                  "superadmin", "token-a"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        org.apache.hugegraph.testutil.Assert.assertFalse(
                content.contains("127.0.0.1"));
        org.apache.hugegraph.testutil.Assert.assertFalse(
                content.contains("secret-canary"));
        org.apache.hugegraph.testutil.Assert.assertFalse(
                content.contains("/private"));
    }

    private OperationsDataService dataService() {
        OperationsDataService data = Mockito.mock(OperationsDataService.class);
        Mockito.when(data.overview(Mockito.any(), Mockito.anySet(),
                                   Mockito.anyBoolean()))
               .thenReturn(Collections.singletonMap("status", "UP"));
        Mockito.when(data.nodes(Mockito.any(), Mockito.anySet(), Mockito.any(),
                                Mockito.any(), Mockito.any(), Mockito.anyInt(),
                                Mockito.anyInt(), Mockito.anyString(),
                                Mockito.anyString()))
               .thenReturn(Collections.singletonMap("nodes",
                           Collections.emptyList()));
        Mockito.when(data.node(Mockito.any(), Mockito.anySet(),
                               Mockito.anyString(), Mockito.anyBoolean()))
               .thenAnswer(invocation -> {
                   HugeClient client = invocation.getArgument(0);
                   String nodeId = invocation.getArgument(2);
                   if (client != this.superClient || !NODE_ID.equals(nodeId)) {
                       throw new OperationsNodeNotFoundException();
                   }
                   Map<String, Object> node = new LinkedHashMap<>();
                   node.put("id", NODE_ID);
                   return Collections.singletonMap("node", node);
               });
        return data;
    }

    private MockHttpServletRequestBuilder authGet(String path,
                                                   String username,
                                                   String token) {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(Constant.USERNAME_KEY, username);
        session.setAttribute(Constant.TOKEN_KEY, token);
        HugeClient client = "token-a".equals(token) ?
                            this.superClient : this.otherClient;
        return get(path).session(session).requestAttr("hugeClient", client);
    }

    private static HugeClient client(String authContext) {
        HugeClient client = Mockito.mock(HugeClient.class);
        Mockito.when(client.getAuthContext()).thenReturn(authContext);
        return client;
    }

    private static String level(String username) {
        if ("superadmin".equals(username)) {
            return "ADMIN";
        }
        if ("spaceadmin".equals(username)) {
            return "SPACEADMIN";
        }
        return "USER";
    }

    private static ExceptionAdvisor advisor() {
        MessageSourceHandler messages = Mockito.mock(
                                        MessageSourceHandler.class);
        Mockito.when(messages.getMessage(Mockito.anyString(),
                                          Mockito.nullable(Object[].class)))
               .thenAnswer(invocation -> invocation.getArgument(0));
        ExceptionAdvisor advisor = new ExceptionAdvisor();
        ReflectionTestUtils.setField(advisor, "messageSourceHandler", messages);
        return advisor;
    }
}
