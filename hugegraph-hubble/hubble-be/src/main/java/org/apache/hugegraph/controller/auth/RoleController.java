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

import java.util.List;
import java.util.Map;

import com.baomidou.mybatisplus.core.metadata.IPage;
import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.service.auth.RoleService;
import org.apache.hugegraph.structure.auth.Role;
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

@RestController
@RequestMapping(Constant.API_VERSION + "graphspaces/{graphspace}/auth/roles")
public class RoleController extends AuthController {

    @Autowired
    private RoleService roleService;

    @GetMapping("list")
    public List<Role> listName(@PathVariable("graphspace") String graphSpace) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        return this.roleService.list(client, graphSpace,
                                     this.userService.isSuperAdmin(client));
    }

    @GetMapping
    public IPage<Role> queryPage(
            @PathVariable("graphspace") String graphSpace,
            @RequestParam(name = "query", required = false,
                          defaultValue = "") String query,
            @RequestParam(name = "page_no", required = false,
                          defaultValue = "1") int pageNo,
            @RequestParam(name = "page_size", required = false,
                          defaultValue = "10") int pageSize) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        return this.roleService.queryPage(
                client, graphSpace, query, pageNo, pageSize,
                this.userService.isSuperAdmin(client));
    }

    @GetMapping("{id}")
    public Role get(@PathVariable("graphspace") String graphSpace,
                    @PathVariable("id") String roleId) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        return this.roleService.get(client, graphSpace, roleId,
                                    this.userService.isSuperAdmin(client));
    }

    @PostMapping
    public Role add(@PathVariable("graphspace") String graphSpace,
                    @RequestBody Role role) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        role.graphSpace(graphSpace);
        return this.roleService.insert(client, graphSpace, role);
    }

    @PutMapping("{id}")
    public Role update(@PathVariable("graphspace") String graphSpace,
                       @PathVariable("id") String id,
                       @RequestBody Map<String, Object> body) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        boolean includeLegacy = this.userService.isSuperAdmin(client);
        Role current = this.roleService.get(client, graphSpace, id,
                                            includeLegacy);
        String name = firstNonBlank(body, "role_name", "group_name",
                                    "new_group_name");
        if (name != null) {
            current.name(name);
            current.nickname(name);
        }
        String description = firstNonBlank(body, "role_description",
                                           "group_description");
        if (description != null) {
            current.description(description);
        }
        return this.roleService.update(client, graphSpace, current,
                                       includeLegacy);
    }

    @DeleteMapping("{id}")
    public void delete(@PathVariable("graphspace") String graphSpace,
                       @PathVariable("id") String id) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        this.roleService.delete(client, graphSpace, id,
                                this.userService.isSuperAdmin(client));
    }

    private static String firstNonBlank(Map<String, Object> body,
                                        String... keys) {
        for (String key : keys) {
            Object value = body.get(key);
            if (value instanceof String && !((String) value).isEmpty()) {
                return (String) value;
            }
        }
        return null;
    }
}
