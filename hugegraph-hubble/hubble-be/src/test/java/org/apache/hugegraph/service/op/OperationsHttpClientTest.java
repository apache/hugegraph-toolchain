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

package org.apache.hugegraph.service.op;

import java.io.IOException;
import java.io.InterruptedIOException;
import java.net.InetSocketAddress;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import com.sun.net.httpserver.HttpServer;
import org.junit.Test;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

import org.apache.hugegraph.testutil.Assert;

public class OperationsHttpClientTest {

    @Test
    public void testReadinessProbeReadsBounded503BodyWhileOrdinaryGetRejectsIt() throws IOException {
        HttpServer server = server(503, "{\"ready\":false}", null, null);
        OperationsHttpClient client = new OperationsHttpClient(1000, 1000, 64);
        try {
            OperationsHttpClient.ProbeResponse response = client.probe(
                    uri(server, "/v1/ready"), null, null, Collections.emptySet());
            Assert.assertEquals(503, response.getStatus());
            Assert.assertEquals("{\"ready\":false}", response.getBody());
            Assert.assertThrows(UpstreamRequestException.class, () ->
                    client.get(uri(server, "/v1/ready"), null, null));
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void testReadinessProbeKeepsResponseAndOriginLimits() throws IOException {
        HttpServer server = server(503, "0123456789", null, null);
        OperationsHttpClient client = new OperationsHttpClient(1000, 1000, 8);
        try {
            Assert.assertThrows(UpstreamResponseTooLargeException.class, () ->
                    client.probe(uri(server, "/v1/ready"), null, null, Collections.emptySet()));
            Assert.assertThrows(IllegalArgumentException.class, () ->
                    client.probe(uri(server, "/v1/ready"), null, null,
                                 Collections.singleton("http://127.0.0.1:1")));
        } finally {
            server.stop(0);
        }
    }

    @Test(expected = IllegalArgumentException.class)
    public void testRejectsNonHttpTarget() {
        OperationsHttpClient.validateTarget(URI.create("file:///etc/passwd"),
                                             Collections.emptySet());
    }

    @Test(expected = IllegalArgumentException.class)
    public void testRejectsTargetOutsideDiscoverySet() {
        OperationsHttpClient.validateTarget(URI.create("http://127.0.0.1:9"),
                Collections.singleton("http://127.0.0.1:10"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void testRejectsSameAuthorityWithWrongScheme() {
        OperationsHttpClient.validateTarget(
                URI.create("https://store.internal:8520"),
                Collections.singleton("http://store.internal:8520"));
    }

    @Test
    public void testHttpsResolutionPreservesHostnameForTlsVerification()
                     throws IOException {
        URI target = URI.create(
                     "https://store.internal:9443/metrics/system");

        URI resolved = OperationsHttpClient.resolveTarget(
                       target, new InetAddress[]{
                       InetAddress.getByName("10.0.0.8")});

        Assert.assertEquals(target, resolved);
    }

    @Test
    public void testPinnedDnsReturnsOnlyPrevalidatedAddresses()
                     throws IOException {
        InetAddress pinned = InetAddress.getByName("10.0.0.8");

        java.util.List<InetAddress> resolved = OperationsHttpClient.pinnedDns(
                "store.internal", new InetAddress[]{pinned})
                .lookup("store.internal");

        Assert.assertEquals(Collections.singletonList(pinned), resolved);
        Assert.assertThrows(UnknownHostException.class, () ->
                OperationsHttpClient.pinnedDns(
                        "store.internal", new InetAddress[]{pinned})
                        .lookup("other.internal"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void testRejectsMetadataAddress() {
        OperationsHttpClient.resolveTarget(
                URI.create("http://169.254.169.254/latest/meta-data"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void testRejectsIpv6LinkLocalAddress() {
        OperationsHttpClient.resolveTarget(URI.create("http://[fe80::1]:8520"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void testRejectsMixedSafeAndLinkLocalDnsAnswers() throws IOException {
        OperationsHttpClient.validateResolvedAddresses("store.internal",
                new InetAddress[]{
                InetAddress.getByName("127.0.0.1"),
                InetAddress.getByName("169.254.169.254")
        });
    }

    @Test(expected = IllegalArgumentException.class)
    public void testRejectsHostnameResolvingToLoopback() {
        OperationsHttpClient.resolveTarget(
                URI.create("http://localhost:8520/metrics/system"));
    }

    @Test
    public void testAllowsConfiguredPrivateHostnameResolution() throws IOException {
        OperationsHttpClient.validateResolvedAddresses("store.internal",
                new InetAddress[]{InetAddress.getByName("10.0.0.8")});
    }

    @Test(expected = UpstreamRequestException.class)
    public void testDoesNotFollowRedirects() throws IOException {
        HttpServer server = server(302, "redirect", "/elsewhere", null);
        OperationsHttpClient client = new OperationsHttpClient(1000, 1000, 64);
        try {
            client.get(uri(server, "/"), null, null);
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void testDnsFailuresKeepOnlySafeRequestPaths() {
        OperationsHttpClient client = new OperationsHttpClient(1000, 1000, 64);
        String host = "private-pd-host.invalid";
        try (MockedStatic<InetAddress> dns = Mockito.mockStatic(InetAddress.class)) {
            dns.when(() -> InetAddress.getAllByName(host))
               .thenThrow(new UnknownHostException(host));
            for (String path : new String[]{"/v1/members", "/v1/stores", "/actuator/prometheus"}) {
                UpstreamRequestException error = (UpstreamRequestException) Assert.assertThrows(
                        UpstreamRequestException.class, () -> client.get(URI.create(
                        "http://" + host + ":8620" + path + "?token=private-query"),
                        "private-user", "private-password"));
                Assert.assertEquals("upstream_unavailable", error.getMessage());
                Assert.assertTrue(error.getCause() instanceof UnknownHostException);
                Assert.assertEquals(Map.of("request_path", path), error.getDiagnostics());
                Assert.assertFalse(error.getDiagnostics().toString().contains("private-"));
            }
        }
    }

    @Test
    public void testRejectedDnsAnswersKeepOnlySafeRequestPaths() {
        OperationsHttpClient client = new OperationsHttpClient(1000, 1000, 64);
        for (String path : new String[]{"/v1/members", "/v1/stores", "/actuator/prometheus"}) {
            UpstreamRequestException error = (UpstreamRequestException) Assert.assertThrows(
                    UpstreamRequestException.class, () -> client.get(URI.create(
                    "http://localhost:8620" + path + "?token=private-query"),
                    "private-user", "private-password"));
            Assert.assertEquals("upstream_unavailable", error.getMessage());
            Assert.assertTrue(error.getCause() instanceof IllegalArgumentException);
            Assert.assertEquals(Map.of("request_path", path), error.getDiagnostics());
        }
    }

    @Test
    public void testCapsResponseBodyWithSafeExactSizeDiagnostics()
           throws IOException {
        HttpServer server = server(200, "0123456789", null, null);
        OperationsHttpClient client = new OperationsHttpClient(1000, 1000, 8);
        try {
            UpstreamResponseTooLargeException error =
                    (UpstreamResponseTooLargeException) Assert.assertThrows(
                    UpstreamResponseTooLargeException.class, () -> client.get(
                    uri(server, "/metrics/system?token=private-query"),
                    "private-user", "private-password"));

            Assert.assertEquals(Map.of("request_path", "/metrics/system",
                                       "max_response_bytes", 8L,
                                       "response_bytes", 10L,
                                       "response_size_exact", true),
                                error.getDiagnostics());
            Assert.assertFalse(error.getDiagnostics().toString()
                                    .contains("private-"));
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void testChunkedResponseReportsOnlyObservedSizeLowerBound()
           throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/", exchange -> {
            exchange.sendResponseHeaders(200, 0);
            exchange.getResponseBody().write(
                    "0123456789".getBytes(StandardCharsets.UTF_8));
            exchange.close();
        });
        server.start();
        OperationsHttpClient client = new OperationsHttpClient(1000, 1000, 8);
        try {
            UpstreamResponseTooLargeException error =
                    (UpstreamResponseTooLargeException) Assert.assertThrows(
                    UpstreamResponseTooLargeException.class, () -> client.get(
                    uri(server, "/metrics/drive?token=private-query"),
                    "private-user", "private-password"));
            Map<String, Object> diagnostics = error.getDiagnostics();

            Assert.assertEquals("/metrics/drive", diagnostics.get("request_path"));
            Assert.assertEquals(8L, diagnostics.get("max_response_bytes"));
            long observed = ((Number) diagnostics.get("response_bytes")).longValue();
            Assert.assertTrue(observed > 8L && observed <= 10L);
            Assert.assertEquals(false, diagnostics.get("response_size_exact"));
            Assert.assertFalse(diagnostics.toString().contains("private-"));
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void testSendsBasicIdentityWithoutReturningIt() throws IOException {
        AtomicReference<String> authorization = new AtomicReference<>();
        HttpServer server = server(200, "ok", null, authorization);
        OperationsHttpClient client = new OperationsHttpClient(1000, 1000, 64);
        String response;
        try {
            response = client.get(uri(server, "/"), "hubble", "s3cret");
        } finally {
            server.stop(0);
        }

        Assert.assertEquals("ok", response);
        Assert.assertTrue(authorization.get().startsWith("Basic "));
        Assert.assertFalse(response.contains("s3cret"));
    }

    @Test
    public void testSupportsExplicitPrometheusAcceptType() throws IOException {
        AtomicReference<String> accept = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/", exchange -> {
            accept.set(exchange.getRequestHeaders().getFirst("Accept"));
            byte[] bytes = "metric 1".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        OperationsHttpClient client = new OperationsHttpClient(1000, 1000, 64);
        try {
            client.get(uri(server, "/"), "hubble", "secret",
                       Collections.emptySet(), "text/plain");
        } finally {
            server.stop(0);
        }

        Assert.assertEquals("text/plain", accept.get());
    }

    @Test
    public void testSendsBearerServiceIdentityWithoutReturningIt() throws IOException {
        AtomicReference<String> authorization = new AtomicReference<>();
        HttpServer server = server(200, "ok", null, authorization);
        OperationsHttpClient client = new OperationsHttpClient(1000, 1000, 64);
        try {
            String response = client.getBearer(uri(server, "/"), "service-token",
                                               Collections.emptySet());
            Assert.assertEquals("Bearer service-token", authorization.get());
            Assert.assertFalse(response.contains("service-token"));
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void testClassifiesReadTimeout() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/", exchange -> {
            try {
                Thread.sleep(500L);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            exchange.close();
        });
        server.start();
        OperationsHttpClient client = new OperationsHttpClient(1000, 50, 64);
        try {
            UpstreamRequestException error = (UpstreamRequestException)
                    Assert.assertThrows(UpstreamRequestException.class, () ->
                            client.get(uri(server, "/"), null, null));
            Assert.assertEquals("upstream_timeout", error.getMessage());
        } finally {
            server.stop(0);
        }
    }

    @Test(timeout = 6000L)
    public void testBearerCallDeadlineBoundsContinuouslyProgressingBody()
           throws IOException {
        this.assertCallDeadline("private-service-token", false);
    }

    @Test(timeout = 6000L)
    public void testAnonymousVermeerCallStillBoundsContinuouslyProgressingBody()
           throws IOException {
        this.assertCallDeadline(null, false);
    }

    @Test(timeout = 6000L)
    public void testBoundedBasicCallDeadlineBoundsContinuouslyProgressingBody()
           throws IOException {
        this.assertCallDeadline(null, true);
    }

    @Test(timeout = 4000L)
    public void testBoundedBasicCallLimitsBlockingDns() {
        CountDownLatch release = new CountDownLatch(1);
        OperationsHttpClient client = new OperationsHttpClient(100, 100, 128, host -> {
            boolean interrupted = false;
            try {
                while (true) {
                    try {
                        release.await();
                        break;
                    } catch (InterruptedException e) {
                        interrupted = true;
                    }
                }
                return java.util.List.of(InetAddress.getByName("127.0.0.1"));
            } finally {
                if (interrupted) {
                    Thread.currentThread().interrupt();
                }
            }
        });
        try {
            long start = System.nanoTime();
            UpstreamRequestException error = (UpstreamRequestException)
                    Assert.assertThrows(UpstreamRequestException.class, () ->
                            client.getBounded(URI.create("http://127.0.0.1/v1/cluster"),
                                              null, null));
            Assert.assertEquals("upstream_timeout", error.getMessage());
            Assert.assertEquals(Map.of("request_path", "/v1/cluster"), error.getDiagnostics());
            Assert.assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start) < 2000L);
        } finally {
            release.countDown();
        }
    }

    @Test(timeout = 4000L)
    public void testBoundedDnsInterruptionPreservesReasonAndInterrupt() throws Exception {
        CountDownLatch resolving = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicReference<UpstreamRequestException> failure = new AtomicReference<>();
        AtomicReference<Boolean> interrupted = new AtomicReference<>(false);
        OperationsHttpClient client = new OperationsHttpClient(1000, 1000, 128, host -> {
            resolving.countDown();
            try {
                release.await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new UnknownHostException("DNS interrupted");
            }
            return java.util.List.of(InetAddress.getByName("127.0.0.1"));
        });
        Thread caller = new Thread(() -> {
            try {
                client.getBounded(URI.create("http://127.0.0.1/v1/cluster"), null, null);
            } catch (UpstreamRequestException e) {
                failure.set(e);
                interrupted.set(Thread.currentThread().isInterrupted());
            }
        });
        try {
            caller.start();
            Assert.assertTrue(resolving.await(1, TimeUnit.SECONDS));
            caller.interrupt();
            caller.join(1000);
            Assert.assertFalse(caller.isAlive());
            Assert.assertEquals("upstream_interrupted", failure.get().getMessage());
            Assert.assertEquals(Map.of("request_path", "/v1/cluster"),
                                failure.get().getDiagnostics());
            Assert.assertTrue(interrupted.get());
        } finally {
            release.countDown();
            caller.interrupt();
            caller.join(1000);
        }
    }

    private void assertCallDeadline(String token, boolean basic) throws IOException {
        AtomicInteger chunks = new AtomicInteger();
        AtomicReference<String> authorization = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/", exchange -> {
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            try {
                exchange.sendResponseHeaders(200, 80L);
                for (int index = 0; index < 80; index++) {
                    exchange.getResponseBody().write('x');
                    exchange.getResponseBody().flush();
                    chunks.incrementAndGet();
                    // Progress every 50ms prevents the 1000ms idle-read timeout.
                    Thread.sleep(50L);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } catch (IOException ignored) {
                // The call deadline closes the connection while the server streams.
            } finally {
                exchange.close();
            }
        });
        server.start();
        OperationsHttpClient client = new OperationsHttpClient(100, 1000, 128);
        long started = System.nanoTime();
        try {
            UpstreamRequestException error = (UpstreamRequestException)
                    Assert.assertThrows(UpstreamRequestException.class, () -> {
                        URI target = uri(server, "/api/v1/admin/cluster?token=private-query");
                        if (basic) {
                            client.getBounded(target, "user", "pass");
                        } else {
                            client.getBearer(target, token, Collections.emptySet());
                        }
                    });

            Assert.assertEquals("upstream_timeout", error.getMessage());
            Assert.assertTrue(error.getCause() instanceof InterruptedIOException);
            Assert.assertFalse(error.getCause() instanceof java.net.SocketTimeoutException);
            Assert.assertEquals(basic ? "Basic dXNlcjpwYXNz" :
                                token == null ? null : "Bearer " + token, authorization.get());
            Assert.assertTrue(chunks.get() >= 3);
            Assert.assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 3000L);
            Assert.assertEquals(Map.of("request_path", "/api/v1/admin/cluster"), error.getDiagnostics());
            Assert.assertFalse(error.getDiagnostics().toString().contains("private-"));
        } finally {
            server.stop(0);
        }
    }

    @Test(timeout = 6000L)
    public void testBasicGetKeepsIdleReadSemanticsWhileBodyProgresses()
           throws IOException {
        this.assertProgressingResponseWithoutVermeerDeadline(false);
    }

    @Test(timeout = 6000L)
    public void testReadinessProbeKeepsIdleReadSemanticsWhileBodyProgresses()
           throws IOException {
        this.assertProgressingResponseWithoutVermeerDeadline(true);
    }

    private void assertProgressingResponseWithoutVermeerDeadline(boolean readiness)
                 throws IOException {
        String body = "{\"ready\":true,\"detail\":\"streaming-progress\"}";
        AtomicReference<String> authorization = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/", exchange -> {
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            try {
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(readiness ? 503 : 200, bytes.length);
                for (int offset = 0; offset < bytes.length; offset += 8) {
                    exchange.getResponseBody().write(bytes, offset, Math.min(8, bytes.length - offset));
                    exchange.getResponseBody().flush();
                    // Six chunks span at least 1250ms, beyond the 1100ms call
                    // budget but below the 1000ms idle timeout between chunks.
                    // Avoid per-byte flushes whose overhead varies by platform.
                    if (offset + 8 < bytes.length) {
                        Thread.sleep(250L);
                    }
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } catch (IOException ignored) {
                // The regression closes this connection before the fix.
            } finally {
                exchange.close();
            }
        });
        server.start();
        OperationsHttpClient client = new OperationsHttpClient(100, 1000, 128);
        try {
            long started = System.nanoTime();
            if (readiness) {
                OperationsHttpClient.ProbeResponse response = client.probe(
                        uri(server, "/v1/ready"), "hubble", "private-password", Collections.emptySet());
                Assert.assertEquals(503, response.getStatus());
                Assert.assertEquals(body, response.getBody());
            } else {
                Assert.assertEquals(body, client.get(uri(server, "/v1/members"),
                                                    "hubble", "private-password"));
            }
            Assert.assertTrue(System.nanoTime() - started >
                              TimeUnit.MILLISECONDS.toNanos(client.callTimeoutMillis()));
            Assert.assertTrue(authorization.get().startsWith("Basic "));
        } finally {
            server.stop(0);
        }
    }

    private static HttpServer server(int status, String body, String location,
                                     AtomicReference<String> authorization)
                                     throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/", exchange -> {
            if (authorization != null) {
                authorization.set(exchange.getRequestHeaders()
                                          .getFirst("Authorization"));
            }
            if (location != null) {
                exchange.getResponseHeaders().set("Location", location);
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        return server;
    }

    private static URI uri(HttpServer server, String path) {
        return URI.create("http://127.0.0.1:" +
                          server.getAddress().getPort() + path);
    }
}
