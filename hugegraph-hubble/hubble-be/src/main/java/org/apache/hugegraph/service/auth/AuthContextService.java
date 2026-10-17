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

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.auth.UserEntity;
import org.apache.hugegraph.exception.ForbiddenException;
import org.apache.hugegraph.exception.InternalException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.op.OperationsCapabilityService;
import org.apache.hugegraph.service.space.GraphSpaceService;

@Service
public class AuthContextService {

    public static final String SUPERADMIN = "SUPERADMIN";
    public static final String SPACEADMIN = "SPACEADMIN";
    public static final String USER = "USER";

    public static final String ACCOUNT_SELF_MANAGE = "account_self_manage";
    public static final String ACCOUNTS_MANAGE = "accounts_manage";
    public static final String MODEL_SETTINGS_MANAGE = "model_settings_manage";
    public static final String ACCOUNT_PERMISSION_PRESETS =
                               "account_permission_presets";
    public static final String GRAPHSPACES_READ = "graphspaces_read";
    public static final String GRAPHSPACES_MANAGE = "graphspaces_manage";
    public static final String GRAPHSPACE_MEMBERS_MANAGE =
                               "graphspace_members_manage";
    public static final String GRAPHSPACE_ROLES_MANAGE =
                               "graphspace_roles_manage";
    public static final String GRAPHSPACE_AUTHORIZATIONS_MANAGE =
                               "graphspace_authorizations_manage";
    public static final String GRAPH_RESOURCES_ACCESS =
                               "graph_resources_access";

    private static final int SCHEMA_VERSION = 1;
    private static final char[] HEX = "0123456789abcdef".toCharArray();
    private static final Set<String> SELF_ACTIONS = set(
            "read", "update", "change_password");
    private static final Set<String> LEGACY_SELF_ACTIONS = set(
            "read", "change_password");
    private static final Set<String> CRUD_ACTIONS = set(
            "read", "create", "update", "delete");
    private static final Set<String> MEMBER_ACTIONS = set(
            "read", "add", "remove");
    private static final Set<String> AUTHORIZATION_ACTIONS = set(
            "read", "grant", "revoke");
    private static final Set<String> OPERATIONS_ACTIONS = set(
            "read_health", "read_topology", "read_metrics");
    private static final Set<String> GRAPH_RESOURCE_ACTIONS = set(
            "use_authorized");

    private final HugeConfig config;
    private final UserService users;
    private final AuthModeService authMode;
    private final GraphSpaceService graphSpaces;

    @Autowired
    public AuthContextService(HugeConfig config, UserService users,
                              AuthModeService authMode,
                              GraphSpaceService graphSpaces) {
        this.config = config;
        this.users = users;
        this.authMode = authMode;
        this.graphSpaces = graphSpaces;
    }

    public Map<String, Object> context(HugeClient client, String username) {
        if (this.authMode.anonymous()) {
            return anonymousContext(this.config.get(HubbleOptions.PD_ENABLED));
        }
        boolean pdEnabled = this.config.get(HubbleOptions.PD_ENABLED);
        String mode = pdEnabled ? "PD" : "NON_PD";
        String role;
        UserEntity user = null;
        List<String> adminGraphSpaces = Collections.emptyList();
        if (pdEnabled) {
            user = this.users.getpersonal(client, username);
            adminGraphSpaces = sorted(user.getAdminSpaces());
            if (user.isSuperadmin()) {
                role = SUPERADMIN;
            } else if (!adminGraphSpaces.isEmpty()) {
                role = SPACEADMIN;
            } else {
                role = USER;
            }
        } else {
            String serverRole = this.users.userLevel(client, username);
            role = "ADMIN".equals(serverRole) ? SUPERADMIN : USER;
        }

        boolean permissionPresets = pdEnabled &&
                                    client.supportsDefaultRole();
        boolean profileUpdate =
                client.supportsPersonalProfileUpdate();
        List<String> writeGraphSpaces = pdEnabled ?
                                        writeGraphSpaces(
                                                user, permissionPresets,
                                                this.graphSpaces
                                                    .listAnonymous(client)) :
                                        Collections.emptyList();
        Set<String> capabilities = this.capabilities(pdEnabled, role,
                                                     permissionPresets);
        Map<String, Set<String>> actions = this.actions(pdEnabled, role,
                                                       permissionPresets,
                                                       profileUpdate);
        Map<String, Object> scopes = this.scopes(pdEnabled, role,
                                                 adminGraphSpaces,
                                                 writeGraphSpaces);
        String version = version(mode, username, role, capabilities,
                                 actions, scopes);

        Map<String, Object> context = new LinkedHashMap<>();
        context.put("schema_version", SCHEMA_VERSION);
        context.put("context_version", version);
        context.put("mode", mode);
        context.put("username", username);
        context.put("role", role);
        context.put("capabilities", capabilities);
        context.put("actions", actions);
        context.put("scopes", scopes);
        return Collections.unmodifiableMap(context);
    }

