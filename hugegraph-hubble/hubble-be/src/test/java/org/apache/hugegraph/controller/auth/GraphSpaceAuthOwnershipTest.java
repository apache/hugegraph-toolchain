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
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
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
import org.apache.hugegraph.entity.auth.RoleEntity;
import org.apache.hugegraph.entity.auth.UserEntity;
import org.apache.hugegraph.entity.auth.UserView;
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
import org.apache.hugegraph.structure.auth.User;

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
    public void testScopedRolesPersistOwnershipAndHideInternalMarker() {
        Mockito.when(this.auth.createGraphSpaceGroup(
                     Mockito.any(Group.class)))
               .thenAnswer(invocation -> {
                   Group group = invocation.getArgument(0);
                   group.setId("role-id");
                   return group;
               });
        Role request = new Role();
        request.name("operators");
        request.description("Operate this space");

        Role created = new RoleService().insert(this.client, "SPACE_A",
                                                request);

        ArgumentCaptor<Group> persisted = ArgumentCaptor.forClass(Group.class);
        Mockito.verify(this.auth).createGraphSpaceGroup(persisted.capture());
        Assert.assertNotEquals("operators", persisted.getValue().name());
        Assert.assertTrue(persisted.getValue().name()
                                   .startsWith("~hubble_role:v1:"));
        Assert.assertEquals("SPACE_A", created.graphSpace());
        Assert.assertEquals("operators", created.name());
        Assert.assertEquals("Operate this space", created.description());
    }

    @Test
    public void testScopedRoleListsFilterForeignAndLegacyGroups() {
        List<Group> created = this.createScopedGroups("SPACE_A", "SPACE_B");
        Group legacy = group("legacy-id", "legacy-role");
        Mockito.when(this.auth.listGraphSpaceGroups())
               .thenReturn(Arrays.asList(created.get(0), created.get(1),
                                         legacy));
        Mockito.when(this.auth.listGroups())
               .thenReturn(Arrays.asList(created.get(0), created.get(1),
                                         legacy));
        RoleService service = new RoleService();

        List<Role> scoped = service.list(this.client, "SPACE_A", false);
        List<Role> superadmin = service.list(this.client, "SPACE_A", true);

        Assert.assertEquals(1, scoped.size());
        Assert.assertEquals("SPACE_A", scoped.get(0).graphSpace());
        Assert.assertEquals(2, superadmin.size());
        Assert.assertNull(superadmin.get(1).graphSpace());
    }

    @Test
    public void testScopedRoleGetRejectsForeignAndLegacyForSpaceAdmin() {
        List<Group> created = this.createScopedGroups("SPACE_A", "SPACE_B");
        Mockito.when(this.auth.getGraphSpaceGroup("foreign-id"))
               .thenReturn(created.get(1));
        Mockito.when(this.auth.getGraphSpaceGroup("legacy-id"))
               .thenReturn(group("legacy-id", "legacy-role"));
        Mockito.when(this.auth.getGroup("legacy-id"))
               .thenReturn(group("legacy-id", "legacy-role"));
        RoleService service = new RoleService();

        assertForbidden(() -> service.get(this.client, "SPACE_A",
                                           "foreign-id", false));
        assertForbidden(() -> service.get(this.client, "SPACE_A",
                                           "legacy-id", false));
        Assert.assertNull(service.get(this.client, "SPACE_A", "legacy-id",
                                      true).graphSpace());
    }

    @Test
    public void testScopedRoleUpdateKeepsImmutableGroupName() {
        Group group = this.createScopedGroups("SPACE_A").get(0);
        Mockito.when(this.auth.getGraphSpaceGroup("role-id"))
               .thenReturn(group);
        Mockito.when(this.auth.updateGraphSpaceGroup(
                     Mockito.any(Group.class)))
               .thenAnswer(invocation -> invocation.getArgument(0));
        Role update = new Role();
        update.setId("role-id");
        update.name("renamed");
        update.description("updated");
        String persistedName = group.name();

        Role result = new RoleService().update(this.client, "SPACE_A",
                                               update, false);

        Assert.assertEquals(persistedName, group.name());
        Assert.assertEquals("renamed", result.name());
        Assert.assertEquals("updated", result.description());
    }

    @Test
    public void testScopedRoleDeletePreflightsEveryReference() {
        Group group = this.createScopedGroups("SPACE_A").get(0);
        Mockito.when(this.auth.getGraphSpaceGroup("role-id"))
               .thenReturn(group);
        Access local = access("local-access", "SPACE_A");
        Access foreign = access("foreign-access", "SPACE_B");
        Mockito.when(this.auth.listAccessesByGroup(group, -1))
               .thenReturn(Arrays.asList(local, foreign));
        Mockito.when(this.auth.listBelongsByGroup(group, -1))
               .thenReturn(Collections.emptyList());

        assertForbidden(() -> new RoleService().delete(
                this.client, "SPACE_A", "role-id", false));

        Mockito.verify(this.auth, Mockito.never()).deleteAccess(
                Mockito.anyString());
        Mockito.verify(this.auth, Mockito.never()).deleteGraphSpaceGroup(
                Mockito.anyString());
    }

    @Test
    public void testAccessAndBelongRejectForeignRoleBeforeMutation() {
        Group foreign = this.createScopedGroups("SPACE_B").get(0);
        Mockito.when(this.auth.getGraphSpaceGroup("foreign-role"))
               .thenReturn(foreign);
        Target target = target("target-id", "SPACE_A");
        TargetService targets = Mockito.mock(TargetService.class);
        Mockito.when(targets.get(this.client, "SPACE_A", "target-id"))
               .thenReturn(target);
        AccessService accessService = new AccessService();
        ReflectionTestUtils.setField(accessService, "targetService", targets);
        AccessEntity access = new AccessEntity();
        access.setRoleId("foreign-role");
        access.setTargetId("target-id");
        access.setPermissions(Collections.singleton(HugePermission.READ));

        assertForbidden(() -> accessService.addOrUpdate(
                this.client, "SPACE_A", access));
        assertForbidden(() -> new BelongService().add(
                this.client, "SPACE_A", "foreign-role", "user-id"));

        Mockito.verify(this.auth, Mockito.never()).createAccess(
                Mockito.any(Access.class));
        Mockito.verify(this.auth, Mockito.never()).createBelong(
                Mockito.any(Belong.class));
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
    public void testScopedListsIgnorePdDefaultAuthorizationRecords() {
        Target defaultTarget = target("DEFAULT_SPACE_TARGET", "SPACE_A");
        defaultTarget.name("DEFAULT_SPACE_TARGET");
        Mockito.when(this.auth.listTargets())
               .thenReturn(Collections.singletonList(defaultTarget));
        Mockito.when(this.auth.getTarget("DEFAULT_SPACE_TARGET"))
               .thenReturn(defaultTarget);

        Access defaultAccess = access("default-access", "SPACE_A");
        defaultAccess.group("space_member");
        defaultAccess.target("DEFAULT_SPACE_TARGET");
        Mockito.when(this.auth.listAccessesByGroup(null, -1))
               .thenReturn(Collections.singletonList(defaultAccess));

        Belong defaultBelong = new Belong();
        defaultBelong.setId("default-belong");
        defaultBelong.graphSpace("SPACE_A");
        defaultBelong.user("user-id");
        defaultBelong.role("space_member");
        Mockito.when(this.auth.listBelongs())
               .thenReturn(Collections.singletonList(defaultBelong));

        TargetService targetService = new TargetService();
        Assert.assertTrue(targetService.list(this.client, "SPACE_A")
                                       .isEmpty());
        assertForbidden(() -> targetService.get(
                this.client, "SPACE_A", "DEFAULT_SPACE_TARGET"));
        assertForbidden(() -> targetService.delete(
                this.client, "SPACE_A", "DEFAULT_SPACE_TARGET"));
        Mockito.verify(this.auth, Mockito.never()).deleteTarget(
                "DEFAULT_SPACE_TARGET");
        Assert.assertTrue(new AccessService().list(this.client, "SPACE_A",
                                                   null, null).isEmpty());
        Assert.assertTrue(new BelongService().list(this.client, "SPACE_A",
                                                   null, null).isEmpty());
        Mockito.verify(this.auth, Mockito.never()).getGraphSpaceGroup(
                Mockito.anyString());
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
        User account = new User();
        account.name("graph-user");
        Mockito.when(this.auth.getUser("user-id")).thenReturn(account);
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
        Mockito.verify(this.auth).delSpaceMember("graph-user", "SPACE_A");
    }

    @Test
    public void testGraphSpaceUserRoleUpdatePreflightsAllRoles() {
        List<Group> groups = this.createScopedGroups("SPACE_A", "SPACE_B");
        Mockito.when(this.auth.getGraphSpaceGroup("local-role"))
               .thenReturn(groups.get(0));
        Mockito.when(this.auth.getGraphSpaceGroup("foreign-role"))
               .thenReturn(groups.get(1));
        BelongService belongs = Mockito.mock(BelongService.class);
        GraphSpaceUserService service = new GraphSpaceUserService();
        ReflectionTestUtils.setField(service, "belongService", belongs);
        UserView user = new UserView(
                "user-id", "user",
                Arrays.asList(new RoleEntity("local-role", "local"),
                              new RoleEntity("foreign-role", "foreign")));

        assertForbidden(() -> service.createOrUpdate(
                this.client, "SPACE_A", user));

        Mockito.verifyZeroInteractions(belongs);
        Mockito.verify(this.auth, Mockito.never())
               .addSpaceMember(Mockito.anyString(), Mockito.anyString());
    }

    @Test
    public void testGraphSpaceUserCreationAddsPdMemberBeforeBelong() {
        Group group = this.createScopedGroups("SPACE_A").get(0);
        Mockito.when(this.auth.getGraphSpaceGroup("local-role"))
               .thenReturn(group);
        User account = new User();
        account.name("graph-user");
        Mockito.when(this.auth.getUser("user-id")).thenReturn(account);
        Mockito.when(this.auth.listSpaceMember("SPACE_A"))
               .thenReturn(Collections.emptyList());
        BelongService belongs = Mockito.mock(BelongService.class);
        Mockito.when(belongs.list(this.client, "SPACE_A", null, "user-id"))
               .thenReturn(Collections.emptyList());
        GraphSpaceUserService service = new GraphSpaceUserService();
        ReflectionTestUtils.setField(service, "belongService", belongs);
        UserView user = new UserView(
                "user-id", "graph-user",
                Collections.singletonList(new RoleEntity("local-role",
                                                          "local")));

        service.createOrUpdate(this.client, "SPACE_A", user);

        InOrder order = Mockito.inOrder(this.auth, belongs);
        order.verify(this.auth).addSpaceMember("graph-user", "SPACE_A");
        order.verify(belongs).add(this.client, "SPACE_A", "local-role",
                                  "user-id");
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
        Group group = target.graphSpace() == null ?
                      group("group-id", "group") :
                      this.createScopedGroups(target.graphSpace()).get(0);
        group.setId("group-id");
        Mockito.when(this.auth.getGraphSpaceGroup("group-id"))
               .thenReturn(group);
        TargetService targets = Mockito.mock(TargetService.class);
        Mockito.when(targets.get(this.client, "target-id"))
               .thenReturn(target);
        AccessService service = new AccessService();
        ReflectionTestUtils.setField(service, "targetService", targets);
        return service;
    }

    private List<Group> createScopedGroups(String... graphSpaces) {
        java.util.ArrayList<Group> groups = new java.util.ArrayList<>();
        Mockito.when(this.auth.createGraphSpaceGroup(
                     Mockito.any(Group.class)))
               .thenAnswer(invocation -> {
                   Group group = invocation.getArgument(0);
                   group.setId("role-id");
                   groups.add(group);
                   return group;
               });
        for (String graphSpace : graphSpaces) {
            Role role = new Role();
            role.name("role-" + graphSpace);
            new RoleService().insert(this.client, graphSpace, role);
        }
        return groups;
    }

    private static Group group(String id, String name) {
        Group group = new Group();
        group.setId(id);
        group.name(name);
        return group;
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
