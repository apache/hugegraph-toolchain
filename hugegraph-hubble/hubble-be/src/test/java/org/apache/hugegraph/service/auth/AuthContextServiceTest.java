/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

package org.apache.hugegraph.service.auth;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.Test;
import org.mockito.Mockito;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.auth.UserEntity;
import org.apache.hugegraph.exception.ForbiddenException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.space.GraphSpaceService;
import org.apache.hugegraph.testutil.Assert;

public class AuthContextServiceTest {

    @Test
    public void testPdSuperAdminGetsGlobalActionsAndOperations() throws Exception {
        Fixture fixture = new Fixture(true);
        UserEntity user = user(true, Arrays.asList("space-b", "space-a"));
        user.setPassword("password-canary");
        Mockito.when(fixture.client.supportsDefaultRole()).thenReturn(true);
        Mockito.when(fixture.users.getpersonal(fixture.client, "alice"))
               .thenReturn(user);

        Map<String, Object> context = fixture.service.context(fixture.client,
                                                              "alice");

        Assert.assertEquals(1, context.get("schema_version"));
        Assert.assertEquals("PD", context.get("mode"));
        Assert.assertEquals("SUPERADMIN", context.get("role"));
        Assert.assertEquals("alice", context.get("username"));
        Assert.assertTrue(capabilities(context).contains("accounts_manage"));
        Assert.assertTrue(capabilities(context).contains(
                          "account_permission_presets"));
        Assert.assertTrue(capabilities(context).contains("graphspaces_manage"));
        Assert.assertTrue(capabilities(context).contains(
                          "operations_metrics_read"));
        Assert.assertTrue(actions(context, "accounts").contains("delete"));
        Assert.assertTrue((Boolean) scopes(context).get("all_graphspaces"));
        Assert.assertTrue(((String) context.get("context_version"))
                          .matches("[0-9a-f]{16}"));

        String json = new ObjectMapper().writeValueAsString(context);
        Assert.assertFalse(json.contains("password-canary"));
        Assert.assertFalse(json.contains("\"password\":"));
        Assert.assertFalse(json.contains("\"token\":"));
        Assert.assertFalse(json.contains("\"authorization\":"));
        Assert.assertFalse(json.contains("\"cookie\":"));
    }

    @Test
    public void testPdSpaceAdminOnlyGetsScopedManagementActions() {
        Fixture fixture = new Fixture(true);
        Mockito.when(fixture.client.supportsDefaultRole()).thenReturn(true);
        Mockito.when(fixture.users.getpersonal(fixture.client, "alice"))
               .thenReturn(user(false,
                                Arrays.asList("space-b", "space-a", "space-a")));

        Map<String, Object> context = fixture.service.context(fixture.client,
                                                              "alice");

        Assert.assertEquals("SPACEADMIN", context.get("role"));
        Assert.assertFalse(capabilities(context).contains("accounts_manage"));
        Assert.assertFalse(capabilities(context).contains(
                           "operations_health_read"));
        Assert.assertTrue(capabilities(context).contains(
                          "graphspace_members_manage"));
        Assert.assertTrue(actions(context, "members").contains("add"));
        Assert.assertTrue(actions(context, "roles").isEmpty());
        Assert.assertTrue(actions(context, "authorizations").isEmpty());
        Assert.assertFalse(capabilities(context).contains("graphspace_roles_manage"));
        Assert.assertFalse(capabilities(context).contains("graphspace_authorizations_manage"));
        Assert.assertEquals(Arrays.asList("space-a", "space-b"),
                            scopes(context).get("admin_graphspaces"));
        Assert.assertEquals(Arrays.asList("space-a", "space-b"),
                            scopes(context).get("write_graphspaces"));
        Assert.assertFalse((Boolean) scopes(context).get("all_graphspaces"));
    }

    @Test
    public void testPdServerWithoutPresetApiHidesScopedMutations() {
        Fixture fixture = new Fixture(true);
        Mockito.when(fixture.client.supportsDefaultRole()).thenReturn(false);
        Mockito.when(fixture.client.supportsPersonalProfileUpdate())
               .thenReturn(false);
        Mockito.when(fixture.users.getpersonal(fixture.client, "alice"))
               .thenReturn(user(true, Collections.singletonList("space-a")));

        Map<String, Object> context = fixture.service.context(fixture.client,
                                                              "alice");

        Assert.assertFalse(capabilities(context).contains(
                           "account_permission_presets"));
        Assert.assertFalse(capabilities(context).contains(
                           "graphspace_members_manage"));
        Assert.assertTrue(actions(context, "members").isEmpty());
        Assert.assertTrue(actions(context, "roles").isEmpty());
        Assert.assertTrue(actions(context, "authorizations").isEmpty());
        Assert.assertEquals(Set.of("read", "change_password"),
                            actions(context, "account"));
    }

