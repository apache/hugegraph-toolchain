/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hugegraph.unit;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

import org.apache.hugegraph.api.graph.GraphMetricsAPI;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.GraphManager;
import org.apache.hugegraph.driver.GraphsManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.graphs.GraphStatisticsEntity;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.graphs.GraphsService;
import org.apache.hugegraph.service.query.QueryService;
import org.apache.hugegraph.structure.graph.Edge;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.structure.gremlin.ResultSet;

public class GraphsServiceDefaultTest {

    private HugeClient client;
    private GraphsManager graphs;
    private GraphsService service;

    @Before
    public void setup() {
        this.client = Mockito.mock(HugeClient.class);
        this.graphs = Mockito.mock(GraphsManager.class);
        Mockito.when(this.client.graphs()).thenReturn(this.graphs);
        this.service = new GraphsService();
    }

    @Test
    public void testSetDefaultReplacesAllPreviousDefaults() {
        Map<String, Object> defaults = new LinkedHashMap<>();
        defaults.put("default_graph", Arrays.asList("old_a", "old_b"));
        Mockito.when(this.graphs.getDefault()).thenReturn(defaults);

        this.service.setDefault(this.client, "target");

        InOrder order = Mockito.inOrder(this.graphs);
        order.verify(this.graphs).getDefault();
        order.verify(this.graphs).setDefault("target");
        order.verify(this.graphs).unSetDefault("old_a");
        order.verify(this.graphs).unSetDefault("old_b");
    }

    @Test
    public void testClearGraphUsesExplicitDestructiveConfirmation() {
        Mockito.when(this.graphs.getDefault()).thenReturn(
                Collections.singletonMap("default_graph",
                                         Collections.singletonList("default")));

        this.service.clearGraph(this.client, "graph_a");

        InOrder order = Mockito.inOrder(this.graphs);
        order.verify(this.graphs).getDefault();
        order.verify(this.graphs).clearGraph(
              "graph_a", "I'm sure to delete all data");
    }

    @Test
    public void testClearGraphRejectsDefaultGraph() {
        Mockito.when(this.graphs.getDefault()).thenReturn(
                Collections.singletonMap("default_graph",
                                         Arrays.asList("other", "graph_a")));

        try {
            this.service.clearGraph(this.client, "graph_a");
            Assert.fail("Expected default graph rejection");
        } catch (ExternalException ignored) {
            // Expected: default graphs must not be cleared.
        }

        Mockito.verify(this.graphs).getDefault();
        Mockito.verify(this.graphs, Mockito.never())
               .clearGraph(Mockito.anyString(), Mockito.anyString());
    }

    @Test
    public void testSetDefaultIsNoopWhenTargetIsOnlyDefault() {
        Mockito.when(this.graphs.getDefault()).thenReturn(
                Collections.singletonMap("default_graph",
                                         Collections.singletonList("target")));

        this.service.setDefault(this.client, "target");

        Mockito.verify(this.graphs).getDefault();
        Mockito.verify(this.graphs, Mockito.never()).unSetDefault(Mockito.anyString());
        Mockito.verify(this.graphs, Mockito.never()).setDefault(Mockito.anyString());
    }

    @Test
    public void testSetDefaultKeepsTargetAndDeduplicatesOldDefaults() {
        Map<String, Object> defaults = new LinkedHashMap<>();
        defaults.put("default_graph", Arrays.asList("old", "target", "old"));
        Mockito.when(this.graphs.getDefault()).thenReturn(defaults);

        this.service.setDefault(this.client, "target");

        Mockito.verify(this.graphs, Mockito.never()).setDefault(Mockito.anyString());
        Mockito.verify(this.graphs).unSetDefault("old");
        Mockito.verify(this.graphs, Mockito.never()).unSetDefault("target");
    }

