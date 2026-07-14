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
import java.util.Collections;

import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import org.apache.hugegraph.controller.BaseController;
import org.apache.hugegraph.driver.AuthManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.auth.AccessEntity;
import org.apache.hugegraph.entity.auth.BelongEntity;
import org.apache.hugegraph.entity.auth.UserEntity;
import org.apache.hugegraph.exception.ForbiddenException;
import org.apache.hugegraph.service.auth.AccessService;
import org.apache.hugegraph.service.auth.BelongService;
import org.apache.hugegraph.service.auth.GraphSpaceUserService;
import org.apache.hugegraph.service.auth.RoleService;
import org.apache.hugegraph.service.auth.TargetService;
import org.apache.hugegraph.service.auth.UserService;
import org.apache.hugegraph.structure.auth.Access;
import org.apache.hugegraph.structure.auth.Belong;
import org.apache.hugegraph.structure.auth.Group;
import org.apache.hugegraph.structure.auth.HugePermission;
import org.apache.hugegraph.structure.auth.Role;
import org.apache.hugegraph.structure.auth.Target;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

public class GraphSpaceAuthOwnershipTest {

    private HugeClient client;
    private AuthManager auth;

    @Before
    public void setup() {
        this.client = Mockito.mock(HugeClient.class);
        this.auth = Mockito.mock(AuthManager.class);
        Mockito.when(this.client.auth()).thenReturn(this.auth);
    }

    @Test
    public void testGlobalGroupsAreNotPresentedAsSpaceOwnedRoles() {
        Group group = new Group();
        group.setId("group-id");
        group.name("operators");
        Mockito.when(this.auth.listGroups())
               .thenReturn(Collections.singletonList(group));

        Role role = new RoleService().list(this.client, "SPACE").get(0);

        Assert.assertNull(role.graphSpace());
    }

    @Test
    public void testTargetRejectsMismatchedResponseGraphSpace() {
        Target target = target("target-id", "SPACE_B");
        Mockito.when(this.auth.getTarget("target-id")).thenReturn(target);

        assertForbidden(() -> new TargetService().get(
                this.client, "SPACE_A", "target-id"));
    }

    @Test
    public void testTargetCreateUsesCanonicalPathGraphSpace() {
        Target request = target(null, null);
        Mockito.when(this.auth.createTarget(Mockito.any(Target.class)))
               .thenAnswer(invocation -> invocation.getArgument(0));

        Target created = new TargetService().add(this.client, "SPACE_A",
                                                 request);

        ArgumentCaptor<Target> persisted = ArgumentCaptor.forClass(
                Target.class);
        Mockito.verify(this.auth).createTarget(persisted.capture());
        Assert.assertEquals("SPACE_A", persisted.getValue().graphSpace());
        Assert.assertEquals("SPACE_A", created.graphSpace());
    }

    @Test
    public void testTargetCreateRejectsMismatchedBodyGraphSpace() {
        Target request = target(null, "SPACE_B");

        assertForbidden(() -> new TargetService().add(
                this.client, "SPACE_A", request));

        Mockito.verify(this.auth, Mockito.never())
               .createTarget(Mockito.any(Target.class));
    }

    @Test
    public void testScopedGetsRejectNullGraphSpaceOwnership() {
        Target legacyTarget = target("target-id", null);
        Mockito.when(this.auth.getTarget("target-id"))
               .thenReturn(legacyTarget);
        assertForbidden(() -> new TargetService().get(
                this.client, "SPACE_A", "target-id"));

        Access legacyAccess = access("access-id", null);
        Mockito.when(this.auth.getAccess("access-id"))
               .thenReturn(legacyAccess);
        AccessService accessService = accessService(legacyTarget);
        assertForbidden(() -> accessService.get(
                this.client, "SPACE_A", "access-id"));

        Belong legacyBelong = new Belong();
        legacyBelong.setId("belong-id");
        Mockito.when(this.auth.getBelong("belong-id"))
               .thenReturn(legacyBelong);
        assertForbidden(() -> new BelongService().get(
                this.client, "SPACE_A", "belong-id"));
    }

