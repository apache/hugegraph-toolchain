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

package org.apache.hugegraph.unit;

import java.net.ConnectException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import javax.net.ssl.SSLException;

import com.google.common.cache.Cache;
import com.sun.net.httpserver.HttpServer;
import org.apache.hugegraph.config.ConfigException;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.factory.PDHugeClientFactory;
import org.apache.hugegraph.exception.ParameterizedException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.HugeClientPoolService;
import org.apache.hugegraph.service.SettingSSLService;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Before;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

public class HugeClientPoolServiceTest {

    private static final String CLUSTER = "cluster";
    private static final String GRAPH_SPACE = "space";
    private static final String SERVICE = "service";
    private static final String URL = "http://127.0.0.1:8080";

    private HugeClientPoolService service;
    private PDHugeClientFactory factory;

    @Before
    public void setup() {
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        Mockito.when(config.get(HubbleOptions.CLIENT_URL_CACHE_MAX_ENTRIES))
               .thenReturn(1024);
        this.factory = Mockito.mock(PDHugeClientFactory.class);
        this.service = new HugeClientPoolService();
        ReflectionTestUtils.setField(this.service, "config", config);
        ReflectionTestUtils.setField(this.service, "cluster", CLUSTER);
        ReflectionTestUtils.setField(this.service, "pdHugeClientFactory",
                                     this.factory);
        ReflectionTestUtils.invokeMethod(this.service, "initializeUrlCache");
    }

    @Test
    public void testUseWarmCacheWhenDiscoveryThrows() {
        this.stubSuccessfulDiscovery(GRAPH_SPACE, SERVICE, URL);
        Assert.assertEquals(Collections.singletonList(URL),
                            this.allAvailableURLs(GRAPH_SPACE, SERVICE));

        Mockito.reset(this.factory);
        Mockito.when(this.factory.getURLs(Mockito.anyString(),
                                          Mockito.anyString(),
                                          Mockito.nullable(String.class)))
               .thenThrow(new IllegalStateException("PD unavailable"));

        Assert.assertEquals(Collections.singletonList(URL),
                            this.allAvailableURLs(GRAPH_SPACE, SERVICE));
    }

    @Test
    public void testFailClosedWhenColdDiscoveryThrows() {
        Mockito.when(this.factory.getURLs(Mockito.anyString(),
                                          Mockito.anyString(),
                                          Mockito.nullable(String.class)))
               .thenThrow(new IllegalStateException("PD unavailable"));

        Assert.assertThrows(ParameterizedException.class, () ->
                this.service.create(null, GRAPH_SPACE, SERVICE, "token"));
    }

    @Test
    public void testDoNotReuseCacheAcrossGraphSpaces() {
        this.stubSuccessfulDiscovery(GRAPH_SPACE, SERVICE, URL);
        Assert.assertEquals(Collections.singletonList(URL),
                            this.allAvailableURLs(GRAPH_SPACE, SERVICE));

        Mockito.reset(this.factory);
        Mockito.when(this.factory.getURLs(Mockito.anyString(),
                                          Mockito.anyString(),
                                          Mockito.nullable(String.class)))
               .thenThrow(new IllegalStateException("PD unavailable"));

        Assert.assertEquals(Collections.emptyList(),
                            this.allAvailableURLs("other-space", SERVICE));
    }

    @Test
    public void testDoNotReuseCacheAcrossServices() {
        this.stubSuccessfulDiscovery(GRAPH_SPACE, SERVICE, URL);
        Assert.assertEquals(Collections.singletonList(URL),
                            this.allAvailableURLs(GRAPH_SPACE, SERVICE));

        Mockito.reset(this.factory);
        Mockito.when(this.factory.getURLs(Mockito.anyString(),
                                          Mockito.anyString(),
                                          Mockito.nullable(String.class)))
               .thenThrow(new IllegalStateException("PD unavailable"));

        Assert.assertEquals(Collections.emptyList(),
                            this.allAvailableURLs(GRAPH_SPACE, "other-service"));
    }

