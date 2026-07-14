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
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.extern.log4j.Log4j2;
import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.driver.AuthManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.auth.BelongEntity;
import org.apache.hugegraph.entity.auth.UserEntity;
import org.apache.hugegraph.exception.InternalException;
import org.apache.hugegraph.structure.auth.Belong;
import org.apache.hugegraph.structure.auth.Group;
import org.apache.hugegraph.util.PageUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Log4j2
@Service
public class BelongService extends AuthService {

    @Autowired
    private UserService userService;

    public void add(HugeClient client, String roleId, String userId) {
        Belong belong = new Belong();
        belong.user(userId);
        belong.group(roleId);
        this.add(client, belong);
    }

    public void add(HugeClient client, String graphSpace, String roleId,
                    String userId) {
        RoleService.requireScopedGroup(client.auth(), graphSpace, roleId);
        Belong belong = new Belong();
        belong.graphSpace(graphSpace);
        belong.user(userId);
        belong.group(roleId);
        this.add(client, belong);
    }

    public void add(HugeClient client, Belong belong) {
        client.auth().createBelong(belong);
    }

    public void addMany(HugeClient client, String roleId, String[] userIds) {
        for (String userId : userIds) {
            this.add(client, roleId, userId);
        }
    }

    public void delete(HugeClient client, String belongId) {
        client.auth().deleteBelong(belongId);
    }

    public void delete(HugeClient client, String roleId, String userId) {
        this.list(client, roleId, userId).forEach(belong -> {
            client.auth().deleteBelong(belong.getId());
        });
    }

    protected List<BelongEntity> listByUser(HugeClient client, String userId) {
        AuthManager auth = client.auth();
        List<BelongEntity> result = new ArrayList<>();
        auth.listBelongsByUser(userId, -1).forEach(belong -> {
            BelongEntity entity = this.convert(client, belong);
            if (entity != null) {
                result.add(entity);
            }
        });
        return result;
    }

    public List<BelongEntity> listByRole(HugeClient client, String roleId) {
        RoleService.getGroup(client.auth(), roleId);
        List<BelongEntity> result = new ArrayList<>();
        client.auth().listBelongsByGroup(roleId, -1).forEach(belong -> {
            BelongEntity entity = this.convert(client, belong);
            if (entity != null) {
                result.add(entity);
            }
        });
        return result;
    }

    public List<BelongEntity> listAll(HugeClient client) {
        List<BelongEntity> result = new ArrayList<>();
        client.auth().listBelongs().forEach(belong -> {
            BelongEntity entity = this.convert(client, belong);
            if (entity != null) {
                result.add(entity);
            }
        });
        return result;
    }

    public List<BelongEntity> list(HugeClient client, String roleId,
                                   String userId) {
        List<BelongEntity> result = new ArrayList<>();
        if (StringUtils.isEmpty(userId) && StringUtils.isEmpty(roleId)) {
            return this.listAll(client);
        } else if (StringUtils.isEmpty(userId)) {
            return this.listByRole(client, roleId);
        } else if (StringUtils.isEmpty(roleId)) {
            return this.listByUser(client, userId);
        }

        client.auth().listBelongsByGroup(roleId, -1).forEach(belong -> {
            BelongEntity entity = this.convert(client, belong);
            if (entity != null && entity.getUserId().equals(userId)) {
                result.add(entity);
            }
        });
        return result;
    }

    public IPage<BelongEntity> listPage(HugeClient client, String roleId,
                                        String userId, int pageNo,
                                        int pageSize) {
        return PageUtil.page(this.list(client, roleId, userId), pageNo,
                             pageSize);
    }

    public List<BelongEntity> list(HugeClient client, String graphSpace,
                                   String roleId, String userId) {
        List<Belong> belongs;
        if (StringUtils.isEmpty(userId) && StringUtils.isEmpty(roleId)) {
            belongs = client.auth().listBelongs();
        } else if (StringUtils.isEmpty(userId)) {
            RoleService.requireScopedGroup(client.auth(), graphSpace, roleId);
            belongs = client.auth().listBelongsByGroup(roleId, -1);
        } else if (StringUtils.isEmpty(roleId)) {
            belongs = client.auth().listBelongsByUser(userId, -1);
        } else {
            belongs = client.auth().listBelongsByGroup(roleId, -1);
        }
        List<BelongEntity> result = new ArrayList<>();
        belongs.forEach(belong -> {
            if (!belongsToGraphSpace(graphSpace, belong.graphSpace())) {
                return;
            }
            if (belong.group() == null || belong.user() == null ||
                graphSpace != null && RoleService.isPdDefaultRoleId(
                        belong.group().toString())) {
                return;
            }
            BelongEntity entity = this.convert(client, graphSpace, belong);
            if (entity != null &&
                (StringUtils.isEmpty(userId) ||
                 userId.equals(entity.getUserId()))) {
                result.add(entity);
            }
        });
        return result;
    }

