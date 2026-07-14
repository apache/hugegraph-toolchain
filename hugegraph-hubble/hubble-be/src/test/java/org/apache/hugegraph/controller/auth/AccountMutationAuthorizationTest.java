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

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Before;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.multipart.MultipartFile;

import org.apache.hugegraph.controller.BaseController;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.auth.UserEntity;
import org.apache.hugegraph.entity.auth.UserView;
import org.apache.hugegraph.entity.auth.PasswordEntity;
import org.apache.hugegraph.exception.ForbiddenException;
import org.apache.hugegraph.exception.ParameterizedException;
import org.apache.hugegraph.handler.ExceptionAdvisor;
import org.apache.hugegraph.service.auth.GraphSpaceUserService;
import org.apache.hugegraph.service.auth.UserService;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

public class AccountMutationAuthorizationTest {

    private HugeClient client;
    private UserService authorizationService;

    @Before
    public void setup() {
        this.client = Mockito.mock(HugeClient.class);
        this.authorizationService = Mockito.mock(UserService.class);
    }

    @Test
    public void testOrdinaryUserCannotCreateAccount() {
        TestUserController controller = new TestUserController(this.client,
                                                               "alice");
        this.setBaseUserService(controller, this.authorizationService);
        controller.userService = this.authorizationService;
        Mockito.when(this.authorizationService.userLevel(this.client,
                                                         "alice"))
               .thenReturn("USER");

        ForbiddenException failure = assertForbidden(
                () -> controller.create(new UserEntity()));

        org.junit.Assert.assertTrue(failure.getMessage()
                                           .contains("manage accounts"));
        Mockito.verify(this.authorizationService, Mockito.never())
               .add(Mockito.any(), Mockito.any());
    }

    @Test
    public void testOnlySuperadminCanReadGlobalAccountDirectory() {
        TestUserController ordinary = accountController("alice", "USER");
        assertGlobalAccountReadsForbidden(ordinary);

        TestUserController spaceAdmin = accountController("manager",
                                                          "SPACEADMIN");
        assertGlobalAccountReadsForbidden(spaceAdmin);

        TestUserController superadmin = accountController("admin", "ADMIN");
        superadmin.list();
        superadmin.queryPage("", 1, 10);
        superadmin.get("bob-id");
        superadmin.listadminspace("bob");
    }

    @Test
    public void testPasswordUpdateIsBoundToCurrentSessionIdentity() {
        TestUserController controller = accountController("alice", "USER");
        PasswordEntity foreign = PasswordEntity.builder()
                                               .username("bob")
                                               .oldpwd("old")
                                               .newpwd("new")
                                               .build();

        assertForbidden(() -> controller.updatepwd(foreign));
        Mockito.verify(this.authorizationService, Mockito.never())
               .updatepwd(Mockito.any(), Mockito.anyString(),
                          Mockito.anyString(), Mockito.anyString());

        PasswordEntity own = PasswordEntity.builder()
                                           .username("alice")
                                           .oldpwd("old")
                                           .newpwd("new")
                                           .build();
        controller.updatepwd(own);
        Mockito.verify(this.authorizationService)
               .updatepwd(this.client, "alice", "old", "new");
    }

    @Test
    public void testForbiddenAccountMutationUsesHttpAndBody403()
            throws Exception {
        TestUserController controller = new TestUserController(this.client,
                                                               "alice");
        this.setBaseUserService(controller, this.authorizationService);
        controller.userService = this.authorizationService;
        Mockito.when(this.authorizationService.userLevel(this.client,
                                                         "alice"))
               .thenReturn("USER");
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller)
                                     .setControllerAdvice(
                                             new ExceptionAdvisor())
                                     .build();

