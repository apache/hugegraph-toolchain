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

package org.apache.hugegraph.service.query;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import org.apache.hugegraph.controller.query.Text2GqlController;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.SchemaManager;
import org.apache.hugegraph.entity.enums.QueryLanguage;
import org.apache.hugegraph.entity.query.Text2GqlRequest;
import org.apache.hugegraph.entity.query.Text2GqlResult;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.handler.MessageSourceHandler;
import org.apache.hugegraph.handler.ResponseAdvisor;
import org.junit.Test;
import org.junit.AfterClass;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

public class Text2GqlStreamTest {

    private static final ThreadPoolTaskScheduler HEARTBEATS = heartbeats();

    private static ThreadPoolTaskScheduler heartbeats() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setThreadNamePrefix("text2gql-test-heartbeat-");
        scheduler.setRemoveOnCancelPolicy(true);
        scheduler.initialize();
        return scheduler;
    }

    @AfterClass
    public static void stopHeartbeats() {
        HEARTBEATS.shutdown();
    }


    @Test
    public void testMvcFlushesRealDeltasBeforeCompletionWithoutResponseAdviceWrappingOrThinking() throws Exception {
        CountDownLatch first = new CountDownLatch(1);
        CountDownLatch finish = new CountDownLatch(1);
        AtomicReference<JsonNode> body = new AtomicReference<>();
        HttpServer server = server();
        server.createContext("/v1/chat/completions", exchange -> {
            body.set(new ObjectMapper().readTree(exchange.getRequestBody()));
            start(exchange);
            chunk(exchange, "{\"reasoning_content\":\"hidden reasoning\"}", null);
            chunk(exchange, "{\"content\":\"g.\"}", null);
            first.countDown();
            try {
                finish.await(3, TimeUnit.SECONDS);
                chunk(exchange, "{\"content\":\"V().limit(1)\"}", null);
                complete(exchange);
            } catch (InterruptedException failure) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        server.start();
        Fixture fixture = new Fixture(new Text2GqlService());
        try {
            MvcResult response = fixture.start(modelRequest(server));
            assertTrue(first.await(2, TimeUnit.SECONDS));
            awaitDelta(response);
            String partial = response.getResponse().getContentAsString();
            assertTrue(partial.contains("delta"));
            assertFalse(partial.contains("result"));
            assertFalse(partial.contains("hidden reasoning"));
            Mockito.verify(fixture.client).close();
            assertNull(response.getRequest().getAttribute("hugeClient"));
            finish.countDown();
            List<JsonNode> events = fixture.complete(response);
            assertEquals("waiting", events.get(0).get("type").asText());
            assertEquals("g.V().limit(1)", deltas(events));
            JsonNode result = events.get(events.size() - 1);
            assertEquals("result", result.get("type").asText());
            assertDuration(result);
            assertEquals("g.V().limit(1)", result.get("query").asText());
            assertTrue(result.get("valid").asBoolean());
            assertTrue(body.get().get("stream").asBoolean());
            assertFalse(body.get().has("tools"));
            assertFalse(body.get().has("response_format"));
            assertFalse(response.getResponse().getContentAsString().contains("secret-key"));
        } finally {
            finish.countDown();
            server.stop(0);
        }
    }

    @Test
    public void testModelDurationIncludesDelayedProviderButExcludesSchemaPreparation() throws Exception {
        AtomicLong schemaNanos = new AtomicLong();
        HttpServer server = server();
        server.createContext("/v1/chat/completions", exchange -> {
            try {
                Thread.sleep(120);
                start(exchange);
                chunk(exchange, "{\"content\":\"g.V().limit(1)\"}", null);
                complete(exchange);
            } catch (InterruptedException failure) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        server.start();
        try {
            Fixture fixture = new Fixture(new Text2GqlService());
            Mockito.when(fixture.client.schema().getPropertyKeys()).thenAnswer(invocation -> {
                long started = System.nanoTime();
                Thread.sleep(350);
                schemaNanos.set(System.nanoTime() - started);
                return List.of();
            });
            long started = System.nanoTime();
            List<JsonNode> events = fixture.complete(fixture.start(modelRequest(server)));
            long totalMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
            JsonNode terminal = events.get(events.size() - 1);
            assertEquals("result", terminal.get("type").asText());
            assertDuration(terminal);
            long duration = terminal.get("duration_ms").longValue();
            assertTrue("Provider delay must be counted", duration >= 100);
            assertTrue("Schema preparation must be excluded from model duration",
                       totalMillis - duration >= TimeUnit.NANOSECONDS.toMillis(schemaNanos.get()) - 20);
            assertFalse(events.get(0).has("duration_ms"));
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void testSharedCypherRepairUsesTheSamePreparedSchemaAndRedactedMessage() throws Exception {
        AtomicReference<JsonNode> body = new AtomicReference<>();
        HttpServer server = server();
        server.createContext("/v1/chat/completions", exchange -> {
            body.set(new ObjectMapper().readTree(exchange.getRequestBody()));
            start(exchange);
            chunk(exchange, "{\"content\":\"RETURN 1\"}", null);
            complete(exchange);
            exchange.close();
        });
        server.start();
        Fixture fixture = new Fixture(new Text2GqlService());
        try {
            Text2GqlRequest shared = new Text2GqlRequest();
            shared.setSource("shared");
            shared.setQuestion("Find people");
            shared.setLanguage(QueryLanguage.CYPHER);
            shared.setRepair(new Text2GqlRequest.Repair("RETURN secret-key", "bad secret-key"));
            Mockito.when(fixture.settings.sharedRequest(Mockito.any())).thenAnswer(invocation -> {
                Text2GqlRequest input = invocation.getArgument(0);
                Text2GqlRequest resolved = modelRequest(server);
                resolved.setLanguage(input.getLanguage());
                resolved.setRepair(input.getRepair());
                return resolved;
            });
            List<JsonNode> events = fixture.complete(fixture.start(shared));
            JsonNode result = events.get(events.size() - 1);
            assertEquals("cypher", result.get("language").asText());
            assertEquals("RETURN 1", result.get("query").asText());
            assertTrue(result.get("valid").asBoolean());
            String message = body.get().get("messages").get(1).get("content").asText();
            assertTrue(message.contains("failed_query"));
            assertFalse(message.contains("secret-key"));
            Mockito.verify(fixture.settings).sharedRequest(Mockito.any());
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void testInvalidCompletedAndOversizedStreamsStayBoundedDrafts() throws Exception {
        for (String query : new String[]{"g.V().drop()", "x".repeat(10001)}) {
            HttpServer server = server();
            server.createContext("/v1/chat/completions", exchange -> {
                start(exchange);
                chunk(exchange, new ObjectMapper().writeValueAsString(Map.of("content", query)), null);
                try {
                    complete(exchange);
                } catch (IOException ignored) {
                    // An oversized draft cancels the provider before reading the rest of the stream.
                }
                exchange.close();
            });
            server.start();
            try {
                Fixture fixture = new Fixture(new Text2GqlService());
                List<JsonNode> events = fixture.complete(fixture.start(modelRequest(server)));
                JsonNode result = events.get(events.size() - 1);
                assertEquals("result", result.get("type").asText());
                assertFalse(result.get("valid").asBoolean());
                assertTrue(result.get("query").asText().length() <= 10000);
                assertTrue(deltas(events).length() <= 10000);
            } finally {
                server.stop(0);
            }
        }
    }

    @Test
    public void testAbruptEofAfterAValidPrefixNeverBecomesAnExecutableResult() throws Exception {
        HttpServer server = server();
        server.createContext("/v1/chat/completions", exchange -> {
            start(exchange);
            chunk(exchange, "{\"content\":\"g.V()\"}", null);
            exchange.close();
        });
        server.start();
        try {
            Fixture fixture = new Fixture(new Text2GqlService());
            List<JsonNode> events = fixture.complete(fixture.start(modelRequest(server)));
            assertEquals("g.V()", deltas(events));
            JsonNode terminal = events.get(events.size() - 1);
            assertEquals("error", terminal.get("type").asText());
            assertDuration(terminal);
            assertEquals(502, terminal.get("status").asInt());
            assertEquals("SAFE:text2gql.model-failed", terminal.get("message").asText());
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void testHttpFailureAndDeadlineProduceSafeSingleTerminalEvents() throws Exception {
        for (boolean timeout : new boolean[]{false, true}) {
            AtomicInteger calls = new AtomicInteger();
            HttpServer server = server();
            server.createContext("/v1/chat/completions", exchange -> {
                calls.incrementAndGet();
                if (timeout) {
                    try {
                        Thread.sleep(300);
                    } catch (InterruptedException failure) {
                        Thread.currentThread().interrupt();
                    }
                } else {
                    byte[] secret = "secret-key provider private body".getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(401, secret.length);
                    exchange.getResponseBody().write(secret);
                }
                exchange.close();
            });
            server.start();
            try {
                Fixture fixture = new Fixture(new Text2GqlService(timeout ? Duration.ofMillis(80) :
                                                                           Duration.ofSeconds(2)));
                List<JsonNode> events = fixture.complete(fixture.start(modelRequest(server)));
                assertEquals(2, events.size());
                JsonNode terminal = events.get(1);
                assertEquals("error", terminal.get("type").asText());
                assertDuration(terminal);
                assertEquals(timeout ? 504 : 502, terminal.get("status").asInt());
                assertEquals(timeout ? "SAFE:text2gql.model-timeout" :
                                       "SAFE:text2gql.model-authentication-failed", terminal.get("message").asText());
                assertFalse(terminal.toString().contains("secret-key"));
                assertTrue(calls.get() <= 1);
            } finally {
                server.stop(0);
            }
        }
    }

    @Test
    public void testCancellationBeforeFirstTextSuppressesAllLaterResults() throws Exception {
        CountDownLatch received = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        HttpServer server = server();
        server.createContext("/v1/chat/completions", exchange -> {
            start(exchange);
            received.countDown();
            try {
                release.await(2, TimeUnit.SECONDS);
                chunk(exchange, "{\"content\":\"g.V()\"}", null);
                complete(exchange);
            } catch (IOException ignored) {
                // Cancellation closes the upstream response before any generated text.
            } catch (InterruptedException failure) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        server.start();
        AtomicInteger callbacks = new AtomicInteger();
        try {
            Text2GqlService service = new Text2GqlService();
            Text2GqlService.StreamControl control = service.stream(service.prepare(client(), modelRequest(server)),
                    new Text2GqlService.StreamListener() {
                        @Override
                        public void onDelta(String text) {
                            callbacks.incrementAndGet();
                        }

                        @Override
                        public void onResult(Text2GqlResult result) {
                            callbacks.incrementAndGet();
                        }

                        @Override
                        public void onError(ExternalException failure) {
                            callbacks.incrementAndGet();
                        }
                    });
            assertTrue(received.await(2, TimeUnit.SECONDS));
            control.cancel();
            release.countDown();
            Thread.sleep(100);
            assertEquals(0, callbacks.get());
        } finally {
            release.countDown();
            server.stop(0);
        }
    }

    @Test
    public void testAuthorizationAndPreparationErrorsNeverStartAStreamAndCloseAcquiredGraphClients() {
        for (boolean denied : new boolean[]{true, false}) {
            HugeClient client = client();
            org.springframework.mock.web.MockHttpServletRequest request =
                    new org.springframework.mock.web.MockHttpServletRequest();
            Text2GqlController controller = new Text2GqlController() {
                @Override
                protected HugeClient authClient(String graphSpace, String graph) {
                    if (denied) {
                        throw new ExternalException(403, "denied");
                    }
                    request.setAttribute("hugeClient", client);
                    return client;
                }

                @Override
                protected jakarta.servlet.http.HttpServletRequest getRequest() {
                    return request;
                }
            };
            ReflectionTestUtils.setField(controller, "service", new Text2GqlService());
            ReflectionTestUtils.setField(controller, "settings", Mockito.mock(Text2GqlSettingsService.class));
            Text2GqlRequest input = new Text2GqlRequest();
            input.setRepair(new Text2GqlRequest.Repair(null, null));
            try {
                controller.stream("space", "graph", input, new org.springframework.mock.web.MockHttpServletResponse());
                fail("Expected authorization or preparation rejection before SSE starts");
            } catch (ExternalException failure) {
                assertEquals(denied ? 403 : 400, failure.status());
            }
            Mockito.verify(client, Mockito.never()).schema();
            Mockito.verify(client, denied ? Mockito.never() : Mockito.times(1)).close();
            assertNull(request.getAttribute("hugeClient"));
        }
    }

    private static void assertDuration(JsonNode event) {
        JsonNode duration = event.get("duration_ms");
        assertTrue("Terminal event must carry a nonnegative duration_ms",
                   duration != null && duration.isIntegralNumber() && duration.canConvertToLong() &&
                   duration.longValue() >= 0);
    }

    private static void awaitDelta(MvcResult response) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (System.nanoTime() < deadline) {
            if (response.getResponse().getContentAsString().contains("delta")) {
                return;
            }
            Thread.sleep(10);
        }
        fail("The first model delta was not flushed before provider completion");
    }

    private static String deltas(List<JsonNode> events) {
        StringBuilder text = new StringBuilder();
        for (JsonNode event : events) {
            if ("delta".equals(event.get("type").asText())) {
                text.append(event.get("text").asText());
            }
        }
        return text.toString();
    }

    private static HttpServer server() throws IOException {
        return HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    }

    private static void start(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
        exchange.sendResponseHeaders(200, 0);
    }

    private static void chunk(HttpExchange exchange, String delta, String reason) throws IOException {
        String event = "data: {\"choices\":[{\"index\":0,\"delta\":" + delta +
                       ",\"finish_reason\":" + (reason == null ? "null" : "\"" + reason + "\"") + "}]}\n\n";
        exchange.getResponseBody().write(event.getBytes(StandardCharsets.UTF_8));
        exchange.getResponseBody().flush();
    }

    private static void complete(HttpExchange exchange) throws IOException {
        chunk(exchange, "{}", "stop");
        exchange.getResponseBody().write("data: [DONE]\n\n".getBytes(StandardCharsets.UTF_8));
        exchange.getResponseBody().flush();
    }

    private static Text2GqlRequest modelRequest(HttpServer server) {
        Text2GqlRequest request = new Text2GqlRequest();
        request.setQuestion("Find people");
        request.setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/v1");
        request.setModel("test-model");
        request.setApiKey("secret-key");
        return request;
    }

    private static HugeClient client() {
        HugeClient client = Mockito.mock(HugeClient.class);
        SchemaManager schema = Mockito.mock(SchemaManager.class);
        Mockito.when(client.schema()).thenReturn(schema);
        Mockito.when(client.supportsCypher()).thenReturn(true);
        Mockito.when(schema.getPropertyKeys()).thenReturn(List.of());
        Mockito.when(schema.getVertexLabels()).thenReturn(List.of());
        Mockito.when(schema.getEdgeLabels()).thenReturn(List.of());
        return client;
    }

    private static final class Fixture {

        private final HugeClient client = client();
        private final Text2GqlSettingsService settings = Mockito.mock(Text2GqlSettingsService.class);
        private final MockMvc mvc;

        private Fixture(Text2GqlService service) {
            Text2GqlController controller = new Text2GqlController() {
                @Override
                protected HugeClient authClient(String graphSpace, String graph) {
                    this.getRequest().setAttribute("hugeClient", Fixture.this.client);
                    return Fixture.this.client;
                }
            };
            ReflectionTestUtils.setField(controller, "service", service);
            ReflectionTestUtils.setField(controller, "heartbeats", HEARTBEATS);
            ReflectionTestUtils.setField(controller, "settings", this.settings);
            ReflectionTestUtils.setField(controller, "messages", new MessageSourceHandler() {
                @Override
                public String getMessage(String message, Object... args) {
                    return "SAFE:" + message;
                }
            });
            this.mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ResponseAdvisor()).build();
        }

        private MvcResult start(Text2GqlRequest request) throws Exception {
            // API keys are write-only in the DTO and therefore supplied explicitly by the simulated browser.
            Map<String, Object> body = new ObjectMapper().convertValue(request, Map.class);
            if ("custom".equals(request.getSource())) {
                body.put("api_key", request.getApiKey());
            }
            return this.mvc.perform(post("/api/v1.3/graphspaces/space/graphs/graph/text2gql/stream")
                    .contentType(MediaType.APPLICATION_JSON).accept(MediaType.TEXT_EVENT_STREAM)
                    .content(new ObjectMapper().writeValueAsString(body)))
                    .andExpect(status().isOk()).andExpect(request().asyncStarted()).andReturn();
        }

        private List<JsonNode> complete(MvcResult response) throws Exception {
            response.getAsyncResult(3000);
            this.mvc.perform(asyncDispatch(response)).andExpect(status().isOk());
            assertTrue(response.getResponse().getContentType().startsWith("text/event-stream"));
            List<JsonNode> events = new ArrayList<>();
            for (String line : response.getResponse().getContentAsString().split("\n")) {
                if (line.startsWith("data:")) {
                    events.add(new ObjectMapper().readTree(line.substring(5).trim()));
                }
            }
            return events;
        }
    }
}
