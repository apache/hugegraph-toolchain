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

package org.apache.hugegraph.api;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.apache.commons.io.FileUtils;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.SchemaManager;
import org.apache.hugegraph.rest.ClientException;
import org.apache.hugegraph.structure.graph.Edge;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.structure.gremlin.ResultSet;
import org.apache.hugegraph.testutil.Assert;
import org.junit.After;
import org.junit.Test;

import com.google.common.collect.ImmutableSet;

public class GraphsApiTest extends BaseApiTest {

    private static final String GRAPH2 = "hugegraph2";
    private static final String CONFIG2_PATH = "src/test/resources/hugegraph-create.json";

    private static final String GRAPH3 = "hugegraph3";
    private static final String CONFIG3_PATH = "src/test/resources/hugegraph-clone.json";

    protected static void initPropertyKey(HugeClient client) {
        SchemaManager schema = client.schema();
        schema.propertyKey("name").asText().ifNotExist().create();
        schema.propertyKey("age").asInt().ifNotExist().create();
        schema.propertyKey("city").asText().ifNotExist().create();
        schema.propertyKey("lang").asText().ifNotExist().create();
        schema.propertyKey("date").asDate().ifNotExist().create();
        schema.propertyKey("price").asInt().ifNotExist().create();
        schema.propertyKey("weight").asDouble().ifNotExist().create();
    }

    protected static void initVertexLabel(HugeClient client) {
        SchemaManager schema = client.schema();

        schema.vertexLabel("person")
              .properties("name", "age", "city")
              .primaryKeys("name")
              .nullableKeys("city")
              .ifNotExist()
              .create();

        schema.vertexLabel("software")
              .properties("name", "lang", "price")
              .primaryKeys("name")
              .nullableKeys("price")
              .ifNotExist()
              .create();

        schema.vertexLabel("book")
              .useCustomizeStringId()
              .properties("name", "price")
              .nullableKeys("price")
              .ifNotExist()
              .create();
    }

    protected static void initEdgeLabel(HugeClient client) {
        SchemaManager schema = client.schema();

        schema.edgeLabel("knows")
              .sourceLabel("person")
              .targetLabel("person")
              .multiTimes()
              .properties("date", "city")
              .sortKeys("date")
              .nullableKeys("city")
              .ifNotExist()
              .create();

        schema.edgeLabel("created")
              .sourceLabel("person")
              .targetLabel("software")
              .properties("date", "city")
              .nullableKeys("city")
              .ifNotExist()
              .create();
    }

    @Override
    @After
    public void teardown() {
        for (String g : ImmutableSet.of(GRAPH2, GRAPH3)) {
            try {
                graphsAPI.get(g);
            } catch (Exception ognored) {
                continue;
            }
            graphsAPI.drop(g, "I'm sure to drop the graph");
        }
    }

