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
import java.util.Arrays;
import java.util.Collections;

import org.junit.Test;
import org.mockito.Mockito;

import org.apache.hugegraph.api.gremlin.GremlinRequest;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.CypherManager;
import org.apache.hugegraph.driver.GraphManager;
import org.apache.hugegraph.driver.GremlinManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.query.AdjacentQuery;
import org.apache.hugegraph.entity.query.GremlinQuery;
import org.apache.hugegraph.entity.query.GremlinResult;
import org.apache.hugegraph.entity.schema.VertexLabelEntity;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.query.QueryService;
import org.apache.hugegraph.service.schema.VertexLabelService;
import org.apache.hugegraph.structure.constant.Direction;
import org.apache.hugegraph.structure.constant.IdStrategy;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.structure.gremlin.ResultSet;
import org.apache.hugegraph.testutil.Assert;

public class QueryServiceTest {

    @Test
    public void testQueryIgnoresNonEdgeAdjacentResults() throws Exception {
        Vertex vertex = new Vertex("person");
        vertex.id("isolated");
        GremlinManager gremlin = this.mockGremlin(this.resultSet(vertex),
                                                  this.resultSet(vertex));
        HugeClient client = this.mockClient(gremlin);
        QueryService service = this.serviceWithConfig();

        GremlinResult result = service.executeGremlinQuery(
                               client, new GremlinQuery("g.V('isolated')"));

        Assert.assertEquals(1, result.getGraphView().getVertices().size());
        Assert.assertEquals(0, result.getGraphView().getEdges().size());
    }

    @Test
    public void testExpandVertexEscapesGremlinLiterals() throws Exception {
        GremlinManager gremlin = this.mockGremlin();
        HugeClient client = this.mockClient(gremlin);
        QueryService service = this.serviceWithConfig();

        AdjacentQuery query = AdjacentQuery.builder()
                                           .vertexId("marko'id")
                                           .vertexLabel("person")
                                           .edgeLabel("edge'label\\x\r\n")
                                           .direction(Direction.BOTH)
                                           .conditions(Collections.singletonList(
                                                   AdjacentQuery.Condition
                                                   .builder()
                                                   .key("name'key\r")
                                                   .operator("eq")
                                                   .value("value'quote\\slash\r\n")
                                                   .build()))
                                           .build();

        service.expandVertex(client, query);

        Mockito.verify(gremlin).gremlin(
                "g.V('marko\\'id').toE(BOTH, 'edge\\'label\\\\x\\r\\n')" +
                ".has('name\\'key\\r', eq('value\\'quote\\\\slash\\r\\n'))" +
                ".limit(100).otherV().path()");
    }

    @Test
    public void testExpandVertexRejectsInvalidOperatorInService()
           throws Exception {
        GremlinManager gremlin = this.mockGremlin();
        HugeClient client = this.mockClient(gremlin);
        QueryService service = this.serviceWithConfig();

        AdjacentQuery query = AdjacentQuery.builder()
                                           .vertexId("marko")
                                           .vertexLabel("person")
                                           .conditions(Collections.singletonList(
                                                   AdjacentQuery.Condition
                                                   .builder()
                                                   .key("name")
                                                   .operator("drop")
                                                   .value("value")
                                                   .build()))
                                           .build();

        Assert.assertThrows(ExternalException.class, () -> {
            service.expandVertex(client, query);
        });
        Mockito.verify(gremlin, Mockito.never()).gremlin(Mockito.anyString());
    }

    @Test
    public void testExpandVertexRejectsStructuredConditionValue()
           throws Exception {
        GremlinManager gremlin = this.mockGremlin();
        HugeClient client = this.mockClient(gremlin);
        QueryService service = this.serviceWithConfig();

        AdjacentQuery query = AdjacentQuery.builder()
                                           .vertexId("marko")
                                           .vertexLabel("person")
                                           .conditions(Collections.singletonList(
                                                   AdjacentQuery.Condition
                                                   .builder()
                                                   .key("name")
                                                   .operator("eq")
                                                   .value(Collections.singletonMap(
                                                           "payload",
                                                           "x'));g.V().drop();//"))
                                                   .build()))
                                           .build();

        Assert.assertThrows(ExternalException.class, () -> {
            service.expandVertex(client, query);
        });
        Mockito.verify(gremlin, Mockito.never()).gremlin(Mockito.anyString());
    }

    @Test
    public void testGremlinPreservesServerUnavailableStatus() throws Exception {
        ServerException server = new ServerException((String) null);
        server.status(503);
        GremlinManager gremlin = this.mockGremlinFailure(server);
        QueryService service = this.serviceWithConfig();

        ExternalException error = (ExternalException)
                                  Assert.assertThrows(ExternalException.class,
                                                      () -> {
            service.executeGremlinQuery(this.mockClient(gremlin),
                                        new GremlinQuery("g.V()"));
        });

        Assert.assertEquals(503, error.status());
        Assert.assertEquals("gremlin.server.unavailable", error.getMessage());
    }

    @Test
    public void testGremlinHidesServerUnavailableDetail() throws Exception {
        String detail = "The server is too busy to process the request";
        ServerException server = new ServerException(detail);
        server.status(503);
        GremlinManager gremlin = this.mockGremlinFailure(server);
        QueryService service = this.serviceWithConfig();

        ExternalException error = (ExternalException)
                                  Assert.assertThrows(ExternalException.class,
                                                      () -> {
            service.executeGremlinQuery(this.mockClient(gremlin),
                                        new GremlinQuery("g.V()"));
        });

        Assert.assertEquals(503, error.status());
        Assert.assertEquals("gremlin.server.unavailable", error.getMessage());
        Assert.assertEquals(0, error.args().length);
    }