    @Test
    public void testPdUserOnlyGetsSelfActions() {
        Fixture fixture = new Fixture(true);
        UserEntity user = user(false, Collections.emptyList());
        user.setGraphspacePermissions(Arrays.asList(
                permission("space-c", "GS_READ_ONLY"),
                permission("space-b", "GS_READ_WRITE"),
                permission("space-a", "GS_READ_WRITE")));
        Mockito.when(fixture.client.supportsDefaultRole()).thenReturn(true);
        Mockito.when(fixture.users.getpersonal(fixture.client, "alice"))
               .thenReturn(user);

        Map<String, Object> context = fixture.service.context(fixture.client,
                                                              "alice");

        Assert.assertEquals("USER", context.get("role"));
        Assert.assertEquals(Set.of("account_self_manage",
                                   "graph_resources_access",
                                   "graphspaces_read",
                                   "account_permission_presets"),
                            capabilities(context));
        Assert.assertEquals(Set.of("read", "update", "change_password"),
                            actions(context, "account"));
        Assert.assertTrue(actions(context, "accounts").isEmpty());
        Assert.assertTrue(actions(context, "members").isEmpty());
        Assert.assertEquals(Arrays.asList("space-a", "space-b"),
                            scopes(context).get("write_graphspaces"));
    }

    @Test
    public void testPdReadOnlyUserGetsNoWriteScope() {
        Fixture fixture = new Fixture(true);
        UserEntity user = user(false, Collections.emptyList());
        user.setGraphspacePermissions(Collections.singletonList(
                permission("space-a", "GS_READ_ONLY")));
        Mockito.when(fixture.client.supportsDefaultRole()).thenReturn(true);
        Mockito.when(fixture.users.getpersonal(fixture.client, "alice"))
               .thenReturn(user);

        Map<String, Object> context = fixture.service.context(fixture.client,
                                                              "alice");

        Assert.assertEquals(Collections.emptyList(),
                            scopes(context).get("write_graphspaces"));
    }

    @Test
    public void testPdReadOnlyUserCannotWriteGraphSpaceResources() {
        Fixture fixture = new Fixture(true);
        UserEntity user = user(false, Collections.emptyList());
        user.setGraphspacePermissions(Collections.singletonList(
                permission("space-a", "GS_READ_ONLY")));
        Mockito.when(fixture.client.supportsDefaultRole()).thenReturn(true);
        Mockito.when(fixture.users.getpersonal(fixture.client, "alice"))
               .thenReturn(user);

        Assert.assertThrows(
                ForbiddenException.class,
                () -> fixture.service.requireGraphSpaceWrite(
                      fixture.client, "alice", "space-a"));
    }

    @Test
    public void testPdUserRetainsWriteAccessToPublicGraphSpace() {
        Fixture fixture = new Fixture(true);
        UserEntity user = user(false, Collections.emptyList());
        Mockito.when(fixture.client.supportsDefaultRole()).thenReturn(true);
        Mockito.when(fixture.users.getpersonal(fixture.client, "alice"))
               .thenReturn(user);
        Mockito.when(fixture.graphSpaces.listAnonymous(fixture.client))
               .thenReturn(Collections.singletonList("public"));
        Mockito.when(fixture.graphSpaces.isAuth(fixture.client, "public"))
               .thenReturn(false);

        Map<String, Object> context = fixture.service.context(fixture.client,
                                                              "alice");

        Assert.assertEquals(Collections.singletonList("public"),
                            scopes(context).get("write_graphspaces"));
        fixture.service.requireGraphSpaceWrite(fixture.client, "alice",
                                               "public");
    }

    @Test
    public void testPdReadWriteUserCanWriteGraphSpaceResources() {
        Fixture fixture = new Fixture(true);
        UserEntity user = user(false, Collections.emptyList());
        user.setGraphspacePermissions(Collections.singletonList(
                permission("space-a", "GS_READ_WRITE")));
        Mockito.when(fixture.client.supportsDefaultRole()).thenReturn(true);
        Mockito.when(fixture.users.getpersonal(fixture.client, "alice"))
               .thenReturn(user);

        fixture.service.requireGraphSpaceWrite(fixture.client, "alice",
                                               "space-a");
    }

    @Test
    public void testLegacyPdDefersGraphSpaceWritesToServerAuthorization() {
        Fixture fixture = new Fixture(true);
        Mockito.when(fixture.client.supportsDefaultRole()).thenReturn(false);

        fixture.service.requireGraphSpaceWrite(fixture.client, "alice",
                                               "space-a");

        Mockito.verify(fixture.users, Mockito.never())
               .getpersonal(Mockito.any(), Mockito.anyString());
    }

    @Test
    public void testLegacyPdAnalystKeepsWriteScope() {
        Fixture fixture = new Fixture(true);
        UserEntity user = user(false, Collections.emptyList());
        user.setResSpaces(Arrays.asList("space-b", "space-a"));
        Mockito.when(fixture.client.supportsDefaultRole()).thenReturn(false);
        Mockito.when(fixture.users.getpersonal(fixture.client, "alice"))
               .thenReturn(user);

        Map<String, Object> context = fixture.service.context(fixture.client,
                                                              "alice");

        Assert.assertEquals(Arrays.asList("space-a", "space-b"),
                            scopes(context).get("write_graphspaces"));
    }

