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

package org.apache.hugegraph.unit;

import java.util.Collections;

import com.google.common.collect.ImmutableList;
import com.google.common.collect.ImmutableMap;
import com.google.common.collect.ImmutableSet;
import org.apache.hugegraph.entity.auth.AccessEntity;
import org.apache.hugegraph.service.auth.AccessService;
import org.apache.hugegraph.service.auth.RoleService;
import org.apache.hugegraph.structure.auth.Access;
import org.apache.hugegraph.structure.auth.Group;
import org.apache.hugegraph.structure.auth.HugePermission;
import org.apache.hugegraph.structure.auth.Role;
import org.apache.hugegraph.structure.auth.Target;
import org.junit.Assert;
import org.junit.Test;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

public class AuthzRouteRegistrationTest {

    private static final String API = "/api/v1.3/";

    @Test
    public void testGraphspaceAuthzControllersAreRegistered() throws Exception {
        assertController("org.apache.hugegraph.controller.auth.TargetController",
                         "graphspaces/{graphspace}/auth/targets");
        assertController("org.apache.hugegraph.controller.auth.RoleController",
                         "graphspaces/{graphspace}/auth/roles");
        assertController("org.apache.hugegraph.controller.auth.AccessController",
                         "graphspaces/{graphspace}/auth/accesses");
        assertController("org.apache.hugegraph.controller.auth.BelongController",
                         "graphspaces/{graphspace}/auth/belongs");
        assertController("org.apache.hugegraph.controller.auth.GraphSpaceUserController",
                         "graphspaces/{graphspace}/auth/users");
    }

    @Test
    public void testSpaceAdminCreationUsesPost() throws Exception {
        Class<?> type = Class.forName(
                "org.apache.hugegraph.controller.auth.GraphSpaceUserController");
        java.lang.reflect.Method method = type.getMethod(
                "setGraphSpaceAdmin", String.class, String.class);

        Assert.assertNotNull(method.getAnnotation(PostMapping.class));
        Assert.assertNull(method.getAnnotation(PutMapping.class));
    }

    @Test
    public void testGraphspaceAuthzServicesAreRegistered() throws Exception {
        assertService("org.apache.hugegraph.service.auth.TargetService");
        assertService("org.apache.hugegraph.service.auth.RoleService");
        assertService("org.apache.hugegraph.service.auth.AccessService");
        assertService("org.apache.hugegraph.service.auth.BelongService");
        assertService("org.apache.hugegraph.service.auth.GraphSpaceUserService");
    }

    @Test
    public void testRoleDtoCarriesPathGraphspace() {
        Group group = new Group();
        group.setId("-38:slice5-role");
        group.name("slice5-role");

        Role role = TestRoleService.toRole("DEFAULT", group);

        Assert.assertEquals("DEFAULT", role.graphSpace());
        Assert.assertEquals(group.id(), role.id());
        Assert.assertEquals("slice5-role", role.name());
    }

    @Test
    public void testAccessDtoCarriesPathGraphspace() throws Exception {
        Group group = new Group();
        group.setId("-38:slice5-role");
        group.name("slice5-role");

        Target target = new Target();
        target.setId("-46:slice5-target");
        target.name("slice5-target");
        target.graph("hugegraph");
        target.graphSpace(null);
        target.description("target desc");
        target.resources(Collections.singletonList(
                ImmutableMap.<String, Object>of("type", "GREMLIN",
                                                "label", "*")));

        Access access = new Access();
        access.group(group);
        access.target(target);
        access.permission(HugePermission.READ);

        AccessEntity entity = new TestAccessService()
                .exposeConvert("DEFAULT", access, group, target);

        Assert.assertEquals("DEFAULT", entity.getGraphSpace());
        Assert.assertEquals("hugegraph", entity.getGraph());
        Assert.assertEquals(target.id(), entity.getTargetId());
        Assert.assertEquals(group.id(), entity.getRoleId());
        Assert.assertEquals(Collections.singleton(HugePermission.READ),
                            entity.getPermissions());
        Assert.assertEquals(target.resourcesList(), entity.getResources());
    }

    @Test
    public void testAccessListDtoCarriesPathGraphspace() throws Exception {
        Group group = new Group();
        group.setId("-38:slice5-role");
        group.name("slice5-role");

        Target target = new Target();
        target.setId("-46:slice5-target");
        target.name("slice5-target");
        target.graph("hugegraph");
        target.graphSpace(null);
        target.resources(Collections.singletonList(
                ImmutableMap.<String, Object>of("type", "GREMLIN",
                                                "label", "*")));

        Access read = new Access();
        read.group(group);
        read.target(target);
        read.permission(HugePermission.READ);

        Access write = new Access();
        write.group(group);
        write.target(target);
        write.permission(HugePermission.WRITE);

        AccessEntity entity = new TestAccessService()
                .exposeConvert("DEFAULT", ImmutableList.of(read, write),
                               group, target);

        Assert.assertEquals("DEFAULT", entity.getGraphSpace());
        Assert.assertEquals(target.id(), entity.getTargetId());
        Assert.assertEquals(group.id(), entity.getRoleId());
        Assert.assertEquals(ImmutableSet.of(HugePermission.READ,
                                           HugePermission.WRITE),
                            entity.getPermissions());
    }

    private static void assertController(String className, String path)
                                  throws Exception {
        Class<?> type = Class.forName(className);

        Assert.assertNotNull(type.getAnnotation(RestController.class));
        RequestMapping mapping = type.getAnnotation(RequestMapping.class);
        Assert.assertNotNull(mapping);
        Assert.assertEquals(API + path, mapping.value()[0]);
    }

    private static void assertService(String className) throws Exception {
        Class<?> type = Class.forName(className);

        Assert.assertNotNull(type.getAnnotation(Service.class));
    }

    private static class TestRoleService extends RoleService {

        public static Role toRole(String graphSpace, Group group) {
            return RoleService.toRole(graphSpace, group);
        }
    }

    private static class TestAccessService extends AccessService {

        public AccessEntity exposeConvert(String graphSpace, Access access,
                                          Group group, Target target) {
            return this.convert(graphSpace, access, group, target);
        }

        public AccessEntity exposeConvert(String graphSpace,
                                          Iterable<Access> accesses,
                                          Group group, Target target) {
            return this.convert(graphSpace,
                                ImmutableList.copyOf(accesses), group,
                                target);
        }
    }
}