    public void requireModelSettingsManager(HugeClient client, String username) {
        if (!this.authMode.anonymous() && (username == null || username.isBlank())) {
            throw new ForbiddenException("Permission denied: manage model settings");
        }
        Set<?> capabilities = (Set<?>) this.context(client, username).get("capabilities");
        if (!capabilities.contains(MODEL_SETTINGS_MANAGE)) {
            throw new ForbiddenException("Permission denied: manage model settings");
        }
    }

    public void requireGraphSpaceWrite(HugeClient client, String username,
                                       String graphSpace) {
        if (this.authMode.anonymous() ||
            !this.config.get(HubbleOptions.PD_ENABLED) ||
            !client.supportsDefaultRole()) {
            return;
        }
        if (!this.graphSpaces.isAuth(client, graphSpace)) {
            return;
        }

        UserEntity user = this.users.getpersonal(client, username);
        if (user.isSuperadmin() ||
            contains(user.getAdminSpaces(), graphSpace) ||
            writeGraphSpaces(user, true,
                             Collections.emptyList()).contains(graphSpace)) {
            return;
        }
        throw new ForbiddenException(
                "Permission denied: write graphspace resources");
    }

    private static Map<String, Object> anonymousContext(boolean pdEnabled) {
        Set<String> capabilities = new LinkedHashSet<>();
        capabilities.add(GRAPH_RESOURCES_ACCESS);
        capabilities.add(MODEL_SETTINGS_MANAGE);
        if (pdEnabled) {
            capabilities.add(GRAPHSPACES_READ);
        }
        capabilities.addAll(OperationsCapabilityService.forLevel("ADMIN"));

        Map<String, Object> context = new LinkedHashMap<>();
        context.put("schema_version", SCHEMA_VERSION);
        context.put("context_version",
                    pdEnabled ? "anonymous-v3-pd" : "anonymous-v3-non-pd");
        context.put("mode", "NON_AUTH");
        context.put("username", null);
        context.put("role", "ANONYMOUS");
        Map<String, Set<String>> actions = new LinkedHashMap<>();
        actions.put("graphspaces", pdEnabled ?
                   Collections.singleton("read") : Collections.emptySet());
        actions.put("operations", OPERATIONS_ACTIONS);
        context.put("capabilities",
                    Collections.unmodifiableSet(capabilities));
        context.put("actions", actions);
        Map<String, Object> scopes = new LinkedHashMap<>();
        scopes.put("all_graphspaces", pdEnabled);
        scopes.put("admin_graphspaces", Collections.emptyList());
        scopes.put("write_graphspaces", Collections.emptyList());
        scopes.put("graph_resources", "SERVER_ANONYMOUS");
        context.put("scopes", scopes);
        return Collections.unmodifiableMap(context);
    }

    private Set<String> capabilities(boolean pdEnabled, String role,
                                     boolean permissionPresets) {
        Set<String> capabilities = new LinkedHashSet<>();
        capabilities.add(ACCOUNT_SELF_MANAGE);
        capabilities.add(GRAPH_RESOURCES_ACCESS);
        if (pdEnabled) {
            capabilities.add(GRAPHSPACES_READ);
        }
        if (permissionPresets) {
            capabilities.add(ACCOUNT_PERMISSION_PRESETS);
        }
        if (SUPERADMIN.equals(role)) {
            capabilities.add(ACCOUNTS_MANAGE);
            capabilities.add(MODEL_SETTINGS_MANAGE);
            if (pdEnabled) {
                capabilities.add(GRAPHSPACES_MANAGE);
            }
        }
        if (pdEnabled && permissionPresets &&
            (SUPERADMIN.equals(role) || SPACEADMIN.equals(role))) {
            capabilities.add(GRAPHSPACE_MEMBERS_MANAGE);
        }
        if (pdEnabled && SUPERADMIN.equals(role)) {
            capabilities.add(GRAPHSPACE_ROLES_MANAGE);
            capabilities.add(GRAPHSPACE_AUTHORIZATIONS_MANAGE);
        }
        if (SUPERADMIN.equals(role)) {
            capabilities.addAll(OperationsCapabilityService.forLevel("ADMIN"));
        }
        return Collections.unmodifiableSet(capabilities);
    }

