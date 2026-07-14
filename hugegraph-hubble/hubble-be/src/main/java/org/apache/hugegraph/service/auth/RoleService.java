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

package org.apache.hugegraph.service.auth;

import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.nio.charset.StandardCharsets;

import com.baomidou.mybatisplus.core.metadata.IPage;
import lombok.extern.log4j.Log4j2;
import org.apache.hugegraph.driver.AuthManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.exception.ForbiddenException;
import org.apache.hugegraph.exception.ParameterizedException;
import org.apache.hugegraph.structure.auth.Access;
import org.apache.hugegraph.structure.auth.Belong;
import org.apache.hugegraph.structure.auth.Group;
import org.apache.hugegraph.structure.auth.HugePermission;
import org.apache.hugegraph.structure.auth.Role;
import org.apache.hugegraph.util.PageUtil;
import org.springframework.stereotype.Service;

@Log4j2
@Service
public class RoleService extends AuthService {

    private static final String SCOPED_PREFIX = "~hubble_role:v1:";
    private static final String METADATA_PREFIX = "~hubble_role_meta:v1:";
    private static final Base64.Encoder ENCODER =
            Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DECODER = Base64.getUrlDecoder();

    public Role get(HugeClient client, String roleId) {
        AuthManager auth = client.auth();
        Group group = auth.getGroup(roleId);
        if (group == null) {
            throw new ExternalException("auth.role.get.not-exist", roleId);
        }
        return toRole(null, group);
    }

    public Role get(HugeClient client, String graphSpace, String roleId) {
        return this.get(client, graphSpace, roleId, false);
    }

    public Role get(HugeClient client, String graphSpace, String roleId,
                    boolean includeLegacy) {
        Group group = requireGroup(client.auth(), graphSpace, roleId,
                                   includeLegacy);
        return toRole(scopeOf(group), group);
    }

    public List<Role> list(HugeClient client) {
        List<Role> roles = new ArrayList<>();
        client.auth().listGroups().forEach(group -> {
            roles.add(toRole(null, group));
        });
        return roles;
    }

    public List<Role> list(HugeClient client, String graphSpace) {
        return this.list(client, graphSpace, false);
    }

    public List<Role> list(HugeClient client, String graphSpace,
                           boolean includeLegacy) {
        List<Role> roles = new ArrayList<>();
        client.auth().listGraphSpaceGroups().forEach(group -> {
            String scope = scopeOf(group);
            if (graphSpace.equals(scope)) {
                roles.add(toRole(scope, group));
            }
        });
        if (includeLegacy) {
            client.auth().listGroups().forEach(group -> {
                if (scopeOf(group) == null && isVisibleLegacy(group)) {
                    roles.add(toRole(null, group));
                }
            });
        }
        return roles;
    }

    public IPage<Role> queryPage(HugeClient client, String query,
                                 int pageNo, int pageSize) {
        return this.queryPage(client, null, query, pageNo, pageSize);
    }

    public IPage<Role> queryPage(HugeClient client, String graphSpace,
                                 String query, int pageNo, int pageSize) {
        return this.queryPage(client, graphSpace, query, pageNo, pageSize,
                              false);
    }

    public IPage<Role> queryPage(HugeClient client, String graphSpace,
                                 String query, int pageNo, int pageSize,
                                 boolean includeLegacy) {
        ArrayList<Role> results = new ArrayList<>();
        this.list(client, graphSpace, includeLegacy).stream()
              .filter(role -> role.nickname() != null &&
                              role.nickname().contains(query))
              .forEach(results::add);
        return PageUtil.page(results, pageNo, pageSize);
    }

    public Role update(HugeClient client, Role role) {
        AuthManager auth = client.auth();
        Group group = auth.getGroup(role.id());
        if (group == null) {
            throw new ExternalException("auth.role.not-exist", role.id(),
                                        role.name());
        }
        group.name(firstNonNull(role.name(), role.nickname(), group.name()));
        group.description(role.description());
        return toRole(null, auth.updateGroup(group));
    }

    public Role insert(HugeClient client, Role role) {
        Group group = new Group();
        group.name(firstNonNull(role.name(), role.nickname()));
        group.description(role.description());
        return toRole(null, client.auth().createGroup(group));
    }

    public Role insert(HugeClient client, String graphSpace, Role role) {
        String name = firstNonNull(role.name(), role.nickname());
        checkScopedRole(graphSpace, name);
        Group group = new Group();
        group.name(scopedGroupName(graphSpace));
        group.description(metadata(name, role.description()));
        Group created = client.auth().createGraphSpaceGroup(group);
        return toRole(graphSpace, created);
    }

    public Role update(HugeClient client, String graphSpace, Role role,
                       boolean includeLegacy) {
        AuthManager auth = client.auth();
        Group group = requireGroup(auth, graphSpace, role.id().toString(),
                                   includeLegacy);
        String scope = scopeOf(group);
        if (scope == null) {
            if (role.name() != null && !role.name().equals(group.name())) {
                throw new ParameterizedException(
                        "Legacy role names cannot be updated");
            }
            group.description(role.description());
            return toRole(null, auth.updateGroup(group));
        }
        String name = firstNonNull(role.name(), role.nickname(),
                                   displayName(group));
        checkScopedRole(graphSpace, name);
        group.description(metadata(name, role.description()));
        return toRole(scope, auth.updateGraphSpaceGroup(group));
    }

