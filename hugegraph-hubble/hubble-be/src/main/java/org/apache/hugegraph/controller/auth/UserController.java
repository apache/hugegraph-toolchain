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

package org.apache.hugegraph.controller.auth;

import com.google.common.collect.ImmutableMap;
import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.common.Response;
import org.apache.hugegraph.controller.BaseController;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.auth.PasswordEntity;
import org.apache.hugegraph.entity.auth.UserEntity;
import org.apache.hugegraph.exception.ForbiddenException;
import org.apache.hugegraph.exception.ParameterizedException;
import org.apache.hugegraph.service.auth.UserService;
import org.apache.hugegraph.exception.UnauthorizedException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@RestController
@RequestMapping(Constant.API_VERSION + "auth/users")
public class UserController extends BaseController {

    @Autowired
    UserService userService;

    @GetMapping("list")
    public Object list() {
        List<UserEntity> users = this.userService.listUsers(
                this.requireAccountManager());
        return ImmutableMap.of("users", users);
    }

    @GetMapping
    public Object queryPage(@RequestParam(name = "query", required = false,
            defaultValue = "") String query,
                            @RequestParam(name = "page_no", required = false,
                                    defaultValue = "1") int pageNo,
                            @RequestParam(name = "page_size", required = false,
                                    defaultValue = "10") int pageSize) {
        return userService.queryPage(this.requireAccountManager(),
                query, pageNo, pageSize);
    }

    @PostMapping
    public void create(@RequestBody UserEntity userEntity) {
        HugeClient client = this.requireAccountManager();
        this.checkAccountGrantScope(client, null, userEntity);
        userService.add(client, userEntity);
    }

    @PostMapping("batch")
    public void createbatch(@RequestParam("file") MultipartFile csvfile) {
        HugeClient client = this.requireAccountManager();
        userService.addbatch(client, csvfile);
    }

    @GetMapping("{id}")
    public Object get(@PathVariable("id") String id) {
        return userService.get(this.requireAccountManager(), id);
    }

    @PutMapping("{id}")
    public void update(@PathVariable("id") String id,
                       @RequestBody UserEntity userEntity) {
        HugeClient client = this.requireAccountManager();
        UserEntity current = this.userService.get(client, id);
        if (userEntity.getName() != null &&
            !Objects.equals(userEntity.getName(), current.getName())) {
            throw new ParameterizedException(
                    "The body user_name(%s) does not match path user(%s)",
                    userEntity.getName(), current.getName());
        }
        if (!this.userService.isSuperAdmin(client) &&
            current.isSuperadmin()) {
            throw new ForbiddenException(
                    "Permission denied: modify superadmin");
        }
        userEntity.setId(current.getId());
        userEntity.setName(current.getName());
        if (!userEntity.hasSuperadmin()) {
            userEntity.setSuperadmin(current.isSuperadmin());
        }
        if (userEntity.getAdminSpaces() == null) {
            userEntity.setAdminSpaces(current.getAdminSpaces());
        }
        this.checkAccountGrantScope(client, current.getName(), userEntity);
        userService.update(client, userEntity);
    }

    @DeleteMapping("{id}")
    public void delete(@PathVariable("id") String id) {
        HugeClient client = this.requireAccountManager();
        UserEntity current = this.userService.get(client, id);
        userService.delete(client, current.getId());
    }

    @PostMapping("updatepwd")
    public Response updatepwd(@RequestBody PasswordEntity pwd) {
        if (!Objects.equals(this.getUser(), pwd.getUsername())) {
            throw new ForbiddenException(
                    "Permission denied: change another account password");
        }
        HugeClient client = this.authClient(null, null);
        return userService.updatepwd(client, pwd.getUsername(), pwd.getOldpwd(), pwd.getNewpwd());
    }

    @GetMapping("listadminspace/{username}")
    public List<String> listadminspace(@PathVariable("username") String username) {
        HugeClient client = this.requireAccountManager();
        return userService.listAdminSpace(client, username);
    }

    @PostMapping("updateadminspace/{username}")
    public void updateadminspace(@PathVariable("username") String username,
                                 @RequestBody List<String> adminspaces) {
        HugeClient client = this.requireAccountManager();
        this.checkAdminSpaceScope(client, username, adminspaces);
        userService.updateAdminSpace(client, username, adminspaces);
    }

    private void checkAccountGrantScope(HugeClient client, String username,
                                        UserEntity userEntity) {
        if (this.userService.isSuperAdmin(client)) {
            return;
        }
        if (userEntity.isSuperadmin()) {
            throw new ForbiddenException(
                    "Permission denied: grant superadmin");
        }
        this.checkAdminSpaceScope(client, username,
                                  userEntity.getAdminSpaces());
    }

    private void checkAdminSpaceScope(HugeClient client, String username,
                                      List<String> requestedSpaces) {
        if (this.userService.isSuperAdmin(client)) {
            return;
        }
        Set<String> managedSpaces = new HashSet<>(
                this.userService.listAdminSpace(client, this.getUser()));
        Set<String> requested = requestedSpaces == null ?
                                new HashSet<>() :
                                new HashSet<>(requestedSpaces);
        Set<String> current = username == null ? new HashSet<>() :
                              new HashSet<>(this.userService.listAdminSpace(
                                      client, username));
        Set<String> changed = new HashSet<>(current);
        changed.addAll(requested);
        changed.removeIf(space -> current.contains(space) ==
                                  requested.contains(space));
        if (!managedSpaces.containsAll(changed)) {
            throw new ForbiddenException(
                    "Permission denied: manage another graphspace");
        }
    }

    @PutMapping("personal")
    public void updatePersonal(@RequestBody PersonalProfile profile) {
        String username = this.getUser();
        if (username == null) {
            throw new UnauthorizedException();
        }
        this.checkParamsNotEmpty("nickname", profile.getNickname(), true);
        String description = profile.getDescription() == null ? "" :
                             profile.getDescription();
        userService.updatePersonal(this.authClient(null, null), username,
                                   profile.getNickname(), description);
    }

    @GetMapping("getpersonal")
    public Object getpersonal() {
        return userService.getpersonal(this.authClient(null, null),
                getUser());
    }

    public static class PersonalProfile {

        private String nickname;
        private String description;

        public String getNickname() {
            return this.nickname;
        }

        public void setNickname(String nickname) {
            this.nickname = nickname;
        }

        public String getDescription() {
            return this.description;
        }

        public void setDescription(String description) {
            this.description = description;
        }
    }

}