        mvc.perform(post("/api/v1.3/auth/users")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"user_name\":\"bob\"}"))
           .andExpect(status().isForbidden())
           .andExpect(jsonPath("$.status").value(403));

        Mockito.verify(this.authorizationService, Mockito.never())
               .add(Mockito.any(), Mockito.any());
    }

    @Test
    public void testSpaceAdminCannotCreateGlobalAccount() {
        TestUserController controller = new TestUserController(this.client,
                                                               "manager");
        this.setBaseUserService(controller, this.authorizationService);
        controller.userService = this.authorizationService;
        Mockito.when(this.authorizationService.userLevel(this.client,
                                                         "manager"))
               .thenReturn("SPACEADMIN");
        UserEntity account = new UserEntity();

        ForbiddenException failure = assertForbidden(
                () -> controller.create(account));

        org.junit.Assert.assertTrue(failure.getMessage()
                                           .contains("manage accounts"));
        Mockito.verify(this.authorizationService, Mockito.never())
               .add(this.client, account);
    }

    @Test
    public void testOrdinaryUserCannotModifyDeleteOrGrantAccounts() {
        TestUserController controller = new TestUserController(this.client,
                                                               "alice");
        this.setBaseUserService(controller, this.authorizationService);
        controller.userService = this.authorizationService;
        Mockito.when(this.authorizationService.userLevel(this.client,
                                                         "alice"))
               .thenReturn("USER");
        UserEntity account = new UserEntity();
        account.setName("bob");

        assertForbidden(() -> controller.update("bob", account));
        assertForbidden(() -> controller.delete("bob"));
        assertForbidden(() -> controller.updateadminspace(
                "bob", Collections.singletonList("SPACE")));

        Mockito.verify(this.authorizationService, Mockito.never())
               .update(Mockito.any(), Mockito.any());
        Mockito.verify(this.authorizationService, Mockito.never())
               .delete(Mockito.any(), Mockito.anyString());
        Mockito.verify(this.authorizationService, Mockito.never())
               .updateAdminSpace(Mockito.any(), Mockito.anyString(),
                                 Mockito.anyList());
    }

    @Test
    public void testSpaceAdminCannotCreateSuperadminAccount() {
        TestUserController controller = new TestUserController(this.client,
                                                               "manager");
        this.setBaseUserService(controller, this.authorizationService);
        controller.userService = this.authorizationService;
        Mockito.when(this.authorizationService.userLevel(this.client,
                                                         "manager"))
               .thenReturn("SPACEADMIN");
        UserEntity account = new UserEntity();
        account.setSuperadmin(true);

        ForbiddenException failure = assertForbidden(
                () -> controller.create(account));

        org.junit.Assert.assertTrue(failure.getMessage()
                                           .contains("manage accounts"));
    }

    @Test
    public void testSpaceAdminCannotChangeAnotherGraphSpaceGrant() {
        TestUserController controller = new TestUserController(this.client,
                                                               "manager");
        this.setBaseUserService(controller, this.authorizationService);
        controller.userService = this.authorizationService;
        Mockito.when(this.authorizationService.userLevel(this.client,
                                                         "manager"))
               .thenReturn("SPACEADMIN");
        Mockito.when(this.authorizationService.isSuperAdmin(this.client))
               .thenReturn(false);
        Mockito.when(this.authorizationService.listAdminSpace(
                this.client, "manager"))
               .thenReturn(Collections.singletonList("SPACE_A"));
        Mockito.when(this.authorizationService.listAdminSpace(
                this.client, "bob"))
               .thenReturn(Collections.singletonList("SPACE_B"));

        ForbiddenException failure = assertForbidden(
                () -> controller.updateadminspace(
                        "bob", Collections.singletonList("SPACE_A")));

        org.junit.Assert.assertTrue(failure.getMessage()
                                           .contains("manage accounts"));
    }

    @Test
    public void testSpaceAdminCannotUseGlobalAdminSpaceGrantEndpoint() {
        TestUserController controller = new TestUserController(this.client,
                                                               "manager");
        this.setBaseUserService(controller, this.authorizationService);
        controller.userService = this.authorizationService;
        Mockito.when(this.authorizationService.userLevel(this.client,
                                                         "manager"))
               .thenReturn("SPACEADMIN");
        Mockito.when(this.authorizationService.isSuperAdmin(this.client))
               .thenReturn(false);
        Mockito.when(this.authorizationService.listAdminSpace(
                this.client, "manager"))
               .thenReturn(Collections.singletonList("SPACE_A"));
        Mockito.when(this.authorizationService.listAdminSpace(
                this.client, "bob"))
               .thenReturn(Collections.singletonList("SPACE_B"));
        java.util.List<String> requested = Arrays.asList("SPACE_A", "SPACE_B");

        assertForbidden(() -> controller.updateadminspace("bob", requested));

        Mockito.verify(this.authorizationService, Mockito.never())
               .updateAdminSpace(Mockito.any(), Mockito.anyString(),
                                 Mockito.anyList());
    }

    @Test
    public void testUpdateRejectsBodyUsernameDifferentFromPathIdentity() {
        TestUserController controller = new TestUserController(this.client,
                                                               "admin");
        this.setBaseUserService(controller, this.authorizationService);
        controller.userService = this.authorizationService;
        Mockito.when(this.authorizationService.userLevel(this.client,
                                                         "admin"))
               .thenReturn("ADMIN");
        UserEntity current = account("canonical-id", "bob", false);
        Mockito.when(this.authorizationService.get(this.client,
                                                   "canonical-id"))
               .thenReturn(current);
        UserEntity update = new UserEntity();
        update.setName("mallory");

        try {
            controller.update("canonical-id", update);
            org.junit.Assert.fail("Expected mismatched username rejection");
        } catch (ParameterizedException ignored) {
            // Expected: path identity is authoritative.
        }

        Mockito.verify(this.authorizationService, Mockito.never())
               .update(Mockito.any(), Mockito.any());
    }

    @Test
    public void testMissingSuperadminFieldPreservesCurrentGrant() {
        TestUserController controller = new TestUserController(this.client,
                                                               "admin");
        this.setBaseUserService(controller, this.authorizationService);
        controller.userService = this.authorizationService;
        Mockito.when(this.authorizationService.userLevel(this.client,
                                                         "admin"))
               .thenReturn("ADMIN");
        Mockito.when(this.authorizationService.isSuperAdmin(this.client))
               .thenReturn(true);
        UserEntity current = account("canonical-id", "bob", true);
        Mockito.when(this.authorizationService.get(this.client,
                                                   "canonical-id"))
               .thenReturn(current);
        UserEntity update = new UserEntity();

        controller.update("canonical-id", update);

        org.mockito.ArgumentCaptor<UserEntity> captor =
                org.mockito.ArgumentCaptor.forClass(UserEntity.class);
        Mockito.verify(this.authorizationService)
               .update(Mockito.eq(this.client), captor.capture());
        org.junit.Assert.assertTrue(captor.getValue().isSuperadmin());
        org.junit.Assert.assertEquals("bob", captor.getValue().getName());
        org.junit.Assert.assertEquals("canonical-id",
                                      captor.getValue().getId());
    }

    @Test
    public void testDeleteUsesFetchedCanonicalUserId() {
        TestUserController controller = accountController("admin", "ADMIN");
        UserEntity current = account("canonical-id", "bob", false);
        Mockito.when(this.authorizationService.get(this.client, "lookup-id"))
               .thenReturn(current);

        controller.delete("lookup-id");

        Mockito.verify(this.authorizationService)
               .delete(this.client, "canonical-id");
    }

    @Test
    public void testExplicitFalseSuperadminFieldRevokesCurrentGrant() {
        TestUserController controller = new TestUserController(this.client,
                                                               "admin");
        this.setBaseUserService(controller, this.authorizationService);
        controller.userService = this.authorizationService;
        Mockito.when(this.authorizationService.userLevel(this.client,
                                                         "admin"))
               .thenReturn("ADMIN");
        Mockito.when(this.authorizationService.isSuperAdmin(this.client))
               .thenReturn(true);
        UserEntity current = account("canonical-id", "bob", true);
        Mockito.when(this.authorizationService.get(this.client,
                                                   "canonical-id"))
               .thenReturn(current);
        UserEntity update = new UserEntity();
        update.setSuperadmin(false);

        controller.update("canonical-id", update);

        org.mockito.ArgumentCaptor<UserEntity> captor =
                org.mockito.ArgumentCaptor.forClass(UserEntity.class);
        Mockito.verify(this.authorizationService)
               .update(Mockito.eq(this.client), captor.capture());
        org.junit.Assert.assertFalse(captor.getValue().isSuperadmin());
    }

    @Test
    public void testSuperadminPresenceTracksJsonField() throws Exception {
        ObjectMapper mapper = new ObjectMapper();

        UserEntity omitted = mapper.readValue("{\"user_name\":\"bob\"}",
                                              UserEntity.class);
        UserEntity explicitFalse = mapper.readValue(
                "{\"user_name\":\"bob\",\"is_superadmin\":false}",
                UserEntity.class);

        org.junit.Assert.assertFalse(omitted.hasSuperadmin());
        org.junit.Assert.assertTrue(explicitFalse.hasSuperadmin());
        org.junit.Assert.assertFalse(explicitFalse.isSuperadmin());
        org.junit.Assert.assertFalse(mapper.writeValueAsString(explicitFalse)
                                           .contains("superadminSpecified"));
    }

    @Test
    public void testSpaceAdminCannotModifyExistingSuperadmin() {
        TestUserController controller = new TestUserController(this.client,
                                                               "manager");
        this.setBaseUserService(controller, this.authorizationService);
        controller.userService = this.authorizationService;
        Mockito.when(this.authorizationService.userLevel(this.client,
                                                         "manager"))
               .thenReturn("SPACEADMIN");
        Mockito.when(this.authorizationService.isSuperAdmin(this.client))
               .thenReturn(false);
        UserEntity current = account("canonical-id", "admin", true);
        Mockito.when(this.authorizationService.get(this.client,
                                                   "canonical-id"))
               .thenReturn(current);
        UserEntity update = new UserEntity();
        update.setName("admin");

        ForbiddenException failure = assertForbidden(
                () -> controller.update("canonical-id", update));

        org.junit.Assert.assertTrue(failure.getMessage()
                                           .contains("manage accounts"));
        Mockito.verify(this.authorizationService, Mockito.never())
               .update(Mockito.any(), Mockito.any());
    }

    @Test
    public void testSpaceAdminCannotUpdateSharedGlobalAccount() {
        TestUserController controller = accountController("manager",
                                                         "SPACEADMIN");
        UserEntity current = account("bob-id", "bob", false);
        current.setAdminSpaces(Collections.emptyList());
        current.setResSpaces(Arrays.asList("SPACE_A", "SPACE_B"));
        Mockito.when(this.authorizationService.get(this.client, "bob-id"))
               .thenReturn(current);
        Mockito.when(this.authorizationService.listAdminSpace(
                this.client, "manager"))
               .thenReturn(Collections.singletonList("SPACE_A"));

        assertForbidden(() -> controller.update("bob-id", new UserEntity()));

        Mockito.verify(this.authorizationService, Mockito.never())
               .update(Mockito.any(), Mockito.any());
    }

    @Test
    public void testSpaceAdminCannotUpdateOrDeleteAccountOutsideManagedSpace() {
        TestUserController controller = accountController("manager",
                                                         "SPACEADMIN");
        UserEntity current = account("bob-id", "bob", false);
        current.setAdminSpaces(Collections.emptyList());
        current.setResSpaces(Collections.singletonList("SPACE_B"));
        Mockito.when(this.authorizationService.get(this.client, "bob-id"))
               .thenReturn(current);
        Mockito.when(this.authorizationService.listAdminSpace(
                this.client, "manager"))
               .thenReturn(Collections.singletonList("SPACE_A"));

        assertForbidden(() -> controller.update("bob-id", new UserEntity()));
        assertForbidden(() -> controller.delete("bob-id"));

        Mockito.verify(this.authorizationService, Mockito.never())
               .update(Mockito.any(), Mockito.any());
        Mockito.verify(this.authorizationService, Mockito.never())
               .delete(Mockito.any(), Mockito.anyString());
    }

    @Test
    public void testSpaceAdminCannotDeleteAfterAddingManagedMembership() {
        TestUserController controller = accountController("manager",
                                                         "SPACEADMIN");
        UserEntity current = account("bob-id", "bob", false);
        current.setAdminSpaces(Collections.emptyList());
        current.setResSpaces(Arrays.asList("SPACE_A", "SPACE_B"));
        Mockito.when(this.authorizationService.get(this.client, "bob-id"))
               .thenReturn(current);
        Mockito.when(this.authorizationService.listAdminSpace(
                this.client, "manager"))
               .thenReturn(Collections.singletonList("SPACE_A"));

        assertForbidden(() -> controller.delete("bob-id"));

        Mockito.verify(this.authorizationService, Mockito.never())
               .delete(Mockito.any(), Mockito.anyString());
    }

    @Test
    public void testOnlyGlobalAdminCanBatchCreateAccounts() {
        MultipartFile file = Mockito.mock(MultipartFile.class);
        TestUserController spaceAdmin = accountController("manager",
                                                         "SPACEADMIN");

        assertForbidden(() -> spaceAdmin.createbatch(file));

        TestUserController admin = accountController("admin", "ADMIN");
        admin.createbatch(file);
        Mockito.verify(this.authorizationService).addbatch(this.client, file);
    }

    @Test
    public void testOrdinaryUserCannotAssignGraphSpaceMembership() {
        TestGraphSpaceUserController controller =
                new TestGraphSpaceUserController(this.client, "alice");
        GraphSpaceUserService memberService =
                Mockito.mock(GraphSpaceUserService.class);
        ReflectionTestUtils.setField(controller, "userService", memberService);
        this.setBaseUserService(controller, this.authorizationService);
        Mockito.when(this.authorizationService.isSuperAdmin(this.client))
               .thenReturn(false);
        Mockito.when(this.authorizationService.isAssignSpaceAdmin(
                this.client, "SPACE"))
               .thenReturn(false);
        UserView member = new UserView("bob", "bob",
                                      Collections.emptyList());

        ForbiddenException failure = assertForbidden(
                () -> controller.create("SPACE", member));

        org.junit.Assert.assertTrue(failure.getMessage()
                                           .contains("graphspace members"));
        Mockito.verifyZeroInteractions(memberService);
    }

    @Test
    public void testCurrentSpaceAdminCanAssignGraphSpaceMembership() {
        TestGraphSpaceUserController controller =
                new TestGraphSpaceUserController(this.client, "manager");
        GraphSpaceUserService memberService =
                Mockito.mock(GraphSpaceUserService.class);
        ReflectionTestUtils.setField(controller, "userService", memberService);
        this.setBaseUserService(controller, this.authorizationService);
        Mockito.when(this.authorizationService.isSuperAdmin(this.client))
               .thenReturn(false);
        Mockito.when(this.authorizationService.isAssignSpaceAdmin(
                this.client, "SPACE"))
               .thenReturn(true);
        UserView member = new UserView("bob", "bob",
                                      Collections.emptyList());
        Mockito.when(memberService.createOrUpdate(this.client, "SPACE",
                                                  member))
               .thenReturn(member);

        org.junit.Assert.assertSame(member,
                                    controller.create("SPACE", member));
    }

    @Test
    public void testOrdinaryUserCannotChangeAnyGraphSpaceMembership() {
        TestGraphSpaceUserController controller =
                new TestGraphSpaceUserController(this.client, "alice");
        GraphSpaceUserService memberService =
                Mockito.mock(GraphSpaceUserService.class);
        ReflectionTestUtils.setField(controller, "userService", memberService);
        this.setBaseUserService(controller, this.authorizationService);
        Mockito.when(this.authorizationService.isSuperAdmin(this.client))
               .thenReturn(false);
        Mockito.when(this.authorizationService.isAssignSpaceAdmin(
                this.client, "SPACE"))
               .thenReturn(false);
        UserView member = new UserView("bob", "bob",
                                      Collections.emptyList());

        assertForbidden(() -> controller.createOrUpdate("SPACE", "bob",
                                                        member));
        assertForbidden(() -> controller.delete("SPACE", "bob"));
        assertForbidden(() -> controller.setGraphSpaceAdmin("SPACE", "bob"));
        assertForbidden(() -> controller.removeGraphSpaceAdmin("SPACE",
                                                               "bob"));

        Mockito.verifyZeroInteractions(memberService);
    }

    private void setBaseUserService(BaseController controller,
                                    UserService service) {
        try {
            Field field = BaseController.class.getDeclaredField("userService");
            field.setAccessible(true);
            field.set(controller, service);
        } catch (ReflectiveOperationException e) {
            throw new AssertionError(e);
        }
    }

    private TestUserController accountController(String username,
                                                 String level) {
        TestUserController controller = new TestUserController(this.client,
                                                               username);
        this.setBaseUserService(controller, this.authorizationService);
        controller.userService = this.authorizationService;
        Mockito.when(this.authorizationService.userLevel(this.client,
                                                         username))
               .thenReturn(level);
        Mockito.when(this.authorizationService.isSuperAdmin(this.client))
               .thenReturn("ADMIN".equals(level));
        return controller;
    }

    private static void assertGlobalAccountReadsForbidden(
            TestUserController controller) {
        assertForbidden(controller::list);
        assertForbidden(() -> controller.queryPage("", 1, 10));
        assertForbidden(() -> controller.get("bob-id"));
        assertForbidden(() -> controller.listadminspace("bob"));
    }

    private static ForbiddenException assertForbidden(Action action) {
        try {
            action.run();
            org.junit.Assert.fail("Expected forbidden response");
            return null;
        } catch (ForbiddenException e) {
            return e;
        }
    }

    private static UserEntity account(String id, String name,
                                      boolean superadmin) {
        UserEntity account = new UserEntity();
        account.setId(id);
        account.setName(name);
        account.setSuperadmin(superadmin);
        return account;
    }

    @FunctionalInterface
    private interface Action {

        void run();
    }

    private static class TestUserController extends UserController {

        private final HugeClient client;
        private final String username;

        TestUserController(HugeClient client, String username) {
            this.client = client;
            this.username = username;
        }

        @Override
        protected HugeClient authClient(String graphSpace, String graph) {
            return this.client;
        }

        @Override
        protected String getUser() {
            return this.username;
        }
    }

    private static class TestGraphSpaceUserController
            extends GraphSpaceUserController {

        private final HugeClient client;
        private final String username;

        TestGraphSpaceUserController(HugeClient client, String username) {
            this.client = client;
            this.username = username;
        }

        @Override
        protected HugeClient authClient(String graphSpace, String graph) {
            return this.client;
        }

        @Override
        protected String getUser() {
            return this.username;
        }
    }
}
