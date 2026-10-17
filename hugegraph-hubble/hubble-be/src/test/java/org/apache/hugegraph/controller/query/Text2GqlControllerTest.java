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
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

package org.apache.hugegraph.controller.query;

import java.util.List;
import java.util.Map;

import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.SchemaManager;
import org.apache.hugegraph.entity.enums.QueryLanguage;
import org.apache.hugegraph.entity.query.Text2GqlRequest;
import org.apache.hugegraph.entity.query.Text2GqlResult;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.service.query.Text2GqlService;
import org.apache.hugegraph.service.auth.AuthModeService;
import org.apache.hugegraph.service.query.Text2GqlSettingsService;
import org.junit.Test;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.fail;

public class Text2GqlControllerTest {

    @Test
    public void testUsesAuthorizedClientForCurrentGraph() {
        HugeClient client = Mockito.mock(HugeClient.class);
        Text2GqlService service = Mockito.mock(Text2GqlService.class);
        BoundController controller = new BoundController(client);
        ReflectionTestUtils.setField(controller, "service", service);
        Text2GqlRequest request = new Text2GqlRequest();
        Mockito.when(service.generate(client, request)).thenReturn(new Text2GqlResult("g.V().limit(10)", QueryLanguage.GREMLIN, true));

        assertEquals("g.V().limit(10)", controller.generate("my-space", "my-graph", request).getQuery());
        assertEquals("my-space", controller.space);
        assertEquals("my-graph", controller.graph);
        Mockito.verify(service).generate(client, request);
        Mockito.verifyNoMoreInteractions(service);
    }

    @Test
    public void testAuthorizationFailureNeverCallsModel() {
        Text2GqlService service = Mockito.mock(Text2GqlService.class);
        BoundController controller = new BoundController(null);
        ReflectionTestUtils.setField(controller, "service", service);
        controller.failure = new ExternalException(403, "permission denied");
        try {
            controller.generate("private-space", "private-graph", new Text2GqlRequest());
            fail("Expected graph authorization failure");
        } catch (ExternalException exception) {
            assertSame(controller.failure, exception);
        }
        Mockito.verifyNoInteractions(service);
    }

    @Test
    public void testRequestToStringDoesNotExposeApiKey() {
        Text2GqlRequest request = new Text2GqlRequest();
        request.setApiKey("secret-key-never-log");
        assertFalse(request.toString().contains("secret-key-never-log"));
    }

    @Test
    public void testSharedSourceUsesOnlyResolvedServerConfiguration() {
        HugeClient client = Mockito.mock(HugeClient.class);
        Text2GqlService service = Mockito.mock(Text2GqlService.class);
        Text2GqlSettingsService settings = Mockito.mock(Text2GqlSettingsService.class);
        BoundController controller = new BoundController(client, true);
        ReflectionTestUtils.setField(controller, "service", service);
        ReflectionTestUtils.setField(controller, "settings", settings);
        Text2GqlRequest request = new Text2GqlRequest();
        request.setSource("shared");
        Text2GqlRequest resolved = new Text2GqlRequest();
        resolved.setModel("shared-model");
        Mockito.when(settings.sharedRequest(request)).thenReturn(resolved);
        Mockito.when(service.generate(client, resolved)).thenReturn(new Text2GqlResult("g.V().limit(10)", QueryLanguage.GREMLIN, true));
        assertEquals("g.V().limit(10)", controller.generate("space", "graph", request).getQuery());
        Mockito.verify(service).generate(client, resolved);
        Mockito.verifyNoMoreInteractions(service);
    }

    @Test
    public void testAvailabilityChecksGraphSchemaReadPermissionBeforeReturningDescriptor() {
        HugeClient client = Mockito.mock(HugeClient.class);
        SchemaManager schema = Mockito.mock(SchemaManager.class);
        Text2GqlSettingsService settings = Mockito.mock(Text2GqlSettingsService.class);
        BoundController controller = new BoundController(client, true);
        ReflectionTestUtils.setField(controller, "settings", settings);
        Mockito.when(client.schema()).thenReturn(schema);
        Mockito.when(schema.getPropertyKeys()).thenReturn(List.of());
        Mockito.when(settings.availability()).thenReturn(Map.of("available", false));
        Map<String, Object> templates = Map.of("prompts", Map.of("gremlin", "shared text"),
                                              "default_prompts", Map.of("gremlin", "built-in text"));
        Mockito.when(settings.promptSettings()).thenReturn(templates);
        assertEquals(Map.of("available", false, "custom_available", true,
                            "prompts", templates.get("prompts"), "default_prompts", templates.get("default_prompts")),
                     controller.config("private-space", "private-graph"));
        assertEquals("private-space", controller.space);
        assertEquals("private-graph", controller.graph);
        org.mockito.InOrder order = Mockito.inOrder(client, schema, settings);
        order.verify(client).schema();
        order.verify(schema).getPropertyKeys();
        order.verify(settings).availability();
        order.verify(settings).promptSettings();
        Mockito.when(schema.getPropertyKeys()).thenThrow(new ExternalException(403, "denied"));
        Mockito.clearInvocations(settings);
        try {
            controller.config("private-space", "private-graph");
            fail("Expected graph read authorization failure");
        } catch (ExternalException failure) {
            assertEquals(403, failure.status());
        }
        Mockito.verifyNoInteractions(settings);
    }