    @Test
    public void testCreateAndDropGraph() {
        int initialGraphNumber = graphsAPI.list().size();

        // Create new graph dynamically
        String config;
        try {
            config = FileUtils.readFileToString(new File(CONFIG2_PATH),
                                                StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new ClientException("Failed to read config file: %s",
                                      CONFIG2_PATH);
        }
        Map<String, String> result = graphsAPI.create(GRAPH2, null, config);
        Assert.assertEquals(GRAPH2, result.get("name"));
        Assert.assertEquals("rocksdb", result.get("backend"));

        Assert.assertEquals(initialGraphNumber + 1, graphsAPI.list().size());

        HugeClient client = new HugeClient(baseClient(), GRAPHSPACE, GRAPH2);
        // Insert graph schema and data
        initPropertyKey(client);
        initVertexLabel(client);
        initEdgeLabel(client);

        List<Vertex> vertices = new ArrayList<>(100);
        for (int i = 0; i < 100; i++) {
            Vertex vertex = new Vertex("person").property("name", "person" + i)
                                                .property("city", "Beijing")
                                                .property("age", 19);
            vertices.add(vertex);
        }
        vertices = client.graph().addVertices(vertices);

        List<Edge> edges = new ArrayList<>(100);
        for (int i = 0; i < 100; i++) {
            Edge edge = new Edge("knows").source(vertices.get(i))
                                         .target(vertices.get((i + 1) % 100))
                                         .property("date", "2016-01-10");
            edges.add(edge);
        }
        client.graph().addEdges(edges, false);

        // Query vertices and edges count from new created graph
        ResultSet resultSet = client.gremlin().gremlin("g.V().count()")
                                    .execute();
        Assert.assertEquals(100, resultSet.iterator().next().getInt());

        resultSet = client.gremlin().gremlin("g.E().count()").execute();
        Assert.assertEquals(100, resultSet.iterator().next().getInt());

        // Clear graph schema and data from new created graph
        graphsAPI.clear(GRAPH2, "I'm sure to delete all data");

        resultSet = client.gremlin().gremlin("g.V().count()").execute();
        Assert.assertEquals(0, resultSet.iterator().next().getInt());

        resultSet = client.gremlin().gremlin("g.E().count()").execute();
        Assert.assertEquals(0, resultSet.iterator().next().getInt());

        Assert.assertTrue(client.schema().getPropertyKeys().isEmpty());

        Assert.assertEquals(initialGraphNumber + 1, graphsAPI.list().size());

        // Remove new created graph dynamically
        graphsAPI.drop(GRAPH2, "I'm sure to drop the graph");

        Assert.assertEquals(initialGraphNumber, graphsAPI.list().size());
    }

    @Test
    public void testCloneAndDropGraph() {
        int initialGraphNumber = graphsAPI.list().size();

        // Clone a new graph from exist a graph dynamically
        String config;
        try {
            config = FileUtils.readFileToString(new File(CONFIG3_PATH),
                                                StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new ClientException("Failed to read config file: %s",
                                      CONFIG3_PATH);
        }
        Map<String, String> result = graphsAPI.create(GRAPH3, "hugegraph",
                                                      config);
        Assert.assertEquals(GRAPH3, result.get("name"));
        Assert.assertEquals("rocksdb", result.get("backend"));

        Assert.assertEquals(initialGraphNumber + 1, graphsAPI.list().size());

        HugeClient client = new HugeClient(baseClient(), GRAPHSPACE, GRAPH3);
        // Insert graph schema and data
        initPropertyKey(client);
        initVertexLabel(client);
        initEdgeLabel(client);

        List<Vertex> vertices = new ArrayList<>(100);
        for (int i = 0; i < 100; i++) {
            Vertex vertex = new Vertex("person").property("name", "person" + i)
                                                .property("city", "Beijing")
                                                .property("age", 19);
            vertices.add(vertex);
        }
        vertices = client.graph().addVertices(vertices);

        List<Edge> edges = new ArrayList<>(100);
        for (int i = 0; i < 100; i++) {
            Edge edge = new Edge("knows").source(vertices.get(i))
                                         .target(vertices.get((i + 1) % 100))
                                         .property("date", "2016-01-10");
            edges.add(edge);
        }
        client.graph().addEdges(edges, false);

        // Query vertices and edges count from new created graph
        ResultSet resultSet = client.gremlin().gremlin("g.V().count()")
                                    .execute();
        Assert.assertEquals(100, resultSet.iterator().next().getInt());

        resultSet = client.gremlin().gremlin("g.E().count()").execute();
        Assert.assertEquals(100, resultSet.iterator().next().getInt());

        // Clear graph schema and data from new created graph
        graphsAPI.clear(GRAPH3, "I'm sure to delete all data");

        resultSet = client.gremlin().gremlin("g.V().count()").execute();
        Assert.assertEquals(0, resultSet.iterator().next().getInt());

        resultSet = client.gremlin().gremlin("g.E().count()").execute();
        Assert.assertEquals(0, resultSet.iterator().next().getInt());

        Assert.assertTrue(client.schema().getPropertyKeys().isEmpty());

        Assert.assertEquals(initialGraphNumber + 1, graphsAPI.list().size());

        // Remove new created graph dynamically
        graphsAPI.drop(GRAPH3, "I'm sure to drop the graph");

        Assert.assertEquals(initialGraphNumber, graphsAPI.list().size());
    }

    @Test
    public void testCloneAndDropGraphWithoutConfig() {
        int initialGraphNumber = graphsAPI.list().size();

        // Clone a new graph from exist a graph dynamically
        String config = null;
        Map<String, String> result = graphsAPI.create(GRAPH3, "hugegraph",
                                                      config);
        Assert.assertEquals(GRAPH3, result.get("name"));
        Assert.assertEquals("rocksdb", result.get("backend"));

        Assert.assertEquals(initialGraphNumber + 1, graphsAPI.list().size());

        HugeClient client = new HugeClient(baseClient(), GRAPHSPACE, GRAPH3);
        // Insert graph schema and data
        initPropertyKey(client);
        initVertexLabel(client);
        initEdgeLabel(client);

        List<Vertex> vertices = new ArrayList<>(100);
        for (int i = 0; i < 100; i++) {
            Vertex vertex = new Vertex("person").property("name", "person" + i)
                                                .property("city", "Beijing")
                                                .property("age", 19);
            vertices.add(vertex);
        }
        vertices = client.graph().addVertices(vertices);

        List<Edge> edges = new ArrayList<>(100);
        for (int i = 0; i < 100; i++) {
            Edge edge = new Edge("knows").source(vertices.get(i))
                                         .target(vertices.get((i + 1) % 100))
                                         .property("date", "2016-01-10");
            edges.add(edge);
        }
        client.graph().addEdges(edges, false);

        // Query vertices and edges count from new created graph
        ResultSet resultSet = client.gremlin().gremlin("g.V().count()")
                                    .execute();
        Assert.assertEquals(100, resultSet.iterator().next().getInt());

        resultSet = client.gremlin().gremlin("g.E().count()").execute();
        Assert.assertEquals(100, resultSet.iterator().next().getInt());

        // Clear graph schema and data from new created graph
        graphsAPI.clear(GRAPH3, "I'm sure to delete all data");

        resultSet = client.gremlin().gremlin("g.V().count()").execute();
        Assert.assertEquals(0, resultSet.iterator().next().getInt());

        resultSet = client.gremlin().gremlin("g.E().count()").execute();
        Assert.assertEquals(0, resultSet.iterator().next().getInt());

        Assert.assertTrue(client.schema().getPropertyKeys().isEmpty());

        Assert.assertEquals(initialGraphNumber + 1, graphsAPI.list().size());

        // Remove new created graph dynamically
        graphsAPI.drop(GRAPH3, "I'm sure to drop the graph");

        Assert.assertEquals(initialGraphNumber, graphsAPI.list().size());
    }
}