    @Test
    public void testSetFailureDoesNotClearExistingDefault() {
        Map<String, Object> defaults = new LinkedHashMap<>();
        defaults.put("default_graph", Collections.singletonList("old"));
        Mockito.when(this.graphs.getDefault()).thenReturn(defaults);
        Mockito.when(this.graphs.setDefault("target"))
               .thenThrow(new IllegalStateException("set failed"));

        try {
            this.service.setDefault(this.client, "target");
            Assert.fail("Expected set failure");
        } catch (IllegalStateException ignored) {
            // Expected: the failure propagates without clearing the old default.
        }

        Mockito.verify(this.graphs, Mockito.never()).unSetDefault(Mockito.anyString());
    }

    @Test
    public void testCreateStandaloneGraphIncludesRequiredFactory() {
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        ReflectionTestUtils.setField(this.service, "config", config);

        this.service.create(this.client, "Demo", "demo", null);

        ArgumentCaptor<String> configJson = ArgumentCaptor.forClass(String.class);
        Mockito.verify(this.graphs).createGraph(Mockito.eq("demo"),
                                               configJson.capture());
        Assert.assertTrue(configJson.getValue().contains(
                "\"gremlin.graph\":\"org.apache.hugegraph.auth." +
                "HugeFactoryAuthProxy\""));
        Assert.assertTrue(configJson.getValue().contains(
                "\"backend\":\"rocksdb\""));
        Assert.assertTrue(configJson.getValue().contains(
                "\"task.scheduler_type\":\"local\""));
        Assert.assertTrue(configJson.getValue().contains(
                "\"rocksdb.data_path\":\"rocksdb-data/data_demo\""));
        Assert.assertTrue(configJson.getValue().contains(
                "\"rocksdb.wal_path\":\"rocksdb-data/wal_demo\""));
    }

    @Test
    public void testCreateStandaloneGraphRejectsUnsafeName() {
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        ReflectionTestUtils.setField(this.service, "config", config);

        try {
            this.service.create(this.client, "Unsafe", "../unsafe", null);
            Assert.fail("Expected unsafe graph name to be rejected");
        } catch (ExternalException ignored) {
            // Expected.
        }
        Mockito.verify(this.graphs, Mockito.never())
               .createGraph(Mockito.anyString(), Mockito.anyString());
    }

    @Test
    public void testSmallStatisticsFallsBackToBoundedGraphReads() {
        QueryService query = Mockito.mock(QueryService.class);
        Mockito.when(query.executeQueryCount(Mockito.eq(this.client),
                                             Mockito.anyString()))
               .thenThrow(new ExternalException("gremlin.execute.failed"));
        ReflectionTestUtils.setField(this.service, "queryService", query);

        GraphManager graph = Mockito.mock(GraphManager.class);
        Mockito.when(this.client.graph()).thenReturn(graph);
        Vertex personA = Mockito.mock(Vertex.class);
        Vertex personB = Mockito.mock(Vertex.class);
        Edge relation = Mockito.mock(Edge.class);
        Mockito.when(personA.label()).thenReturn("人物");
        Mockito.when(personB.label()).thenReturn("人物");
        Mockito.when(relation.label()).thenReturn("关系");
        Mockito.when(graph.iterateVertices(1000))
               .thenReturn(Arrays.asList(personA, personB).iterator());
        Mockito.when(graph.iterateEdges(1000))
               .thenReturn(Collections.singletonList(relation).iterator());

        GraphStatisticsEntity result =
                this.service.postSmallStatistics(this.client, "DEFAULT", "demo");

        Assert.assertEquals("2", result.getVertexCount());
        Assert.assertEquals("1", result.getEdgeCount());
        Assert.assertEquals(2L, result.getVertices().get("人物"));
        Assert.assertEquals(1L, result.getEdges().get("关系"));
    }

