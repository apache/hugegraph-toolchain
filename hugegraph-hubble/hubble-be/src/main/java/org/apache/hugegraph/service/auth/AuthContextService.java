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
import org.apache.hugegraph.exception.InternalException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.op.OperationsCapabilityService;

@Service
public class AuthContextService {

    public static final String SUPERADMIN = "SUPERADMIN";
    public static final String SPACEADMIN = "SPACEADMIN";
    public static final String USER = "USER";

    public static final String ACCOUNT_SELF_MANAGE = "account_self_manage";
    public static final String ACCOUNTS_MANAGE = "accounts_manage";
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

    @Autowired
    public AuthContextService(HugeConfig config, UserService users) {
        this.config = config;
        this.users = users;
    }

    public Map<String, Object> context(HugeClient client, String username) {
        boolean pdEnabled = this.config.get(HubbleOptions.PD_ENABLED);
        String mode = pdEnabled ? "PD" : "NON_PD";
        String role;
        List<String> adminGraphSpaces = Collections.emptyList();
        if (pdEnabled) {
            UserEntity user = this.users.getpersonal(client, username);
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

        Set<String> capabilities = this.capabilities(pdEnabled, role);
        Map<String, Set<String>> actions = this.actions(pdEnabled, role);
        Map<String, Object> scopes = this.scopes(pdEnabled, role,
                                                 adminGraphSpaces);
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

    private Set<String> capabilities(boolean pdEnabled, String role) {
        Set<String> capabilities = new LinkedHashSet<>();
        capabilities.add(ACCOUNT_SELF_MANAGE);
        capabilities.add(GRAPH_RESOURCES_ACCESS);
        if (pdEnabled) {
            capabilities.add(GRAPHSPACES_READ);
        }
        if (SUPERADMIN.equals(role)) {
            capabilities.add(ACCOUNTS_MANAGE);
            if (pdEnabled) {
                capabilities.add(GRAPHSPACES_MANAGE);
            }
        }
        if (pdEnabled && (SUPERADMIN.equals(role) ||
                          SPACEADMIN.equals(role))) {
            capabilities.add(GRAPHSPACE_MEMBERS_MANAGE);
            capabilities.add(GRAPHSPACE_ROLES_MANAGE);
            capabilities.add(GRAPHSPACE_AUTHORIZATIONS_MANAGE);
        }
        if (SUPERADMIN.equals(role)) {
            capabilities.addAll(OperationsCapabilityService.forLevel("ADMIN"));
        }
        return Collections.unmodifiableSet(capabilities);
    }

    private Map<String, Set<String>> actions(boolean pdEnabled, String role) {
        Map<String, Set<String>> actions = new LinkedHashMap<>();
        boolean superAdmin = SUPERADMIN.equals(role);
        boolean spaceManager = pdEnabled &&
                               (superAdmin || SPACEADMIN.equals(role));
        actions.put("account", SELF_ACTIONS);
        actions.put("accounts", superAdmin ? CRUD_ACTIONS : emptySet());
        actions.put("graphspaces", pdEnabled ?
                   (superAdmin ? CRUD_ACTIONS : set("read")) : emptySet());
        actions.put("members", spaceManager ? MEMBER_ACTIONS : emptySet());
        actions.put("roles", spaceManager ? CRUD_ACTIONS : emptySet());
        actions.put("authorizations", spaceManager ?
                   AUTHORIZATION_ACTIONS : emptySet());
        actions.put("operations", superAdmin ?
                   OPERATIONS_ACTIONS : emptySet());
        actions.put("graph_resources", GRAPH_RESOURCE_ACTIONS);
        return Collections.unmodifiableMap(actions);
    }

    private Map<String, Object> scopes(boolean pdEnabled, String role,
                                       List<String> adminGraphSpaces) {
        Map<String, Object> scopes = new LinkedHashMap<>();
        scopes.put("all_graphspaces",
                   pdEnabled && SUPERADMIN.equals(role));
        scopes.put("admin_graphspaces", adminGraphSpaces);
        scopes.put("graph_resources", "SERVER_AUTHORIZED");
        return Collections.unmodifiableMap(scopes);
    }

    private static List<String> sorted(Collection<String> values) {
        if (values == null || values.isEmpty()) {
            return Collections.emptyList();
        }
        return Collections.unmodifiableList(new ArrayList<>(
               new TreeSet<>(values)));
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
