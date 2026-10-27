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

package org.apache.hugegraph.api.traverser;

import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.structure.constant.Direction;
import org.apache.hugegraph.structure.constant.T;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.structure.traverser.SameNeighborsBatch;
import org.apache.hugegraph.structure.traverser.SameNeighborsBatchRequest;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Assume;
import org.junit.BeforeClass;
import org.junit.Test;

import com.google.common.collect.ImmutableList;

public class SameNeighborsBatchApiTest extends TraverserApiTest {

    @BeforeClass
    public static void initShortestPathGraph() {
        schema().vertexLabel("node")
                .useCustomizeNumberId()
                .ifNotExist()
                .create();

        schema().edgeLabel("link")
                .sourceLabel("node").targetLabel("node")
                .ifNotExist()
                .create();
        schema().edgeLabel("relateTo")
                .sourceLabel("node").targetLabel("node")
                .ifNotExist()
                .create();

        Vertex v1 = graph().addVertex(T.LABEL, "node", T.ID, 1);
        Vertex v2 = graph().addVertex(T.LABEL, "node", T.ID, 2);
        Vertex v3 = graph().addVertex(T.LABEL, "node", T.ID, 3);
        Vertex v4 = graph().addVertex(T.LABEL, "node", T.ID, 4);
        Vertex v5 = graph().addVertex(T.LABEL, "node", T.ID, 5);
        Vertex v6 = graph().addVertex(T.LABEL, "node", T.ID, 6);
        Vertex v7 = graph().addVertex(T.LABEL, "node", T.ID, 7);
        Vertex v8 = graph().addVertex(T.LABEL, "node", T.ID, 8);
        Vertex v9 = graph().addVertex(T.LABEL, "node", T.ID, 9);
        Vertex v10 = graph().addVertex(T.LABEL, "node", T.ID, 10);

        v1.addEdge("link", v3);
        v2.addEdge("link", v3);
        v4.addEdge("link", v1);
        v4.addEdge("link", v2);

        v1.addEdge("relateTo", v5);
        v2.addEdge("relateTo", v5);
        v6.addEdge("relateTo", v1);
        v6.addEdge("relateTo", v2);

        v1.addEdge("link", v7);
        v8.addEdge("link", v1);
        v2.addEdge("link", v9);
        v10.addEdge("link", v2);

        // Server added /traversers/sameneighborsbatch after 1.7.0, which answers 404, so
        // skip the class there instead of failing every test
        try {
            sameNeighborsBatchAPI.post(SameNeighborsBatchRequest.builder().vertex(1, 2).build());
        } catch (ServerException e) {
            Assume.assumeTrue("Server has no /traversers/sameneighborsbatch endpoint",
                              e.status() != 404);
            throw e;
        }
    }

    @Test
    public void testSameNeighborsBatchBatch() {
        SameNeighborsBatchRequest.Builder builder = SameNeighborsBatchRequest.builder();
        builder.vertex(1, 2);
        builder.vertex(3, 4);
        builder.vertex(7, 9);
        SameNeighborsBatchRequest request = builder.build();
        SameNeighborsBatch neighbors = sameNeighborsBatchAPI.post(request);
        Assert.assertEquals(3, neighbors.sameNeighbors.size());
        Assert.assertEquals(4, neighbors.sameNeighbors.get(0).size());
        Assert.assertEquals(2, neighbors.sameNeighbors.get(1).size());
        Assert.assertEquals(0, neighbors.sameNeighbors.get(2).size());

        Assert.assertTrue(neighbors.sameNeighbors.get(0).containsAll(ImmutableList.of(3, 4, 5, 6)));
        Assert.assertTrue(neighbors.sameNeighbors.get(1).containsAll(ImmutableList.of(1, 2)));
    }

