/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
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
import org.apache.hugegraph.testutil.Assert;

public class SampleGraphControllerTest {

    @Test
    public void testLoadExecutesSchemaBeforeIdempotentData() {
        HugeClient client = Mockito.mock(HugeClient.class);
        GremlinManager gremlin = Mockito.mock(GremlinManager.class);
        Mockito.when(client.gremlin()).thenReturn(gremlin);
        Mockito.when(gremlin.gremlin(Mockito.anyString()))
               .thenAnswer(invocation -> new GremlinRequest.Builder(
                       invocation.getArgument(0), gremlin));
        SampleGraphController controller = new TestController(client);

        Map<String, Object> result = controller.load("DEFAULT", "hugegraph",
                                                     "loader");

        ArgumentCaptor<GremlinRequest> requests =
                ArgumentCaptor.forClass(GremlinRequest.class);
        Mockito.verify(gremlin, Mockito.times(2)).execute(requests.capture());
        Assert.assertEquals(SampleGraphController.LOADER_SCHEMA,
                            requests.getAllValues().get(0).gremlin);
        Assert.assertEquals(SampleGraphController.LOADER_DATA,
                            requests.getAllValues().get(1).gremlin);
        Assert.assertEquals("hugegraph", result.get("graph"));
        Assert.assertEquals(true, result.get("idempotent"));
        Assert.assertEquals(false, result.get("clears_existing_data"));
    }

    @Test
    public void testSampleContractIsRetrySafeAndNonDestructive() {
        String schema = SampleGraphController.LOADER_SCHEMA +
                        SampleGraphController.RANK_SCHEMA;
        String data = SampleGraphController.LOADER_DATA +
                      SampleGraphController.RANK_DATA;

        Assert.assertTrue(schema.contains("ifNotExist()"));
        Assert.assertTrue(data.contains("fold().coalesce(unfold(),addV"));
        Assert.assertTrue(data.contains(".addEdge("));
        Assert.assertTrue(data.contains(".hasNext()"));
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
        Assert.assertEquals(14, occurrences(SampleGraphController.RANK_DATA,
                                            "coalesce(unfold(),addV"));
        Assert.assertEquals(15, occurrences(SampleGraphController.RANK_DATA,
                                            ".addEdge("));
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
