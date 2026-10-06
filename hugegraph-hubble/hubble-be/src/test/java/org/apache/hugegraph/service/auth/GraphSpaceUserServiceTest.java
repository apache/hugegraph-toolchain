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

package org.apache.hugegraph.service.auth;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import org.junit.Before;
import org.junit.Test;
import org.mockito.InOrder;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

import org.apache.hugegraph.driver.AuthManager;
import org.apache.hugegraph.driver.GraphSpaceManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.auth.BelongEntity;
import org.apache.hugegraph.entity.auth.RoleEntity;
import org.apache.hugegraph.entity.auth.UserView;
import org.apache.hugegraph.exception.ParameterizedException;
import org.apache.hugegraph.structure.auth.User;
import org.apache.hugegraph.testutil.Assert;

public class GraphSpaceUserServiceTest {

    private HugeClient client;
    private AuthManager auth;
    private GraphSpaceManager graphSpace;
    private BelongService belongService;
    private GraphSpaceUserService service;

    @Before
    public void setup() {
        this.client = Mockito.mock(HugeClient.class);
        this.auth = Mockito.mock(AuthManager.class);
        this.graphSpace = Mockito.mock(GraphSpaceManager.class);
        this.belongService = Mockito.mock(BelongService.class);
        this.service = new GraphSpaceUserService();
        ReflectionTestUtils.setField(this.service, "belongService",
                                     this.belongService);
        Mockito.when(this.client.auth()).thenReturn(this.auth);
        Mockito.when(this.client.graphSpace()).thenReturn(this.graphSpace);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(true);
        Mockito.when(this.auth.listSuperAdmin())
               .thenReturn(Collections.emptyList());
    }

    @Test
    public void testPermissionPresetFailureHasActionableErrorKey() {
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(false);

        ParameterizedException error = null;
        try {
            this.service.validatePermissionPresets(
                    this.client, Collections.emptyList(), "GS_READ_ONLY");
        } catch (ParameterizedException e) {
            error = e;
        }

        Assert.assertNotNull(error);
        Assert.assertEquals("auth.permission-preset.unsupported",
                            error.getMessage());
    }

    @Test
    public void testGetUserResolvesUniqueAccountIdToRealId() {
        User account = new User();
        account.setId("user-42");
        account.name("alice@example.com");
        Mockito.when(this.client.findUserByName("alice@example.com"))
               .thenReturn(account);
        Mockito.when(this.belongService.list(
                         this.client, "team", null, "user-42"))
               .thenReturn(Collections.emptyList());

        UserView result = this.service.getUserByAccountId(
                this.client, "team", "alice@example.com");

        Assert.assertEquals("user-42", result.getId());
        Assert.assertEquals("alice@example.com", result.getName());
    }

    @Test
    public void testGetUserDoesNotHideConnectionFailure() {
        RuntimeException failure = new RuntimeException("connection timeout");
        Mockito.when(this.client.findUserByName("alice")).thenThrow(failure);

        Throwable actual = Assert.assertThrows(
                RuntimeException.class,
                () -> this.service.getUserByAccountId(
                        this.client, "team", "alice"));

        Assert.assertSame(failure, actual);
        Mockito.verify(this.auth, Mockito.never())
               .getUser(Mockito.anyString());
    }

    @Test
    public void testGraphSpacePresetRequiresAtLeastOneGraphSpace() {
        for (String preset : Arrays.asList(
                "GS_READ_ONLY", "GS_READ_WRITE", "GS_ADMIN")) {
            ParameterizedException error = null;
            try {
                this.service.validatePermissionPresets(
                        this.client, Collections.emptyList(), preset);
            } catch (ParameterizedException e) {
                error = e;
            }

            Assert.assertNotNull(error);
            Assert.assertEquals(
                    "auth.permission-preset.graphspace-required",
                    error.getMessage());
        }
        Mockito.verifyNoInteractions(this.graphSpace);
    }