    @Test
    public void testSameNeighborsWithDirection() {
        // OUT
        SameNeighborsBatchRequest.Builder builder = SameNeighborsBatchRequest.builder();
        builder.vertex(1, 2);
        builder.vertex(3, 4);
        builder.vertex(4, 6);
        SameNeighborsBatchRequest request = builder.build();
        builder.direction(Direction.OUT);
        SameNeighborsBatch neighbors = sameNeighborsBatchAPI.post(request);
        Assert.assertEquals(3, neighbors.sameNeighbors.size());
        Assert.assertEquals(2, neighbors.sameNeighbors.get(0).size());
        Assert.assertEquals(0, neighbors.sameNeighbors.get(1).size());
        Assert.assertEquals(2, neighbors.sameNeighbors.get(2).size());

        Assert.assertTrue(neighbors.sameNeighbors.get(0).containsAll(ImmutableList.of(3, 5)));
        Assert.assertTrue(neighbors.sameNeighbors.get(2).containsAll(ImmutableList.of(1, 2)));

        // IN
        builder = SameNeighborsBatchRequest.builder();
        builder.vertex(1, 2);
        builder.vertex(3, 4);
        builder.vertex(5, 9);
        request = builder.build();
        builder.direction(Direction.IN);
        neighbors = sameNeighborsBatchAPI.post(request);
        Assert.assertEquals(3, neighbors.sameNeighbors.size());
        Assert.assertEquals(2, neighbors.sameNeighbors.get(0).size());
        Assert.assertEquals(0, neighbors.sameNeighbors.get(1).size());
        Assert.assertEquals(1, neighbors.sameNeighbors.get(2).size());

        Assert.assertTrue(neighbors.sameNeighbors.get(0).containsAll(ImmutableList.of(4, 6)));
        Assert.assertTrue(neighbors.sameNeighbors.get(2).containsAll(ImmutableList.of(2)));
    }

