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

package org.apache.hugegraph.test.functional;

import java.util.Map;

import org.apache.hugegraph.formatter.Formatter;
import org.apache.hugegraph.formatter.JsonFormatter;
import org.apache.hugegraph.structure.JsonGraph;
import org.apache.hugegraph.structure.graph.Edge;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.testutil.Assert;
import org.apache.hugegraph.util.JsonUtil;
import org.junit.Test;

import com.google.common.collect.ImmutableSet;

public class JsonGraphTest {

    @Test
    public void testEdgeIsAttachedToBothEndpoints() {
        JsonGraph graph = new JsonGraph();
        graph.put(vertex("person", "1:marko", "marko"));
        graph.put(vertex("software", "2:lop", "lop"));
        graph.put(edge("1:marko", "person", "2:lop", "software"));

        Assert.assertEquals(ImmutableSet.of("person", "software"), graph.tables());
        JsonGraph.JsonVertex marko = graph.table("person").get("1:marko");
        JsonGraph.JsonVertex lop = graph.table("software").get("2:lop");
        Assert.assertEquals(1, marko.getEdges().size());
        Assert.assertEquals(marko.getEdges(), lop.getEdges());

        JsonGraph.JsonEdge edge = marko.getEdges().iterator().next();
        Assert.assertEquals("created", edge.getLabel());
        Assert.assertEquals("1:marko", edge.getSource());
        Assert.assertEquals("2:lop", edge.getTarget());
        Assert.assertEquals(0.4D, edge.properties().get("weight"));
        Assert.assertEquals("marko", marko.properties().get("name"));
    }

    @Test
    public void testEdgeWithMissingEndpointIsDropped() {
        JsonGraph graph = new JsonGraph();
        graph.put(vertex("person", "1:marko", "marko"));

        // Target vertex doesn't exist
        graph.put(edge("1:marko", "person", "2:lop", "software"));
        // Source vertex doesn't exist
        graph.put(edge("1:josh", "person", "1:marko", "person"));

        Assert.assertTrue(graph.table("person").get("1:marko").getEdges().isEmpty());
        Assert.assertTrue(graph.table("software").isEmpty());
    }

    @Test
    public void testVertexWithSameIdIsReplaced() {
        JsonGraph graph = new JsonGraph();
        graph.put(vertex("person", "1:marko", "marko"));
        graph.put(vertex("person", "1:marko", "marko-v2"));

        Assert.assertEquals(1, graph.table("person").size());
        Assert.assertEquals("marko-v2",
                            graph.table("person").get("1:marko").properties().get("name"));
    }

    @Test
    public void testJsonFormatterKeepsRawProperties() throws Exception {
        JsonGraph graph = new JsonGraph();
        graph.put(vertex("person", "1:marko", "李四"));
        graph.put(vertex("software", "2:lop", "lop"));
        graph.put(edge("1:marko", "person", "2:lop", "software"));

        Formatter formatter = Formatter.loadFormatter("JsonFormatter");
        Assert.assertTrue(formatter instanceof JsonFormatter);
        String json = formatter.dump(graph.table("person").get("1:marko"));

        @SuppressWarnings("unchecked")
        Map<String, Object> dumped = JsonUtil.fromJson(json, Map.class);
        Assert.assertEquals("1:marko", dumped.get("id"));
        Assert.assertEquals("person", dumped.get("label"));
        // Properties are written as a json object rather than a quoted string
        Assert.assertEquals("李四", ((Map<?, ?>) dumped.get("properties")).get("name"));
        Assert.assertEquals(1, ((java.util.List<?>) dumped.get("edges")).size());
    }

    @Test
    public void testLoadInvalidFormatter() {
        Assert.assertThrows(RuntimeException.class, () -> {
            Formatter.loadFormatter("NotExistFormatter");
        }, e -> {
            Assert.assertContains("Can't load formatter: NotExistFormatter",
                                  e.getMessage());
            Assert.assertTrue(e.getCause() instanceof ClassNotFoundException);
        });
        // A class in the formatter package which isn't a formatter
        Assert.assertThrows(RuntimeException.class, () -> {
            Formatter.loadFormatter("kgdumper.SignFS64");
        }, e -> {
            Assert.assertContains("Invalid formatter: kgdumper.SignFS64",
                                  e.getCause().getMessage());
        });
    }

    private static Vertex vertex(String label, String id, String name) {
        Vertex vertex = new Vertex(label);
        vertex.id(id);
        vertex.property("name", name);
        return vertex;
    }

    private static Edge edge(String source, String sourceLabel,
                             String target, String targetLabel) {
        Edge edge = new Edge("created");
        edge.id("S" + source + ">created>>S" + target);
        edge.sourceId(source);
        edge.sourceLabel(sourceLabel);
        edge.targetId(target);
        edge.targetLabel(targetLabel);
        edge.property("weight", 0.4D);
        return edge;
    }
}