    @Test
    public void testDoNotReuseCacheAcrossAmbiguousScopeNames() {
        this.stubSuccessfulDiscovery("space_a", "service", URL);
        Assert.assertEquals(Collections.singletonList(URL),
                            this.allAvailableURLs("space_a", "service"));

        Mockito.reset(this.factory);
        Mockito.when(this.factory.getURLs(Mockito.anyString(),
                                          Mockito.anyString(),
                                          Mockito.nullable(String.class)))
               .thenThrow(new IllegalStateException("PD unavailable"));

        Assert.assertEquals(Collections.emptyList(),
                            this.allAvailableURLs("space", "a_service"));
    }

    @Test
    public void testExplicitSpaceDoesNotFallbackToDefaultCache() {
        String defaultUrl = "http://127.0.0.1:8081";
        Mockito.when(this.factory.getURLs(
                CLUSTER, PDHugeClientFactory.DEFAULT_GRAPHSPACE,
                PDHugeClientFactory.DEFAULT_SERVICE))
               .thenReturn(Collections.singletonList(defaultUrl));
        Assert.assertEquals(Collections.singletonList(defaultUrl),
                            this.allAvailableURLs(null, null));

        this.stubSuccessfulDiscovery("space-a", SERVICE, URL);
        Assert.assertEquals(Collections.singletonList(URL),
                            this.allAvailableURLs("space-a", SERVICE));

        Mockito.reset(this.factory);
        Mockito.when(this.factory.getURLs(Mockito.anyString(),
                                          Mockito.anyString(),
                                          Mockito.nullable(String.class)))
               .thenThrow(new IllegalStateException("PD unavailable"));

        Assert.assertEquals(Collections.emptyList(),
                            this.allAvailableURLs("space-b", SERVICE));
    }

    @Test
    public void testUrlCacheBoundEvictsOldScopesAndKeepsWarmFallback() {
        HugeConfig config = (HugeConfig) ReflectionTestUtils.getField(
                            this.service, "config");
        Mockito.when(config.get(HubbleOptions.CLIENT_URL_CACHE_MAX_ENTRIES))
               .thenReturn(2);
        ReflectionTestUtils.invokeMethod(this.service, "initializeUrlCache");

        this.stubSuccessfulDiscovery("space-a", SERVICE,
                                     "http://127.0.0.1:8081");
        this.allAvailableURLs("space-a", SERVICE);
        this.stubSuccessfulDiscovery("space-b", SERVICE,
                                     "http://127.0.0.1:8082");
        this.allAvailableURLs("space-b", SERVICE);
        this.stubSuccessfulDiscovery("space-c", SERVICE,
                                     "http://127.0.0.1:8083");
        this.allAvailableURLs("space-c", SERVICE);

        Mockito.reset(this.factory);
        Mockito.when(this.factory.getURLs(Mockito.anyString(),
                                          Mockito.anyString(),
                                          Mockito.nullable(String.class)))
               .thenThrow(new IllegalStateException("PD unavailable"));

        Assert.assertEquals(Collections.emptyList(),
                            this.allAvailableURLs("space-a", SERVICE));
        Assert.assertEquals(Collections.singletonList(
                            "http://127.0.0.1:8083"),
                            this.allAvailableURLs("space-c", SERVICE));
    }

    @Test
    public void testUrlCacheMaximumHasPositiveDefaultContract() {
        Assert.assertEquals(1024,
                            HubbleOptions.CLIENT_URL_CACHE_MAX_ENTRIES
                                         .defaultValue());
        Assert.assertThrows(ConfigException.class, () ->
                HubbleOptions.CLIENT_URL_CACHE_MAX_ENTRIES.parseConvert("0"));
        Assert.assertThrows(ConfigException.class, () ->
                HubbleOptions.CLIENT_URL_CACHE_MAX_ENTRIES.parseConvert("-1"));
    }