    @Test
    public void testSameNeighborsWithLabel() {
        SameNeighborsBatchRequest.Builder builder = SameNeighborsBatchRequest.builder();
        builder.vertex(1, 2);
        builder.vertex(3, 4);
        builder.vertex(4, 6);
        SameNeighborsBatchRequest request = builder.build();
        builder.direction(Direction.BOTH);
        builder.label("link");
        SameNeighborsBatch neighbors = sameNeighborsBatchAPI.post(request);
        Assert.assertEquals(3, neighbors.sameNeighbors.size());
        Assert.assertEquals(2, neighbors.sameNeighbors.get(0).size());
        Assert.assertEquals(2, neighbors.sameNeighbors.get(1).size());
        Assert.assertEquals(0, neighbors.sameNeighbors.get(2).size());

        Assert.assertTrue(neighbors.sameNeighbors.get(0).containsAll(ImmutableList.of(3, 4)));
        Assert.assertTrue(neighbors.sameNeighbors.get(1).containsAll(ImmutableList.of(1, 2)));

        builder = SameNeighborsBatchRequest.builder();
        builder.vertex(1, 2);
        builder.vertex(3, 4);
        builder.vertex(4, 8);
        request = builder.build();
        builder.direction(Direction.OUT);
        builder.label("link");
        neighbors = sameNeighborsBatchAPI.post(request);
        Assert.assertEquals(3, neighbors.sameNeighbors.size());
        Assert.assertEquals(1, neighbors.sameNeighbors.get(0).size());
        Assert.assertEquals(0, neighbors.sameNeighbors.get(1).size());
        Assert.assertEquals(1, neighbors.sameNeighbors.get(2).size());

        Assert.assertTrue(neighbors.sameNeighbors.get(0).containsAll(ImmutableList.of(3)));
        Assert.assertTrue(neighbors.sameNeighbors.get(2).containsAll(ImmutableList.of(1)));

        builder = SameNeighborsBatchRequest.builder();
        builder.vertex(1, 2);
        builder.vertex(3, 4);
        builder.vertex(3, 9);
        request = builder.build();
        builder.direction(Direction.IN);
        builder.label("link");
        neighbors = sameNeighborsBatchAPI.post(request);
        Assert.assertEquals(3, neighbors.sameNeighbors.size());
        Assert.assertEquals(1, neighbors.sameNeighbors.get(0).size());
        Assert.assertEquals(0, neighbors.sameNeighbors.get(1).size());
        Assert.assertEquals(1, neighbors.sameNeighbors.get(2).size());

        Assert.assertTrue(neighbors.sameNeighbors.get(0).containsAll(ImmutableList.of(4)));
        Assert.assertTrue(neighbors.sameNeighbors.get(2).containsAll(ImmutableList.of(2)));

        builder = SameNeighborsBatchRequest.builder();
        builder.vertex(1, 2);
        builder.vertex(3, 4);
        builder.vertex(3, 9);
        request = builder.build();
        builder.direction(Direction.IN);
        builder.label("link");
        neighbors = sameNeighborsBatchAPI.post(request);
        Assert.assertEquals(3, neighbors.sameNeighbors.size());
        Assert.assertEquals(1, neighbors.sameNeighbors.get(0).size());
        Assert.assertEquals(0, neighbors.sameNeighbors.get(1).size());
        Assert.assertEquals(1, neighbors.sameNeighbors.get(2).size());

        Assert.assertTrue(neighbors.sameNeighbors.get(0).containsAll(ImmutableList.of(4)));
        Assert.assertTrue(neighbors.sameNeighbors.get(2).containsAll(ImmutableList.of(2)));

        builder = SameNeighborsBatchRequest.builder();
        builder.vertex(1, 2);
        builder.vertex(3, 4);
        builder.vertex(5, 6);
        request = builder.build();
        builder.direction(Direction.BOTH);
        builder.label("relateTo");
        neighbors = sameNeighborsBatchAPI.post(request);
        Assert.assertEquals(3, neighbors.sameNeighbors.size());
        Assert.assertEquals(2, neighbors.sameNeighbors.get(0).size());
        Assert.assertEquals(0, neighbors.sameNeighbors.get(1).size());
        Assert.assertEquals(2, neighbors.sameNeighbors.get(2).size());

        Assert.assertTrue(neighbors.sameNeighbors.get(0).containsAll(ImmutableList.of(5, 6)));
        Assert.assertTrue(neighbors.sameNeighbors.get(2).containsAll(ImmutableList.of(1, 2)));

        builder = SameNeighborsBatchRequest.builder();
        builder.vertex(1, 2);
        builder.vertex(3, 4);
        builder.vertex(5, 6);
        request = builder.build();
        builder.direction(Direction.OUT);
        builder.label("relateTo");
        neighbors = sameNeighborsBatchAPI.post(request);
        Assert.assertEquals(3, neighbors.sameNeighbors.size());
        Assert.assertEquals(1, neighbors.sameNeighbors.get(0).size());
        Assert.assertEquals(0, neighbors.sameNeighbors.get(1).size());
        Assert.assertEquals(0, neighbors.sameNeighbors.get(2).size());

        Assert.assertTrue(neighbors.sameNeighbors.get(0).containsAll(ImmutableList.of(5)));

        builder = SameNeighborsBatchRequest.builder();
        builder.vertex(1, 2);
        builder.vertex(3, 4);
        builder.vertex(5, 6);
        request = builder.build();
        builder.direction(Direction.IN);
        builder.label("relateTo");
        neighbors = sameNeighborsBatchAPI.post(request);
        Assert.assertEquals(3, neighbors.sameNeighbors.size());
        Assert.assertEquals(1, neighbors.sameNeighbors.get(0).size());
        Assert.assertEquals(0, neighbors.sameNeighbors.get(1).size());
        Assert.assertEquals(0, neighbors.sameNeighbors.get(2).size());

        Assert.assertTrue(neighbors.sameNeighbors.get(0).containsAll(ImmutableList.of(6)));
    }