    @Test
    public void testSmallStatisticsStopsBeforeLoadingEdgesAboveLimit() {
        QueryService query = Mockito.mock(QueryService.class);
        Mockito.when(query.executeQueryCount(Mockito.eq(this.client),
                                             Mockito.anyString()))
               .thenThrow(new ExternalException("gremlin.execute.failed"));
        ReflectionTestUtils.setField(this.service, "queryService", query);

        GraphManager graph = Mockito.mock(GraphManager.class);
        Mockito.when(this.client.graph()).thenReturn(graph);
        Vertex vertex = Mockito.mock(Vertex.class);
        Mockito.when(vertex.label()).thenReturn("person");
        Mockito.when(graph.iterateVertices(1000))
               .thenReturn(Collections.nCopies(10001, vertex).iterator());

        try {
            this.service.postSmallStatistics(this.client, "DEFAULT", "demo");
            Assert.fail("Expected bounded statistics failure");
        } catch (ExternalException ignored) {
            // Expected: the fallback stops as soon as the limit is exceeded.
        }

        Mockito.verify(graph, Mockito.never()).iterateEdges(Mockito.anyInt());
    }

    @Test
    public void testSmallStatisticsRejectsEmptyGremlinCountResponse() {
        QueryService query = Mockito.mock(QueryService.class);
        ResultSet empty = Mockito.mock(ResultSet.class);
        Mockito.when(empty.data()).thenReturn(Collections.emptyList());
        Mockito.when(query.executeQueryCount(Mockito.eq(this.client),
                                             Mockito.anyString()))
               .thenReturn(empty);
        ReflectionTestUtils.setField(this.service, "queryService", query);

        GraphManager graph = Mockito.mock(GraphManager.class);
        Mockito.when(this.client.graph()).thenReturn(graph);
        Vertex vertex = Mockito.mock(Vertex.class);
        Edge edge = Mockito.mock(Edge.class);
        Mockito.when(vertex.label()).thenReturn("person");
        Mockito.when(edge.label()).thenReturn("knows");
        Mockito.when(graph.iterateVertices(1000))
               .thenReturn(Collections.singletonList(vertex).iterator());
        Mockito.when(graph.iterateEdges(1000))
               .thenReturn(Collections.singletonList(edge).iterator());

        GraphStatisticsEntity result =
                this.service.postSmallStatistics(this.client, "DEFAULT", "demo");

        Assert.assertEquals("1", result.getVertexCount());
        Assert.assertEquals("1", result.getEdgeCount());
    }

    @Test
    public void testElementCountPrefersAvailableDailySnapshot() {
        GraphManager graph = Mockito.mock(GraphManager.class);
        Mockito.when(this.client.graph()).thenReturn(graph);
        GraphMetricsAPI.ElementCount snapshot = new GraphMetricsAPI.ElementCount();
        snapshot.setVertices(12L);
        snapshot.setEdges(8L);
        Mockito.when(graph.getEVCount(Mockito.anyString())).thenReturn(snapshot);

        Map<String, Object> result =
                this.service.evCount(this.client, "DEFAULT", "demo");

        Assert.assertEquals(12L, result.get("vertex"));
        Assert.assertEquals(8L, result.get("edge"));
        Assert.assertNotNull(result.get("date"));
        Mockito.verify(graph, Mockito.never()).iterateVertices(Mockito.anyInt());
        Mockito.verify(graph, Mockito.never()).iterateEdges(Mockito.anyInt());
    }

