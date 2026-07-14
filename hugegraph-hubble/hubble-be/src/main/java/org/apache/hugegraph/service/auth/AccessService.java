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
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import com.google.common.collect.ArrayListMultimap;
import com.google.common.collect.ImmutableList;
import com.google.common.collect.Multimap;
import lombok.extern.log4j.Log4j2;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.auth.AccessEntity;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.structure.auth.Access;
import org.apache.hugegraph.structure.auth.HugePermission;
import org.apache.hugegraph.structure.auth.Group;
import org.apache.hugegraph.structure.auth.Target;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Log4j2
@Service
public class AccessService extends AuthService {

    @Autowired
    private TargetService targetService;

    public AccessEntity get(HugeClient client, String accessId) {
        return this.get(client, null, accessId);
    }

    public AccessEntity get(HugeClient client, String graphSpace,
                            String accessId) {
        Access access = client.auth().getAccess(accessId);
        if (access == null) {
            throw new ExternalException("auth.access.not-exist.id", accessId);
        }
        requireGraphSpace(graphSpace, access.graphSpace(), "access");
        Group group = graphSpace == null ?
                      RoleService.getGroup(client.auth(),
                                           access.group().toString()) :
                      RoleService.requireScopedGroup(
                              client.auth(), graphSpace,
                              access.group().toString());
        Target target = graphSpace == null ?
                        this.targetService.get(client,
                                               access.target().toString()) :
                        this.targetService.get(client, graphSpace,
                                               access.target().toString());
        return convert(graphSpace, access, group, target);
    }

    private List<Access> list0(HugeClient client, String roleId,
                               String targetId) {
        return this.list0(client, null, roleId, targetId, false);
    }

    private List<Access> list0(HugeClient client, String graphSpace,
                               String roleId, String targetId,
                               boolean strict) {
        List<Access> result = new ArrayList<>();
        client.auth().listAccessesByGroup(roleId, -1).forEach(access -> {
            if (!belongsToGraphSpace(graphSpace, access.graphSpace())) {
                if (strict) {
                    requireGraphSpace(graphSpace, access.graphSpace(),
                                      "access");
                }
                return;
            }
            if (targetId == null ||
                access.target().toString().equals(targetId)) {
                result.add(access);
            }
        });
        return result;
    }

    public List<AccessEntity> list(HugeClient client, String roleId,
                                   String targetId) {
        return this.list(client, null, roleId, targetId);
    }

    public List<AccessEntity> list(HugeClient client, String graphSpace,
                                   String roleId, String targetId) {
        List<AccessEntity> result = new ArrayList<>();
        List<Access> accesses = this.list0(client, graphSpace, roleId,
                                           targetId, false);
        Multimap<ImmutableList<String>, Access> grouped =
                ArrayListMultimap.create();

        accesses.forEach(access -> {
            if (access.group() == null || access.target() == null ||
                graphSpace != null && RoleService.isPdDefaultRoleId(
                        access.group().toString())) {
                return;
            }
            grouped.put(ImmutableList.of(access.group().toString(),
                                         access.target().toString()), access);
        });

        for (ImmutableList<String> key : grouped.keySet()) {
            try {
                Group group = graphSpace == null ?
                              RoleService.getGroup(client.auth(), key.get(0)) :
                              RoleService.requireScopedGroup(
                                      client.auth(), graphSpace, key.get(0));
                Target target = graphSpace == null ?
                                this.targetService.get(client, key.get(1)) :
                                this.targetService.get(client, graphSpace,
                                                       key.get(1));
                result.add(convert(graphSpace, grouped.get(key), group,
                                   target));
            } catch (Exception e) {
                log.warn("list access error", e);
            }
        }
        return result;
    }

    public AccessEntity addOrUpdate(HugeClient client,
                                    AccessEntity accessEntity) {
        return this.addOrUpdate(client, null, accessEntity);
    }

    public AccessEntity addOrUpdate(HugeClient client, String graphSpace,
                                    AccessEntity accessEntity) {
        if (accessEntity.getGraphSpace() != null) {
            requireGraphSpace(graphSpace, accessEntity.getGraphSpace(),
                              "access");
        }
        accessEntity.setGraphSpace(graphSpace);
        if (graphSpace != null) {
            RoleService.requireScopedGroup(client.auth(), graphSpace,
                                           accessEntity.getRoleId());
            this.targetService.get(client, graphSpace,
                                   accessEntity.getTargetId());
        }
        List<Access> accesses = this.list0(client, graphSpace,
                                           accessEntity.getRoleId(),
                                           accessEntity.getTargetId(), true);
        Set<HugePermission> currentPermissions =
                accesses.stream().map(Access::permission)
                        .collect(Collectors.toSet());

        accesses.forEach(access -> {
            if (!accessEntity.getPermissions().contains(access.permission())) {
                client.auth().deleteAccess(access.id());
            }
        });

        accessEntity.getPermissions().forEach(permission -> {
            if (!currentPermissions.contains(permission)) {
                Access access = new Access();
                access.graphSpace(graphSpace);
                access.group(accessEntity.getRoleId());
                access.target(accessEntity.getTargetId());
                access.permission(permission);
                client.auth().createAccess(access);
            }
        });

        List<AccessEntity> results = this.list(client, graphSpace,
                                               accessEntity.getRoleId(),
                                               accessEntity.getTargetId());
        if (results.isEmpty()) {
            return null;
        }
        return results.get(0);
    }

    public void delete(HugeClient client, String roleId, String targetId) {
        this.list0(client, roleId, targetId).forEach(access -> {
            client.auth().deleteAccess(access.id());
        });
    }

    public void delete(HugeClient client, String graphSpace, String roleId,
                       String targetId) {
        RoleService.requireScopedGroup(client.auth(), graphSpace, roleId);
        this.targetService.get(client, graphSpace, targetId);
        this.list0(client, graphSpace, roleId, targetId, true)
            .forEach(access -> client.auth().deleteAccess(access.id()));
    }

    protected AccessEntity convert(Access access, Group group, Target target) {
        return this.convert(null, access, group, target);
    }

    protected AccessEntity convert(String graphSpace, Access access,
                                   Group group, Target target) {
        AccessEntity entity = new AccessEntity(target.id().toString(),
                                               target.name(),
                                               group.id().toString(),
                                               RoleService.displayName(group),
                                               firstNonNull(graphSpace,
                                                            access.graphSpace(),
                                                            target.graphSpace()),
                                               target.graph(),
                                               new HashSet<>(),
                                               target.description(),
                                               target.resourcesList());
        entity.addPermission(access.permission());
        return entity;
    }

    protected AccessEntity convert(Collection<Access> accesses, Group group,
                                   Target target) {
        return this.convert(null, accesses, group, target);
    }

    protected AccessEntity convert(String graphSpace,
                                   Collection<Access> accesses, Group group,
                                   Target target) {
        AccessEntity entity = new AccessEntity(target.id().toString(),
                                               target.name(),
                                               group.id().toString(),
                                               RoleService.displayName(group),
                                               firstNonNull(graphSpace,
                                                            target.graphSpace()),
                                               target.graph(),
                                               new HashSet<>(),
                                               target.description(),
                                               target.resourcesList());
        accesses.forEach(access -> {
            entity.addPermission(access.permission());
        });
        return entity;
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