    @Test
    public void testGremlinSeparatesUpstreamUnauthorizedFromHubbleSession()
           throws Exception {
        ServerException server = new ServerException("Unauthorized");
        server.status(401);
        GremlinManager gremlin = this.mockGremlinFailure(server);
        QueryService service = this.serviceWithConfig();

        ExternalException error = (ExternalException)
                                  Assert.assertThrows(ExternalException.class,
                                                      () -> {
            service.executeGremlinQuery(this.mockClient(gremlin),
                                        new GremlinQuery("g.V()"));
        });

        Assert.assertEquals(502, error.status());
        Assert.assertEquals("gremlin.server.authentication-failed",
                            error.getMessage());
        Assert.assertEquals(0, error.args().length);
    }

    @Test
    public void testCypherSeparatesUpstreamUnauthorizedFromHubbleSession()
           throws Exception {
        ServerException server = new ServerException("Unauthorized");
        server.status(401);
        CypherManager cypher = Mockito.mock(CypherManager.class);
        Mockito.when(cypher.cypher(Mockito.anyString())).thenThrow(server);
        HugeClient client = this.mockClient(this.mockGremlin());
        Mockito.when(client.cypher()).thenReturn(cypher);
        QueryService service = this.serviceWithConfig();

        ExternalException error = (ExternalException)
                                  Assert.assertThrows(ExternalException.class,
                                                      () -> {
            service.executeCypherQuery(client, "MATCH (n) RETURN n");
        });

        Assert.assertEquals(502, error.status());
        Assert.assertEquals("gremlin.server.authentication-failed",
                            error.getMessage());
        Assert.assertEquals(0, error.args().length);
    }

    @Test
    public void testAsyncQueriesSeparateUnauthorizedFromHubbleSession()
           throws Exception {
        ServerException server = new ServerException("Unauthorized");
        server.status(401);
        GremlinManager gremlin = Mockito.mock(GremlinManager.class);
        Mockito.when(gremlin.executeAsTask(Mockito.any())).thenThrow(server);
        CypherManager cypher = Mockito.mock(CypherManager.class);
        Mockito.when(cypher.executeAsTask(Mockito.anyString()))
               .thenThrow(server);
        HugeClient client = this.mockClient(gremlin);
        Mockito.when(client.cypher()).thenReturn(cypher);
        QueryService service = this.serviceWithConfig();

        ExternalException gremlinError = (ExternalException)
                                         Assert.assertThrows(
                                         ExternalException.class, () -> {
            service.executeGremlinAsyncTask(client, new GremlinQuery("g.V()"));
        });
        ExternalException cypherError = (ExternalException)
                                        Assert.assertThrows(
                                        ExternalException.class, () -> {
            service.executeCypherAsyncTask(client, "MATCH (n) RETURN n");
        });

        Assert.assertEquals(502, gremlinError.status());
        Assert.assertEquals("gremlin.server.authentication-failed",
                            gremlinError.getMessage());
        Assert.assertEquals(502, cypherError.status());
        Assert.assertEquals("gremlin.server.authentication-failed",
                            cypherError.getMessage());
    }

    private QueryService serviceWithConfig() throws Exception {
        QueryService service = new QueryService();
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.GREMLIN_SUFFIX_LIMIT))
               .thenReturn(250);
        Mockito.when(config.get(HubbleOptions.GREMLIN_VERTEX_DEGREE_LIMIT))
               .thenReturn(100);
        Mockito.when(config.get(HubbleOptions.GREMLIN_BATCH_QUERY_IDS))
               .thenReturn(100);
        Mockito.when(config.get(HubbleOptions.GREMLIN_EDGES_TOTAL_LIMIT))
               .thenReturn(500);
        this.setField(service, "config", config);
        VertexLabelService vlService = Mockito.mock(VertexLabelService.class);
        Mockito.when(vlService.get(Mockito.eq("person"), Mockito.any()))
               .thenReturn(VertexLabelEntity.builder()
                                            .name("person")
                                            .idStrategy(IdStrategy.CUSTOMIZE_STRING)
                                            .build());
        this.setField(service, "vlService", vlService);
        return service;
    }

    private HugeClient mockClient(GremlinManager gremlin) {
        HugeClient client = Mockito.mock(HugeClient.class);
        Mockito.when(client.gremlin()).thenReturn(gremlin);
        return client;
    }

    private GremlinManager mockGremlin() throws Exception {
        return this.mockGremlin(this.resultSet());
    }

    private GremlinManager mockGremlin(ResultSet... resultSets) throws Exception {
        GremlinManager gremlin = Mockito.mock(GremlinManager.class);
        Mockito.when(gremlin.gremlin(Mockito.anyString()))
               .thenAnswer(invocation -> new GremlinRequest.Builder(
                       invocation.getArgument(0), gremlin));
        Mockito.when(gremlin.execute(Mockito.any()))
               .thenReturn(resultSets[0], Arrays.copyOfRange(resultSets, 1,
                                                              resultSets.length));
        return gremlin;
    }

    private GremlinManager mockGremlinFailure(ServerException failure) {
        GremlinManager gremlin = Mockito.mock(GremlinManager.class);
        Mockito.when(gremlin.gremlin(Mockito.anyString()))
               .thenAnswer(invocation -> new GremlinRequest.Builder(
                       invocation.getArgument(0), gremlin));
        Mockito.when(gremlin.execute(Mockito.any())).thenThrow(failure);
        return gremlin;
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
