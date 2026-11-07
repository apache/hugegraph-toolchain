/*
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

import java.util.Arrays;
import java.util.Collections;
import java.util.Map;

import org.apache.hugegraph.api.auth.AuthAPI;
import org.apache.hugegraph.api.task.ComputerDisAPI;
import org.apache.hugegraph.api.task.TaskAPI;
import org.apache.hugegraph.driver.GraphManager;
import org.apache.hugegraph.structure.auth.Access;
import org.apache.hugegraph.structure.auth.Belong;
import org.apache.hugegraph.structure.auth.Group;
import org.apache.hugegraph.structure.auth.HugeResource;
import org.apache.hugegraph.structure.auth.HugeResourceType;
import org.apache.hugegraph.structure.auth.Role;
import org.apache.hugegraph.structure.auth.Target;
import org.apache.hugegraph.structure.auth.User;
import org.apache.hugegraph.structure.constant.GraphAttachable;
import org.apache.hugegraph.structure.graph.Path;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;
import org.mockito.Mockito;

import com.google.common.collect.ImmutableMap;

public class StructureHelperTest {

    @Test
    public void testFormatEntityId() {
        Assert.assertNull(AuthAPI.formatEntityId(null));
        Assert.assertEquals("-21:admin", AuthAPI.formatEntityId("-21:admin"));
        Assert.assertEquals("123", AuthAPI.formatEntityId(123));

        User user = new User();
        user.setId("-63:alice");
        Assert.assertEquals("-63:alice", AuthAPI.formatEntityId(user));
    }

    @Test
    public void testAccessAcceptsElementOrId() {
        Group group = new Group();
        group.setId("-69:all");
        Target target = new Target();
        target.setId("-77:graph");

        Access access = new Access();
        access.group(group);
        access.target(target);
        Assert.assertEquals("-69:all", access.group());
        Assert.assertEquals("-77:graph", access.target());

        access.group("-69:other");
        access.target("-77:other");
        Assert.assertEquals("-69:other", access.group());
        Assert.assertEquals("-77:other", access.target());
    }

    @Test
    public void testBelongAcceptsElementOrId() {
        User user = new User();
        user.setId("-63:alice");
        Group group = new Group();
        group.setId("-69:all");
        Role role = new Role();
        role.setId("-70:reader");

        Belong belong = new Belong();
        belong.user(user);
        belong.group(group);
        belong.role(role);
        Assert.assertEquals("-63:alice", belong.user());
        Assert.assertEquals("-69:all", belong.group());
        Assert.assertEquals("-70:reader", belong.role());

        belong.user("-63:bob");
        belong.group(null);
        belong.role(7);
        Assert.assertEquals("-63:bob", belong.user());
        Assert.assertNull(belong.group());
        Assert.assertEquals(7, belong.role());
    }

    @Test
    public void testHugeResourceEquals() {
        HugeResource resource = new HugeResource(HugeResourceType.VERTEX, "person");
        Assert.assertEquals(resource, resource);
        Assert.assertEquals(resource,
                            new HugeResource(HugeResourceType.VERTEX, "person"));
        Assert.assertNotEquals(resource,
                               new HugeResource(HugeResourceType.EDGE, "person"));
        Assert.assertNotEquals(resource,
                               new HugeResource(HugeResourceType.VERTEX, "book"));
        Assert.assertNotEquals(resource, "person");
        Assert.assertNotEquals(resource, null);
    }

    @Test
    public void testPathEquals() {
        Path path = new Path("c", Arrays.asList("a", "b"));
        Assert.assertEquals(path, new Path("c", Arrays.asList("a", "b")));
        Assert.assertNotEquals(path, new Path("x", Arrays.asList("a", "b")));
        Assert.assertNotEquals(path, new Path("c", Arrays.asList("a")));
        Assert.assertNotEquals(path, Arrays.asList("a", "b"));
        Assert.assertNotEquals(path, null);
    }

    @Test
    public void testPathAttachManager() {
        GraphManager manager = Mockito.mock(GraphManager.class);
        GraphAttachable object = Mockito.mock(GraphAttachable.class);
        GraphAttachable crosspoint = Mockito.mock(GraphAttachable.class);

        Path path = new Path(crosspoint, Arrays.asList(object, "plain"));
        path.attachManager(manager);
        Mockito.verify(object).attachManager(manager);
        Mockito.verify(crosspoint).attachManager(manager);

        new Path("plain", Arrays.asList("a")).attachManager(manager);
    }

    @Test
    public void testParseTaskId() {
        Map<String, Object> task = ImmutableMap.of("task_id", 15);
        Assert.assertEquals(15L, TaskAPI.parseTaskId(task));
        Assert.assertEquals(15L, ComputerDisAPI.parseTaskId(task));

        Map<String, Object> extra = ImmutableMap.of("task_id", 15, "x", 1);
        Assert.assertThrows(IllegalStateException.class, () -> {
            ComputerDisAPI.parseTaskId(extra);
        }, e -> {
            Assert.assertContains("Task must be formatted to {\"task_id\" : id}",
                                  e.getMessage());
        });

        Map<String, Object> text = ImmutableMap.of("task_id", "15");
        Assert.assertThrows(IllegalStateException.class, () -> {
            ComputerDisAPI.parseTaskId(text);
        }, e -> {
            Assert.assertEquals("Task id must be number, but got '15'", e.getMessage());
        });

        Assert.assertThrows(IllegalStateException.class, () -> {
            ComputerDisAPI.parseTaskId(Collections.emptyMap());
        });
    }
}
