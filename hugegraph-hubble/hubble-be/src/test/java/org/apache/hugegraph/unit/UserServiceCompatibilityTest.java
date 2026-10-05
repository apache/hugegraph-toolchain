/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hugegraph.unit;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import com.baomidou.mybatisplus.core.metadata.IPage;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

import org.apache.hugegraph.common.Response;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.AuthManager;
import org.apache.hugegraph.driver.GraphSpaceManager;
import org.apache.hugegraph.driver.GraphsManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.auth.UserEntity;
import org.apache.hugegraph.exception.ParameterizedException;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.exception.UnauthorizedException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.auth.GraphSpaceUserService;
import org.apache.hugegraph.service.auth.StandaloneAccountPermissionService;
import org.apache.hugegraph.service.auth.UserService;
import org.apache.hugegraph.structure.auth.User;

public class UserServiceCompatibilityTest {

    private HugeConfig config;
    private HugeClient client;
    private AuthManager auth;
    private GraphSpaceManager graphSpace;
    private GraphsManager graphs;
    private GraphSpaceUserService graphSpaceUsers;
    private StandaloneAccountPermissionService standalonePermissions;
    private UserService service;

    @Before
    public void setup() {
        this.config = Mockito.mock(HugeConfig.class);
        this.client = Mockito.mock(HugeClient.class);
        this.auth = Mockito.mock(AuthManager.class);
        this.graphSpace = Mockito.mock(GraphSpaceManager.class);
        this.graphs = Mockito.mock(GraphsManager.class);
        this.graphSpaceUsers = Mockito.mock(GraphSpaceUserService.class);
        this.standalonePermissions =
                Mockito.mock(StandaloneAccountPermissionService.class);
        Mockito.when(this.client.auth()).thenReturn(this.auth);
        Mockito.when(this.client.graphSpace()).thenReturn(this.graphSpace);
        Mockito.when(this.client.graphs()).thenReturn(this.graphs);
        Mockito.when(this.auth.createUser(Mockito.any(User.class)))
               .thenReturn(user("created-id"));
        Mockito.when(this.auth.listSuperAdmin())
               .thenReturn(java.util.Collections.emptyList());
        this.service = new UserService();
        ReflectionTestUtils.setField(this.service, "config", this.config);
        ReflectionTestUtils.setField(this.service, "graphSpaceUserService",
                                     this.graphSpaceUsers);
        ReflectionTestUtils.setField(this.service, "standalonePermissions",
                                     this.standalonePermissions);
    }

    @Test
    public void testStandaloneUserCreationOmitsPdOnlyNickname() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        UserEntity created =
                this.service.add(this.client, userEntity("display-name"));