    @Test
    public void testScopedListsFilterMismatchedGraphSpace() {
        Target target = target("target-id", "SPACE_B");
        Mockito.when(this.auth.listTargets())
               .thenReturn(Collections.singletonList(target));

        Access access = new Access();
        access.graphSpace("SPACE_B");
        Mockito.when(this.auth.listAccessesByGroup(null, -1))
               .thenReturn(Collections.singletonList(access));

        Belong belong = new Belong();
        belong.graphSpace("SPACE_B");
        Mockito.when(this.auth.listBelongs())
               .thenReturn(Collections.singletonList(belong));

        Assert.assertTrue(new TargetService().list(this.client, "SPACE_A")
                                             .isEmpty());
        Assert.assertTrue(new AccessService().list(this.client, "SPACE_A",
                                                   null, null).isEmpty());
        Assert.assertTrue(new BelongService().list(this.client, "SPACE_A",
                                                   null, null).isEmpty());
    }

    @Test
    public void testScopedListsHideNullGraphSpaceOwnership() {
        Target legacyTarget = target("target-id", null);
        Mockito.when(this.auth.listTargets())
               .thenReturn(Collections.singletonList(legacyTarget));

        Access legacyAccess = access("access-id", null);
        Mockito.when(this.auth.listAccessesByGroup(null, -1))
               .thenReturn(Collections.singletonList(legacyAccess));
        AccessService accessService = accessService(legacyTarget);

        Belong legacyBelong = new Belong();
        legacyBelong.setId("belong-id");
        legacyBelong.graphSpace(null);
        legacyBelong.group("group-id");
        legacyBelong.user("user-id");
        Mockito.when(this.auth.listBelongs())
               .thenReturn(Collections.singletonList(legacyBelong));
        BelongService belongService = new BelongService();
        UserService users = Mockito.mock(UserService.class);
        UserEntity user = new UserEntity();
        user.setId("user-id");
        user.setName("user");
        Mockito.when(users.getUser(this.client, "user-id")).thenReturn(user);
        ReflectionTestUtils.setField(belongService, "userService", users);

        Assert.assertTrue(new TargetService().list(this.client, "SPACE_A")
                                             .isEmpty());
        Assert.assertTrue(accessService.list(this.client, "SPACE_A",
                                             null, null).isEmpty());
        Assert.assertTrue(belongService.list(this.client, "SPACE_A",
                                             null, null).isEmpty());
    }

    @Test
    public void testAccessCreatePersistsAndReturnsGraphSpace() {
        Target scopedTarget = target("target-id", "SPACE_A");
        Access created = access("access-id", "SPACE_A");
        Mockito.when(this.auth.listAccessesByGroup("group-id", -1))
               .thenReturn(Collections.emptyList())
               .thenReturn(Collections.singletonList(created));
        Mockito.when(this.auth.createAccess(Mockito.any(Access.class)))
               .thenReturn(created);
        AccessService service = accessService(scopedTarget);
        TargetService targets = (TargetService) ReflectionTestUtils.getField(
                service, "targetService");
        Mockito.when(targets.get(this.client, "SPACE_A", "target-id"))
               .thenReturn(scopedTarget);
        AccessEntity request = new AccessEntity();
        request.setRoleId("group-id");
        request.setTargetId("target-id");
        request.setPermissions(Collections.singleton(HugePermission.READ));

        AccessEntity result = service.addOrUpdate(this.client, "SPACE_A",
                                                  request);

        ArgumentCaptor<Access> persisted = ArgumentCaptor.forClass(
                Access.class);
        Mockito.verify(this.auth).createAccess(persisted.capture());
        Assert.assertEquals("SPACE_A", persisted.getValue().graphSpace());
        Assert.assertEquals("SPACE_A", result.getGraphSpace());
    }

    @Test
    public void testAccessRejectsMismatchedResponseGraphSpace() {
        Access access = new Access();
        access.setId("access-id");
        access.graphSpace("SPACE_B");
        access.group("group-id");
        access.target("target-id");
        Mockito.when(this.auth.getAccess("access-id")).thenReturn(access);
        Group group = new Group();
        group.setId("group-id");
        Mockito.when(this.auth.getGroup("group-id")).thenReturn(group);
        AccessService service = new AccessService();
        TargetService targets = Mockito.mock(TargetService.class);
        Mockito.when(targets.get(this.client, "target-id"))
               .thenReturn(target("target-id", "SPACE_B"));
        ReflectionTestUtils.setField(service, "targetService", targets);

        assertForbidden(() -> service.get(this.client, "SPACE_A",
                                          "access-id"));
    }

