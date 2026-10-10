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

import java.util.Map;

import org.apache.hugegraph.rest.SerializeException;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.testutil.Assert;
import org.apache.hugegraph.util.JsonUtil;
import org.junit.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

public class JsonUtilTest extends BaseUnitTest {

    @Test
    public void testVertexRoundTrip() {
        Vertex vertex = new Vertex("person");
        vertex.id("1:marko");
        vertex.property("name", "marko");
        vertex.property("age", 29);

        Vertex copy = JsonUtil.fromJson(JsonUtil.toJson(vertex), Vertex.class);

        Assert.assertEquals("1:marko", copy.id());
        Assert.assertEquals("person", copy.label());
        Assert.assertEquals("marko", copy.property("name"));
        Assert.assertEquals(29, copy.property("age"));
    }

    @Test
    public void testFromJsonWithMalformedJson() {
        Assert.assertThrows(SerializeException.class, () -> {
            JsonUtil.fromJson("{\"id\": ", Map.class);
        }, e -> {
            Assert.assertContains("Failed to deserialize json", e.getMessage());
        });
        Assert.assertThrows(SerializeException.class, () -> {
            JsonUtil.fromJson("", Map.class);
        });
    }

    @Test
    public void testFromJsonWithMismatchedType() {
        Assert.assertThrows(SerializeException.class, () -> {
            JsonUtil.fromJson("[1, 2]", Vertex.class);
        });
        Assert.assertThrows(SerializeException.class, () -> {
            JsonUtil.fromJson("\"text\"", Integer.class);
        });
    }

    @Test
    public void testToJsonWithUnserializableObject() {
        Assert.assertThrows(SerializeException.class, () -> {
            JsonUtil.toJson(new Object());
        }, e -> {
            Assert.assertContains("Failed to serialize object", e.getMessage());
        });
    }

    @Test
    public void testConvertValue() {
        ObjectNode node = JsonNodeFactory.instance.objectNode();
        node.put("label", "person");
        node.put("type", "vertex");

        Vertex vertex = JsonUtil.convertValue(node, Vertex.class);
        Assert.assertEquals("person", vertex.label());

        JsonNode text = JsonNodeFactory.instance.textNode("not a number");
        Assert.assertThrows(SerializeException.class, () -> {
            JsonUtil.convertValue(text, Integer.class);
        }, e -> {
            Assert.assertContains("Failed to deserialize json node", e.getMessage());
        });
    }
}