        ArgumentCaptor<User> request = ArgumentCaptor.forClass(User.class);
        Mockito.verify(this.auth).createUser(request.capture());
        Assert.assertNull(request.getValue().nickname());
        Assert.assertEquals("created-id", created.getId());
        Mockito.verify(this.standalonePermissions).assignReadWrite(
                Mockito.eq(this.client), Mockito.any(User.class));
    }

    @Test
    public void testPdUserCreationKeepsNickname() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);

        this.service.add(this.client, userEntity("display-name"));

        ArgumentCaptor<User> request = ArgumentCaptor.forClass(User.class);
        Mockito.verify(this.auth).createUser(request.capture());
        Assert.assertEquals("display-name", request.getValue().nickname());
        Mockito.verifyNoMoreInteractions(this.standalonePermissions);
    }

    @Test
    public void testStandaloneGrantFailureDeletesNewAccount() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        User created = user("created-user");
        Mockito.when(this.auth.createUser(Mockito.any(User.class)))
               .thenReturn(created);
        RuntimeException failure = new RuntimeException("grant failed");
        Mockito.doThrow(failure).when(this.standalonePermissions)
               .assignReadWrite(this.client, created);

        RuntimeException error = null;
        try {
            this.service.add(this.client, userEntity("display-name"));
        } catch (RuntimeException e) {
            error = e;
        }

        Assert.assertNotNull(error);
        Assert.assertSame(failure, error);
        Mockito.verify(this.auth).deleteUser("created-user");
    }

    @Test
    public void testStandaloneAccountLevelsMatchServerRoles() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        Mockito.when(this.auth.listUsers())
               .thenReturn(Arrays.asList(user("admin"), user("hubbleuser")));
        Mockito.when(this.standalonePermissions.readWriteUsers(this.client))
               .thenReturn(Collections.singleton("hubbleuser"));

        @SuppressWarnings("unchecked")
        IPage<UserEntity> result = (IPage<UserEntity>)
                this.service.queryPage(this.client, "", 1, 10);

        Assert.assertTrue(result.getRecords().get(0).isSuperadmin());
        Assert.assertFalse(result.getRecords().get(1).isSuperadmin());
        Assert.assertEquals("GS_READ_WRITE",
                            result.getRecords().get(1).getPermissionPreset());
    }

    @Test
    public void testStandaloneUserUpdateOmitsPdOnlyNickname() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        UserEntity user = UserEntity.builder()
                                    .id("user-id")
                                    .name("user")
                                    .nickname("display-name")
                                    .build();
        user.setSuperadmin(true);

        this.service.update(this.client, user);

        ArgumentCaptor<User> request = ArgumentCaptor.forClass(User.class);
        Mockito.verify(this.auth).updateUser(request.capture());
        Assert.assertNull(request.getValue().nickname());
        Mockito.verify(this.auth, Mockito.never())
               .addSuperAdmin(Mockito.anyString());
    }

    @Test
    public void testStandalonePersonalUpdateOmitsPdOnlyNickname() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        Mockito.when(this.client.supportsPersonalProfileUpdate())
               .thenReturn(true);
        Mockito.when(this.client.findCurrentUser("user")).thenReturn(user("user"));

        this.service.updatePersonal(this.client, "user", "display-name",
                                    "description");

        ArgumentCaptor<User> request = ArgumentCaptor.forClass(User.class);
        Mockito.verify(this.auth).updateUser(request.capture());
        Assert.assertNull(request.getValue().nickname());
        Assert.assertEquals("description", request.getValue().description());
    }

    @Test
    public void testLegacyPersonalUpdateFailsBeforeServerWrite() {
        Mockito.when(this.client.supportsPersonalProfileUpdate())
               .thenReturn(false);

        ParameterizedException error = null;
        try {
            this.service.updatePersonal(this.client, "user", "display-name",
                                        "description");
        } catch (ParameterizedException e) {
            error = e;
        }

        Assert.assertNotNull(error);
        Assert.assertEquals("auth.profile.update-unsupported",
                            error.getMessage());
        Mockito.verify(this.client, Mockito.never())
               .findCurrentUser(Mockito.anyString());
        Mockito.verify(this.auth, Mockito.never())
               .updateUser(Mockito.any(User.class));
    }

    @Test
    public void testLegacyPasswordUpdateUsesVerifiedIdentity() {
        User current = user("user");
        current.setId("user-id");
        Mockito.when(this.client.findCurrentUser("user"))
               .thenReturn(current);

        Response response = this.service.updatepwd(
                this.client, "user", "old-password", "new-password");

        Assert.assertEquals(200, response.getStatus());
        ArgumentCaptor<User> request = ArgumentCaptor.forClass(User.class);
        Mockito.verify(this.auth).updateUser(request.capture());
        Assert.assertEquals("user-id", request.getValue().id());
        Assert.assertEquals("new-password", request.getValue().password());
    }

    @Test
    public void testCurrentUserIdentityMismatchIsUnauthorized() {
        Mockito.when(this.client.findCurrentUser("user"))
               .thenThrow(new IllegalStateException("mismatch"));

        try {
            this.service.getpersonal(this.client, "user");
            Assert.fail("Expected an unauthorized current-user identity");
        } catch (UnauthorizedException ignored) {
            // Expected
        }
    }

    @Test
    public void testMissingCurrentUserRecordIsUnauthorized() {
        ServerException missing = new ServerException("missing");
        missing.status(404);
        Mockito.when(this.client.findCurrentUser("user")).thenThrow(missing);

        try {
            this.service.getpersonal(this.client, "user");
            Assert.fail("Expected an unauthorized missing current user");
        } catch (UnauthorizedException ignored) {
            // Expected
        }
    }

    @Test
    public void testCurrentUserPresetUsesSelfPermissionApi() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(true);
        Mockito.when(this.client.findCurrentUser("user"))
               .thenReturn(user("user"));
        Mockito.when(this.graphSpace.listGraphSpace())
               .thenReturn(java.util.Collections.singletonList("SPACE"));
        Mockito.when(this.auth.checkDefaultRole("SPACE", "analyst"))
               .thenReturn(true);

        UserEntity result = this.service.getpersonal(this.client, "user");

        Assert.assertEquals("GS_READ_WRITE",
                            result.getGraphspacePermissions().get(0)
                                  .get("permission_preset"));
        Mockito.verify(this.graphSpace, Mockito.never())
               .checkDefaultRole(Mockito.anyString(), Mockito.anyString(),
                                 Mockito.anyString());
    }

    @Test
    public void testUserDetailFindsAdminSpacesByUsername() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        User account = user("alice");
        account.setId("user-id");
        Mockito.when(this.auth.getUser("user-id")).thenReturn(account);
        Mockito.when(this.auth.listUsers())
               .thenReturn(Collections.singletonList(account));
        Mockito.when(this.graphSpace.listGraphSpace())
               .thenReturn(Collections.singletonList("SPACE"));
        Mockito.when(this.auth.listSpaceAdmin("SPACE"))
               .thenReturn(Collections.singletonList("alice"));

        UserEntity result = this.service.get(this.client, "user-id");

        Assert.assertEquals(Collections.singletonList("SPACE"),
                            result.getAdminSpaces());
        Assert.assertEquals(Integer.valueOf(1), result.getSpacenum());
    }

    @Test
    public void testCurrentUserIgnoresOnlyForbiddenGraphSpaces() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(true);
        Mockito.when(this.client.findCurrentUser("user"))
               .thenReturn(user("user"));
        Mockito.when(this.graphSpace.listGraphSpace())
               .thenReturn(Arrays.asList("OWNED", "DENIED"));
        Mockito.when(this.auth.checkDefaultRole("OWNED", "analyst"))
               .thenReturn(true);
        ServerException forbidden = new ServerException("forbidden");
        forbidden.status(403);
        Mockito.when(this.graphs.listGraph()).thenThrow(forbidden);

        UserEntity result = this.service.getpersonal(this.client, "user");

        Assert.assertEquals(Collections.singletonList("OWNED"),
                            result.getResSpaces());
        Assert.assertEquals(1, result.getGraphspacePermissions().size());
    }

    @Test
    public void testLegacySpaceMemberKeepsGraphSpaceAccess() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(false);
        Mockito.when(this.client.findCurrentUser("user"))
               .thenReturn(user("user"));
        Mockito.when(this.graphSpace.listGraphSpace())
               .thenReturn(Collections.singletonList("SPACE"));
        Mockito.when(this.auth.isSpaceMember("SPACE")).thenReturn(true);

        UserEntity result = this.service.getpersonal(this.client, "user");

        Assert.assertEquals(Collections.singletonList("SPACE"),
                            result.getResSpaces());
        Assert.assertEquals("LEGACY_CUSTOM", result.getPermissionPreset());
        Mockito.verify(this.auth, Mockito.never())
               .checkDefaultRole(Mockito.anyString(), Mockito.anyString());
    }

    @Test
    public void testModernCustomRoleMemberKeepsGraphSpaceAccess() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(true);
        Mockito.when(this.client.findCurrentUser("user"))
               .thenReturn(user("user"));
        Mockito.when(this.graphSpace.listGraphSpace())
               .thenReturn(Collections.singletonList("SPACE"));
        Mockito.when(this.auth.isSpaceMember("SPACE")).thenReturn(true);

        UserEntity result = this.service.getpersonal(this.client, "user");

        Assert.assertEquals(Collections.singletonList("SPACE"),
                            result.getResSpaces());
    }

    @Test
    public void testLegacyUserDetailKeepsMembershipWithoutPreset() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(false);
        User account = user("alice");
        account.setId("user-id");
        Mockito.when(this.auth.getUser("user-id")).thenReturn(account);
        Mockito.when(this.auth.listUsers())
               .thenReturn(Collections.singletonList(account));
        Mockito.when(this.graphSpace.listGraphSpace())
               .thenReturn(Collections.singletonList("SPACE"));
        Mockito.when(this.auth.listSpaceAdmin("SPACE"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.graphSpaceUsers.hasGraphSpaceAccess(
                             this.client, "SPACE", "alice"))
               .thenReturn(true);

        UserEntity result = this.service.get(this.client, "user-id");

        Assert.assertEquals(Collections.singletonList("SPACE"),
                            result.getResSpaces());
        Assert.assertEquals(Collections.emptyList(),
                            result.getGraphspacePermissions());
        Assert.assertEquals("LEGACY_CUSTOM", result.getPermissionPreset());
        Assert.assertEquals(Collections.emptyList(), result.getAdminSpaces());
    }

    @Test
    public void testLegacyProfileUpdatePreservesPermissionAssignments() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(false);
        UserEntity user = UserEntity.builder()
                                    .id("user-id")
                                    .name("user")
                                    .nickname("display-name")
                                    .build();

        this.service.update(this.client, user);

        Mockito.verify(this.graphSpaceUsers, Mockito.never())
               .validatePermissionPresets(Mockito.any(), Mockito.any(),
                                          Mockito.any());
        Mockito.verify(this.graphSpaceUsers, Mockito.never())
               .applyPermissionPresets(Mockito.any(), Mockito.anyString(),
                                       Mockito.any(), Mockito.any());
        Mockito.verify(this.auth).updateUser(Mockito.any(User.class));
    }

    @Test
    public void testModernProfileUpdatePreservesPermissionAssignments() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(true);
        UserEntity user = UserEntity.builder()
                                    .id("user-id")
                                    .name("user")
                                    .nickname("display-name")
                                    .build();

        this.service.update(this.client, user);

        Mockito.verify(this.auth).updateUser(Mockito.any(User.class));
        Mockito.verify(this.graphSpaceUsers, Mockito.never())
               .validatePermissionPresets(Mockito.any(), Mockito.any(),
                                          Mockito.any());
        Mockito.verify(this.graphSpaceUsers, Mockito.never())
               .applyPermissionPresets(Mockito.any(), Mockito.anyString(),
                                       Mockito.any(), Mockito.any());
        Mockito.verify(this.auth, Mockito.never()).listSuperAdmin();
        Mockito.verify(this.auth, Mockito.never())
               .addSuperAdmin(Mockito.anyString());
        Mockito.verify(this.auth, Mockito.never())
               .delSuperAdmin(Mockito.anyString());
    }

    @Test
    public void testModernUserUpdateUsesPresetAsPermissionSource() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(true);
        Mockito.when(this.auth.getUser("user")).thenReturn(user("user"));
        Map<String, String> permission = new HashMap<>();
        permission.put("graphspace", "NEW");
        permission.put("permission_preset", "GS_ADMIN");
        UserEntity account = UserEntity.builder()
                                       .id("user")
                                       .name("user")
                                       .adminSpaces(
                                               Collections.singletonList("NEW"))
                                       .build();
        account.setPermissionPreset("GS_ADMIN");
        account.setGraphspacePermissions(
                Collections.singletonList(permission));

        this.service.update(this.client, account);

        Mockito.verify(this.graphSpaceUsers).validatePermissionPresets(
                this.client, account.getGraphspacePermissions(), "GS_ADMIN");
        Mockito.verify(this.graphSpaceUsers).applyPermissionPresets(
                this.client, "user", account.getGraphspacePermissions(),
                "GS_ADMIN");
        Mockito.verify(this.auth, Mockito.never())
               .addSpaceAdmin(Mockito.anyString(), Mockito.anyString());
        Mockito.verify(this.auth, Mockito.never())
               .addSuperAdmin(Mockito.anyString());
    }

    @Test
    public void testModernCombinedPasswordAndPermissionUpdateIsRejected() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(true);
        UserEntity account = UserEntity.builder()
                                       .id("user")
                                       .name("user")
                                       .password("new-password")
                                       .build();
        account.setPermissionPreset("GS_READ_ONLY");
        account.setGraphspacePermissions(Collections.singletonList(
                permission("team", "GS_READ_ONLY")));

        ParameterizedException error = null;
        try {
            this.service.update(this.client, account);
        } catch (ParameterizedException e) {
            error = e;
        }

        Assert.assertNotNull(error);
        Mockito.verify(this.auth, Mockito.never())
               .updateUser(Mockito.any(User.class));
        Mockito.verify(this.graphSpaceUsers, Mockito.never())
               .applyPermissionPresets(Mockito.any(), Mockito.anyString(),
                                       Mockito.any(), Mockito.any());
    }

    @Test
    public void testModernUserUpdateKeepsSuperAdminWhenPresetFails() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(true);
        User previous = user("alice");
        previous.setId("u-1");
        previous.description("old");
        Mockito.when(this.auth.getUser("u-1")).thenReturn(previous);
        Mockito.when(this.auth.listSuperAdmin())
               .thenReturn(Collections.singletonList("alice"))
               .thenReturn(Collections.singletonList("alice"));
        UserEntity account = UserEntity.builder()
                                       .id("u-1")
                                       .name("alice")
                                       .description("new")
                                       .build();
        account.setPermissionPreset("GS_READ_ONLY");
        account.setGraphspacePermissions(Collections.singletonList(
                permission("team", "GS_READ_ONLY")));
        RuntimeException failure = new RuntimeException("preset failed");
        Mockito.doThrow(failure).when(this.graphSpaceUsers)
               .applyPermissionPresets(
                       this.client, "alice",
                       account.getGraphspacePermissions(), "GS_READ_ONLY");

        RuntimeException error = null;
        try {
            this.service.update(this.client, account);
        } catch (RuntimeException e) {
            error = e;
        }

        Assert.assertSame(failure, error);
        Mockito.verify(this.auth, Mockito.never()).delSuperAdmin("alice");
        Mockito.verify(this.auth, Mockito.never()).addSuperAdmin("alice");
        ArgumentCaptor<User> updates = ArgumentCaptor.forClass(User.class);
        Mockito.verify(this.auth, Mockito.times(2))
               .updateUser(updates.capture());
        Assert.assertSame(previous, updates.getAllValues().get(1));
    }

    @Test
    public void testLegacyUserUpdateRejectsPermissionChangesBeforeWrites() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(false);
        Mockito.when(this.graphSpace.listGraphSpace())
               .thenReturn(Arrays.asList("OLD", "NEW"));
        Mockito.when(this.auth.listSpaceAdmin("OLD"))
               .thenReturn(Collections.singletonList("user"));
        Mockito.when(this.auth.listSpaceAdmin("NEW"))
               .thenReturn(Collections.emptyList());
        UserEntity account = UserEntity.builder()
                                       .id("user")
                                       .name("user")
                                       .adminSpaces(
                                               Collections.singletonList("NEW"))
                                       .build();

        ParameterizedException error = null;
        try {
            this.service.update(this.client, account);
        } catch (ParameterizedException e) {
            error = e;
        }

        Assert.assertNotNull(error);
        Assert.assertEquals("auth.permission-preset.unsupported",
                            error.getMessage());
        Mockito.verify(this.auth, Mockito.never())
               .addSpaceAdmin(Mockito.anyString(), Mockito.anyString());
        Mockito.verify(this.auth, Mockito.never())
               .delSpaceAdmin(Mockito.anyString(), Mockito.anyString());
        Mockito.verify(this.auth, Mockito.never())
               .updateUser(Mockito.any(User.class));
    }

    @Test
    public void testLegacyUserUpdateRejectsPresetBeforeProfileWrite() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(false);
        UserEntity account = UserEntity.builder()
                                       .id("user")
                                       .name("user")
                                       .permissionPreset("GS_READ_ONLY")
                                       .graphspacePermissions(
                                               Collections.singletonList(
                                                       permission(
                                                               "SPACE",
                                                               "GS_READ_ONLY")))
                                       .build();

        ParameterizedException error = null;
        try {
            this.service.update(this.client, account);
        } catch (ParameterizedException e) {
            error = e;
        }

        Assert.assertNotNull(error);
        Assert.assertEquals("auth.permission-preset.unsupported",
                            error.getMessage());
        Mockito.verify(this.auth, Mockito.never())
               .updateUser(Mockito.any(User.class));
    }

    @Test
    public void testPdUserListReportsPresetAndCustomRoleState() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(true);
        Mockito.when(this.auth.listUsers())
               .thenReturn(Collections.singletonList(user("alice")));
        Mockito.when(this.graphSpace.listGraphSpace())
               .thenReturn(Arrays.asList("ADMIN", "WRITE", "READ", "CUSTOM"));
        Mockito.when(this.auth.listSpaceAdmin("ADMIN"))
               .thenReturn(Collections.singletonList("alice"));
        Mockito.when(this.auth.listSpaceAdmin("WRITE"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.auth.listSpaceAdmin("READ"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.auth.listSpaceAdmin("CUSTOM"))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.graphSpace.checkDefaultRole(
                "WRITE", "alice", "analyst")).thenReturn(true);
        Mockito.when(this.graphSpace.checkDefaultRole(
                "READ", "alice", "observer")).thenReturn(true);
        Mockito.when(this.graphSpaceUsers.hasCustomRoles(
                this.client, "CUSTOM", "alice")).thenReturn(true);

        UserEntity account = this.service.listUsers(this.client).get(0);

        Assert.assertEquals(Integer.valueOf(1), account.getSpacenum());
        Assert.assertEquals(Collections.singletonList("ADMIN"),
                            account.getAdminSpaces());
        Assert.assertEquals(3, account.getGraphspacePermissions().size());
        Assert.assertEquals("GS_ADMIN",
                            account.getGraphspacePermissions().get(0)
                                   .get("permission_preset"));
        Assert.assertEquals("GS_READ_WRITE",
                            account.getGraphspacePermissions().get(1)
                                   .get("permission_preset"));
        Assert.assertEquals("GS_READ_ONLY",
                            account.getGraphspacePermissions().get(2)
                                   .get("permission_preset"));
        Assert.assertEquals("LEGACY_CUSTOM", account.getPermissionPreset());
    }

    @Test
    public void testLegacyUserCreationRejectsPermissionPreset() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(false);
        UserEntity user = userEntity("display-name");
        user.setPermissionPreset("GS_READ_ONLY");
        user.setGraphspacePermissions(java.util.Collections.singletonList(
                java.util.Collections.singletonMap(
                        "permission_preset", "GS_READ_ONLY")));

        ParameterizedException error = null;
        try {
            this.service.add(this.client, user);
        } catch (ParameterizedException e) {
            error = e;
        }

        Assert.assertNotNull(error);
        Assert.assertEquals("auth.permission-preset.unsupported",
                            error.getMessage());
        Mockito.verify(this.auth, Mockito.never())
               .createUser(Mockito.any(User.class));
        Mockito.verify(this.graphSpaceUsers, Mockito.never())
               .validatePermissionPresets(Mockito.any(), Mockito.any(),
                                          Mockito.any());
        Mockito.verify(this.graphSpaceUsers, Mockito.never())
               .applyPermissionPresets(Mockito.any(), Mockito.anyString(),
                                       Mockito.any(), Mockito.any());
    }

    @Test
    public void testModernScopedUserCreationRejectsEmptyGraphSpaces() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(true);
        ReflectionTestUtils.setField(this.service, "graphSpaceUserService",
                                     new GraphSpaceUserService());
        UserEntity user = userEntity("display-name");
        user.setPermissionPreset("GS_READ_WRITE");
        user.setGraphspacePermissions(Collections.emptyList());

        ParameterizedException error = null;
        try {
            this.service.add(this.client, user);
        } catch (ParameterizedException e) {
            error = e;
        }

        Assert.assertNotNull(error);
        Assert.assertEquals("auth.permission-preset.graphspace-required",
                            error.getMessage());
        Mockito.verify(this.auth, Mockito.never())
               .createUser(Mockito.any(User.class));
    }

    @Test
    public void testModernScopedUserCreationRollsBackFailedPreset() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(true);
        Mockito.when(this.auth.createUser(Mockito.any(User.class)))
               .thenReturn(user("created-user"));
        UserEntity user = userEntity("display-name");
        user.setPermissionPreset("GS_READ_ONLY");
        user.setGraphspacePermissions(Collections.singletonList(
                permission("team", "GS_READ_ONLY")));
        RuntimeException failure = new RuntimeException("preset failed");
        Mockito.doThrow(failure).when(this.graphSpaceUsers)
               .applyPermissionPresetsForNewAccount(
                       this.client, "user",
                       user.getGraphspacePermissions(),
                       "GS_READ_ONLY");

        RuntimeException error = null;
        try {
            this.service.add(this.client, user);
        } catch (RuntimeException e) {
            error = e;
        }

        Assert.assertNotNull(error);
        Assert.assertSame(failure, error);
        Mockito.verify(this.auth).deleteUser("created-user");
    }

    @Test
    public void testSuperAdminGrantFailureDeletesNewAccount() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(true);
        User created = user("alice");
        created.setId("u-1");
        Mockito.when(this.auth.createUser(Mockito.any(User.class)))
               .thenReturn(created);
        RuntimeException failure = new RuntimeException("grant failed");
        Mockito.when(this.auth.addSuperAdmin("user")).thenThrow(failure);
        UserEntity user = userEntity("display-name");
        user.setPermissionPreset("SUPER_ADMIN");
        user.setSuperadmin(true);

        RuntimeException error = null;
        try {
            this.service.add(this.client, user);
        } catch (RuntimeException e) {
            error = e;
        }

        Assert.assertNotNull(error);
        Assert.assertSame(failure, error);
        Mockito.verify(this.auth).addSuperAdmin("user");
        Mockito.verify(this.auth).delSuperAdmin("user");
        Mockito.verify(this.auth).deleteUser("u-1");
    }

    @Test
    public void testLegacyAdminGrantIsRejectedBeforeAccountCreation() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(false);
        UserEntity user = userEntity("display-name");
        user.setAdminSpaces(Arrays.asList("FIRST", "SECOND"));

        ParameterizedException error = null;
        try {
            this.service.add(this.client, user);
        } catch (ParameterizedException e) {
            error = e;
        }

        Assert.assertNotNull(error);
        Assert.assertEquals("auth.permission-preset.unsupported",
                            error.getMessage());
        Mockito.verify(this.auth, Mockito.never())
               .createUser(Mockito.any(User.class));
        Mockito.verify(this.auth, Mockito.never())
               .addSpaceAdmin(Mockito.anyString(), Mockito.anyString());
    }

    @Test
    public void testLegacyAdminSpaceEndpointRejectsBeforeWrites() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(false);

        ParameterizedException error = null;
        try {
            this.service.updateAdminSpace(
                    this.client, "user", Collections.singletonList("SPACE"));
        } catch (ParameterizedException e) {
            error = e;
        }

        Assert.assertNotNull(error);
        Assert.assertEquals("auth.permission-preset.unsupported",
                            error.getMessage());
        Mockito.verify(this.auth, Mockito.never())
               .addSpaceAdmin(Mockito.anyString(), Mockito.anyString());
    }

    @Test
    public void testModernUserCreationRejectsUnknownPreset() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(true);
        ReflectionTestUtils.setField(this.service, "graphSpaceUserService",
                                     new GraphSpaceUserService());
        UserEntity user = userEntity("display-name");
        user.setPermissionPreset("UNKNOWN");
        user.setGraphspacePermissions(Collections.emptyList());

        ParameterizedException error = null;
        try {
            this.service.add(this.client, user);
        } catch (ParameterizedException e) {
            error = e;
        }

        Assert.assertNotNull(error);
        Assert.assertEquals("auth.permission-preset.invalid",
                            error.getMessage());
        Mockito.verify(this.auth, Mockito.never())
               .createUser(Mockito.any(User.class));
    }

    @Test
    public void testModernUserCreationAllowsUnassignedAccount() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(true);
        UserEntity user = userEntity("display-name");

        this.service.add(this.client, user);

        Mockito.verify(this.auth).createUser(Mockito.any(User.class));
        Mockito.verify(this.graphSpaceUsers, Mockito.never())
               .applyPermissionPresetsForNewAccount(
                       Mockito.any(), Mockito.anyString(),
                       Mockito.any(), Mockito.any());
    }

    @Test
    public void testModernSuperAdminCanBeDemotedWithoutGraphSpace() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(true);
        User previous = user("alice");
        previous.setId("u-1");
        Mockito.when(this.auth.getUser("u-1")).thenReturn(previous);
        Mockito.when(this.auth.listSuperAdmin())
               .thenReturn(Collections.singletonList("alice"));
        UserEntity account = UserEntity.builder()
                                       .id("u-1")
                                       .name("alice")
                                       .build();
        account.setSuperadmin(false);
        account.setPermissionPreset("GS_READ_ONLY");
        account.setGraphspacePermissions(Collections.emptyList());

        this.service.update(this.client, account);

        Mockito.verify(this.graphSpaceUsers, Mockito.never())
               .validatePermissionPresets(Mockito.any(), Mockito.any(),
                                          Mockito.any());
        org.mockito.InOrder order = Mockito.inOrder(this.auth,
                                                    this.graphSpaceUsers);
        order.verify(this.auth).updateUser(Mockito.any(User.class));
        order.verify(this.graphSpaceUsers).applyPermissionPresets(
              this.client, "alice", Collections.emptyList(), "GS_READ_ONLY");
        order.verify(this.auth).delSuperAdmin("alice");
    }

    @Test
    public void testModernUserCreationRejectsSuperAdminMismatch() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(true);
        UserEntity superPreset = userEntity("display-name");
        superPreset.setPermissionPreset("SUPER_ADMIN");

        ParameterizedException missingFlag = null;
        try {
            this.service.add(this.client, superPreset);
        } catch (ParameterizedException e) {
            missingFlag = e;
        }
        Assert.assertNotNull(missingFlag);
        Assert.assertEquals("auth.permission-preset.superadmin-mismatch",
                            missingFlag.getMessage());

        UserEntity scopedPreset = userEntity("display-name");
        scopedPreset.setPermissionPreset("GS_READ_ONLY");
        scopedPreset.setSuperadmin(true);
        ParameterizedException extraFlag = null;
        try {
            this.service.add(this.client, scopedPreset);
        } catch (ParameterizedException e) {
            extraFlag = e;
        }
        Assert.assertNotNull(extraFlag);
        Assert.assertEquals("auth.permission-preset.superadmin-mismatch",
                            extraFlag.getMessage());
        Mockito.verify(this.auth, Mockito.never())
               .createUser(Mockito.any(User.class));
    }

    private static UserEntity userEntity(String nickname) {
        return UserEntity.builder()
                         .name("user")
                         .nickname(nickname)
                         .password("password")
                         .build();
    }

    private static User user(String name) {
        User user = new User();
        user.setId(name);
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