    @Test
    public void testUnknownSourceCannotCallModel() {
        Text2GqlService service = Mockito.mock(Text2GqlService.class);
        BoundController controller = new BoundController(Mockito.mock(HugeClient.class));
        ReflectionTestUtils.setField(controller, "service", service);
        Text2GqlRequest request = new Text2GqlRequest();
        request.setSource("unknown");
        try {
            controller.generate("space", "graph", request);
            fail("Expected invalid source failure");
        } catch (ExternalException failure) {
            assertEquals(400, failure.status());
        }
        Mockito.verifyNoInteractions(service);
    }

    @Test
    public void testVerifiedAnonymousGraphCanUseCustomModel() {
        HugeClient client = Mockito.mock(HugeClient.class);
        Text2GqlService service = Mockito.mock(Text2GqlService.class);
        BoundController controller = new BoundController(client, true);
        ReflectionTestUtils.setField(controller, "service", service);
        Text2GqlRequest request = new Text2GqlRequest();
        Mockito.when(service.generate(client, request)).thenReturn(new Text2GqlResult("g.V().count()", QueryLanguage.GREMLIN, true));
        assertEquals("g.V().count()", controller.generate("space", "graph", request).getQuery());
        Mockito.verify(service).generate(client, request);
    }

    @Test
    public void testGenerationResponseUsesOneQueryLanguageAndValidityContractForBothDialects() throws Exception {
        for (QueryLanguage language : QueryLanguage.values()) {
            HugeClient client = Mockito.mock(HugeClient.class);
            Text2GqlService service = Mockito.mock(Text2GqlService.class);
            BoundController controller = new BoundController(client);
            ReflectionTestUtils.setField(controller, "service", service);
            Text2GqlRequest request = new Text2GqlRequest();
            request.setLanguage(language);
            for (boolean valid : new boolean[]{false, true}) {
                Text2GqlResult result = new Text2GqlResult("generated-query", language, valid);
                Mockito.when(service.generate(client, request)).thenReturn(result);
                Text2GqlResult response = controller.generate("space", "graph", request);
                assertSame(result, response);
                assertEquals(Map.of("query", "generated-query", "language", language.value(), "valid", valid),
                             new ObjectMapper().readValue(new ObjectMapper().writeValueAsString(response), Map.class));
            }
        }
    }

    @Test
    public void testQueryLanguageDefaultsToGremlinAndRejectsUnsupportedJsonValues() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        assertEquals(QueryLanguage.GREMLIN, mapper.readValue("{}", Text2GqlRequest.class).getLanguage());
        assertEquals(QueryLanguage.CYPHER, mapper.readValue(
                "{\"language\":\"cypher\"}", Text2GqlRequest.class).getLanguage());
        for (String invalid : new String[]{"sql", "Gremlin", "CYPHER", "", "gremlin "}) {
            try {
                mapper.readValue("{\"language\":\"" + invalid + "\"}", Text2GqlRequest.class);
                fail("Expected strict query-language validation");
            } catch (JsonProcessingException expected) {
                // The transport rejects unknown dialects before accessing a model.
            }
        }
    }

    private static final class BoundController extends Text2GqlController {

        private final HugeClient client;
        private String space;
        private String graph;
        private ExternalException failure;

        private BoundController(HugeClient client) {
            this(client, false);
        }

        private BoundController(HugeClient client, boolean anonymous) {
            this.client = client;
            ReflectionTestUtils.setField(this, "settings", Mockito.mock(Text2GqlSettingsService.class));
            this.authMode = Mockito.mock(AuthModeService.class);
            Mockito.when(this.authMode.anonymous()).thenReturn(anonymous);
        }

        @Override
        protected HugeClient authClient(String graphSpace, String graph) {
            this.space = graphSpace;
            this.graph = graph;
            if (this.failure != null) {
                throw this.failure;
            }
            return this.client;
        }
    }
}
