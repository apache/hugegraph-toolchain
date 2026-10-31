/*
 *
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
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hugegraph.unit;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;

import org.junit.Test;
import org.mockito.Mockito;

import org.apache.hugegraph.api.gremlin.GremlinRequest;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.GraphManager;
import org.apache.hugegraph.driver.GremlinManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.TraverserManager;
import org.apache.hugegraph.entity.algorithm.WeightedShortestPathEntity;
import org.apache.hugegraph.entity.algorithm.KoutEntity;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.entity.query.GraphView;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.query.ExecuteHistoryService;
import org.apache.hugegraph.service.algorithm.OltpAlgoService;
import org.apache.hugegraph.structure.graph.Edge;
import org.apache.hugegraph.structure.graph.Path;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.structure.constant.Direction;
import org.apache.hugegraph.structure.constant.Traverser;
import org.apache.hugegraph.structure.gremlin.ResultSet;
import org.apache.hugegraph.structure.traverser.Kout;
import org.apache.hugegraph.structure.traverser.KoutRequest;
import org.apache.hugegraph.structure.traverser.WeightedPath;
import org.apache.hugegraph.testutil.Assert;
import com.fasterxml.jackson.databind.ObjectMapper;

public class OltpAlgoServiceTest {

    @Test
    public void testKoutRequestsPathsAndReturnsEdgesForBothForms()
           throws Exception {
        Vertex marko = new Vertex("person");
        marko.id("marko");
        Vertex vadas = new Vertex("person");
        vadas.id("vadas");
        Edge knows = new Edge("knows");
        knows.id("S1:marko>vadas");
        knows.source(marko);
        knows.target(vadas);

        Kout result = new Kout();
        this.setField(result, "paths", Collections.emptyList());
        this.setField(result, "edges", Collections.singleton(knows));

        TraverserManager traverser = Mockito.mock(TraverserManager.class);
        Mockito.when(traverser.kout(Mockito.any(KoutRequest.class)))
               .thenAnswer(invocation -> {
                   KoutRequest request = invocation.getArgument(0);
                   // Server returns edge records only when paths are requested.
                   Assert.assertTrue(request.withPath);
                   Assert.assertTrue(request.withEdge);
                   return result;
               });
        GremlinManager gremlin = Mockito.mock(GremlinManager.class);
        Mockito.when(gremlin.gremlin(Mockito.anyString()))
               .thenAnswer(invocation -> new GremlinRequest.Builder(
                       invocation.getArgument(0), gremlin));
        Mockito.when(gremlin.execute(Mockito.any()))
               .thenReturn(this.resultSet(marko, vadas));
        HugeClient client = Mockito.mock(HugeClient.class);
        Mockito.when(client.getGraphSpaceName()).thenReturn("DEFAULT");
        Mockito.when(client.getGraphName()).thenReturn("hugegraph");
        Mockito.when(client.traverser()).thenReturn(traverser);
        Mockito.when(client.gremlin()).thenReturn(gremlin);

        OltpAlgoService service = this.serviceWithConfig();
        this.setField(service, "historyService",
                      Mockito.mock(ExecuteHistoryService.class));
        KoutEntity basic = KoutEntity.builder().source("marko")
                                     .direction(Direction.BOTH).maxDepth(1)
                                     .maxDegree(100).capacity(100).limit(100)
                                     .algorithm("deep_first")
                                     .build();
        GraphView basicView = service.kout(client, basic).getGraphView();
        Assert.assertEquals(2, basicView.getVertices().size());
        Assert.assertTrue(basicView.getEdges().contains(knows));
        Mockito.verify(traverser).kout(Mockito.argThat(request ->
                Traverser.TRAVERSE_MODE_DFS.equals(request.traverseMode)));
        basic.setAlgorithm("breadth_first");
        service.kout(client, basic);
        Mockito.verify(traverser).kout(Mockito.argThat(request ->
                Traverser.TRAVERSE_MODE_BFS.equals(request.traverseMode)));
        basic.setAlgorithm(null);
        service.kout(client, basic);
        Mockito.verify(traverser, Mockito.times(2)).kout(Mockito.argThat(request ->
                Traverser.TRAVERSE_MODE_BFS.equals(request.traverseMode)));
        basic.setAlgorithm("unknown");
        Assert.assertThrows(ExternalException.class, () -> service.kout(client, basic));

        ObjectMapper mapper = new ObjectMapper();
        KoutRequest advanced = mapper.readValue(
                "{\"source\":\"marko\",\"algorithm\":\"deep_first\"}", KoutRequest.class);
        GraphView advancedView = service.koutPost(client, advanced).getGraphView();
        Assert.assertEquals(2, advancedView.getVertices().size());
        Assert.assertTrue(advancedView.getEdges().contains(knows));
        Assert.assertEquals(Traverser.TRAVERSE_MODE_DFS, advanced.traverseMode);
        Assert.assertEquals(Traverser.TRAVERSE_MODE_DFS,
                            mapper.readTree(mapper.writeValueAsString(advanced))
                                  .get("traverse_mode").asText());

        KoutRequest breadth = mapper.readValue(
                "{\"source\":\"marko\",\"algorithm\":\"breadth_first\"}", KoutRequest.class);
        service.koutPost(client, breadth);
        Assert.assertEquals(Traverser.TRAVERSE_MODE_BFS, breadth.traverseMode);
        KoutRequest canonical = mapper.readValue(
                "{\"source\":\"marko\",\"traverse_mode\":\"depth_first_search\"}", KoutRequest.class);
        service.koutPost(client, canonical);
        Assert.assertEquals(Traverser.TRAVERSE_MODE_DFS, canonical.traverseMode);
        KoutRequest defaultMode = mapper.readValue("{\"source\":\"marko\"}", KoutRequest.class);
        service.koutPost(client, defaultMode);
        Assert.assertEquals(Traverser.TRAVERSE_MODE_BFS, defaultMode.traverseMode);
        KoutRequest invalid = mapper.readValue(
                "{\"source\":\"marko\",\"algorithm\":\"unknown\"}", KoutRequest.class);
        Assert.assertThrows(ExternalException.class, () -> service.koutPost(client, invalid));
        Mockito.verify(traverser, Mockito.times(7)).kout(Mockito.any(KoutRequest.class));
    }

    @Test
    public void testBuildPathGraphViewKeepsPathEdges() throws Exception {
        Vertex marko = new Vertex("person");
        marko.id("marko");
        Vertex vadas = new Vertex("person");
        vadas.id("vadas");

        Edge knows = new Edge("knows");
        knows.id("S1:marko>vadas");
        knows.source(marko);
        knows.target(vadas);

        HugeClient client = Mockito.mock(HugeClient.class);
        Path path = new Path(Arrays.asList(marko, knows, vadas));

        GraphView graphView = this.buildPathGraphView(client, path);

        Assert.assertEquals(2, graphView.getVertices().size());
        Assert.assertEquals(1, graphView.getEdges().size());
        Assert.assertTrue(graphView.getEdges().contains(knows));
    }

    @Test
    public void testBuildPathGraphViewBackfillsEdgeEndpointVertices()
           throws Exception {
        Vertex marko = new Vertex("person");
        marko.id("marko");
        Vertex vadas = new Vertex("person");
        vadas.id("vadas");

        Edge knows = new Edge("knows");
        knows.id("S1:marko>vadas");
        knows.source(marko);
        knows.target(vadas);

        GremlinManager gremlin = Mockito.mock(GremlinManager.class);
        Mockito.when(gremlin.gremlin(Mockito.anyString()))
               .thenAnswer(invocation -> new GremlinRequest.Builder(
                       invocation.getArgument(0), gremlin));
        Mockito.when(gremlin.execute(Mockito.any()))
               .thenReturn(this.resultSet(marko, vadas));
        HugeClient client = Mockito.mock(HugeClient.class);
        Mockito.when(client.gremlin()).thenReturn(gremlin);
        Path path = new Path(Arrays.asList(knows));

        GraphView graphView = this.buildPathGraphView(client, path);

        Assert.assertEquals(2, graphView.getVertices().size());
        Assert.assertEquals(1, graphView.getEdges().size());
        Assert.assertTrue(graphView.getEdges().contains(knows));
        Mockito.verify(gremlin, Mockito.times(1))
               .gremlin("g.V('marko','vadas').limit(1000)");
        Mockito.verify(client, Mockito.never()).graph();
    }

    @Test
    public void testBuildPathGraphViewBackfillsEdgesForVertexIdPath()
           throws Exception {
        Vertex marko = new Vertex("person");
        marko.id("marko");
        Vertex vadas = new Vertex("person");
        vadas.id("vadas");

        Edge knows = new Edge("knows");
        knows.id("S1:marko>vadas");
        knows.source(marko);
        knows.target(vadas);

        GremlinManager gremlin = Mockito.mock(GremlinManager.class);
        Mockito.when(gremlin.gremlin(Mockito.anyString()))
               .thenAnswer(invocation -> new GremlinRequest.Builder(
                       invocation.getArgument(0), gremlin));
        Mockito.when(gremlin.execute(Mockito.any()))
               .thenReturn(this.resultSet(marko, vadas),
                           this.resultSet(knows));
        HugeClient client = Mockito.mock(HugeClient.class);
        Mockito.when(client.gremlin()).thenReturn(gremlin);
        OltpAlgoService service = this.serviceWithConfig();
        Path path = new Path(Arrays.asList("marko", "vadas"));

        GraphView graphView = this.buildPathGraphView(service, client, path);

        Assert.assertEquals(2, graphView.getVertices().size());
        Assert.assertEquals(1, graphView.getEdges().size());
        Assert.assertTrue(graphView.getEdges().contains(knows));
        Mockito.verify(gremlin).gremlin("g.V('marko','vadas').limit(1000)");
        Mockito.verify(gremlin).gremlin(
                "g.V('marko','vadas').bothE().local(limit(1000)).dedup()");
    }

    @Test
    public void testBuildPathGraphViewIgnoresNullVertexIds()
           throws Exception {
        HugeClient client = Mockito.mock(HugeClient.class);
        OltpAlgoService service = this.serviceWithConfig();
        Path path = new Path(Arrays.asList((Object) null));

        GraphView graphView = this.buildPathGraphView(service, client, path);

        Assert.assertEquals(0, graphView.getVertices().size());
        Assert.assertEquals(0, graphView.getEdges().size());
        Mockito.verify(client, Mockito.never()).gremlin();
    }

    @Test
    public void testWeightedShortestPathUsesReturnedPathEdges()
           throws Exception {
        Vertex marko = new Vertex("person");
        marko.id("marko");
        Vertex vadas = new Vertex("person");
        vadas.id("vadas");

        Edge pathEdge = new Edge("knows");
        pathEdge.id("S1:marko>vadas");
        pathEdge.source(marko);
        pathEdge.target(vadas);

        Edge nonPathEdge = new Edge("created");
        nonPathEdge.id("S2:marko>vadas");
        nonPathEdge.source(marko);
        nonPathEdge.target(vadas);

        WeightedPath path = new WeightedPath();
        this.setField(path, "vertices", new LinkedHashSet<>(
                Arrays.asList(marko, vadas)));
        this.setField(path, "edges", new LinkedHashSet<>(
                Arrays.asList(pathEdge)));

        TraverserManager traverser = Mockito.mock(TraverserManager.class);
        Mockito.when(traverser.weightedShortestPath(
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(),
                Mockito.any(), Mockito.anyLong(), Mockito.anyLong(),
                Mockito.anyLong(), Mockito.eq(true), Mockito.eq(true)))
               .thenReturn(path);
        Mockito.when(traverser.weightedShortestPath(
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(),
                Mockito.any(), Mockito.anyLong(), Mockito.anyLong(),
                Mockito.anyLong(), Mockito.eq(true), Mockito.eq(false)))
               .thenReturn(path);

        GremlinManager gremlin = Mockito.mock(GremlinManager.class);
        Mockito.when(gremlin.gremlin(Mockito.anyString()))
               .thenAnswer(invocation -> new GremlinRequest.Builder(
                       invocation.getArgument(0), gremlin));
        Mockito.when(gremlin.execute(Mockito.any()))
               .thenReturn(this.resultSet(pathEdge, nonPathEdge));

        HugeClient client = Mockito.mock(HugeClient.class);
        Mockito.when(client.getGraphSpaceName()).thenReturn("DEFAULT");
        Mockito.when(client.getGraphName()).thenReturn("hugegraph");
        Mockito.when(client.traverser()).thenReturn(traverser);
        Mockito.when(client.gremlin()).thenReturn(gremlin);

        OltpAlgoService service = this.serviceWithConfig();
        this.setField(service, "historyService",
                      Mockito.mock(ExecuteHistoryService.class));

        WeightedShortestPathEntity body = WeightedShortestPathEntity.builder()
                                                                    .source("marko")
                                                                    .target("vadas")
                                                                    .weight("weight")
                                                                    .build();
        GraphView graphView = service.weightedShortestPath(client, body)
                                     .getGraphView();

        Assert.assertEquals(2, graphView.getVertices().size());
        Assert.assertEquals(1, graphView.getEdges().size());
        Assert.assertTrue(graphView.getEdges().contains(pathEdge));
        Assert.assertFalse(graphView.getEdges().contains(nonPathEdge));
        Mockito.verify(traverser).weightedShortestPath(
                Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(),
                Mockito.any(), Mockito.anyLong(), Mockito.anyLong(),
                Mockito.anyLong(), Mockito.eq(true), Mockito.eq(true));
        Mockito.verify(gremlin, Mockito.never()).gremlin(Mockito.contains("bothE"));
    }

    private GraphView buildPathGraphView(HugeClient client, Path path)
                                  throws Exception {
        return this.buildPathGraphView(new OltpAlgoService(), client, path);
    }

    private GraphView buildPathGraphView(OltpAlgoService service,
                                         HugeClient client, Path path)
                                         throws Exception {
        Method method = OltpAlgoService.class.getDeclaredMethod("buildPathGraphView",
                                                               HugeClient.class,
                                                               Path.class);
        method.setAccessible(true);
        return (GraphView) method.invoke(service, client, path);
    }

    private OltpAlgoService serviceWithConfig() throws Exception {
        OltpAlgoService service = new OltpAlgoService();
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.GREMLIN_BATCH_QUERY_IDS))
               .thenReturn(1000);
        Mockito.when(config.get(HubbleOptions.GREMLIN_EDGES_TOTAL_LIMIT))
               .thenReturn(1000);
        Mockito.when(config.get(HubbleOptions.GREMLIN_VERTEX_DEGREE_LIMIT))
               .thenReturn(1000);
        this.setField(service, "config", config);
        return service;
    }

    private ResultSet resultSet(Object... data) throws Exception {
        ResultSet resultSet = new ResultSet();
        this.setField(resultSet, "data", Arrays.asList(data));
        resultSet.graphManager(Mockito.mock(GraphManager.class));
        return resultSet;
    }

    private void setField(Object object, String name, Object value)
                          throws Exception {
        Field field = object.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(object, value);
    }
}