    @Test
    public void testUnknownAccountPresetIsRejectedBeforeAccountCreation() {
        ParameterizedException error = null;
        try {
            this.service.validatePermissionPresets(
                    this.client, Collections.emptyList(), "UNKNOWN");
        } catch (ParameterizedException e) {
            error = e;
        }

        Assert.assertNotNull(error);
        Assert.assertEquals("auth.permission-preset.invalid",
                            error.getMessage());
        Mockito.verifyNoInteractions(this.graphSpace);
    }

    @Test
    public void testMixedGraphSpacePresetsAreRejected() {
        Mockito.when(this.graphSpace.listGraphSpace())
               .thenReturn(Collections.singletonList("team"));
        Map<String, String> permission = new HashMap<>();
        permission.put("graphspace", "team");
        permission.put("permission_preset", "GS_READ_ONLY");

        ParameterizedException error = null;
        try {
            this.service.validatePermissionPresets(
                    this.client, Collections.singletonList(permission),
                    "GS_READ_WRITE");
        } catch (ParameterizedException e) {
            error = e;
        }

        Assert.assertNotNull(error);
        Assert.assertEquals("auth.permission-preset.mismatch",
                            error.getMessage());
    }

    @Test
    public void testNullGraphSpacePermissionEntryIsRejected() {
        ParameterizedException error = null;
        try {
            this.service.validatePermissionPresets(
                    this.client, Collections.singletonList(null),
                    "GS_READ_ONLY");
        } catch (ParameterizedException e) {
            error = e;
        }

        Assert.assertNotNull(error);
        Assert.assertEquals("auth.permission-preset.entry-invalid",
                            error.getMessage());
    }

    @Test
    public void testListUsersMarksOnlyServerDefaultRolesAsPresets() {
        User user = user("u-1", "alice");
        Mockito.when(this.belongService.list(
                             this.client, "team", null, null))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.auth.listSpaceMember("team"))
               .thenReturn(Collections.singletonList("alice"));
        Mockito.when(this.client.findUserByName("alice")).thenReturn(user);
        Mockito.when(this.graphSpace.checkDefaultRole(
                             "team", "alice", "observer"))
               .thenReturn(true);

        UserView view = this.service.listUsers(this.client, "team").get(0);

