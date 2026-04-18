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

import static org.apache.hugegraph.structure.graph.UpdateStrategy.INTERSECTION;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;

import org.apache.hugegraph.driver.SchemaManager;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.structure.GraphElement;
import org.apache.hugegraph.structure.graph.BatchEdgeRequest;
import org.apache.hugegraph.structure.graph.BatchVertexRequest;
import org.apache.hugegraph.structure.graph.Edge;
import org.apache.hugegraph.structure.graph.UpdateStrategy;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.structure.schema.VertexLabel;
import org.apache.hugegraph.testutil.Assert;
import org.apache.hugegraph.testutil.Whitebox;
import org.junit.After;
import org.junit.BeforeClass;
import org.junit.Test;

import com.google.common.collect.ImmutableList;
import com.google.common.collect.ImmutableMap;
import com.google.common.collect.ImmutableSet;

public class BatchUpdateElementApiTest extends BaseApiTest {

    private static final int BATCH_SIZE = 5;

    @BeforeClass
    public static void prepareSchema() {
        SchemaManager schema = schema();
        schema.propertyKey("name").asText().ifNotExist().create();
        schema.propertyKey("price").asInt().ifNotExist().create();
        schema.propertyKey("date").asDate().ifNotExist().create();
        schema.propertyKey("set").asText().valueSet().ifNotExist().create();
        schema.propertyKey("list").asText().valueList().ifNotExist().create();

        schema.vertexLabel("object")
              .properties("name", "price", "date", "set", "list")
              .primaryKeys("name")
              .nullableKeys("price", "date", "set", "list")
              .ifNotExist()
              .create();

        schema.edgeLabel("updates")
              .sourceLabel("object")
              .targetLabel("object")
              .properties("name", "price", "date", "set", "list")
              .nullableKeys("name", "price", "date", "set", "list")
              .ifNotExist()
              .create();
    }

    @Override
    @After
    public void teardown() {
        vertexAPI.list(-1).results().forEach(v -> vertexAPI.delete(v.id()));
        edgeAPI.list(-1).results().forEach(e -> edgeAPI.delete(e.id()));
    }

    /* Vertex Test */
    @Test
    public void testVertexBatchUpdateStrategySum() {
        BatchVertexRequest req = batchVertexRequest("price", 1, -1,
                                                    UpdateStrategy.SUM);
        List<Vertex> vertices = vertexAPI.update(req);
        assertBatchResponse(vertices, "price", 0);

        req = batchVertexRequest("price", 2, 3, UpdateStrategy.SUM);
        vertices = vertexAPI.update(req);
        assertBatchResponse(vertices, "price", 5);
    }

    @Test
    public void testVertexBatchUpdateStrategyBigger() {
        // TODO: Add date comparison after fixing the date serialization bug
        BatchVertexRequest req = batchVertexRequest("price", -3, 1,
                                                    UpdateStrategy.BIGGER);

        List<Vertex> vertices = vertexAPI.update(req);
        assertBatchResponse(vertices, "price", 1);

        req = batchVertexRequest("price", 7, 3, UpdateStrategy.BIGGER);
        vertices = vertexAPI.update(req);
        assertBatchResponse(vertices, "price", 7);
    }

    @Test
    public void testVertexBatchUpdateStrategySmaller() {
        BatchVertexRequest req = batchVertexRequest("price", -3, 1,
                                                    UpdateStrategy.SMALLER);

        List<Vertex> vertices = vertexAPI.update(req);
        assertBatchResponse(vertices, "price", -3);

        req = batchVertexRequest("price", 7, 3, UpdateStrategy.SMALLER);
        vertices = vertexAPI.update(req);
        assertBatchResponse(vertices, "price", 3);
    }

    @Test
    public void testVertexBatchUpdateStrategyUnion() {
        BatchVertexRequest req = batchVertexRequest("set", "old", "new",
                                                    UpdateStrategy.UNION);

        List<Vertex> vertices = vertexAPI.update(req);
        assertBatchResponse(vertices, "set", "new", "old");

        req = batchVertexRequest("set", "old", "old", UpdateStrategy.UNION);
        vertices = vertexAPI.update(req);
        assertBatchResponse(vertices, "set", "old");
    }

