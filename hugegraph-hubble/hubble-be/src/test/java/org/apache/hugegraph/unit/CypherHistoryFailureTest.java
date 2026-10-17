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

package org.apache.hugegraph.unit;

import org.apache.hugegraph.controller.query.CypherController;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.query.ExecuteHistory;
import org.apache.hugegraph.entity.query.GremlinQuery;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.service.auth.AuthModeService;
import org.apache.hugegraph.service.query.ExecuteHistoryService;
import org.apache.hugegraph.service.query.QueryService;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

public class CypherHistoryFailureTest {

    @Test
    public void testSyncFailurePersistsOnlyControlledReasonCode() {
        HugeClient client = Mockito.mock(HugeClient.class);
        QueryService queryService = Mockito.mock(QueryService.class);
        ExecuteHistoryService historyService =
                Mockito.mock(ExecuteHistoryService.class);
        RuntimeException unsafe = new RuntimeException(
                "No signature of method: secret.Groovy.stack()");
        Mockito.when(queryService.executeCypherQuery(
                     Mockito.eq(client), Mockito.anyString()))
               .thenThrow(unsafe);

        TestController controller = new TestController(client);
        ReflectionTestUtils.setField(controller, "queryService", queryService);
        ReflectionTestUtils.setField(controller, "historyService", historyService);

        Assert.assertThrows(RuntimeException.class,
                            () -> controller.execute("DEFAULT", "hugegraph",
                                                     "MATCH INVALID"));

        ArgumentCaptor<ExecuteHistory> saved =
                ArgumentCaptor.forClass(ExecuteHistory.class);
        Mockito.verify(historyService).update(saved.capture());
        Assert.assertEquals("GREMLIN_EXECUTION_FAILED",
                            saved.getValue().getFailureReason());
        Assert.assertFalse(saved.getValue().getFailureReason()
                                .contains("signature"));
    }

    @Test
    public void testAsyncSubmissionFailureDoesNotClaimExecutionFailure() {
        HugeClient client = Mockito.mock(HugeClient.class);
        QueryService queryService = Mockito.mock(QueryService.class);
        ExecuteHistoryService historyService =
                Mockito.mock(ExecuteHistoryService.class);
        Mockito.when(queryService.executeCypherAsyncTask(
                     Mockito.eq(client), Mockito.anyString()))
               .thenThrow(new RuntimeException("secret backend detail"));

        TestController controller = new TestController(client);
        ReflectionTestUtils.setField(controller, "queryService", queryService);
        ReflectionTestUtils.setField(controller, "historyService", historyService);

        Assert.assertThrows(RuntimeException.class,
                            () -> controller.executeAsyncTask(
                                    "DEFAULT", "hugegraph",
                                    new GremlinQuery("MATCH INVALID")));

        ArgumentCaptor<ExecuteHistory> saved =
                ArgumentCaptor.forClass(ExecuteHistory.class);
        Mockito.verify(historyService).update(saved.capture());
        Assert.assertNull(saved.getValue().getFailureReason());
    }

    @Test
    public void testReadOnlyMarkerRejectsCypherMutationsBeforeExecutionOrHistory() {
        QueryService queryService = Mockito.mock(QueryService.class);
        ExecuteHistoryService historyService = Mockito.mock(ExecuteHistoryService.class);
        TestController controller = new TestController(Mockito.mock(HugeClient.class));
        ReflectionTestUtils.setField(controller, "queryService", queryService);
        ReflectionTestUtils.setField(controller, "historyService", historyService);
        GremlinQuery mutation = new GremlinQuery("MATCH (n) DELETE n", "Remove nodes", true);
        Assert.assertThrows(ExternalException.class, () -> controller.execute("DEFAULT", "hugegraph", mutation));
        Assert.assertThrows(ExternalException.class, () ->
                controller.executeAsyncTask("DEFAULT", "hugegraph", mutation));
        Mockito.verifyNoInteractions(queryService, historyService);
    }

    @Test
    public void testOrdinaryCypherWithDescriptionRemainsUnrestrictedWithoutReadOnlyMarker() {
        HugeClient client = Mockito.mock(HugeClient.class);
        QueryService queryService = Mockito.mock(QueryService.class);
        ExecuteHistoryService historyService = Mockito.mock(ExecuteHistoryService.class);
        TestController controller = new TestController(client);
        ReflectionTestUtils.setField(controller, "queryService", queryService);
        ReflectionTestUtils.setField(controller, "historyService", historyService);
        GremlinQuery mutation = new GremlinQuery("CREATE (:person)", "Create a person manually");
        controller.execute("DEFAULT", "hugegraph", mutation);
        Mockito.verify(queryService).executeCypherQuery(client, mutation.getContent());
        ArgumentCaptor<ExecuteHistory> history = ArgumentCaptor.forClass(ExecuteHistory.class);
        Mockito.verify(historyService).save(history.capture());
        Assert.assertEquals(mutation.getText(), history.getValue().getText());
    }