        Assert.assertEquals(1, view.getRoles().size());
        Assert.assertEquals("observer", view.getRoles().get(0).getName());
        Assert.assertEquals("GS_READ_ONLY",
                            view.getRoles().get(0).getPermissionPreset());
    }

    @Test
    public void testLegacyAccessUsesMembershipWithoutDefaultRoleApi() {
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(false);
        Mockito.when(this.auth.listSpaceMember("team"))
               .thenReturn(Collections.singletonList("alice"));

        Assert.assertTrue(this.service.hasGraphSpaceAccess(
                          this.client, "team", "alice"));
        Assert.assertFalse(this.service.hasGraphSpaceAccess(
                           this.client, "team", "bob"));
        Mockito.verifyNoInteractions(this.graphSpace);
        Mockito.verify(this.auth, Mockito.times(2)).listSpaceMember("team");
    }

    @Test
    public void testModernCustomRoleAccessFallsBackToMembership() {
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(true);
        Mockito.when(this.auth.listSpaceMember("team"))
               .thenReturn(Collections.singletonList("alice"));

        Assert.assertTrue(this.service.hasGraphSpaceAccess(
                          this.client, "team", "alice"));
        Assert.assertFalse(this.service.hasGraphSpaceAccess(
                           this.client, "team", "bob"));
    }

    @Test
    public void testModernRolePayloadRequiresPresetApi() {
        UserView user = new UserView(
                "u-1", "alice",
                Collections.singletonList(new RoleEntity("custom", "custom")));

        ParameterizedException error = null;
        try {
            this.service.createOrUpdate(this.client, "team", user);
        } catch (ParameterizedException e) {
            error = e;
        }

        Assert.assertNotNull(error);
        Assert.assertEquals("auth.permission-preset.required",
                            error.getMessage());
        Mockito.verifyNoInteractions(this.belongService);
        Mockito.verifyNoInteractions(this.auth);
    }

    @Test
    public void testGetUserMergesCustomAndExplicitDefaultRoles() {
        User user = user("u-1", "alice");
        BelongEntity custom = BelongEntity.builder()
                                          .userId("u-1")
                                          .userName("alice")
                                          .roleId("custom-id")
                                          .roleName("analyst")
                                          .build();
        Mockito.when(this.belongService.list(
                             this.client, "team", null, "u-1"))
               .thenReturn(Collections.singletonList(custom));
        Mockito.when(this.auth.getUser("u-1")).thenReturn(user);
        Mockito.when(this.graphSpace.checkDefaultRole(
                             "team", "alice", "observer"))
               .thenReturn(true);

        UserView view = this.service.getUser(this.client, "team", "u-1");

        Assert.assertEquals(2, view.getRoles().size());
        RoleEntity customRole = view.getRoles().get(0);
        RoleEntity defaultRole = view.getRoles().get(1);
        Assert.assertNull(customRole.getPermissionPreset());
        Assert.assertEquals("GS_READ_ONLY",
                            defaultRole.getPermissionPreset());
    }

    @Test
    public void testApplyReadOnlyPresetAndRemoveUnrequestedSpace() {
        User user = user("alice", "alice");
        Mockito.when(this.client.findUserByName("alice")).thenReturn(user);
        Mockito.when(this.auth.getUser("alice")).thenReturn(user);
        Mockito.when(this.graphSpace.listGraphSpace())
               .thenReturn(java.util.Arrays.asList("team", "old"));
        Mockito.when(this.belongService.list(
                             Mockito.eq(this.client), Mockito.anyString(),
                             Mockito.isNull(), Mockito.eq("alice")))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.auth.listSpaceMember("team"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.auth.listSpaceMember("old"))
               .thenReturn(Collections.singletonList("alice"));
        Mockito.when(this.auth.listSpaceAdmin(Mockito.anyString()))
               .thenReturn(Collections.emptyList());

        this.service.applyPermissionPresets(
                this.client, "alice",
                Collections.singletonList(permission("team", "GS_READ_ONLY")),
                "GS_READ_ONLY");

        Mockito.verify(this.auth).addSpaceMember("alice", "team");
        Mockito.verify(this.graphSpace)
               .setDefaultRole("team", "alice", "observer");
        Mockito.verify(this.auth).delSpaceMember("alice", "old");
    }

    @Test
    public void testNewAccountAppliesOnlyRequestedSpaces() {
        User user = user("u-1", "alice");
        Mockito.when(this.client.findUserByName("alice")).thenReturn(user);
        GraphSpaceUserService service = Mockito.spy(this.service);
        Mockito.doNothing().when(service)
               .applySpacePreset(this.client, "team", "u-1",
                                 "alice",
                                 "GS_READ_ONLY");

        service.applyPermissionPresetsForNewAccount(
                this.client, "alice",
                Collections.singletonList(permission("team", "GS_READ_ONLY")),
                "GS_READ_ONLY");

        Mockito.verify(service).applySpacePreset(
                this.client, "team", "u-1", "alice", "GS_READ_ONLY");
        Mockito.verify(this.graphSpace, Mockito.never()).listGraphSpace();
    }

    @Test
    public void testReconciliationRestoresEarlierGraphSpaces() {
        User user = user("u-1", "alice");
        Mockito.when(this.client.findUserByName("alice")).thenReturn(user);
        Mockito.when(this.graphSpace.listGraphSpace())
               .thenReturn(Arrays.asList("first", "second"));
        Mockito.when(this.auth.listSpaceMember("first"))
               .thenReturn(Collections.singletonList("alice"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.auth.listSpaceMember("second"))
               .thenReturn(Collections.singletonList("alice"));
        Mockito.when(this.belongService.list(
                             Mockito.eq(this.client), Mockito.anyString(),
                             Mockito.isNull(), Mockito.eq("u-1")))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.graphSpace.checkDefaultRole(
                             "first", "alice", "analyst"))
               .thenReturn(false);
        Mockito.when(this.graphSpace.checkDefaultRole(
                             "first", "alice", "observer"))
               .thenReturn(true, false);
        Mockito.when(this.graphSpace.checkDefaultRole(
                             "second", "alice", "analyst"))
               .thenReturn(false);
        Mockito.when(this.graphSpace.checkDefaultRole(
                             "second", "alice", "observer"))
               .thenReturn(false);
        Mockito.when(this.auth.listSpaceAdmin(Mockito.anyString()))
               .thenReturn(Collections.emptyList());
        GraphSpaceUserService service = Mockito.spy(this.service);
        Mockito.doNothing().when(service)
               .applySpacePreset(this.client, "first", "u-1",
                                 "alice",
                                 "GS_READ_ONLY");
        RuntimeException failure = new RuntimeException("second failed");
        Mockito.doThrow(failure).when(service)
               .applySpacePreset(this.client, "second", "u-1",
                                 "alice",
                                 "GS_READ_ONLY");

        Throwable error = Assert.assertThrows(
                RuntimeException.class,
                () -> service.applyPermissionPresets(
                        this.client, "alice",
                        Arrays.asList(
                                permission("first", "GS_READ_ONLY"),
                                permission("second", "GS_READ_ONLY")),
                        "GS_READ_ONLY"));

        Assert.assertSame(failure, error);
        InOrder rollback = Mockito.inOrder(this.auth, this.graphSpace);
        rollback.verify(this.auth).addSpaceMember("alice", "first");
        rollback.verify(this.graphSpace)
                .setDefaultRole("first", "alice", "observer");
    }

    @Test
    public void testNewMemberResolvesIdAfterUsernameMembership() {
        User user = user("u-1", "alice");
        Mockito.when(this.auth.listSpaceMember("team"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.client.findUserByName("alice")).thenReturn(user);
        Mockito.when(this.belongService.list(
                             this.client, "team", null, "u-1"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.auth.listSpaceAdmin("team"))
               .thenReturn(Collections.emptyList());

        this.service.applySpacePreset(this.client, "team", null, "alice", "GS_READ_ONLY");

        Mockito.verify(this.auth).addSpaceMember("alice", "team");
        Mockito.verify(this.client).findUserByName("alice");
        Mockito.verify(this.graphSpace)
               .setDefaultRole("team", "alice", "observer");
    }

    @Test
    public void testApplyAdminPresetAddsManagementAndWriteAccess() {
        User user = user("alice", "alice");
        Mockito.when(this.auth.getUser("alice")).thenReturn(user);
        Mockito.when(this.belongService.list(
                             this.client, "team", null, "alice"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.auth.listSpaceMember("team"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.auth.listSpaceAdmin("team"))
               .thenReturn(Collections.emptyList());

        this.service.applySpacePreset(this.client, "team", "alice",
                                      "alice",
                                      "GS_ADMIN");

        Mockito.verify(this.auth).addSpaceMember("alice", "team");
        Mockito.verify(this.auth).addSpaceAdmin("alice", "team");
        Mockito.verify(this.graphSpace)
               .setDefaultRole("team", "alice", "analyst");
    }

    @Test
    public void testApplyReadWritePresetRemovesAdminAccess() {
        User user = user("alice", "alice");
        Mockito.when(this.auth.getUser("alice")).thenReturn(user);
        Mockito.when(this.belongService.list(
                             this.client, "team", null, "alice"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.auth.listSpaceMember("team"))
               .thenReturn(Collections.singletonList("alice"));
        Mockito.when(this.auth.listSpaceAdmin("team"))
               .thenReturn(Collections.singletonList("alice"));

        this.service.applySpacePreset(this.client, "team", "alice",
                                      "alice",
                                      "GS_READ_WRITE");

        Mockito.verify(this.auth).delSpaceAdmin("alice", "team");
        Mockito.verify(this.graphSpace)
               .setDefaultRole("team", "alice", "analyst");
        Mockito.verify(this.auth, Mockito.never())
               .addSpaceMember(Mockito.anyString(), Mockito.anyString());
    }

    @Test
    public void testApplyPresetAddsMemberBeforeScopedUserRead() {
        User user = user("alice", "alice");
        Mockito.when(this.auth.listSpaceMember("team"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.auth.getUser("alice")).thenReturn(user);
        Mockito.when(this.belongService.list(
                             this.client, "team", null, "alice"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.auth.listSpaceAdmin("team"))
               .thenReturn(Collections.emptyList());

        this.service.applySpacePreset(this.client, "team", "alice",
                                      "alice",
                                      "GS_READ_ONLY");

        InOrder order = Mockito.inOrder(this.auth);
        order.verify(this.auth).addSpaceMember("alice", "team");
        order.verify(this.auth).getUser("alice");
        Mockito.verify(this.graphSpace)
               .setDefaultRole("team", "alice", "observer");
    }

    @Test
    public void testApplyPresetRollsBackBootstrapMemberOnUserReadFailure() {
        Mockito.when(this.auth.listSpaceMember("team"))
               .thenReturn(Collections.emptyList())
               .thenReturn(Collections.singletonList("alice"));
        Mockito.when(this.auth.getUser("alice"))
               .thenThrow(new RuntimeException("read failed"));

        Assert.assertThrows(RuntimeException.class,
                            () -> this.service.applySpacePreset(
                                    this.client, "team", "alice",
                                    "alice",
                                    "GS_READ_ONLY"));

        InOrder order = Mockito.inOrder(this.auth);
        order.verify(this.auth).addSpaceMember("alice", "team");
        order.verify(this.auth).getUser("alice");
        order.verify(this.auth).delSpaceMember("alice", "team");
    }

    @Test
    public void testApplyPresetReconcilesMemberAfterLostAddResponse() {
        Mockito.when(this.auth.listSpaceMember("team"))
               .thenReturn(Collections.emptyList())
               .thenReturn(Collections.singletonList("alice"));
        Mockito.when(this.auth.addSpaceMember("alice", "team"))
               .thenThrow(new RuntimeException("response lost"));

        Assert.assertThrows(RuntimeException.class,
                            () -> this.service.applySpacePreset(
                                    this.client, "team", "alice",
                                    "alice",
                                    "GS_READ_ONLY"));

        Mockito.verify(this.auth).delSpaceMember("alice", "team");
        Mockito.verify(this.auth, Mockito.never()).getUser("alice");
    }

    @Test
    public void testApplyPresetExplainsMissingAccount() {
        Mockito.when(this.auth.listSpaceMember("team"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.auth.addSpaceMember("missing", "team"))
               .thenThrow(new RuntimeException(
                       "The user or group is not exist"));

        ParameterizedException error = null;
        try {
            this.service.applySpacePreset(this.client, "team", null,
                                          "missing", "GS_READ_ONLY");
        } catch (ParameterizedException e) {
            error = e;
        }

        Assert.assertNotNull(error);
        Assert.assertEquals("auth.account.not-exist", error.getMessage());
        Mockito.verify(this.client, Mockito.never())
               .findUserByName(Mockito.anyString());
    }

    @Test
    public void testApplyPresetRollsBackMemberOnDefaultRoleFailure() {
        User user = user("alice", "alice");
        Mockito.when(this.auth.listSpaceMember("team"))
               .thenReturn(Collections.emptyList())
               .thenReturn(Collections.singletonList("alice"));
        Mockito.when(this.auth.getUser("alice")).thenReturn(user);
        Mockito.when(this.belongService.list(
                             this.client, "team", null, "alice"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.auth.listSpaceAdmin("team"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.graphSpace.setDefaultRole(
                             "team", "alice", "observer"))
               .thenThrow(new RuntimeException("role failed"));

        Assert.assertThrows(RuntimeException.class,
                            () -> this.service.applySpacePreset(
                                    this.client, "team", "alice",
                                    "alice",
                                    "GS_READ_ONLY"));

        InOrder order = Mockito.inOrder(this.auth, this.graphSpace);
        order.verify(this.auth).addSpaceMember("alice", "team");
        order.verify(this.auth).getUser("alice");
        order.verify(this.graphSpace)
             .setDefaultRole("team", "alice", "observer");
        order.verify(this.auth).delSpaceMember("alice", "team");
    }

    @Test
    public void testApplyAdminPresetRollsBackAdminAndMemberOnRoleFailure() {
        User user = user("alice", "alice");
        Mockito.when(this.auth.listSpaceMember("team"))
               .thenReturn(Collections.emptyList())
               .thenReturn(Collections.singletonList("alice"));
        Mockito.when(this.auth.getUser("alice")).thenReturn(user);
        Mockito.when(this.belongService.list(
                             this.client, "team", null, "alice"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.auth.listSpaceAdmin("team"))
               .thenReturn(Collections.emptyList())
               .thenReturn(Collections.singletonList("alice"));
        Mockito.when(this.graphSpace.setDefaultRole(
                             "team", "alice", "analyst"))
               .thenThrow(new RuntimeException("role failed"));

        Assert.assertThrows(RuntimeException.class,
                            () -> this.service.applySpacePreset(
                                    this.client, "team", "alice",
                                    "alice",
                                    "GS_ADMIN"));

        InOrder order = Mockito.inOrder(this.auth, this.graphSpace);
        order.verify(this.auth).addSpaceMember("alice", "team");
        order.verify(this.auth).getUser("alice");
        order.verify(this.auth).addSpaceAdmin("alice", "team");
        order.verify(this.graphSpace)
             .setDefaultRole("team", "alice", "analyst");
        order.verify(this.auth).delSpaceAdmin("alice", "team");
        order.verify(this.auth).delSpaceMember("alice", "team");
    }

    @Test
    public void testApplyPresetRestoresExistingAdminStateOnFailure() {
        User user = user("alice", "alice");
        BelongEntity custom = BelongEntity.builder()
                                          .id("belong-1")
                                          .userId("alice")
                                          .roleId("role-1")
                                          .build();
        Mockito.when(this.auth.listSpaceMember("team"))
               .thenReturn(Collections.singletonList("alice"));
        Mockito.when(this.auth.getUser("alice")).thenReturn(user);
        Mockito.when(this.belongService.list(
                             this.client, "team", null, "alice"))
               .thenReturn(Collections.singletonList(custom))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.graphSpace.checkDefaultRole(
                             "team", "alice", "analyst"))
               .thenReturn(true, false);
        Mockito.when(this.graphSpace.checkDefaultRole(
                             "team", "alice", "observer"))
               .thenReturn(false);
        Mockito.when(this.auth.listSpaceAdmin("team"))
               .thenReturn(Collections.singletonList("alice"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.graphSpace.setDefaultRole(
                             "team", "alice", "analyst"))
               .thenThrow(new RuntimeException("role failed"))
               .thenReturn(Collections.emptyMap());

        Assert.assertThrows(RuntimeException.class,
                            () -> this.service.applySpacePreset(
                                    this.client, "team", "alice",
                                    "alice",
                                    "GS_READ_WRITE"));

        Mockito.verify(this.belongService)
               .add(this.client, "team", "role-1", "alice");
        Mockito.verify(this.graphSpace, Mockito.times(2))
               .setDefaultRole("team", "alice", "analyst");
        Mockito.verify(this.auth).addSpaceAdmin("alice", "team");
        Mockito.verify(this.auth, Mockito.never())
               .delSpaceMember(Mockito.anyString(), Mockito.anyString());
    }

    @Test
    public void testApplyPresetContinuesRestoringCustomRolesAfterFailure() {
        User user = user("alice", "alice");
        BelongEntity first = BelongEntity.builder()
                                         .id("belong-1")
                                         .userId("alice")
                                         .roleId("role-1")
                                         .build();
        BelongEntity second = BelongEntity.builder()
                                          .id("belong-2")
                                          .userId("alice")
                                          .roleId("role-2")
                                          .build();
        Mockito.when(this.auth.listSpaceMember("team"))
               .thenReturn(Collections.singletonList("alice"));
        Mockito.when(this.auth.getUser("alice")).thenReturn(user);
        Mockito.when(this.belongService.list(
                             this.client, "team", null, "alice"))
               .thenReturn(java.util.Arrays.asList(first, second))
               .thenReturn(Collections.emptyList())
               .thenReturn(Collections.emptyList());
        Mockito.when(this.graphSpace.checkDefaultRole(
                             "team", "alice", "analyst"))
               .thenReturn(false);
        Mockito.when(this.graphSpace.checkDefaultRole(
                             "team", "alice", "observer"))
               .thenReturn(false);
        Mockito.when(this.auth.listSpaceAdmin("team"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.graphSpace.setDefaultRole(
                             "team", "alice", "observer"))
               .thenThrow(new RuntimeException("role failed"));
        Mockito.doThrow(new RuntimeException("first restore failed"))
               .when(this.belongService)
               .add(this.client, "team", "role-1", "alice");

        Assert.assertThrows(RuntimeException.class,
                            () -> this.service.applySpacePreset(
                                    this.client, "team", "alice",
                                    "alice",
                                    "GS_READ_ONLY"));

        Mockito.verify(this.belongService)
               .add(this.client, "team", "role-1", "alice");
        Mockito.verify(this.belongService)
               .add(this.client, "team", "role-2", "alice");
    }

    @Test
    public void testApplyPresetRemovesRoleCommittedBeforeClientFailure() {
        User user = user("alice", "alice");
        Mockito.when(this.auth.listSpaceMember("team"))
               .thenReturn(Collections.emptyList())
               .thenReturn(Collections.singletonList("alice"));
        Mockito.when(this.auth.getUser("alice")).thenReturn(user);
        Mockito.when(this.belongService.list(
                             this.client, "team", null, "alice"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.graphSpace.checkDefaultRole(
                             "team", "alice", "analyst"))
               .thenReturn(false);
        Mockito.when(this.graphSpace.checkDefaultRole(
                             "team", "alice", "observer"))
               .thenReturn(false, true);
        Mockito.when(this.auth.listSpaceAdmin("team"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.graphSpace.setDefaultRole(
                             "team", "alice", "observer"))
               .thenThrow(new RuntimeException("response lost"));

        Assert.assertThrows(RuntimeException.class,
                            () -> this.service.applySpacePreset(
                                    this.client, "team", "alice",
                                    "alice",
                                    "GS_READ_ONLY"));

        Mockito.verify(this.graphSpace)
               .deleteDefaultRole("team", "alice", "observer");
        Mockito.verify(this.auth).delSpaceMember("alice", "team");
    }

    @Test
    public void testRemovePresetCleansEveryGrantType() {
        User user = user("u-1", "alice");
        BelongEntity belong = BelongEntity.builder()
                                          .id("belong-1")
                                          .userId("u-1")
                                          .build();
        Mockito.when(this.auth.getUser("u-1")).thenReturn(user);
        Mockito.when(this.belongService.list(
                             this.client, "team", null, "u-1"))
               .thenReturn(Collections.singletonList(belong));
        Mockito.when(this.graphSpace.checkDefaultRole(
                             "team", "alice", "analyst"))
               .thenReturn(true);
        Mockito.when(this.graphSpace.checkDefaultRole(
                             "team", "alice", "observer"))
               .thenReturn(true);
        Mockito.when(this.auth.listSpaceAdmin("team"))
               .thenReturn(Collections.singletonList("alice"));
        Mockito.when(this.auth.listSpaceMember("team"))
               .thenReturn(Collections.singletonList("alice"));

        this.service.removeSpacePreset(this.client, "team", "u-1");

        Mockito.verify(this.belongService)
               .deleteById(this.client, "team", "belong-1");
        Mockito.verify(this.graphSpace)
               .deleteDefaultRole("team", "alice", "analyst");
        Mockito.verify(this.graphSpace)
               .deleteDefaultRole("team", "alice", "observer");
        Mockito.verify(this.auth).delSpaceAdmin("alice", "team");
        Mockito.verify(this.auth).delSpaceMember("alice", "team");
    }

    private static User user(String id, String name) {
        User user = new User();
        user.setId(id);
        user.name(name);
        return user;
    }

    private static Map<String, String> permission(String graphSpace,
                                                   String preset) {
        Map<String, String> permission = new HashMap<>();
        permission.put("graphspace", graphSpace);
        permission.put("permission_preset", preset);
        return permission;
    }
}
