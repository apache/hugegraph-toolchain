/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hugegraph.controller.auth;

import java.lang.reflect.Field;

import org.junit.Before;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import org.apache.hugegraph.controller.BaseController;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.handler.ExceptionAdvisor;
import org.apache.hugegraph.service.auth.AccessService;
import org.apache.hugegraph.service.auth.BelongService;
import org.apache.hugegraph.service.auth.GraphSpaceUserService;
import org.apache.hugegraph.service.auth.RoleService;
import org.apache.hugegraph.service.auth.TargetService;
import org.apache.hugegraph.service.auth.UserService;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

public class GraphSpaceAuthMutationAuthorizationTest {

    private HugeClient client;
    private UserService authorizationService;

    @Before
    public void setup() {
        this.client = Mockito.mock(HugeClient.class);
        this.authorizationService = Mockito.mock(UserService.class);
        Mockito.when(this.authorizationService.isSuperAdmin(this.client))
               .thenReturn(false);
        Mockito.when(this.authorizationService.isAssignSpaceAdmin(
                this.client, "SPACE"))
               .thenReturn(false);
    }

    @Test
    public void testOrdinaryUserCannotMutateBelongs() throws Exception {
        BelongController controller = this.prepare(new TestBelongController(
                this.client), "belongService", Mockito.mock(BelongService.class));
        MockMvc mvc = mvc(controller);

        assertForbidden(mvc, post("/api/v1.3/graphspaces/SPACE/auth/belongs")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role_id\":\"r\",\"user_id\":\"u\"}"));
        assertForbidden(mvc,
                post("/api/v1.3/graphspaces/SPACE/auth/belongs/ids")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role_id\":\"r\",\"user_ids\":[\"u\"]}"));
        assertForbidden(mvc,
                delete("/api/v1.3/graphspaces/SPACE/auth/belongs/b"));
        assertForbidden(mvc,
                delete("/api/v1.3/graphspaces/SPACE/auth/belongs")
                        .param("role_id", "r").param("user_id", "u"));
        assertForbidden(mvc,
                post("/api/v1.3/graphspaces/SPACE/auth/belongs/delids")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[\"b\"]}"));
    }

    @Test
    public void testOrdinaryUserCannotReadScopedAuthorizationResources()
            throws Exception {
        this.assertScopedReadsForbidden();
    }

    @Test
    public void testOrdinaryUserCannotMutateRoles() throws Exception {
        RoleController controller = this.prepare(new TestRoleController(
                this.client), "roleService", Mockito.mock(RoleService.class));
        MockMvc mvc = mvc(controller);

        assertForbidden(mvc, post("/api/v1.3/graphspaces/SPACE/auth/roles")
                .contentType(MediaType.APPLICATION_JSON).content("{}"));
        assertForbidden(mvc,
                put("/api/v1.3/graphspaces/SPACE/auth/roles/r")
                        .contentType(MediaType.APPLICATION_JSON).content("{}"));
        assertForbidden(mvc,
                delete("/api/v1.3/graphspaces/SPACE/auth/roles/r"));
    }

    @Test
    public void testOrdinaryUserCannotMutateAccesses() throws Exception {
        AccessController controller = this.prepare(new TestAccessController(
                this.client), "accessService", Mockito.mock(AccessService.class));
        MockMvc mvc = mvc(controller);

        assertForbidden(mvc,
                post("/api/v1.3/graphspaces/SPACE/auth/accesses")
                        .contentType(MediaType.APPLICATION_JSON).content("{}"));
        assertForbidden(mvc,
                put("/api/v1.3/graphspaces/SPACE/auth/accesses")
                        .contentType(MediaType.APPLICATION_JSON).content("{}"));
        assertForbidden(mvc,
                delete("/api/v1.3/graphspaces/SPACE/auth/accesses")
                        .param("role_id", "r").param("target_id", "t"));
    }

    @Test
    public void testOrdinaryUserCannotMutateTargets() throws Exception {
        TargetController controller = this.prepare(new TestTargetController(
                this.client), "targetService", Mockito.mock(TargetService.class));
        MockMvc mvc = mvc(controller);

        assertForbidden(mvc,
                post("/api/v1.3/graphspaces/SPACE/auth/targets")
                        .contentType(MediaType.APPLICATION_JSON).content("{}"));
        assertForbidden(mvc,
                put("/api/v1.3/graphspaces/SPACE/auth/targets/t")
                        .contentType(MediaType.APPLICATION_JSON).content("{}"));
        assertForbidden(mvc,
                delete("/api/v1.3/graphspaces/SPACE/auth/targets/t"));
    }

    @Test
    public void testCurrentSpaceAdminCanManageScopedAuthorizationResources()
            throws Exception {
        Mockito.when(this.authorizationService.isAssignSpaceAdmin(
                this.client, "SPACE"))
               .thenReturn(true);
        Mockito.when(this.authorizationService.userLevel(
                Mockito.eq(this.client), Mockito.any()))
               .thenReturn("SPACEADMIN");

        this.assertScopedReadsAllowed();
        this.assertScopedCreatesAllowed();
    }

    @Test
    public void testSuperadminCanMutateEachResource() throws Exception {
        Mockito.when(this.authorizationService.isSuperAdmin(this.client))
               .thenReturn(true);
        Mockito.when(this.authorizationService.userLevel(
                Mockito.eq(this.client), Mockito.any()))
               .thenReturn("ADMIN");

        this.assertScopedCreatesAllowed();
        RoleController role = this.prepare(new TestRoleController(
                this.client), "roleService", Mockito.mock(RoleService.class));
        mvc(role).perform(post("/api/v1.3/graphspaces/SPACE/auth/roles")
                          .contentType(MediaType.APPLICATION_JSON).content("{}"))
                 .andExpect(status().isOk());
    }

    @Test
    public void testAnotherSpaceAdminCannotMutateCurrentSpace()
            throws Exception {
        Mockito.when(this.authorizationService.isAssignSpaceAdmin(
                this.client, "OTHER"))
               .thenReturn(true);
        RoleController controller = this.prepare(new TestRoleController(
                this.client), "roleService", Mockito.mock(RoleService.class));

        assertForbidden(mvc(controller),
                post("/api/v1.3/graphspaces/SPACE/auth/roles")
                        .contentType(MediaType.APPLICATION_JSON).content("{}"));
        this.assertScopedReadsForbidden();
    }

    private void assertScopedReadsAllowed() throws Exception {
        for (ReadRoute route : this.scopedReadRoutes()) {
            mvc(route.controller).perform(route.request)
                                 .andExpect(status().isOk());
        }
    }

    private void assertScopedReadsForbidden() throws Exception {
        for (ReadRoute route : this.scopedReadRoutes()) {
            assertForbidden(mvc(route.controller), route.request);
        }
    }

    private ReadRoute[] scopedReadRoutes() {
        return new ReadRoute[]{
                new ReadRoute(this.prepare(new TestBelongController(
                        this.client), "belongService",
                        Mockito.mock(BelongService.class)),
                              get("/api/v1.3/graphspaces/SPACE/auth/belongs")),
                new ReadRoute(this.prepare(new TestRoleController(
                        this.client), "roleService",
                        Mockito.mock(RoleService.class)),
                              get("/api/v1.3/graphspaces/SPACE/auth/roles")),
                new ReadRoute(this.prepare(new TestAccessController(
                        this.client), "accessService",
                        Mockito.mock(AccessService.class)),
                              get("/api/v1.3/graphspaces/SPACE/auth/accesses")),
                new ReadRoute(this.prepare(new TestTargetController(
                        this.client), "targetService",
                        Mockito.mock(TargetService.class)),
                              get("/api/v1.3/graphspaces/SPACE/auth/targets")),
                new ReadRoute(this.prepare(new TestGraphSpaceUserController(
                        this.client), "userService",
                        Mockito.mock(GraphSpaceUserService.class)),
                              get("/api/v1.3/graphspaces/SPACE/auth/users"))
        };
    }

    private void assertScopedCreatesAllowed() throws Exception {
        BelongController belong = this.prepare(new TestBelongController(
                this.client), "belongService", Mockito.mock(BelongService.class));
        AccessController access = this.prepare(new TestAccessController(
                this.client), "accessService", Mockito.mock(AccessService.class));
        TargetController target = this.prepare(new TestTargetController(
                this.client), "targetService", Mockito.mock(TargetService.class));

        mvc(belong).perform(post("/api/v1.3/graphspaces/SPACE/auth/belongs")
                           .contentType(MediaType.APPLICATION_JSON)
                           .content("{\"role_id\":\"r\",\"user_id\":\"u\"}"))
                   .andExpect(status().isOk());
        mvc(access).perform(post("/api/v1.3/graphspaces/SPACE/auth/accesses")
                           .contentType(MediaType.APPLICATION_JSON).content("{}"))
                   .andExpect(status().isOk());
        mvc(target).perform(post("/api/v1.3/graphspaces/SPACE/auth/targets")
                           .contentType(MediaType.APPLICATION_JSON).content("{}"))
                   .andExpect(status().isOk());
    }

    private <T extends BaseController> T prepare(T controller,
                                                  String serviceField,
                                                  Object service) {
        setBaseUserService(controller, this.authorizationService);
        ReflectionTestUtils.setField(controller, serviceField, service);
        return controller;
    }

    private static MockMvc mvc(Object controller) {
        return MockMvcBuilders.standaloneSetup(controller)
                              .setControllerAdvice(new ExceptionAdvisor())
                              .build();
    }

    private static void assertForbidden(MockMvc mvc, RequestBuilder request)
            throws Exception {
        mvc.perform(request)
           .andExpect(status().isForbidden())
           .andExpect(jsonPath("$.status").value(403));
    }

    private static void setBaseUserService(BaseController controller,
                                           UserService service) {
        try {
            Field field = BaseController.class.getDeclaredField("userService");
            field.setAccessible(true);
            field.set(controller, service);
        } catch (ReflectiveOperationException e) {
            throw new AssertionError(e);
        }
    }

    private static class TestBelongController extends BelongController {

        private final HugeClient client;

        TestBelongController(HugeClient client) {
            this.client = client;
        }

        @Override
        protected HugeClient authClient(String graphSpace, String graph) {
            return this.client;
        }
    }

    private static class TestRoleController extends RoleController {

        private final HugeClient client;

        TestRoleController(HugeClient client) {
            this.client = client;
        }

        @Override
        protected HugeClient authClient(String graphSpace, String graph) {
            return this.client;
        }
    }

    private static class TestAccessController extends AccessController {

        private final HugeClient client;

        TestAccessController(HugeClient client) {
            this.client = client;
        }

        @Override
        protected HugeClient authClient(String graphSpace, String graph) {
            return this.client;
        }
    }

    private static class TestTargetController extends TargetController {

        private final HugeClient client;

        TestTargetController(HugeClient client) {
            this.client = client;
        }

        @Override
        protected HugeClient authClient(String graphSpace, String graph) {
            return this.client;
        }
    }

    private static class TestGraphSpaceUserController
            extends GraphSpaceUserController {

        private final HugeClient client;

        TestGraphSpaceUserController(HugeClient client) {
            this.client = client;
        }

        @Override
        protected HugeClient authClient(String graphSpace, String graph) {
            return this.client;
        }
    }

    private static class ReadRoute {

        private final Object controller;
        private final RequestBuilder request;

        ReadRoute(Object controller, RequestBuilder request) {
            this.controller = controller;
            this.request = request;
        }
    }
}
