/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to you under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hugegraph.service.query;

import java.io.IOException;
import java.io.InterruptedIOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.Test;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import dev.langchain4j.exception.HttpException;
import dev.langchain4j.http.client.HttpClient;
import dev.langchain4j.http.client.HttpMethod;
import dev.langchain4j.http.client.HttpRequest;
import dev.langchain4j.http.client.SuccessfulHttpResponse;
import dev.langchain4j.http.client.sse.DefaultServerSentEventParser;
import dev.langchain4j.http.client.sse.ServerSentEvent;
import dev.langchain4j.http.client.sse.ServerSentEventContext;
import dev.langchain4j.http.client.sse.ServerSentEventListener;
import dev.langchain4j.http.client.sse.ServerSentEventParser;
import dev.langchain4j.model.openai.OpenAiChatModel;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class Text2GqlHttpClientTest {

    private static final String HOST = "text2gql.test";

    @Test
    public void shouldResolveAndPinAddressesAtConnectTimeAndKeepOriginalHost() throws Exception {
        AtomicInteger dnsLookups = new AtomicInteger();
        AtomicInteger redirectedRequests = new AtomicInteger();
        AtomicReference<String> hostHeader = new AtomicReference<>();
        HttpServer server = server(exchange -> {
            hostHeader.set(exchange.getRequestHeaders().getFirst("Host"));
            if ("/redirect".equals(exchange.getRequestURI().getPath())) {
                exchange.getResponseHeaders().set("Location", "/target");
                exchange.sendResponseHeaders(302, -1);
            } else if ("/target".equals(exchange.getRequestURI().getPath())) {
                redirectedRequests.incrementAndGet();
                exchange.sendResponseHeaders(200, -1);
            }
            exchange.close();
        });
        server.start();

        try {
            Text2GqlHttpClient adapter = new Text2GqlHttpClient(host -> {
                dnsLookups.incrementAndGet();
                assertEquals(HOST, host);
                return List.of(InetAddress.getByAddress(host, new byte[]{127, 0, 0, 1}));
            });
            HttpClient client = adapter.build();
            assertEquals("DNS must not be resolved before the request", 0, dnsLookups.get());

            HttpRequest request = HttpRequest.builder()
                    .method(HttpMethod.GET)
                    .url(url(server, "/redirect"))
                    .build();
            try {
                client.execute(request);
                fail("Expected redirects to be rejected");
            } catch (HttpException exception) {
                assertEquals(302, exception.statusCode());
            }

            assertEquals(1, dnsLookups.get());
            assertEquals(0, redirectedRequests.get());
            assertEquals(HOST + ":" + server.getAddress().getPort(), hostHeader.get());
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void shouldStopWhenConnectTimeDnsValidationRejectsHost() throws Exception {
        AtomicInteger requests = new AtomicInteger();
        HttpServer server = server(exchange -> {
            requests.incrementAndGet();
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        server.start();

        try {
            Text2GqlHttpClient adapter = new Text2GqlHttpClient(host -> {
                throw new UnknownHostException("rejected by address policy");
            });
            HttpRequest request = HttpRequest.builder()
                    .method(HttpMethod.GET)
                    .url(url(server, "/blocked"))
                    .build();
            try {
                adapter.build().execute(request);
                fail("Expected address validation to reject the connection");
            } catch (RuntimeException exception) {
                assertNotNull(findCause(exception, UnknownHostException.class));
            }
            assertEquals(0, requests.get());
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void shouldNotRetryFailedRequest() throws Exception {
        AtomicInteger requests = new AtomicInteger();
        HttpServer server = server(exchange -> {
            requests.incrementAndGet();
            exchange.close();
        });
        server.start();

        try {
            Text2GqlHttpClient adapter = new Text2GqlHttpClient(host ->
                    List.of(InetAddress.getByAddress(host, new byte[]{127, 0, 0, 1})));
            try {
                adapter.build().execute(HttpRequest.builder()
                        .method(HttpMethod.GET)
                        .url(url(server, "/drop"))
                        .build());
                fail("Expected the server connection to close");
            } catch (RuntimeException ignored) {
                assertEquals(1, requests.get());
            }
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void shouldRejectDeclaredOversizedErrorBodyWithoutExposingIt() throws Exception {
        String marker = "upstream-secret-marker";
        HttpServer server = server(exchange -> {
            byte[] prefix = marker.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/plain");
            exchange.sendResponseHeaders(503, Text2GqlHttpClient.MAX_RESPONSE_BODY_BYTES + 1L);
            try {
                exchange.getResponseBody().write(prefix);
            } catch (IOException ignored) {
                // The client rejects the declared length before reading the body.
            } finally {
                exchange.close();
            }
        });
        server.start();

        try {
            Text2GqlHttpClient adapter = new Text2GqlHttpClient(host ->
                    List.of(InetAddress.getByAddress(host, new byte[]{127, 0, 0, 1})));
            try {
                adapter.build().execute(HttpRequest.builder()
                        .method(HttpMethod.GET)
                        .url(url(server, "/declared-error"))
                        .build());
                fail("Expected an oversized error body to be rejected");
            } catch (HttpException exception) {
                assertEquals(503, exception.statusCode());
                assertFalse(exception.getMessage().contains(marker));
            }
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void shouldRejectDeclaredOversizedSuccessBody() throws Exception {
        HttpServer server = server(exchange -> {
            exchange.sendResponseHeaders(200, Text2GqlHttpClient.MAX_RESPONSE_BODY_BYTES + 1L);
            try {
                exchange.getResponseBody().write("prefix".getBytes(StandardCharsets.UTF_8));
            } catch (IOException ignored) {
                // The client rejects the declared length before reading the body.
            } finally {
                exchange.close();
            }
        });
        server.start();

        try {
            Text2GqlHttpClient adapter = new Text2GqlHttpClient(host ->
                    List.of(InetAddress.getByAddress(host, new byte[]{127, 0, 0, 1})));
            try {
                adapter.build().execute(HttpRequest.builder()
                        .method(HttpMethod.GET)
                        .url(url(server, "/declared-success"))
                        .build());
                fail("Expected an oversized success body to be rejected");
            } catch (IllegalStateException exception) {
                assertEquals("Upstream response exceeds the size limit", exception.getMessage());
            }
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void shouldRejectOversizedChunkedSuccessBody() throws Exception {
        HttpServer server = server(exchange -> writeOversizedChunkedBody(exchange, 200, null));
        server.start();

        try {
            Text2GqlHttpClient adapter = new Text2GqlHttpClient(host ->
                    List.of(InetAddress.getByAddress(host, new byte[]{127, 0, 0, 1})));
            try {
                adapter.build().execute(HttpRequest.builder()
                        .method(HttpMethod.GET)
                        .url(url(server, "/chunked-success"))
                        .build());
                fail("Expected an oversized chunked response to be rejected");
            } catch (IllegalStateException exception) {
                assertEquals("Upstream response exceeds the size limit", exception.getMessage());
            }
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void shouldRejectOversizedChunkedErrorBodyWithoutExposingIt() throws Exception {
        String marker = "upstream-secret-marker";
        HttpServer server = server(exchange -> writeOversizedChunkedBody(exchange, 503, marker));
        server.start();

        try {
            Text2GqlHttpClient adapter = new Text2GqlHttpClient(host ->
                    List.of(InetAddress.getByAddress(host, new byte[]{127, 0, 0, 1})));
            try {
                adapter.build().execute(HttpRequest.builder()
                        .method(HttpMethod.GET)
                        .url(url(server, "/chunked-error"))
                        .build());
                fail("Expected an oversized chunked error body to be rejected");
            } catch (HttpException exception) {
                assertEquals(503, exception.statusCode());
                assertFalse(exception.getMessage().contains(marker));
            }
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void shouldRetainTimeoutCauseForSilentResponse() throws Exception {
        HttpServer server = server(exchange -> {
            try {
                Thread.sleep(500);
                exchange.sendResponseHeaders(200, -1);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IOException(exception);
            } finally {
                exchange.close();
            }
        });
        server.start();

        try {
            Text2GqlHttpClient adapter = new Text2GqlHttpClient(host ->
                    List.of(InetAddress.getByAddress(host, new byte[]{127, 0, 0, 1})));
            adapter.connectTimeout(Duration.ofSeconds(1)).readTimeout(Duration.ofMillis(100));
            try {
                adapter.build().execute(HttpRequest.builder()
                        .method(HttpMethod.GET)
                        .url(url(server, "/slow"))
                        .build());
                fail("Expected the configured read timeout");
            } catch (RuntimeException exception) {
                assertTrue(findCause(exception, SocketTimeoutException.class) != null ||
                           findCause(exception, InterruptedIOException.class) != null);
            }
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void shouldEnforceTotalCallDeadlineForDripResponse() throws Exception {
        HttpServer server = server(exchange -> {
            exchange.sendResponseHeaders(200, 0);
            try {
                for (int i = 0; i < 30; i++) {
                    exchange.getResponseBody().write('x');
                    exchange.getResponseBody().flush();
                    Thread.sleep(50);
                }
            } catch (IOException ignored) {
                // The call deadline closes the response while the server is still writing.
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IOException(exception);
            } finally {
                exchange.close();
            }
        });
        server.start();

        try {
            Duration timeout = Duration.ofMillis(250);
            Text2GqlHttpClient adapter = new Text2GqlHttpClient(host ->
                    List.of(InetAddress.getByAddress(host, new byte[]{127, 0, 0, 1})));
            OpenAiChatModel model = OpenAiChatModel.builder()
                    .baseUrl("http://" + HOST + ":" + server.getAddress().getPort() + "/v1")
                    .apiKey("test-key")
                    .modelName("test-model")
                    .timeout(timeout)
                    .maxRetries(0)
                    .httpClientBuilder(adapter)
                    .build();
            long start = System.nanoTime();
            try {
                model.chat("drip response");
                fail("Expected the total call deadline to stop a drip response");
            } catch (RuntimeException exception) {
                long elapsedMs = Duration.ofNanos(System.nanoTime() - start).toMillis();
                assertNotNull(findCause(exception, InterruptedIOException.class));
                assertTrue("Call exceeded expected total deadline: " + elapsedMs, elapsedMs < 1000);
            }
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void shouldDeliverFirstEventBeforeResponseCompletes() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        HttpServer server = server(exchange -> {
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.sendResponseHeaders(200, 0);
            try {
                writeEvent(exchange, "first");
                awaitRelease(release);
                writeEvent(exchange, "last");
            } finally {
                exchange.close();
            }
        });
        server.start();
        StreamResult result = new StreamResult();
        try {
            adapter().build().execute(request(server), new DefaultServerSentEventParser(), result);
            assertTrue("First event must arrive while the server is still waiting",
                       result.first.await(2, TimeUnit.SECONDS));
            assertEquals(1, result.events.get());
            assertEquals(1L, result.finished.getCount());
            assertEquals(200, result.status.get());
            release.countDown();
            assertTrue(result.finished.await(2, TimeUnit.SECONDS));
            assertEquals(2, result.events.get());
            assertEquals(1, result.closed.get());
            assertEquals(null, result.error.get());
        } finally {
            release.countDown();
            server.stop(0);
        }
    }

    @Test
    public void shouldRejectStreamingHttpErrorsWithoutExposingBodies() throws Exception {
        for (int status : new int[]{401, 429}) {
            HttpServer server = server(exchange -> {
                byte[] secret = "private-upstream-error-key".getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(status, 0);
                try {
                    exchange.getResponseBody().write(secret);
                } finally {
                    exchange.close();
                }
            });
            server.start();
            try {
                StreamResult result = new StreamResult();
                adapter().build().execute(request(server), new DefaultServerSentEventParser(), result);
                assertTrue(result.finished.await(2, TimeUnit.SECONDS));
                assertTrue(result.error.get() instanceof HttpException);
                assertEquals(status, ((HttpException) result.error.get()).statusCode());
                assertFalse(result.error.get().getMessage().contains("private-upstream"));
                assertEquals(0, result.events.get());
                assertEquals(0, result.closed.get());
            } finally {
                server.stop(0);
            }
        }
    }

    @Test
    public void shouldBoundChunkedStreamingResponseCumulatively() throws Exception {
        HttpServer server = server(exchange -> {
            exchange.sendResponseHeaders(200, 0);
            try {
                byte[] event = ("data: " + "x".repeat(1000) + "\n\n")
                        .getBytes(StandardCharsets.UTF_8);
                for (int i = 0; i < 3000; i++) {
                    exchange.getResponseBody().write(event);
                }
            } catch (IOException ignored) {
                // The bounded input closes the socket after the overflow sentinel.
            } finally {
                exchange.close();
            }
        });
        server.start();
        try {
            StreamResult result = new StreamResult();
            adapter().build().execute(request(server), new DefaultServerSentEventParser(), result);
            assertTrue(result.finished.await(5, TimeUnit.SECONDS));
            assertNotNull(result.error.get());
            assertEquals("Upstream response exceeds the size limit", result.error.get().getMessage());
            assertTrue(result.events.get() > 1);
            assertTrue("The parser must not receive an over-limit event",
                       result.events.get() * 1008 <= Text2GqlHttpClient.MAX_RESPONSE_BODY_BYTES);
            assertEquals(0, result.closed.get());
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void shouldRetainStreamingTimeoutCauseBeforeFirstByte() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        HttpServer server = server(exchange -> {
            awaitRelease(release);
            exchange.close();
        });
        server.start();
        try {
            Text2GqlHttpClient adapter = adapter();
            adapter.readTimeout(Duration.ofMillis(150));
            StreamResult result = new StreamResult();
            adapter.build().execute(request(server), new DefaultServerSentEventParser(), result);
            assertTrue(result.finished.await(2, TimeUnit.SECONDS));
            assertNotNull(findCause(result.error.get(), InterruptedIOException.class));
            assertEquals(0, result.events.get());
        } finally {
            release.countDown();
            server.stop(0);
        }
    }

    @Test
    public void shouldEnforceStreamingTotalDeadlineDuringContinuousEvents() throws Exception {
        HttpServer server = server(exchange -> {
            exchange.sendResponseHeaders(200, 0);
            try {
                for (int i = 0; i < 100; i++) {
                    writeEvent(exchange, "partial");
                    Thread.sleep(30);
                }
            } catch (IOException ignored) {
                // Continuous bytes do not extend the overall deadline.
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        server.start();
        try {
            Text2GqlHttpClient adapter = adapter();
            adapter.readTimeout(Duration.ofMillis(250));
            StreamResult result = new StreamResult();
            adapter.build().execute(request(server), new DefaultServerSentEventParser(), result);
            assertTrue(result.finished.await(2, TimeUnit.SECONDS));
            assertNotNull(findCause(result.error.get(), InterruptedIOException.class));
            assertTrue(result.events.get() > 0);
            assertEquals(0, result.closed.get());
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void shouldCancelBeforeFirstEventAndBeforeCallRegistration() throws Exception {
        for (boolean beforeRegistration : new boolean[]{false, true}) {
            CountDownLatch connected = new CountDownLatch(1);
            CountDownLatch release = new CountDownLatch(1);
            HttpServer server = server(exchange -> {
                connected.countDown();
                awaitRelease(release);
                exchange.close();
            });
            server.start();
            try {
                Text2GqlHttpClient adapter = adapter();
                if (beforeRegistration) {
                    adapter.cancel();
                }
                StreamResult result = new StreamResult();
                adapter.build().execute(request(server), new DefaultServerSentEventParser(), result);
                if (!beforeRegistration) {
                    assertTrue(connected.await(2, TimeUnit.SECONDS));
                    adapter.cancel();
                }
                assertTrue(result.finished.await(2, TimeUnit.SECONDS));
                assertNotNull(result.error.get());
                assertEquals(0, result.events.get());
            } finally {
                release.countDown();
                server.stop(0);
            }
        }
    }

    @Test
    public void shouldCancelDuringStreamFromRequestOrParsingContext() throws Exception {
        for (boolean contextCancel : new boolean[]{false, true}) {
            CountDownLatch release = new CountDownLatch(1);
            HttpServer server = server(exchange -> {
                exchange.sendResponseHeaders(200, 0);
                try {
                    writeEvent(exchange, "first");
                    awaitRelease(release);
                    writeEvent(exchange, "must-not-arrive");
                } catch (IOException ignored) {
                    // Cancellation closes the active response input and request.
                } finally {
                    exchange.close();
                }
            });
            server.start();
            try {
                Text2GqlHttpClient adapter = adapter();
                StreamResult result = new StreamResult() {
                    @Override
                    public void onEvent(ServerSentEvent event, ServerSentEventContext context) {
                        super.onEvent(event, context);
                        if (contextCancel) {
                            context.parsingHandle().cancel();
                            assertTrue(context.parsingHandle().isCancelled());
                        }
                    }
                };
                adapter.build().execute(request(server), new DefaultServerSentEventParser(), result);
                assertTrue(result.first.await(2, TimeUnit.SECONDS));
                if (!contextCancel) {
                    adapter.cancel();
                }
                assertTrue(result.finished.await(2, TimeUnit.SECONDS));
                release.countDown();
                assertEquals(1, result.events.get());
            } finally {
                release.countDown();
                server.stop(0);
            }
        }
    }

    @Test
    public void shouldCloseStreamWhenParserOrListenerFails() throws Exception {
        for (boolean listenerFailure : new boolean[]{false, true}) {
            CountDownLatch release = new CountDownLatch(1);
            HttpServer server = server(exchange -> {
                exchange.sendResponseHeaders(200, 0);
                try {
                    writeEvent(exchange, "first");
                    awaitRelease(release);
                } finally {
                    exchange.close();
                }
            });
            server.start();
            try {
                StreamResult result = new StreamResult() {
                    @Override
                    public void onEvent(ServerSentEvent event, ServerSentEventContext context) {
                        if (listenerFailure) {
                            throw new IllegalStateException("Consumer failed");
                        }
                        super.onEvent(event, context);
                    }
                };
                ServerSentEventParser parser = listenerFailure ? new DefaultServerSentEventParser() :
                        (input, listener) -> {
                            throw new IllegalStateException("Parser failed");
                        };
                adapter().build().execute(request(server), parser, result);
                assertTrue(result.finished.await(2, TimeUnit.SECONDS));
                assertEquals(listenerFailure ? "Consumer failed" : "Parser failed",
                             result.error.get().getMessage());
                assertEquals(0, result.closed.get());
            } finally {
                release.countDown();
                server.stop(0);
            }
        }
    }

    private static Text2GqlHttpClient adapter() {
        return new Text2GqlHttpClient(host ->
                List.of(InetAddress.getByAddress(host, new byte[]{127, 0, 0, 1})));
    }

    private static HttpRequest request(HttpServer server) {
        return HttpRequest.builder().method(HttpMethod.GET).url(url(server, "/stream")).build();
    }

    private static void writeEvent(HttpExchange exchange, String data) throws IOException {
        exchange.getResponseBody().write(("data: " + data + "\n\n").getBytes(StandardCharsets.UTF_8));
        exchange.getResponseBody().flush();
    }

    private static void awaitRelease(CountDownLatch release) throws IOException {
        try {
            if (!release.await(5, TimeUnit.SECONDS)) {
                throw new IOException("Timed out waiting for the test reader");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IOException(exception);
        }
    }

    private static class StreamResult implements ServerSentEventListener {

        private final CountDownLatch first = new CountDownLatch(1);
        private final CountDownLatch finished = new CountDownLatch(1);
        private final AtomicInteger events = new AtomicInteger();
        private final AtomicInteger status = new AtomicInteger();
        private final AtomicInteger closed = new AtomicInteger();
        private final AtomicReference<Throwable> error = new AtomicReference<>();

        @Override
        public void onOpen(SuccessfulHttpResponse response) {
            this.status.set(response.statusCode());
        }

        @Override
        public void onEvent(ServerSentEvent event, ServerSentEventContext context) {
            this.events.incrementAndGet();
            this.first.countDown();
        }

        @Override
        public void onError(Throwable exception) {
            this.error.set(exception);
            this.finished.countDown();
        }

        @Override
        public void onClose() {
            this.closed.incrementAndGet();
            this.finished.countDown();
        }
    }

    private static HttpServer server(HttpHandler handler) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", handler::handle);
        return server;
    }

    private static String url(HttpServer server, String path) {
        return "http://" + HOST + ":" + server.getAddress().getPort() + path;
    }

    private static void writeOversizedChunkedBody(HttpExchange exchange, int status, String prefix)
            throws IOException {
        byte[] body = new byte[Text2GqlHttpClient.MAX_RESPONSE_BODY_BYTES + 1024];
        java.util.Arrays.fill(body, (byte) 'x');
        if (prefix != null) {
            byte[] prefixBytes = prefix.getBytes(StandardCharsets.UTF_8);
            System.arraycopy(prefixBytes, 0, body, 0, prefixBytes.length);
        }
        exchange.getResponseHeaders().set("Content-Type", "text/plain");
        exchange.sendResponseHeaders(status, 0);
        try {
            exchange.getResponseBody().write(body);
        } catch (IOException ignored) {
            // The client closes the response as soon as it reads the overflow sentinel.
        } finally {
            exchange.close();
        }
    }

    private static <T extends Throwable> T findCause(Throwable exception, Class<T> type) {
        for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
            if (type.isInstance(cause)) {
                return type.cast(cause);
            }
        }
        return null;
    }

    @FunctionalInterface
    private interface HttpHandler {
        void handle(HttpExchange exchange) throws IOException;
    }
}