    @Test
    public void testSameNeighborsWithDegree() {
        SameNeighborsBatchRequest.Builder builder = SameNeighborsBatchRequest.builder();
        builder.vertex(1, 2);
        builder.vertex(3, 4);
        builder.vertex(4, 6);
        SameNeighborsBatchRequest request = builder.build();
        builder.direction(Direction.OUT);
        builder.maxDegree(6L);
        SameNeighborsBatch neighbors = sameNeighborsBatchAPI.post(request);
        Assert.assertEquals(3, neighbors.sameNeighbors.size());
        Assert.assertEquals(2, neighbors.sameNeighbors.get(0).size());
        Assert.assertEquals(0, neighbors.sameNeighbors.get(1).size());
        Assert.assertEquals(2, neighbors.sameNeighbors.get(2).size());

        Assert.assertTrue(neighbors.sameNeighbors.get(0).containsAll(ImmutableList.of(3, 5)));
        Assert.assertTrue(neighbors.sameNeighbors.get(2).containsAll(ImmutableList.of(1, 2)));

        builder = SameNeighborsBatchRequest.builder();
        builder.vertex(1, 2);
        builder.vertex(3, 4);
        builder.vertex(4, 6);
        request = builder.build();
        builder.direction(Direction.OUT);
        builder.maxDegree(1L);
        neighbors = sameNeighborsBatchAPI.post(request);
        Assert.assertEquals(3, neighbors.sameNeighbors.size());
        Assert.assertEquals(1, neighbors.sameNeighbors.get(0).size());
        Assert.assertEquals(0, neighbors.sameNeighbors.get(1).size());
        Assert.assertEquals(1, neighbors.sameNeighbors.get(2).size());

        Assert.assertTrue(neighbors.sameNeighbors.get(0).containsAll(ImmutableList.of(3)));
        Assert.assertTrue(neighbors.sameNeighbors.get(2).containsAll(ImmutableList.of(1)));
    }

    @Test
    public void testSameNeighborsWithLimit() {
        SameNeighborsBatchRequest.Builder builder = SameNeighborsBatchRequest.builder();
        builder.vertex(1, 2);
        builder.vertex(3, 4);
        builder.vertex(4, 6);
        SameNeighborsBatchRequest request = builder.build();
        builder.direction(Direction.BOTH);
        builder.maxDegree(6);
        builder.label("link");
        SameNeighborsBatch neighbors = sameNeighborsBatchAPI.post(request);
        Assert.assertEquals(3, neighbors.sameNeighbors.size());
        Assert.assertEquals(2, neighbors.sameNeighbors.get(0).size());
        Assert.assertEquals(2, neighbors.sameNeighbors.get(1).size());
        Assert.assertEquals(0, neighbors.sameNeighbors.get(2).size());

        Assert.assertTrue(neighbors.sameNeighbors.get(0).containsAll(ImmutableList.of(3, 4)));
        Assert.assertTrue(neighbors.sameNeighbors.get(1).containsAll(ImmutableList.of(1, 2)));

        builder = SameNeighborsBatchRequest.builder();
        builder.vertex(1, 2);
        builder.vertex(3, 4);
        builder.vertex(4, 6);
        builder.direction(Direction.BOTH);
        builder.maxDegree(6);
        builder.label("link");
        builder.limit(2L);
        request = builder.build();
        neighbors = sameNeighborsBatchAPI.post(request);
        Assert.assertEquals(3, neighbors.sameNeighbors.size());
        Assert.assertEquals(2, neighbors.sameNeighbors.get(0).size());
        Assert.assertEquals(2, neighbors.sameNeighbors.get(1).size());
        Assert.assertEquals(0, neighbors.sameNeighbors.get(2).size());

        Assert.assertTrue(neighbors.sameNeighbors.get(0).containsAll(ImmutableList.of(3, 4)));
        Assert.assertTrue(neighbors.sameNeighbors.get(1).containsAll(ImmutableList.of(1, 2)));

        builder = SameNeighborsBatchRequest.builder();
        builder.vertex(1, 2);
        builder.vertex(3, 4);
        builder.vertex(4, 6);
        builder.direction(Direction.BOTH);
        builder.maxDegree(6);
        builder.label("link");
        builder.limit(1L);
        request = builder.build();
        neighbors = sameNeighborsBatchAPI.post(request);
        Assert.assertEquals(3, neighbors.sameNeighbors.size());
        Assert.assertEquals(1, neighbors.sameNeighbors.get(0).size());
        Assert.assertEquals(1, neighbors.sameNeighbors.get(1).size());
        Assert.assertEquals(0, neighbors.sameNeighbors.get(2).size());

        // The limit applies to each pair; which neighbor is kept is not specified
        Assert.assertTrue(ImmutableList.of(3, 4).containsAll(neighbors.sameNeighbors.get(0)));
        Assert.assertTrue(ImmutableList.of(1, 2).containsAll(neighbors.sameNeighbors.get(1)));
    }
}
