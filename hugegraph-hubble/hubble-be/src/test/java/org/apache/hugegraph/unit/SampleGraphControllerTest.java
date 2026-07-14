/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0 (the
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

import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

import org.apache.hugegraph.controller.graph.SampleGraphController;
import org.apache.hugegraph.api.gremlin.GremlinRequest;
import org.apache.hugegraph.driver.GremlinManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.SchemaManager;
import org.apache.hugegraph.structure.schema.VertexLabel;
import org.apache.hugegraph.testutil.Assert;

public class SampleGraphControllerTest {

    @Test
    public void testRedChamberDataIsNotEagerControllerState() {
        boolean eagerField = java.util.Arrays.stream(
                SampleGraphController.class.getDeclaredFields())
                .anyMatch(field -> "HLM_DATA".equals(field.getName()));

        Assert.assertFalse(eagerField);
    }

    @Test
    public void testLoadExecutesSchemaBeforeIdempotentData() {
        HugeClient client = Mockito.mock(HugeClient.class);
        GremlinManager gremlin = Mockito.mock(GremlinManager.class);
        SchemaManager schema = Mockito.mock(SchemaManager.class,
                                            Mockito.RETURNS_DEEP_STUBS);
        Mockito.when(client.gremlin()).thenReturn(gremlin);
        Mockito.when(client.schema()).thenReturn(schema);
        Mockito.when(gremlin.gremlin(Mockito.anyString()))
               .thenAnswer(invocation -> new GremlinRequest.Builder(
                       invocation.getArgument(0), gremlin));
        SampleGraphController controller = new TestController(client);

        Map<String, Object> result = controller.load("DEFAULT", "hugegraph",
                                                     "loader");

        ArgumentCaptor<GremlinRequest> requests =
                ArgumentCaptor.forClass(GremlinRequest.class);
        Mockito.verify(schema).propertyKey("name");
        Mockito.verify(schema).vertexLabel("person");
        Mockito.verify(schema).edgeLabel("knows");
        Mockito.verify(schema.propertyKey("name").asText()).ifNotExist();
        Mockito.verify(schema.vertexLabel("person")
                             .properties("name", "age", "city")
                             .primaryKeys("name")
                             .nullableKeys("age", "city")).ifNotExist();
        Mockito.verify(schema.edgeLabel("knows")
                             .sourceLabel("person")
                             .targetLabel("person")
                             .properties("date", "weight")).ifNotExist();
        Mockito.verify(gremlin).execute(requests.capture());
        Assert.assertTrue(requests.getValue().gremlin.startsWith(
                          "// hugegraph-client:idempotent-traversal-fallback\n"));
        Assert.assertTrue(requests.getValue().gremlin.endsWith(
                          SampleGraphController.LOADER_DATA));
        Assert.assertEquals("hugegraph", result.get("graph"));
        Assert.assertEquals(true, result.get("idempotent"));
        Assert.assertEquals(false, result.get("clears_existing_data"));
    }

    @Test
    public void testSampleContractIsRetrySafeAndNonDestructive() {
        String schema = SampleGraphController.LOADER_SCHEMA +
                        SampleGraphController.HLM_SCHEMA;
        String data = SampleGraphController.LOADER_DATA +
                      SampleGraphController.hlmData();

        Assert.assertTrue(schema.contains("ifNotExist()"));
        Assert.assertTrue(data.contains("fold().coalesce(unfold(),addV"));
        Assert.assertTrue(data.contains(".addEdge("));
        Assert.assertTrue(data.contains(".hasNext()"));
        Assert.assertTrue(SampleGraphController.HLM_SCHEMA.contains(
                          ".primaryKeys('name')"));
        Assert.assertTrue(SampleGraphController.hlmData().contains(
                          ".has('name','贾宝玉')"));
        Assert.assertFalse(SampleGraphController.hlmData().contains(
                           "property(T.id"));
        Assert.assertFalse((schema + data).contains("clear"));
        Assert.assertFalse((schema + data).contains("drop("));
        Assert.assertFalse((schema + data).contains("remove("));
    }

    @Test
    public void testSampleMatchesLoaderExampleCardinality() {
        Assert.assertEquals("hugegraph-loader/example/file",
                            SampleGraphController.LOADER_SOURCE);
        Assert.assertEquals(8, occurrences(SampleGraphController.LOADER_DATA,
                                           "coalesce(unfold(),addV"));
        Assert.assertEquals(6, occurrences(SampleGraphController.LOADER_DATA,
                                           ".addEdge("));
        Assert.assertEquals(14, occurrences(SampleGraphController.hlmData(),
                                            "coalesce(unfold(),addV"));
        Assert.assertEquals(15, occurrences(SampleGraphController.hlmData(),
                                            ".addEdge("));
    }

    @Test
    public void testLoadRedChamberDataset() {
        HugeClient client = Mockito.mock(HugeClient.class);
        GremlinManager gremlin = Mockito.mock(GremlinManager.class);
        SchemaManager schema = Mockito.mock(SchemaManager.class,
                                            Mockito.RETURNS_DEEP_STUBS);
        VertexLabel.Builder vertex = Mockito.mock(VertexLabel.Builder.class);
        Mockito.when(schema.vertexLabel("人物")).thenReturn(vertex);
        Mockito.when(vertex.properties("name", "gender", "age", "title",
                                       "feature")).thenReturn(vertex);
        Mockito.when(vertex.primaryKeys("name")).thenReturn(vertex);
        Mockito.when(vertex.ifNotExist()).thenReturn(vertex);
        Mockito.when(client.gremlin()).thenReturn(gremlin);
        Mockito.when(client.schema()).thenReturn(schema);
        Mockito.when(gremlin.gremlin(Mockito.anyString()))
               .thenAnswer(invocation -> new GremlinRequest.Builder(
                       invocation.getArgument(0), gremlin));
        SampleGraphController controller = new TestController(client);

        Map<String, Object> result = controller.load("DEFAULT", "hugegraph",
                                                     "hlm");

        ArgumentCaptor<GremlinRequest> requests =
                ArgumentCaptor.forClass(GremlinRequest.class);
        Mockito.verify(schema).propertyKey("name");
        Mockito.verify(schema).propertyKey("age");
        Mockito.verify(vertex).properties("name", "gender", "age", "title",
                                          "feature");
        Mockito.verify(vertex).primaryKeys("name");
        Mockito.verify(vertex, Mockito.never()).useCustomizeStringId();
        Mockito.verify(schema).edgeLabel("关系");
        Mockito.verify(gremlin).execute(requests.capture());
        Assert.assertTrue(requests.getValue().gremlin.startsWith(
                          "// hugegraph-client:idempotent-traversal-fallback\n"));
        Assert.assertTrue(requests.getValue().gremlin.endsWith(
                          SampleGraphController.hlmData()));
        Assert.assertEquals(14, result.get("vertices"));
        Assert.assertEquals(15, result.get("edges"));
    }

    private static int occurrences(String value, String token) {
        int count = 0;
        int offset = 0;
        while ((offset = value.indexOf(token, offset)) >= 0) {
            count++;
            offset += token.length();
        }
        return count;
    }

    private static class TestController extends SampleGraphController {

        private final HugeClient client;

        TestController(HugeClient client) {
            this.client = client;
        }

        @Override
        protected HugeClient authGremlinClient(String graphSpace, String graph) {
            return this.client;
        }
    }
}