    @Test
    public void testNonPdAdminMapsToCanonicalSuperAdminWithoutPdActions() {
        Fixture fixture = new Fixture(false);
        Mockito.when(fixture.users.userLevel(fixture.client, "admin"))
               .thenReturn("ADMIN");

        Map<String, Object> context = fixture.service.context(fixture.client,
                                                              "admin");

        Assert.assertEquals("NON_PD", context.get("mode"));
        Assert.assertEquals("SUPERADMIN", context.get("role"));
        Assert.assertTrue(capabilities(context).contains("accounts_manage"));
        Assert.assertTrue(capabilities(context).contains(
                          "operations_topology_read"));
        Assert.assertFalse(capabilities(context).contains(
                           "graphspaces_manage"));
        Assert.assertTrue(actions(context, "graphspaces").isEmpty());
        Assert.assertFalse((Boolean) scopes(context).get("all_graphspaces"));
        Mockito.verify(fixture.users, Mockito.never())
               .getpersonal(Mockito.any(), Mockito.anyString());
    }

    @Test
    public void testAnonymousModeGetsReadOnlyOperationsCapabilities() {
        Fixture fixture = new Fixture(true);
        Mockito.when(fixture.authMode.anonymous()).thenReturn(true);

        Map<String, Object> context = fixture.service.context(fixture.client,
                                                              null);

        Assert.assertEquals("NON_AUTH", context.get("mode"));
        Assert.assertEquals("ANONYMOUS", context.get("role"));
        Assert.assertEquals("anonymous-v2-pd",
                            context.get("context_version"));
        Assert.assertTrue(capabilities(context).contains(
                          "operations_health_read"));
        Assert.assertTrue(capabilities(context).contains(
                          "operations_topology_read"));
        Assert.assertTrue(capabilities(context).contains(
                          "operations_metrics_read"));
        Assert.assertEquals(Set.of("read_health", "read_topology",
                                   "read_metrics"),
                            actions(context, "operations"));
        Mockito.verifyNoMoreInteractions(fixture.users);
    }

    @Test
    public void testContextVersionIsStableButChangesWithScope() {
        Fixture fixture = new Fixture(true);
        Mockito.when(fixture.users.getpersonal(fixture.client, "alice"))
               .thenReturn(user(false, Arrays.asList("space-b", "space-a")));
        String first = (String) fixture.service.context(fixture.client, "alice")
                                               .get("context_version");
        Mockito.when(fixture.users.getpersonal(fixture.client, "alice"))
               .thenReturn(user(false, Arrays.asList("space-a", "space-b")));
        String reordered = (String) fixture.service.context(fixture.client,
                                                            "alice")
                                                   .get("context_version");
        Mockito.when(fixture.users.getpersonal(fixture.client, "alice"))
               .thenReturn(user(false, Collections.singletonList("space-a")));
        String downgraded = (String) fixture.service.context(fixture.client,
                                                             "alice")
                                                    .get("context_version");

        Assert.assertEquals(first, reordered);
        Assert.assertNotEquals(first, downgraded);
    }

    private static UserEntity user(boolean superadmin,
                                   List<String> adminSpaces) {
        UserEntity user = new UserEntity();
        user.setName("alice");
        user.setSuperadmin(superadmin);
        user.setAdminSpaces(adminSpaces);
        user.setResSpaces(new ArrayList<>());
        return user;
    }

    private static Map<String, String> permission(String graphspace,
                                                   String preset) {
        Map<String, String> permission = new HashMap<>();
        permission.put("graphspace", graphspace);
        permission.put("permission_preset", preset);
        return permission;
    }

    @SuppressWarnings("unchecked")
    private static Set<String> capabilities(Map<String, Object> context) {
        return (Set<String>) context.get("capabilities");
    }

    @SuppressWarnings("unchecked")
    private static Set<String> actions(Map<String, Object> context,
                                       String resource) {
        Map<String, Set<String>> actions =
                (Map<String, Set<String>>) context.get("actions");
        return actions.get(resource);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> scopes(Map<String, Object> context) {
        return (Map<String, Object>) context.get("scopes");
    }

    private static class Fixture {

        private final HugeClient client = Mockito.mock(HugeClient.class);
        private final HugeConfig config = Mockito.mock(HugeConfig.class);
        private final UserService users = Mockito.mock(UserService.class);
        private final AuthModeService authMode =
                Mockito.mock(AuthModeService.class);
        private final GraphSpaceService graphSpaces =
                Mockito.mock(GraphSpaceService.class);
        private final AuthContextService service;

        private Fixture(boolean pdEnabled) {
            Mockito.when(this.config.get(HubbleOptions.PD_ENABLED))
                   .thenReturn(pdEnabled);
            Mockito.when(this.client.supportsPersonalProfileUpdate())
                   .thenReturn(true);
            Mockito.when(this.graphSpaces.listAnonymous(this.client))
                   .thenReturn(Collections.emptyList());
            Mockito.when(this.graphSpaces.isAuth(
                         Mockito.eq(this.client), Mockito.anyString()))
                   .thenReturn(true);
            this.service = new AuthContextService(this.config, this.users,
                                                  this.authMode,
                                                  this.graphSpaces);
        }
    }
}