    @Test
    public void testElementCountFallsBackToLiveSmallGraph() {
        QueryService query = Mockito.mock(QueryService.class);
        ReflectionTestUtils.setField(this.service, "queryService", query);

        GraphManager graph = Mockito.mock(GraphManager.class);
        Mockito.when(this.client.graph()).thenReturn(graph);
        Mockito.when(graph.getEVCount(Mockito.anyString())).thenReturn(null);
        Vertex vertex = Mockito.mock(Vertex.class);
        Edge edge = Mockito.mock(Edge.class);
        Mockito.when(vertex.label()).thenReturn("person");
        Mockito.when(edge.label()).thenReturn("knows");
        Mockito.when(graph.iterateVertices(1000))
               .thenReturn(Collections.nCopies(7, vertex).iterator());
        Mockito.when(graph.iterateEdges(1000))
               .thenReturn(Collections.nCopies(6, edge).iterator());

        Map<String, Object> result =
                this.service.evCount(this.client, "DEFAULT", "demo");

        Assert.assertEquals(7L, result.get("vertex"));
        Assert.assertEquals(6L, result.get("edge"));
        Assert.assertNotNull(result.get("date"));
        Mockito.verifyZeroInteractions(query);
    }

    @Test
    public void testElementCountReturnsUnavailableWhenLiveFallbackFails() {
        QueryService query = Mockito.mock(QueryService.class);
        Mockito.when(query.executeQueryCount(Mockito.eq(this.client),
                                             Mockito.anyString()))
               .thenThrow(new ExternalException("gremlin.execute.failed"));
        ReflectionTestUtils.setField(this.service, "queryService", query);

        GraphManager graph = Mockito.mock(GraphManager.class);
        Mockito.when(this.client.graph()).thenReturn(graph);
        Mockito.when(graph.getEVCount(Mockito.anyString())).thenReturn(null);
        Mockito.when(graph.iterateVertices(1000))
               .thenThrow(new ExternalException("paging.unsupported"));

        Map<String, Object> result =
                this.service.evCount(this.client, "DEFAULT", "demo");

        Assert.assertNull(result.get("vertex"));
        Assert.assertNull(result.get("edge"));
        Assert.assertNull(result.get("date"));
    }

    @Test
    public void testGraphProfilesFallBackForStandaloneServer() {
        Mockito.when(this.graphs.listProfile("huge"))
               .thenThrow(new ServerException("profile unsupported"));
        Mockito.when(this.graphs.listGraph())
               .thenReturn(Arrays.asList("hugegraph", "other"));
        Mockito.when(this.graphs.getGraph("hugegraph"))
               .thenReturn(Collections.singletonMap("backend", "rocksdb"));
        Mockito.when(this.client.assignGraph("DEFAULT", "hugegraph"))
               .thenReturn(this.client);
        GraphManager graph = Mockito.mock(GraphManager.class);
        Mockito.when(this.client.graph()).thenReturn(graph);
        GraphMetricsAPI.ElementCount snapshot = new GraphMetricsAPI.ElementCount();
        snapshot.setVertices(2L);
        snapshot.setEdges(1L);
        Mockito.when(graph.getEVCount(Mockito.anyString())).thenReturn(snapshot);

        List<Map<String, Object>> result =
                this.service.sortedGraphsProfile(this.client, "DEFAULT", "huge",
                                                 "", false,
                                                 Collections.emptyMap());

        Assert.assertEquals(1, result.size());
        Assert.assertEquals("hugegraph", result.get(0).get("name"));
        Assert.assertEquals("rocksdb", result.get(0).get("backend"));
        Assert.assertEquals("DEFAULT", result.get(0).get("graphspace"));
        Mockito.verify(this.graphs).getGraph("hugegraph");
        Mockito.verify(this.graphs, Mockito.never()).getGraph("other");
    }

    @Test
    public void testGraphProfilesDoNotMaskForbiddenResponse() {
        ServerException forbidden = new ServerException("forbidden");
        forbidden.status(403);
        Mockito.when(this.graphs.listProfile(""))
               .thenThrow(forbidden);

        try {
            this.service.sortedGraphsProfile(this.client, "DEFAULT", "", "",
                                             false, Collections.emptyMap());
            Assert.fail("Expected forbidden response");
        } catch (ServerException actual) {
            Assert.assertSame(forbidden, actual);
        }

        Mockito.verify(this.graphs, Mockito.never()).listGraph();
    }
}