    @Test
    public void testVertexBatchUpdateStrategyIntersection() {
        BatchVertexRequest req = batchVertexRequest("set", "old", "new",
                                                    INTERSECTION);

        List<Vertex> vertices = vertexAPI.update(req);
        assertBatchResponse(vertices, "set");

        req = batchVertexRequest("set", "old", "old", INTERSECTION);
        vertices = vertexAPI.update(req);
        assertBatchResponse(vertices, "set", "old");
    }

    @Test
    public void testVertexBatchUpdateStrategyAppend() {
        BatchVertexRequest req = batchVertexRequest("list", "old", "old",
                                                    UpdateStrategy.APPEND);

        List<Vertex> vertices = vertexAPI.update(req);
        assertBatchResponse(vertices, "list", "old", "old");

        req = batchVertexRequest("list", "old", "new", UpdateStrategy.APPEND);
        vertices = vertexAPI.update(req);
        assertBatchResponse(vertices, "list", "old", "new");
    }

    @Test
    public void testVertexBatchUpdateStrategyEliminate() {
        BatchVertexRequest req = batchVertexRequest("list", "old", "old",
                                                    UpdateStrategy.ELIMINATE);

        List<Vertex> vertices = vertexAPI.update(req);
        assertBatchResponse(vertices, "list");

        req = batchVertexRequest("list", "old", "x", UpdateStrategy.ELIMINATE);
        vertices = vertexAPI.update(req);
        assertBatchResponse(vertices, "list", "old");
    }

    @Test
    public void testVertexBatchUpdateStrategyOverride() {
        BatchVertexRequest req = batchVertexRequest("price", -1, 1,
                                                    UpdateStrategy.OVERRIDE);
        assertBatchResponse(vertexAPI.update(req), "price", 1);

        // Construct a specialized test case
        graph().addVertices(this.createNVertexBatch("object", -1, 2));
        List<String> list = ImmutableList.of("newStr1", "newStr2");

        Vertex v1 = new Vertex("object");
        v1.property("name", "tom");
        v1.property("price", 1);
        v1.property("list", list);

        Vertex v2 = new Vertex("object");
        v2.property("name", "tom");

        Map<String, UpdateStrategy> strategies;
        strategies = ImmutableMap.of("price", UpdateStrategy.OVERRIDE,
                                     "list", UpdateStrategy.OVERRIDE);
        req = BatchVertexRequest.createBuilder()
                                .vertices(ImmutableList.of(v1, v2))
                                .updatingStrategies(strategies)
                                .createIfNotExist(true)
                                .build();

        List<Vertex> vertices = vertexAPI.update(req);
        Assert.assertEquals(1, vertices.size());
        Map<String, Object> expectProperties = ImmutableMap.of("name", "tom",
                                                               "price", 1,
                                                               "list", list);
        Assert.assertEquals(vertices.get(0).properties(), expectProperties);
    }

    @Test
    public void testVertexBatchUpdateWithNullValues() {
        BatchVertexRequest req = batchVertexRequest("price", 1, null,
                                                    UpdateStrategy.OVERRIDE);
        List<Vertex> vertices = vertexAPI.update(req);
        assertBatchResponse(vertices, "price", 1);
    }

