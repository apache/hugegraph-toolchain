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

package org.apache.hugegraph.spark.connector.builder;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.spark.connector.client.HGLoadContext;
import org.apache.hugegraph.spark.connector.mapping.VertexMapping;
import org.apache.hugegraph.spark.connector.options.HGOptions;
import org.apache.hugegraph.spark.connector.utils.HGEnvUtils;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.structure.schema.VertexLabel;
import org.apache.hugegraph.testutil.Assert;
import org.jetbrains.annotations.NotNull;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

public class VertexBuilderTest {

    private static HugeClient client;

    @BeforeClass
    public static void setUp() {
        HGEnvUtils.createEnv();
        client = HGEnvUtils.getHugeClient();
    }

    @Test
    public void testCustomizeIdFields() {
        HGLoadContext context = getCustomizeIdVertexContext();

        VertexMapping vertexMapping = new VertexMapping("name");
        vertexMapping.label("person");
        VertexBuilder vertexBuilder = new VertexBuilder(context, vertexMapping);

        VertexLabel vertexLabel = (VertexLabel) vertexBuilder.schemaLabel();
        Assert.assertTrue(vertexLabel.idStrategy().isCustomizeString());

        Assert.assertTrue(vertexBuilder.isIdField("name"));
        System.out.println(vertexBuilder.mapping());
        Assert.assertEquals("vertex-mapping(label=person)",
                            vertexBuilder.mapping().toString());
    }

    @Test
    public void testCustomizeWithNullIdField() {
        HGLoadContext context = getCustomizeIdVertexContext();

        VertexMapping vertexMapping = new VertexMapping(null);
        vertexMapping.label("person");
        Assert.assertThrows(IllegalStateException.class, () -> {
            new VertexBuilder(context, vertexMapping);
        });
    }

    @NotNull
    private static HGLoadContext getCustomizeIdVertexContext() {
        Map<String, String> configs = new HashMap<>();
        configs.put("host", HGEnvUtils.HOST);
        configs.put("port", HGEnvUtils.PORT);
        configs.put("graph", HGEnvUtils.GRAPH);
        configs.put("protocol", HGEnvUtils.PROTOCOL);
        configs.put("username", "admin");
        configs.put("token", "pa");
        configs.put("data-type", "vertex");
        configs.put("label", "person");
        configs.put("id", "name");
        configs.putAll(HGEnvUtils.tlsOptions());
        HGOptions options = new HGOptions(configs);
        HGLoadContext context = new HGLoadContext(options);
        context.updateSchemaCache();
        return context;
    }

    @Test
    public void testCustomizeBuildVertex() {
        HGLoadContext context = getCustomizeIdVertexContext();

        VertexMapping vertexMapping = new VertexMapping("name");
        vertexMapping.label("person");
        VertexBuilder vertexBuilder = new VertexBuilder(context, vertexMapping);

        String[] names = {"name", "age", "city"};
        Object[] values = {"marko", "29", "Beijing"};

        List<Vertex> vertices = vertexBuilder.build(names, values);
        Assert.assertEquals(1, vertices.size());
        Vertex vertex = vertices.get(0);
        Assert.assertEquals("marko", vertex.id());
        Assert.assertEquals("person", vertex.label());
        Map<String, Object> properties = vertex.properties();
        for (int i = 0; i < names.length; i++) {
            String name = names[i];
            Assert.assertTrue(properties.containsKey(name));
            Assert.assertEquals(values[i], String.valueOf(properties.get(name)));
        }
    }

    @Test
    public void testPrimaryIdFields() {
        HGLoadContext context = getPrimaryIdVertexContext();
        VertexMapping vertexMapping = new VertexMapping("name");
        vertexMapping.label("software");
        Assert.assertThrows(IllegalStateException.class, () -> {
            new VertexBuilder(context, vertexMapping);
        });
    }

    @Test
    public void testPrimaryWithNullIdField() {
        HGLoadContext context = getPrimaryIdVertexContext();
        VertexMapping vertexMapping = new VertexMapping(null);
        vertexMapping.label("software");
        VertexBuilder vertexBuilder = new VertexBuilder(context, vertexMapping);
        VertexLabel vertexLabel = (VertexLabel) vertexBuilder.schemaLabel();
        Assert.assertTrue(vertexLabel.idStrategy().isPrimaryKey());
        Assert.assertEquals("vertex-mapping(label=software)",
                            vertexBuilder.mapping().toString());
    }

    @NotNull
    private static HGLoadContext getPrimaryIdVertexContext() {
        Map<String, String> configs = new HashMap<>();
        configs.put("host", HGEnvUtils.HOST);
        configs.put("port", HGEnvUtils.PORT);
        configs.put("graph", HGEnvUtils.GRAPH);
        configs.put("protocol", HGEnvUtils.PROTOCOL);
        configs.put("username", "admin");
        configs.put("token", "pa");
        configs.put("data-type", "vertex");
        configs.put("label", "software");
        configs.putAll(HGEnvUtils.tlsOptions());
        HGOptions options = new HGOptions(configs);
        HGLoadContext context = new HGLoadContext(options);
        context.updateSchemaCache();
        return context;
    }

    @Test
    public void testPrimaryBuildVertex() {
        HGLoadContext context = getCustomizeIdVertexContext();

        VertexMapping vertexMapping = new VertexMapping(null);
        vertexMapping.label("software");
        VertexBuilder vertexBuilder = new VertexBuilder(context, vertexMapping);

        String[] names = {"name", "lang", "price"};
        Object[] values = {"lop", "java", "328.0"};
        List<Vertex> vertices = vertexBuilder.build(names, values);
        Assert.assertEquals(1, vertices.size());
        Vertex vertex = vertices.get(0);
        Assert.assertNull(vertex.id());
        Assert.assertEquals("software", vertex.label());
        Map<String, Object> properties = vertex.properties();
        for (int i = 0; i < names.length; i++) {
            String name = names[i];
            Assert.assertTrue(properties.containsKey(name));
            Assert.assertEquals(values[i], String.valueOf(properties.get(name)));
        }
    }

    @AfterClass
    public static void tearDown() {
        HGEnvUtils.destroyEnv();
    }
}