    @Test
    public void testGeneratedCypherReadPreservesQuestionInExistingHistory() {
        HugeClient client = Mockito.mock(HugeClient.class);
        QueryService queryService = Mockito.mock(QueryService.class);
        ExecuteHistoryService historyService = Mockito.mock(ExecuteHistoryService.class);
        TestController controller = new TestController(client);
        ReflectionTestUtils.setField(controller, "queryService", queryService);
        ReflectionTestUtils.setField(controller, "historyService", historyService);
        GremlinQuery query = new GremlinQuery("MATCH (n) RETURN count(n) AS count", "How many nodes?", true);
        controller.execute("DEFAULT", "hugegraph", query);
        Mockito.verify(queryService).executeCypherQuery(client, query.getContent());
        ArgumentCaptor<ExecuteHistory> history = ArgumentCaptor.forClass(ExecuteHistory.class);
        Mockito.verify(historyService).save(history.capture());
        Assert.assertEquals(query.getContent(), history.getValue().getContent());
        Assert.assertEquals(query.getText(), history.getValue().getText());
    }

    @Test
    public void testCypherPostAcceptsSameJsonQueryContractAsGremlin() throws Exception {
        HugeClient client = Mockito.mock(HugeClient.class);
        QueryService queryService = Mockito.mock(QueryService.class);
        ExecuteHistoryService historyService = Mockito.mock(ExecuteHistoryService.class);
        TestController controller = new TestController(client);
        ReflectionTestUtils.setField(controller, "queryService", queryService);
        ReflectionTestUtils.setField(controller, "historyService", historyService);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(post("/api/v1.3/graphspaces/DEFAULT/graphs/hugegraph/cypher")
                   .contentType(MediaType.APPLICATION_JSON)
                   .content("{\"content\":\"MATCH (n) RETURN n LIMIT 10\"," +
                            "\"text\":\"Find nodes\",\"read_only\":true}"))
           .andExpect(status().isOk());
        Mockito.verify(queryService).executeCypherQuery(client, "MATCH (n) RETURN n LIMIT 10");
        ArgumentCaptor<ExecuteHistory> history = ArgumentCaptor.forClass(ExecuteHistory.class);
        Mockito.verify(historyService).save(history.capture());
        Assert.assertEquals("Find nodes", history.getValue().getText());
    }

    @Test
    public void testOnlyActualAnonymousCypherAuthenticationFailureGetsActionableMessage() {
        for (boolean anonymous : new boolean[]{true, false}) {
            HugeClient client = Mockito.mock(HugeClient.class);
            QueryService queryService = Mockito.mock(QueryService.class);
            ExecuteHistoryService historyService = Mockito.mock(ExecuteHistoryService.class);
            TestController controller = new TestController(client);
            ReflectionTestUtils.setField(controller, "queryService", queryService);
            ReflectionTestUtils.setField(controller, "historyService", historyService);
            AuthModeService authMode = Mockito.mock(AuthModeService.class);
            Mockito.when(authMode.anonymous()).thenReturn(anonymous);
            ReflectionTestUtils.setField(controller, "authMode", authMode);
            ServerException upstream = new ServerException("private upstream response");
            upstream.status(401);
            ExternalException original = new ExternalException(
                    502, "gremlin.server.authentication-failed", upstream);
            Mockito.when(queryService.executeCypherQuery(client, "RETURN 1")).thenThrow(original);
            ExternalException failure = (ExternalException) Assert.assertThrows(ExternalException.class,
                    () -> controller.execute("DEFAULT", "hugegraph", new GremlinQuery("RETURN 1", "", true)));
            Assert.assertEquals(502, failure.status());
            if (anonymous) {
                Assert.assertEquals("cypher.server.authentication-required", failure.getMessage());
                Assert.assertNull(failure.getCause());
            } else {
                org.junit.Assert.assertSame(original, failure);
            }
            ArgumentCaptor<ExecuteHistory> history = ArgumentCaptor.forClass(ExecuteHistory.class);
            Mockito.verify(historyService).update(history.capture());
            Assert.assertEquals("GREMLIN_EXECUTION_FAILED", history.getValue().getFailureReason());
        }
    }

    @Test
    public void testUnsupportedCypherCannotExecuteOrCreateHistory() {
        HugeClient client = Mockito.mock(HugeClient.class);
        QueryService queryService = Mockito.mock(QueryService.class);
        ExecuteHistoryService historyService = Mockito.mock(ExecuteHistoryService.class);
        TestController controller = new TestController(client);
        ReflectionTestUtils.setField(controller, "queryService", queryService);
        ReflectionTestUtils.setField(controller, "historyService", historyService);
        Mockito.when(client.supportsCypher()).thenReturn(false);
        ExternalException failure = (ExternalException) Assert.assertThrows(ExternalException.class,
                () -> controller.execute("DEFAULT", "hugegraph", new GremlinQuery("RETURN 1", "", true)));
        Assert.assertEquals("text2gql.language-unavailable", failure.getMessage());
        Mockito.verifyNoInteractions(queryService, historyService);
    }

    private static class TestController extends CypherController {

        private final HugeClient client;

        TestController(HugeClient client) {
            this.client = client;
            Mockito.when(client.supportsCypher()).thenReturn(true);
        }

        @Override
        protected HugeClient authClient(String graphSpace, String graph) {
            return this.client;
        }
    }
}
