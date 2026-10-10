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

import java.util.Date;
import java.util.UUID;

import org.apache.hugegraph.exception.InvalidOperationException;
import org.apache.hugegraph.structure.graph.Edge;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;

import com.google.common.collect.ImmutableList;
import com.google.common.collect.ImmutableMap;
import com.google.common.collect.ImmutableSet;

public class GraphElementTest extends BaseUnitTest {

    @Test
    public void testVertexPropertyAcceptsSupportedTypes() {
        Vertex vertex = new Vertex("person");
        UUID uuid = UUID.randomUUID();
        Date date = new Date();

        vertex.property("name", "marko")
              .property("age", 29)
              .property("score", 1.5D)
              .property("alive", true)
              .property("uuid", uuid)
              .property("birth", date)
              .property("blob", new byte[]{1, 2})
              .property("tags", ImmutableList.of("a", "b"))
              .property("cities", ImmutableSet.of("x"));

        Assert.assertEquals(9, vertex.sizeOfProperties());
        Assert.assertEquals("marko", vertex.property("name"));
        Assert.assertEquals(uuid, vertex.property("uuid"));
        Assert.assertEquals(date, vertex.property("birth"));
    }

    @Test
    public void testVertexPropertyRejectsInvalidValues() {
        Vertex vertex = new Vertex("person");

        Assert.assertThrows(NullPointerException.class, () -> {
            vertex.property(null, "marko");
        });
        Assert.assertThrows(NullPointerException.class, () -> {
            vertex.property("name", null);
        });
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            vertex.property("map", ImmutableMap.of("k", "v"));
        }, e -> {
            Assert.assertContains("Invalid property value type", e.getMessage());
        });
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            vertex.property("object", new Object());
        });
        Assert.assertEquals(0, vertex.sizeOfProperties());
    }

    @Test
    public void testEdgePropertyRejectsInvalidValues() {
        Edge edge = new Edge("knows");

        edge.property("weight", 0.5D);
        Assert.assertEquals(0.5D, edge.property("weight"));

        Assert.assertThrows(NullPointerException.class, () -> {
            edge.property("date", null);
        });
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            edge.property("object", new Object());
        });
        Assert.assertEquals(1, edge.sizeOfProperties());
    }

    @Test
    public void testRemoveMissingProperty() {
        Vertex vertex = new Vertex("person");
        vertex.id("1:marko");
        Assert.assertThrows(InvalidOperationException.class, () -> {
            vertex.removeProperty("missing");
        }, e -> {
            Assert.assertContains("doesn't have the property 'missing'", e.getMessage());
        });

        Edge edge = new Edge("knows");
        Assert.assertThrows(InvalidOperationException.class, () -> {
            edge.removeProperty("missing");
        });
    }
}
