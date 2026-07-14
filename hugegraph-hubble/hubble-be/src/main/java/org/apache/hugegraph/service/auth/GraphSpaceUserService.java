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
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.google.common.collect.ArrayListMultimap;
import com.google.common.collect.Multimap;
import lombok.extern.log4j.Log4j2;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.auth.BelongEntity;
import org.apache.hugegraph.entity.auth.RoleEntity;
import org.apache.hugegraph.entity.auth.UserView;
import org.apache.hugegraph.structure.auth.User;
import org.apache.hugegraph.util.E;
import org.apache.hugegraph.util.PageUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Log4j2
@Service
public class GraphSpaceUserService extends AuthService {

    @Autowired
    private BelongService belongService;

    public List<UserView> listUsers(HugeClient client, String graphSpace) {
        List<UserView> users = new ArrayList<>();
        List<BelongEntity> belongs = this.belongService.list(
                client, graphSpace, null, null);

        Multimap<String, BelongEntity> grouped = ArrayListMultimap.create();
        belongs.forEach(belong -> {
            grouped.put(belong.getUserId(), belong);
        });

        grouped.keySet().forEach(userId -> {
            UserView user = new UserView(null, null, new ArrayList<>());
            grouped.get(userId).forEach(belong -> {
                user.setId(belong.getUserId());
                user.setName(belong.getUserName());
                user.addRole(new RoleEntity(belong.getRoleId(),
                                            belong.getRoleName()));
            });
            users.add(user);
        });
        return users;
    }

    public UserView getUser(HugeClient client, String graphSpace,
                            String userId) {
        List<BelongEntity> belongs = this.belongService.list(
                client, graphSpace, null, userId);
        UserView user = new UserView(null, null,
                                     new ArrayList<>(belongs.size()));
        belongs.forEach(belong -> {
            user.setId(belong.getUserId());
            user.setName(belong.getUserName());
            user.addRole(new RoleEntity(belong.getRoleId(),
                                        belong.getRoleName()));
        });
        return user;
    }

    public IPage<UserView> queryPage(HugeClient client, String graphSpace,
                                     String query, int pageNo, int pageSize) {
        List<UserView> results =
                this.listUsers(client, graphSpace).stream()
                    .filter(user -> user.getName().contains(query))
                    .sorted(Comparator.comparing(UserView::getName))
                    .collect(Collectors.toList());
        return PageUtil.page(results, pageNo, pageSize);
    }

    public UserView createOrUpdate(HugeClient client, String graphSpace,
                                   UserView userView) {
        E.checkNotNull(userView.getId(), "User Id Not Null");
        E.checkArgument(userView.getRoles() != null &&
                        !userView.getRoles().isEmpty(),
                        "The role info is empty");

        Set<String> newRoles =
                userView.getRoles().stream()
                        .map(RoleEntity::getId)
                        .collect(Collectors.toSet());
        newRoles.forEach(roleId -> RoleService.requireScopedGroup(
                client.auth(), graphSpace, roleId));
        User account = client.auth().getUser(userView.getId());
        E.checkNotNull(account, "User");
        String username = account.name();
        E.checkArgument(username != null && !username.isEmpty(),
                        "The user name is empty");
        List<BelongEntity> current = this.belongService.list(
                client, graphSpace, null, userView.getId());
        if (!client.auth().listSpaceMember(graphSpace).contains(username)) {
            client.auth().addSpaceMember(username, graphSpace);
        }
        current.forEach(belong -> {
            if (!newRoles.contains(belong.getRoleId())) {
                this.belongService.deleteById(client, graphSpace,
                                              belong.getId());
            }
        });
        Set<String> currentRoles = current.stream()
                                          .map(BelongEntity::getRoleId)
                                          .collect(Collectors.toSet());

        userView.getRoles().forEach(role -> {
            if (!currentRoles.contains(role.getId())) {
                this.belongService.add(client, graphSpace, role.getId(),
                                       userView.getId());
            }
        });
        return this.getUser(client, graphSpace, userView.getId());
    }

    public void unauthUser(HugeClient client, String graphSpace,
                           String userId) {
        User account = client.auth().getUser(userId);
        E.checkNotNull(account, "User");
        List<BelongEntity> belongs = this.belongService.list(
                client, graphSpace, null, userId);
        E.checkState(!belongs.isEmpty(), "The user: (%s) not exists", userId);
        belongs.forEach(belong -> {
            this.belongService.deleteById(client, graphSpace, belong.getId());
        });
        client.auth().delSpaceMember(account.name(), graphSpace);
    }

    public IPage<User> querySpaceAdmins(HugeClient client, String graphSpace,
                                        String query, int pageNo,
                                        int pageSize) {
        List<User> spaceAdmins =
                this.getSpaceAdmins(client, graphSpace).stream()
                    .filter(user -> user.name().contains(query))
                    .sorted(Comparator.comparing(User::name))
                    .collect(Collectors.toList());
        return PageUtil.page(spaceAdmins, pageNo, pageSize);
    }

    private List<User> getSpaceAdmins(HugeClient client, String graphSpace) {
        List<String> spaceAdmins = client.auth().listSpaceAdmin(graphSpace);
        ArrayList<User> users = new ArrayList<>();
        for (String spaceAdmin : spaceAdmins) {
            users.add(client.auth().getUser(spaceAdmin));
        }
        return users;
    }
}