    public void delete(HugeClient client, String roleId) {
        AuthManager auth = client.auth();
        Group group = RoleService.getGroup(auth, roleId);
        auth.listAccessesByGroup(group, -1).forEach(access -> {
            auth.deleteAccess(access.id());
        });
        auth.listBelongsByGroup(group, -1).forEach(belong -> {
            auth.deleteBelong(belong.id());
        });
        auth.deleteGroup(roleId);
    }

    public void delete(HugeClient client, String graphSpace, String roleId,
                       boolean includeLegacy) {
        AuthManager auth = client.auth();
        Group group = requireGroup(auth, graphSpace, roleId, includeLegacy);
        String scope = scopeOf(group);
        List<Access> accesses = auth.listAccessesByGroup(group, -1);
        List<Belong> belongs = auth.listBelongsByGroup(group, -1);
        if (scope != null) {
            accesses.forEach(access -> requireGraphSpace(
                    scope, access.graphSpace(), "access"));
            belongs.forEach(belong -> requireGraphSpace(
                    scope, belong.graphSpace(), "belong"));
        }
        accesses.forEach(access -> auth.deleteAccess(access.id()));
        belongs.forEach(belong -> auth.deleteBelong(belong.id()));
        if (scope == null) {
            auth.deleteGroup(roleId);
        } else {
            auth.deleteGraphSpaceGroup(roleId);
        }
    }

    protected static Group getGroup(AuthManager auth, String roleId) {
        Group group = auth.getGroup(roleId);
        if (group == null) {
            throw new ExternalException("auth.role.not-exist", roleId);
        }
        return group;
    }

    static Group requireScopedGroup(AuthManager auth, String graphSpace,
                                    String roleId) {
        return requireGroup(auth, graphSpace, roleId, false);
    }

    private static Group requireGroup(AuthManager auth, String graphSpace,
                                      String roleId, boolean includeLegacy) {
        Group group = includeLegacy ? getGroup(auth, roleId) :
                      getGraphSpaceGroup(auth, roleId);
        String scope = scopeOf(group);
        if (scope == null) {
            if (!includeLegacy || !isVisibleLegacy(group)) {
                throw forbiddenRole();
            }
            return group;
        }
        if (!graphSpace.equals(scope)) {
            throw forbiddenRole();
        }
        return group;
    }

    private static Group getGraphSpaceGroup(AuthManager auth,
                                            String roleId) {
        Group group = auth.getGraphSpaceGroup(roleId);
        if (group == null) {
            throw new ExternalException("auth.role.not-exist", roleId);
        }
        return group;
    }

    protected static Role toRole(String graphSpace, Group group) {
        Role role = new Role();
        role.setId(group.id());
        role.graphSpace(graphSpace);
        String name = graphSpace == null ? group.name() : displayName(group);
        role.name(name);
        role.nickname(name);
        role.description(graphSpace == null ? group.description() :
                         displayDescription(group));
        return role;
    }

    static String displayName(Group group) {
        String[] metadata = metadata(group);
        return metadata == null ? group.name() : metadata[0];
    }

    static boolean isPdDefaultRoleId(String roleId) {
        return HugePermission.SPACE.string().equalsIgnoreCase(roleId) ||
               HugePermission.SPACE_MEMBER.string().equalsIgnoreCase(roleId) ||
               HugePermission.ADMIN.string().equalsIgnoreCase(roleId);
    }

    private static String displayDescription(Group group) {
        String[] metadata = metadata(group);
        return metadata == null ? "" : metadata[1];
    }

    private static String scopedGroupName(String graphSpace) {
        return SCOPED_PREFIX + encode(graphSpace) + ":" +
               UUID.randomUUID().toString().replace("-", "");
    }

    private static String metadata(String name, String description) {
        return METADATA_PREFIX + encode(name) + ":" +
               encode(description == null ? "" : description);
    }

    private static String[] metadata(Group group) {
        String value = group.description();
        if (value == null || !value.startsWith(METADATA_PREFIX)) {
            return null;
        }
        String[] parts = value.substring(METADATA_PREFIX.length())
                              .split(":", -1);
        if (parts.length != 2) {
            return null;
        }
        try {
            return new String[]{decode(parts[0]), decode(parts[1])};
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private static String scopeOf(Group group) {
        String name = group.name();
        if (name == null || !name.startsWith(SCOPED_PREFIX)) {
            return null;
        }
        String[] parts = name.substring(SCOPED_PREFIX.length())
                             .split(":", -1);
        if (parts.length != 2 || !parts[1].matches("[0-9a-f]{32}")) {
            return null;
        }
        try {
            return decode(parts[0]);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private static boolean isVisibleLegacy(Group group) {
        return group.name() != null && !group.name().startsWith("~");
    }

    private static String encode(String value) {
        return ENCODER.encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String decode(String value) {
        return new String(DECODER.decode(value), StandardCharsets.UTF_8);
    }

    private static void checkScopedRole(String graphSpace, String name) {
        if (graphSpace == null || graphSpace.isEmpty() || name == null ||
            name.isEmpty()) {
            throw new ParameterizedException(
                    "Graphspace and role name cannot be empty");
        }
    }

    private static ForbiddenException forbiddenRole() {
        return new ForbiddenException(
                "Permission denied: role belongs to another graphspace");
    }

    private static String firstNonNull(String value, String fallback) {
        return value != null ? value : fallback;
    }

    private static String firstNonNull(String value, String fallback,
                                       String defaultValue) {
        if (value != null) {
            return value;
        }
        if (fallback != null) {
            return fallback;
        }
        return defaultValue;
    }
}
