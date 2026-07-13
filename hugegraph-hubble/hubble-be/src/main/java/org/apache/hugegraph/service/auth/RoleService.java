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
import java.util.List;

import com.baomidou.mybatisplus.core.metadata.IPage;
import lombok.extern.log4j.Log4j2;
import org.apache.hugegraph.driver.AuthManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.structure.auth.Group;
import org.apache.hugegraph.structure.auth.Role;
import org.apache.hugegraph.util.PageUtil;
import org.springframework.stereotype.Service;

@Log4j2
@Service
public class RoleService extends AuthService {

    public Role get(HugeClient client, String roleId) {
        AuthManager auth = client.auth();
        Group group = auth.getGroup(roleId);
        if (group == null) {
            throw new ExternalException("auth.role.get.not-exist", roleId);
        }
        return toRole(null, group);
    }

    public Role get(HugeClient client, String graphSpace, String roleId) {
        return this.get(client, roleId);
    }

    public List<Role> list(HugeClient client) {
        List<Role> roles = new ArrayList<>();
        client.auth().listGroups().forEach(group -> {
            roles.add(toRole(null, group));
        });
        return roles;
    }

    public List<Role> list(HugeClient client, String graphSpace) {
        return this.list(client);
    }

    public IPage<Role> queryPage(HugeClient client, String query,
                                 int pageNo, int pageSize) {
        return this.queryPage(client, null, query, pageNo, pageSize);
    }

    public IPage<Role> queryPage(HugeClient client, String graphSpace,
                                 String query, int pageNo, int pageSize) {
        ArrayList<Role> results = new ArrayList<>();
        this.list(client, graphSpace).stream()
              .filter(role -> role.nickname().contains(query))
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

    protected static Group getGroup(AuthManager auth, String roleId) {
        Group group = auth.getGroup(roleId);
        if (group == null) {
            throw new ExternalException("auth.role.not-exist", roleId);
        }
        return group;
    }

    protected static Role toRole(String graphSpace, Group group) {
        Role role = new Role();
        role.setId(group.id());
        role.graphSpace(graphSpace);
        role.name(group.name());
        role.nickname(group.name());
        role.description(group.description());
        return role;
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