    @Test
    public void testInvalidServiceUrlDoesNotExposeRawValue() {
        String raw = "http://user:secret@[malformed/private";

        try {
            this.service.create(raw, GRAPH_SPACE, SERVICE, "token");
            Assert.fail("Expected invalid service URL to be rejected");
        } catch (ParameterizedException e) {
            Assert.assertEquals("service.url.parse.error", e.getMessage());
            Assert.assertEquals(1, e.args().length);
            Assert.assertEquals("[REDACTED]", e.args()[0]);
            Assert.assertFalse(e.toString().contains("user"));
            Assert.assertFalse(e.toString().contains("secret"));
            Assert.assertFalse(e.toString().contains("malformed"));
            Assert.assertFalse(e.toString().contains("private"));
        }
    }

    @Test
    public void testRetryRefusedCandidateBeforeLiveServer() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        HttpServer server = this.versionServer(200, "0.80", calls);
        try {
            this.cacheCandidates(this.refusedUrl(), this.serverUrl(server));
            try (HugeClient client = this.service.create(null, GRAPH_SPACE, SERVICE, null)) {
                Assert.assertEquals("0.80", client.versionManager().getApiVersion());
                Assert.assertTrue(calls.get() >= 4);
            }
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void testAllRefusedCandidatesFailClosed() throws Exception {
        this.cacheCandidates(this.refusedUrl(), this.refusedUrl());
        try {
            this.service.create(null, GRAPH_SPACE, SERVICE, null);
            Assert.fail("Expected unavailable service");
        } catch (ParameterizedException e) {
            Assert.assertEquals("service.no-available", e.getMessage());
        }
    }

    @Test
    public void testDoNotRetryAuthenticationFailures() throws Exception {
        for (int status : new int[]{401, 403}) {
            AtomicInteger nextCalls = new AtomicInteger();
            HttpServer rejected = this.versionServer(status, "0.80", new AtomicInteger());
            HttpServer next = this.versionServer(200, "0.80", nextCalls);
            try {
                this.cacheCandidates(this.serverUrl(rejected), this.serverUrl(next));
                Assert.assertThrows(Exception.class, () ->
                        this.service.create(null, GRAPH_SPACE, SERVICE, null));
                Assert.assertEquals(0, nextCalls.get());
            } finally {
                rejected.stop(0);
                next.stop(0);
            }
        }
    }

    @Test
    public void testDoNotRetryAuthenticationFailureAfterInitialization() throws Exception {
        for (int status : new int[]{401, 403}) {
            AtomicInteger nextCalls = new AtomicInteger();
            HttpServer rejected = this.versionServer(status, "0.80", new AtomicInteger(), 2);
            HttpServer next = this.versionServer(200, "0.80", nextCalls);
            try {
                this.cacheCandidates(this.serverUrl(rejected), this.serverUrl(next));
                Assert.assertThrows(Exception.class, () ->
                        this.service.create(null, GRAPH_SPACE, SERVICE, null));
                Assert.assertEquals(0, nextCalls.get());
            } finally {
                rejected.stop(0);
                next.stop(0);
            }
        }
    }

    @Test
    public void testDoNotRetryIncompatibleVersion() throws Exception {
        AtomicInteger nextCalls = new AtomicInteger();
        HttpServer incompatible = this.versionServer(200, "9.0", new AtomicInteger());
        HttpServer next = this.versionServer(200, "0.80", nextCalls);
        try {
            this.cacheCandidates(this.serverUrl(incompatible), this.serverUrl(next));
            Assert.assertThrows(ParameterizedException.class, () ->
                    this.service.create(null, GRAPH_SPACE, SERVICE, null));
            Assert.assertEquals(0, nextCalls.get());
        } finally {
            incompatible.stop(0);
            next.stop(0);
        }
    }

    @Test
    public void testTransportClassificationPreservesOtherFailures() {
        Assert.assertTrue(this.isTransportFailure(new ConnectException()));
        Assert.assertTrue(this.isTransportFailure(
                          new Exception(new SocketTimeoutException())));
        Assert.assertFalse(this.isTransportFailure(new Exception("Connection refused")));
        Assert.assertFalse(this.isTransportFailure(new java.io.IOException()));
        Assert.assertFalse(this.isTransportFailure(
                           new SSLException(new SocketTimeoutException())));
        Assert.assertFalse(this.isTransportFailure(
                           new IllegalArgumentException(new ConnectException())));
        Assert.assertFalse(this.isTransportFailure(
                           new IllegalStateException(new SocketTimeoutException())));
        Exception cyclic = new Exception();
        Exception second = new Exception(cyclic);
        cyclic.initCause(second);
        Assert.assertFalse(this.isTransportFailure(cyclic));
    }

    private boolean isTransportFailure(Throwable error) {
        return Boolean.TRUE.equals(ReflectionTestUtils.invokeMethod(
                this.service, "isTransportFailure", error));
    }

    @SuppressWarnings("unchecked")
    private void cacheCandidates(String... urls) {
        HugeConfig config = (HugeConfig) ReflectionTestUtils.getField(this.service, "config");
        Mockito.when(config.get(HubbleOptions.CLIENT_REQUEST_TIMEOUT)).thenReturn(2);
        ReflectionTestUtils.setField(this.service, "sslService", Mockito.mock(SettingSSLService.class));
        Cache<String, List<String>> cache = (Cache<String, List<String>>)
                ReflectionTestUtils.getField(this.service, "urlCache");
        String key = ReflectionTestUtils.invokeMethod(this.service, "cacheKey", GRAPH_SPACE, SERVICE);
        cache.put(key, Arrays.asList(urls));
    }

    private String refusedUrl() throws Exception {
        try (ServerSocket socket = new ServerSocket(0, 1,
                                                   java.net.InetAddress.getLoopbackAddress())) {
            return "http://127.0.0.1:" + socket.getLocalPort();
        }
    }

    private String serverUrl(HttpServer server) {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    private HttpServer versionServer(int status, String api, AtomicInteger calls) throws Exception {
        return this.versionServer(status, api, calls, 0);
    }

    private HttpServer versionServer(int status, String api, AtomicInteger calls,
                                    int acceptedRequests) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/versions", exchange -> {
            int responseStatus = calls.incrementAndGet() <= acceptedRequests ? 200 : status;
            String json = responseStatus == 200 ?
                          "{\"versions\":{\"api\":\"" + api + "\",\"core\":\"1.7.0\"}}" :
                          "{\"exception\":\"Forbidden\",\"message\":\"fixture rejection\"}";
            byte[] body = json.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(responseStatus, body.length);
            try (java.io.OutputStream output = exchange.getResponseBody()) {
                output.write(body);
            }
        });
        server.start();
        return server;
    }

    private void stubSuccessfulDiscovery(String graphSpace, String service,
                                         String url) {
        List<String> urls = new ArrayList<>();
        urls.add(url);
        Mockito.when(this.factory.getURLs(CLUSTER, graphSpace, service))
               .thenReturn(urls);
        Mockito.when(this.factory.getURLs(CLUSTER, graphSpace, null))
               .thenReturn(Collections.emptyList());
        Mockito.when(this.factory.getURLs(
                CLUSTER, PDHugeClientFactory.DEFAULT_GRAPHSPACE,
                PDHugeClientFactory.DEFAULT_SERVICE))
               .thenReturn(Collections.emptyList());
    }

    @SuppressWarnings("unchecked")
    private List<String> allAvailableURLs(String graphSpace, String service) {
        return (List<String>) ReflectionTestUtils.invokeMethod(
                this.service, "allAvailableURLs", graphSpace, service);
    }
}