    public IPage<BelongEntity> listPage(HugeClient client, String graphSpace,
                                        String roleId, String userId,
                                        int pageNo, int pageSize) {
        return PageUtil.page(this.list(client, graphSpace, roleId, userId),
                             pageNo, pageSize);
    }

    public BelongEntity get(HugeClient client, String belongId) {
        Belong belong = client.auth().getBelong(belongId);
        if (belong == null) {
            throw new InternalException("auth.belong.get.%s Not Exits",
                                        belongId);
        }
        return this.convert(client, belong);
    }

    public BelongEntity get(HugeClient client, String graphSpace,
                            String belongId) {
        return this.convert(client, graphSpace, this.requireBelong(
                client, graphSpace, belongId));
    }

    private Belong requireBelong(HugeClient client, String graphSpace,
                                 String belongId) {
        Belong belong = client.auth().getBelong(belongId);
        if (belong == null) {
            throw new InternalException("auth.belong.get.%s Not Exits",
                                        belongId);
        }
        requireGraphSpace(graphSpace, belong.graphSpace(), "belong");
        return belong;
    }

    protected BelongEntity convert(HugeClient client, Belong belong) {
        return this.convert(client, null, belong);
    }

    private BelongEntity convert(HugeClient client, String graphSpace,
                                 Belong belong) {
        try {
            Group group = graphSpace == null ?
                          RoleService.getGroup(
                                  client.auth(), belong.group().toString()) :
                          RoleService.requireScopedGroup(
                                  client.auth(), graphSpace,
                                  belong.group().toString());
            UserEntity user = this.userService.getUser(client,
                                                       belong.user().toString());
            return new BelongEntity(belong.id().toString(),
                                    user.getId(), user.getName(),
                                    group.id().toString(),
                                    RoleService.displayName(group),
                                    user.getDescription(), user.getCreate());
        } catch (Exception e) {
            log.warn("convert belong error", e);
            return null;
        }
    }

    public void deleteMany(HugeClient client, String[] ids) {
        Arrays.stream(ids).forEach(id -> {
            client.auth().deleteBelong(id);
        });
    }

    public void deleteById(HugeClient client, String graphSpace,
                           String belongId) {
        this.requireBelong(client, graphSpace, belongId);
        this.delete(client, belongId);
    }

    public void delete(HugeClient client, String graphSpace, String roleId,
                       String userId) {
        RoleService.requireScopedGroup(client.auth(), graphSpace, roleId);
        this.list(client, graphSpace, roleId, userId).forEach(belong -> {
            client.auth().deleteBelong(belong.getId());
        });
    }

    public void deleteMany(HugeClient client, String graphSpace,
                           String[] ids) {
        Arrays.stream(ids).forEach(id -> this.requireBelong(
                client, graphSpace, id));
        Arrays.stream(ids).forEach(id -> client.auth().deleteBelong(id));
    }

    public boolean exists(HugeClient client, String roleId, String userId) {
        return !this.list(client, roleId, userId).isEmpty();
    }

    public static class BelongsReq {

        @JsonProperty("user_ids")
        private Set<String> userIds = new HashSet<>();

        @JsonProperty("role_id")
        private String roleId;

        @JsonProperty("belong_description")
        private String description;

        public Set<String> getUserIds() {
            return this.userIds;
        }

        public BelongsReq setUserIds(Set<String> userIds) {
            this.userIds = userIds;
            return this;
        }

        public String getRoleId() {
            return this.roleId;
        }

        public BelongsReq setRoleId(String roleId) {
            this.roleId = roleId;
            return this;
        }

        public String getDescription() {
            return this.description;
        }

        public BelongsReq setDescription(String description) {
            this.description = description;
            return this;
        }
    }
}