    private Map<String, Set<String>> actions(boolean pdEnabled, String role,
                                             boolean permissionPresets,
                                             boolean profileUpdate) {
        Map<String, Set<String>> actions = new LinkedHashMap<>();
        boolean superAdmin = SUPERADMIN.equals(role);
        boolean spaceManager = pdEnabled && permissionPresets &&
                               (superAdmin || SPACEADMIN.equals(role));
        actions.put("account", profileUpdate ?
                               SELF_ACTIONS : LEGACY_SELF_ACTIONS);
        actions.put("accounts", superAdmin ? CRUD_ACTIONS : emptySet());
        actions.put("graphspaces", pdEnabled ?
                   (superAdmin ? CRUD_ACTIONS : set("read")) : emptySet());
        actions.put("members", spaceManager ? MEMBER_ACTIONS : emptySet());
        actions.put("roles", permissionPresets && superAdmin ?
                   CRUD_ACTIONS : emptySet());
        actions.put("authorizations", permissionPresets && superAdmin ?
                   AUTHORIZATION_ACTIONS : emptySet());
        actions.put("operations", superAdmin ?
                   OPERATIONS_ACTIONS : emptySet());
        actions.put("graph_resources", GRAPH_RESOURCE_ACTIONS);
        return Collections.unmodifiableMap(actions);
    }

    private Map<String, Object> scopes(boolean pdEnabled, String role,
                                       List<String> adminGraphSpaces,
                                       List<String> writeGraphSpaces) {
        Map<String, Object> scopes = new LinkedHashMap<>();
        scopes.put("all_graphspaces",
                   pdEnabled && SUPERADMIN.equals(role));
        scopes.put("admin_graphspaces", adminGraphSpaces);
        scopes.put("write_graphspaces", writeGraphSpaces);
        scopes.put("graph_resources", "SERVER_AUTHORIZED");
        return Collections.unmodifiableMap(scopes);
    }

    private static List<String> writeGraphSpaces(UserEntity user,
                                                 boolean permissionPresets,
                                                 Collection<String> publicSpaces) {
        if (user.isSuperadmin()) {
            return Collections.emptyList();
        }

        Set<String> values = new TreeSet<>();
        if (publicSpaces != null) {
            values.addAll(publicSpaces);
        }
        if (!permissionPresets) {
            if (user.getResSpaces() != null) {
                values.addAll(user.getResSpaces());
            }
            return Collections.unmodifiableList(new ArrayList<>(values));
        }
        if (user.getGraphspacePermissions() != null) {
            for (Map<String, String> permission :
                 user.getGraphspacePermissions()) {
                String preset = permission.get("permission_preset");
                if ("GS_READ_WRITE".equals(preset) ||
                    "GS_ADMIN".equals(preset)) {
                    String graphSpace = permission.get("graphspace");
                    if (graphSpace != null) {
                        values.add(graphSpace);
                    }
                }
            }
        }
        if (user.getAdminSpaces() != null) {
            for (String graphSpace : user.getAdminSpaces()) {
                if (graphSpace != null) {
                    values.add(graphSpace);
                }
            }
        }
        return Collections.unmodifiableList(new ArrayList<>(values));
    }

    private static List<String> sorted(Collection<String> values) {
        if (values == null || values.isEmpty()) {
            return Collections.emptyList();
        }
        return Collections.unmodifiableList(new ArrayList<>(
               new TreeSet<>(values)));
    }

    private static boolean contains(Collection<String> values, String value) {
        return values != null && values.contains(value);
    }

    private static Set<String> set(String... values) {
        return Collections.unmodifiableSet(new LinkedHashSet<>(
               Arrays.asList(values)));
    }

    private static Set<String> emptySet() {
        return Collections.emptySet();
    }

    private static String version(String mode, String username, String role,
                                  Set<String> capabilities,
                                  Map<String, Set<String>> actions,
                                  Map<String, Object> scopes) {
        String fingerprint = mode + '|' + username + '|' + role + '|' +
                             capabilities + '|' + actions + '|' + scopes;
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(
                          fingerprint.getBytes(StandardCharsets.UTF_8));
            char[] result = new char[16];
            for (int i = 0; i < 8; i++) {
                result[i * 2] = HEX[(hash[i] >>> 4) & 0x0f];
                result[i * 2 + 1] = HEX[hash[i] & 0x0f];
            }
            return new String(result);
        } catch (NoSuchAlgorithmException e) {
            throw new InternalException("SHA-256 is unavailable", e);
        }
    }
}