    @Test
    public void testBelongRejectsMismatchedResponseGraphSpace() {
        Belong belong = new Belong();
        belong.setId("belong-id");
        belong.graphSpace("SPACE_B");
        Mockito.when(this.auth.getBelong("belong-id")).thenReturn(belong);
        BelongService service = new BelongService();

        assertForbidden(() -> service.get(this.client, "SPACE_A",
                                          "belong-id"));
    }

    @Test
    public void testBelongBatchDeleteValidatesAllBeforeMutation() {
        Belong first = new Belong();
        first.setId("first");
        first.graphSpace("SPACE_A");
        Belong second = new Belong();
        second.setId("second");
        second.graphSpace("SPACE_B");
        Mockito.when(this.auth.getBelong("first")).thenReturn(first);
        Mockito.when(this.auth.getBelong("second")).thenReturn(second);
        BelongService service = new BelongService();

        assertForbidden(() -> service.deleteMany(
                this.client, "SPACE_A", new String[]{"first", "second"}));

        Mockito.verify(this.auth, Mockito.never()).deleteBelong(
                Mockito.anyString());
    }

    @Test
    public void testGraphSpaceUserRemovalDeletesOnlyScopedBelongs() {
        BelongService belongs = Mockito.mock(BelongService.class);
        BelongEntity scoped = BelongEntity.builder()
                                          .id("belong-a")
                                          .userId("user-id")
                                          .build();
        Mockito.when(belongs.list(this.client, "SPACE_A", null, "user-id"))
               .thenReturn(Collections.singletonList(scoped));
        GraphSpaceUserService service = new GraphSpaceUserService();
        ReflectionTestUtils.setField(service, "belongService", belongs);

        service.unauthUser(this.client, "SPACE_A", "user-id");

        Mockito.verify(belongs).deleteById(this.client, "SPACE_A",
                                           "belong-a");
        Mockito.verify(belongs, Mockito.never()).delete(
                Mockito.eq(this.client), Mockito.anyString());
    }

    @Test
    public void testSpaceAdminAssignmentUsesPostOnly() throws Exception {
        UserService authorization = Mockito.mock(UserService.class);
        Mockito.when(authorization.isAssignSpaceAdmin(this.client, "SPACE"))
               .thenReturn(true);
        TestGraphSpaceUserController controller =
                new TestGraphSpaceUserController(this.client);
        setBaseUserService(controller, authorization);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller)
                                     .build();

        mvc.perform(get("/api/v1.3/graphspaces/SPACE/auth/users/" +
                        "spaceadmin/user-id"))
           .andExpect(status().isMethodNotAllowed());
        mvc.perform(put("/api/v1.3/graphspaces/SPACE/auth/users/" +
                        "spaceadmin/user-id")
                    .contentType(MediaType.APPLICATION_JSON))
           .andExpect(status().isMethodNotAllowed());
        mvc.perform(post("/api/v1.3/graphspaces/SPACE/auth/users/" +
                         "spaceadmin/user-id")
                    .contentType(MediaType.APPLICATION_JSON))
           .andExpect(status().isOk());
    }

    private static Target target(String id, String graphSpace) {
        Target target = new Target();
        target.setId(id);
        target.graphSpace(graphSpace);
        return target;
    }

    private static Access access(String id, String graphSpace) {
        Access access = new Access();
        access.setId(id);
        access.graphSpace(graphSpace);
        access.group("group-id");
        access.target("target-id");
        access.permission(HugePermission.READ);
        return access;
    }

    private AccessService accessService(Target target) {
        Group group = new Group();
        group.setId("group-id");
        group.name("group");
        Mockito.when(this.auth.getGroup("group-id")).thenReturn(group);
        TargetService targets = Mockito.mock(TargetService.class);
        Mockito.when(targets.get(this.client, "target-id"))
               .thenReturn(target);
        AccessService service = new AccessService();
        ReflectionTestUtils.setField(service, "targetService", targets);
        return service;
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

    private static void assertForbidden(Action action) {
        try {
            action.run();
            Assert.fail("Expected forbidden response");
        } catch (ForbiddenException ignored) {
            // Expected.
        }
    }

    @FunctionalInterface
    private interface Action {

        void run();
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
}