    @Test
    public void testVertexBatchUpdateWithInvalidArgs() {
        BatchVertexRequest req1 = batchVertexRequest("set", "old", "old",
                                                     UpdateStrategy.UNION);

        Assert.assertThrows(ServerException.class, () -> {
            List<Vertex> vertices = Whitebox.getInternalState(req1, "vertices");
            vertices.set(1, null);
            Whitebox.setInternalState(req1, "vertices", vertices);
            vertexAPI.update(req1);
        }, e -> {
            Assert.assertContains("The batch body can't contain null record",
                                  e.toString());
        });

        BatchVertexRequest req2 = batchVertexRequest("list", "old", "old",
                                                     UpdateStrategy.ELIMINATE);
        Assert.assertThrows(ServerException.class, () -> {
            Whitebox.setInternalState(req2, "vertices", null);
            vertexAPI.update(req2);
        }, e -> {
            String expect = "Parameter 'vertices' can't be null";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchVertexRequest req3 = batchVertexRequest("list", "old", "old",
                                                     UpdateStrategy.ELIMINATE);
        Assert.assertThrows(ServerException.class, () -> {
            Whitebox.setInternalState(req3, "vertices", ImmutableList.of());
            vertexAPI.update(req3);
        }, e -> {
            String expect = "The number of vertices can't be 0";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchVertexRequest req4 = batchVertexRequest("list", "old", "old",
                                                     UpdateStrategy.ELIMINATE);
        Assert.assertThrows(ServerException.class, () -> {
            Whitebox.setInternalState(req4, "createIfNotExist", false);
            vertexAPI.update(req4);
        }, e -> {
            String expect = "Parameter 'create_if_not_exist' " +
                            "dose not support false now";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchVertexRequest req5 = batchVertexRequest("list", "old", "old",
                                                     UpdateStrategy.ELIMINATE);
        Assert.assertThrows(ServerException.class, () -> {
            Whitebox.setInternalState(req5, "updateStrategies", null);
            vertexAPI.update(req5);
        }, e -> {
            String expect = "Parameter 'update_strategies' can't be empty";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchVertexRequest req6 = batchVertexRequest("list", "old", "old",
                                                     UpdateStrategy.ELIMINATE);
        Assert.assertThrows(ServerException.class, () -> {
            Whitebox.setInternalState(req6, "updateStrategies",
                                      ImmutableMap.of());
            vertexAPI.update(req6);
        }, e -> {
            String expect = "Parameter 'update_strategies' can't be empty";
            Assert.assertContains(expect, e.getMessage());
        });
    }

    @Test
    public void testVertexInvalidUpdateStrategy() {
        BatchVertexRequest req1 = batchVertexRequest("name", "old", "new",
                                                     UpdateStrategy.SUM);
        Assert.assertThrows(ServerException.class, () -> {
            vertexAPI.update(req1);
        }, e -> {
            String expect = "Property type must be Number for strategy SUM, " +
                            "but got type String, String";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchVertexRequest req2 = batchVertexRequest("name", "old", "new",
                                                     UpdateStrategy.BIGGER);
        Assert.assertThrows(ServerException.class, () -> {
            vertexAPI.update(req2);
        }, e -> {
            String expect = "Property type must be Date or Number " +
                            "for strategy BIGGER, but got type String, String";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchVertexRequest req3 = batchVertexRequest("name", "old", "new",
                                                     UpdateStrategy.SMALLER);
        Assert.assertThrows(ServerException.class, () -> {
            vertexAPI.update(req3);
        }, e -> {
            String expect = "Property type must be Date or Number " +
                            "for strategy SMALLER, but got type String, String";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchVertexRequest req4 = batchVertexRequest("price", 1, -1,
                                                     UpdateStrategy.UNION);
        Assert.assertThrows(ServerException.class, () -> {
            vertexAPI.update(req4);
        }, e -> {
            String expect = "Property type must be Set or List " +
                            "for strategy UNION, but got type Integer, Integer";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchVertexRequest req5 = batchVertexRequest("date", "old", "new",
                                                     INTERSECTION);
        Assert.assertThrows(ServerException.class, () -> {
            vertexAPI.update(req5);
        }, e -> {
            String expect = "Property type must be Set or List for " +
                            "strategy INTERSECTION, but got type Date, String";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchVertexRequest req6 = batchVertexRequest("price", 1, -1,
                                                     UpdateStrategy.APPEND);
        Assert.assertThrows(ServerException.class, () -> {
            vertexAPI.update(req6);
        }, e -> {
            String expect = "Property type must be Set or List for " +
                            "strategy APPEND, but got type Integer, Integer";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchVertexRequest req7 = batchVertexRequest("name", "old", "new",
                                                     UpdateStrategy.ELIMINATE);
        Assert.assertThrows(ServerException.class, () -> {
            vertexAPI.update(req7);
        }, e -> {
            String expect = "Property type must be Set or List for " +
                            "strategy ELIMINATE, but got type String, String";
            Assert.assertContains(expect, e.getMessage());
        });
    }

    /* Edge Test */
    @Test
    public void testEdgeBatchUpdateStrategySum() {
        BatchEdgeRequest req = batchEdgeRequest("price", -1, 1,
                                                UpdateStrategy.SUM);
        List<Edge> edges = edgeAPI.update(req);
        assertBatchResponse(edges, "price", 0);

        req = batchEdgeRequest("price", 2, 3, UpdateStrategy.SUM);
        edges = edgeAPI.update(req);
        assertBatchResponse(edges, "price", 5);
    }

    @Test
    public void testEdgeBatchUpdateStrategyBigger() {
        // TODO: Add date comparison after fixing the date serialization bug
        BatchEdgeRequest req = batchEdgeRequest("price", -3, 1,
                                                UpdateStrategy.BIGGER);
        List<Edge> edges = edgeAPI.update(req);
        assertBatchResponse(edges, "price", 1);

        req = batchEdgeRequest("price", 7, 3, UpdateStrategy.BIGGER);
        edges = edgeAPI.update(req);
        assertBatchResponse(edges, "price", 7);
    }

    @Test
    public void testEdgeBatchUpdateStrategySmaller() {
        BatchEdgeRequest req = batchEdgeRequest("price", -3, 1,
                                                UpdateStrategy.SMALLER);
        List<Edge> edges = edgeAPI.update(req);
        assertBatchResponse(edges, "price", -3);

        req = batchEdgeRequest("price", 7, 3, UpdateStrategy.SMALLER);
        edges = edgeAPI.update(req);
        assertBatchResponse(edges, "price", 3);
    }

    @Test
    public void testEdgeBatchUpdateStrategyUnion() {
        BatchEdgeRequest req = batchEdgeRequest("set", "old", "new",
                                                UpdateStrategy.UNION);
        List<Edge> edges = edgeAPI.update(req);
        assertBatchResponse(edges, "set", "new", "old");

        req = batchEdgeRequest("set", "old", "old", UpdateStrategy.UNION);
        edges = edgeAPI.update(req);
        assertBatchResponse(edges, "set", "old");
    }

    @Test
    public void testEdgeBatchUpdateStrategyIntersection() {
        BatchEdgeRequest req = batchEdgeRequest("set", "old", "new",
                                                INTERSECTION);
        List<Edge> edges = edgeAPI.update(req);
        assertBatchResponse(edges, "set");

        req = batchEdgeRequest("set", "old", "old", INTERSECTION);
        edges = edgeAPI.update(req);
        assertBatchResponse(edges, "set", "old");
    }

    @Test
    public void testEdgeBatchUpdateStrategyAppend() {
        BatchEdgeRequest req = batchEdgeRequest("list", "old", "old",
                                                UpdateStrategy.APPEND);
        List<Edge> edges = edgeAPI.update(req);
        assertBatchResponse(edges, "list", "old", "old");

        req = batchEdgeRequest("list", "old", "new", UpdateStrategy.APPEND);
        edges = edgeAPI.update(req);
        assertBatchResponse(edges, "list", "old", "new");
    }

    @Test
    public void testEdgeBatchUpdateStrategyEliminate() {
        BatchEdgeRequest req = batchEdgeRequest("list", "old", "old",
                                                UpdateStrategy.ELIMINATE);
        List<Edge> edges = edgeAPI.update(req);
        assertBatchResponse(edges, "list");

        req = batchEdgeRequest("list", "old", "new", UpdateStrategy.ELIMINATE);
        edges = edgeAPI.update(req);
        assertBatchResponse(edges, "list", "old");
    }

    @Test
    public void testEdgeBatchUpdateStrategyOverride() {
        BatchEdgeRequest req = batchEdgeRequest("price", -1, 1,
                                                UpdateStrategy.OVERRIDE);
        assertBatchResponse(edgeAPI.update(req), "price", 1);

        // Construct a specialized test case
        graph().addEdges(this.createNEdgesBatch("object", "updates", -1, 2));
        List<String> list = ImmutableList.of("newStr1", "newStr2");
        String vid = "1:a";

        Edge e1 = new Edge("updates");
        e1.sourceLabel("object");
        e1.targetLabel("object");
        e1.sourceId(vid);
        e1.targetId(vid);
        e1.property("name", "tom");
        e1.property("price", 1);
        e1.property("list", list);

        Edge e2 = new Edge("updates");
        e2.sourceLabel("object");
        e2.targetLabel("object");
        e2.sourceId(vid);
        e2.targetId(vid);
        e2.property("name", "tom");

        Map<String, UpdateStrategy> strategies;
        strategies = ImmutableMap.of("price", UpdateStrategy.OVERRIDE,
                                     "list", UpdateStrategy.OVERRIDE);
        req = BatchEdgeRequest.createBuilder()
                              .edges(ImmutableList.of(e1, e2))
                              .updatingStrategies(strategies)
                              .checkVertex(false)
                              .createIfNotExist(true)
                              .build();

        List<Edge> edges = edgeAPI.update(req);
        Assert.assertEquals(1, edges.size());
        Map<String, Object> expectProperties = ImmutableMap.of("name", "tom",
                                                               "price", 1,
                                                               "list", list);
        Assert.assertEquals(edges.get(0).properties(), expectProperties);
    }

    @Test
    public void testEdgeBatchUpdateWithNullValues() {
        BatchEdgeRequest req = batchEdgeRequest("price", 1, null,
                                                UpdateStrategy.OVERRIDE);

        List<Edge> edges = edgeAPI.update(req);
        assertBatchResponse(edges, "price", 1);
    }

    @Test
    public void testEdgeBatchUpdateWithInvalidArgs() {
        BatchEdgeRequest req1 = batchEdgeRequest("list", "old", "old",
                                                 UpdateStrategy.ELIMINATE);
        Assert.assertThrows(ServerException.class, () -> {
            List<Edge> edges = Whitebox.getInternalState(req1, "edges");
            edges.set(1, null);
            Whitebox.setInternalState(req1, "edges", edges);
            edgeAPI.update(req1);
        }, e -> {
            String expect = "The batch body can't contain null record";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchEdgeRequest req2 = batchEdgeRequest("list", "old", "old",
                                                 UpdateStrategy.ELIMINATE);
        Assert.assertThrows(ServerException.class, () -> {
            Whitebox.setInternalState(req2, "edges", null);
            edgeAPI.update(req2);
        }, e -> {
            String expect = "Parameter 'edges' can't be null";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchEdgeRequest req3 = batchEdgeRequest("list", "old", "old",
                                                 UpdateStrategy.ELIMINATE);
        Assert.assertThrows(ServerException.class, () -> {
            Whitebox.setInternalState(req3, "edges", ImmutableList.of());
            edgeAPI.update(req3);
        }, e -> {
            String expect = "The number of edges can't be 0";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchEdgeRequest req4 = batchEdgeRequest("list", "old", "old",
                                                 UpdateStrategy.ELIMINATE);
        Assert.assertThrows(ServerException.class, () -> {
            Whitebox.setInternalState(req4, "createIfNotExist", false);
            edgeAPI.update(req4);
        }, e -> {
            String expect = "Parameter 'create_if_not_exist' " +
                            "dose not support false now";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchEdgeRequest req5 = batchEdgeRequest("list", "old", "old",
                                                 UpdateStrategy.ELIMINATE);
        Assert.assertThrows(ServerException.class, () -> {
            Whitebox.setInternalState(req5, "updateStrategies", null);
            edgeAPI.update(req5);
        }, e -> {
            String expect = "Parameter 'update_strategies' can't be empty";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchEdgeRequest req6 = batchEdgeRequest("list", "old", "old",
                                                 UpdateStrategy.ELIMINATE);
        Assert.assertThrows(ServerException.class, () -> {
            Whitebox.setInternalState(req6, "updateStrategies",
                                      ImmutableMap.of());
            edgeAPI.update(req6);
        }, e -> {
            String expect = "Parameter 'update_strategies' can't be empty";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchEdgeRequest req7 = batchEdgeRequest("list", "old", "old",
                                                 UpdateStrategy.ELIMINATE);
        Assert.assertThrows(ServerException.class, () -> {
            List<Edge> edges = this.createNEdgesBatch("object", "updates",
                                                      "old", 501);
            Whitebox.setInternalState(req7, "edges", edges);
            edgeAPI.update(req7);
        }, e -> {
            String expect = "Too many edges for one time post";
            Assert.assertContains(expect, e.getMessage());
        });
    }

    @Test
    public void testEdgeInvalidUpdateStrategy() {
        BatchEdgeRequest req1 = batchEdgeRequest("name", "old", "new",
                                                 UpdateStrategy.SUM);
        Assert.assertThrows(ServerException.class, () -> {
            edgeAPI.update(req1);
        }, e -> {
            String expect = "Property type must be Number for strategy SUM, " +
                            "but got type String, String";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchEdgeRequest req2 = batchEdgeRequest("name", "old", "new",
                                                 UpdateStrategy.BIGGER);
        Assert.assertThrows(ServerException.class, () -> {
            edgeAPI.update(req2);
        }, e -> {
            String expect = "Property type must be Date or Number " +
                            "for strategy BIGGER, but got type String, String";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchEdgeRequest req3 = batchEdgeRequest("name", "old", "new",
                                                 UpdateStrategy.SMALLER);
        Assert.assertThrows(ServerException.class, () -> {
            edgeAPI.update(req3);
        }, e -> {
            String expect = "Property type must be Date or Number " +
                            "for strategy SMALLER, but got type String, String";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchEdgeRequest req4 = batchEdgeRequest("price", 1, -1,
                                                 UpdateStrategy.UNION);
        Assert.assertThrows(ServerException.class, () -> {
            edgeAPI.update(req4);
        }, e -> {
            String expect = "Property type must be Set or List " +
                            "for strategy UNION, but got type Integer, Integer";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchEdgeRequest req5 = batchEdgeRequest("date", "old", "new",
                                                 INTERSECTION);
        Assert.assertThrows(ServerException.class, () -> {
            edgeAPI.update(req5);
        }, e -> {
            String expect = "Property type must be Set or List for " +
                            "strategy INTERSECTION, but got type Date, String";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchEdgeRequest req6 = batchEdgeRequest("price", 1, -1,
                                                 UpdateStrategy.APPEND);
        Assert.assertThrows(ServerException.class, () -> {
            edgeAPI.update(req6);
        }, e -> {
            String expect = "Property type must be Set or List for " +
                            "strategy APPEND, but got type Integer, Integer";
            Assert.assertContains(expect, e.getMessage());
        });

        BatchEdgeRequest req7 = batchEdgeRequest("name", "old", "new",
                                                 UpdateStrategy.ELIMINATE);
        Assert.assertThrows(ServerException.class, () -> {
            edgeAPI.update(req7);
        }, e -> {
            String expect = "Property type must be Set or List for " +
                            "strategy ELIMINATE, but got type String, String";
            Assert.assertContains(expect, e.getMessage());
        });
    }

    private BatchVertexRequest batchVertexRequest(String key, Object oldData,
                                                  Object newData,
                                                  UpdateStrategy strategy) {
        // Init old & new vertices
        graph().addVertices(this.createNVertexBatch("object", oldData,
                                                    BATCH_SIZE));
        List<Vertex> vertices = this.createNVertexBatch("object", newData,
                                                        BATCH_SIZE);

        Map<String, UpdateStrategy> strategies = ImmutableMap.of(key, strategy);
        BatchVertexRequest req;
        req = new BatchVertexRequest.Builder().vertices(vertices)
                                              .updatingStrategies(strategies)
                                              .createIfNotExist(true)
                                              .build();
        return req;
    }

    private BatchEdgeRequest batchEdgeRequest(String key, Object oldData,
                                              Object newData,
                                              UpdateStrategy strategy) {
        // Init old vertices & edges
        graph().addVertices(this.createNVertexBatch("object", oldData,
                                                    BATCH_SIZE * 2));
        graph().addEdges(this.createNEdgesBatch("object", "updates",
                                                oldData, BATCH_SIZE));
        List<Edge> edges = this.createNEdgesBatch("object", "updates",
                                                  newData, BATCH_SIZE);

        Map<String, UpdateStrategy> strategies = ImmutableMap.of(key, strategy);
        BatchEdgeRequest req;
        req = new BatchEdgeRequest.Builder().edges(edges)
                                            .updatingStrategies(strategies)
                                            .checkVertex(false)
                                            .createIfNotExist(true)
                                            .build();
        return req;
    }

    private List<Vertex> createNVertexBatch(String vertexLabel,
                                            Object symbol, int num) {
        List<Vertex> vertices = new ArrayList<>(num);
        for (int i = 1; i <= num; i++) {
            Vertex vertex = new Vertex(vertexLabel);
            vertex.property("name", String.valueOf(i));
            if (symbol instanceof Number) {
                vertex.property("price", (int) symbol * i);
            }
            vertex.property("date", new Date(System.currentTimeMillis() + i));
            vertex.property("set", ImmutableSet.of(String.valueOf(symbol) + i));
            vertex.property("list",
                            ImmutableList.of(String.valueOf(symbol) + i));
            vertices.add(vertex);
        }
        return vertices;
    }

    private List<Edge> createNEdgesBatch(String vertexLabel, String edgeLabel,
                                         Object symbol, int num) {
        VertexLabel vLabel = schema().getVertexLabel(vertexLabel);

        List<Edge> edges = new ArrayList<>(num);
        for (int i = 1; i <= num; i++) {
            Edge edge = new Edge(edgeLabel);
            edge.sourceLabel(vertexLabel);
            edge.targetLabel(vertexLabel);
            edge.sourceId(vLabel.id() + ":" + i);
            edge.targetId(vLabel.id() + ":" + i * 2);
            edge.property("name", String.valueOf(i));
            if (symbol instanceof Number) {
                edge.property("price", (int) symbol * i);
            }
            edge.property("date", new Date(System.currentTimeMillis() + i));
            edge.property("set", ImmutableSet.of(String.valueOf(symbol) + i));
            edge.property("list", ImmutableList.of(String.valueOf(symbol) + i));
            edges.add(edge);
        }
        return edges;
    }

    private static void assertBatchResponse(List<? extends GraphElement> list,
                                            String property, int result) {
        Assert.assertEquals(BATCH_SIZE, list.size());
        list.forEach(element -> {
            String index = String.valueOf(element.property("name"));
            Object value = element.property(property);
            Assert.assertTrue(value instanceof Number);
            Assert.assertEquals(result * Integer.parseInt(index), value);
        });
    }

    private static void assertBatchResponse(List<? extends GraphElement> list,
                                            String property, String... data) {
        Assert.assertEquals(BATCH_SIZE, list.size());
        list.forEach(element -> {
            String index = String.valueOf(element.property("name"));
            Object value = element.property(property);
            Assert.assertTrue(value instanceof List);
            if (data.length == 0) {
                Assert.assertTrue(((List<?>) value).isEmpty());
            } else if (data.length == 1) {
                Assert.assertEquals(ImmutableList.of(data[0] + index), value);
            } else {
                Assert.assertEquals(ImmutableList.of(data[0] + index,
                                                     data[1] + index), value);
            }
        });
    }
}
