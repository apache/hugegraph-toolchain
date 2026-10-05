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

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.spark.connector.client.HGLoadContext;
import org.apache.hugegraph.spark.connector.mapping.EdgeMapping;
import org.apache.hugegraph.spark.connector.options.HGOptions;
import org.apache.hugegraph.spark.connector.utils.HGEnvUtils;
import org.apache.hugegraph.structure.graph.Edge;
import org.apache.hugegraph.structure.schema.EdgeLabel;
import org.apache.hugegraph.testutil.Assert;
import org.jetbrains.annotations.NotNull;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

public class EdgeBuilderTest {

    private static HugeClient client;

    @BeforeClass
    public static void setUp() {
        HGEnvUtils.createEnv();
        client = HGEnvUtils.getHugeClient();
    }

    @Test
    public void testEdgeIdFields() {
        HGLoadContext context = getEdgeLoadContext();

        EdgeMapping edgeMapping = new EdgeMapping(Collections.singletonList("v1-name"),
                                                  Collections.singletonList("v2-name"));
        edgeMapping.label("created");
        EdgeBuilder edgeBuilder = new EdgeBuilder(context, edgeMapping);

        EdgeLabel edgeLabel = (EdgeLabel) edgeBuilder.schemaLabel();
        Assert.assertEquals("person", edgeLabel.sourceLabel());
        Assert.assertEquals("software", edgeLabel.targetLabel());
        Assert.assertTrue(edgeBuilder.isIdField("v1-name"));
        Assert.assertTrue(edgeBuilder.isIdField("v2-name"));
        Assert.assertEquals("edge-mapping(label=created)",
                            edgeBuilder.mapping().toString());
    }

    @Test
    public void testEdgeBuild() {
        HGLoadContext context = getEdgeLoadContext();

        EdgeMapping edgeMapping = new EdgeMapping(Collections.singletonList("v1-name"),
                                                  Collections.singletonList("name"));
        edgeMapping.label("created");
        EdgeBuilder edgeBuilder = new EdgeBuilder(context, edgeMapping);

        String[] names = {"v1-name", "name", "date", "weight"};
        Object[] values = {"josh", "lop", "2009-11-11", 0.4};

        List<Edge> edges = edgeBuilder.build(names, values);
        Assert.assertEquals(1, edges.size());
        Edge edge = edges.get(0);
        Assert.assertEquals("josh", edge.sourceId());
        Assert.assertEquals("2:lop", edge.targetId());
    }

    @NotNull
    private static HGLoadContext getEdgeLoadContext() {
        Map<String, String> configs = new HashMap<>();
        configs.put("host", HGEnvUtils.HOST);
        configs.put("port", HGEnvUtils.PORT);
        configs.put("graph", HGEnvUtils.GRAPH);
        configs.put("protocol", HGEnvUtils.PROTOCOL);
        configs.put("username", "admin");
        configs.put("token", "pa");
        configs.put("data-type", "edge");
        configs.put("label", "created");
        configs.put("source-name", "v1-name");
        configs.put("target-name", "name");
        configs.putAll(HGEnvUtils.tlsOptions());
        HGOptions options = new HGOptions(configs);
        HGLoadContext context = new HGLoadContext(options);
        context.updateSchemaCache();
        return context;
    }

    @AfterClass
    public static void tearDown() {
        HGEnvUtils.destroyEnv();
    }
}
