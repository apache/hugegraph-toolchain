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

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.config.Text2GqlStreamConfig;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.SchemaManager;
import org.apache.hugegraph.entity.enums.QueryLanguage;
import org.apache.hugegraph.entity.query.Text2GqlResult;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.handler.ExceptionAdvisor;
import org.apache.hugegraph.handler.LoginInterceptor;
import org.apache.hugegraph.handler.MessageSourceHandler;
import org.apache.hugegraph.handler.ResponseAdvisor;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.HugeClientPoolService;
import org.apache.hugegraph.service.auth.AuthModeService;
import org.apache.hugegraph.service.query.Text2GqlService;
import org.apache.hugegraph.service.query.Text2GqlSettingsService;
import org.junit.AfterClass;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServer;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.DispatcherServlet;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.mockito.ArgumentMatchers.any;

/** Exercise content negotiation, async writes and disconnects in a real servlet container. */
public class Text2GqlStreamTransportTest {

    private static final String PATH = "/api/v1.3/graphspaces/space/graphs/graph/text2gql/stream";
    private static final String ACCEPT = "text/event-stream, application/json";
    private static final String BODY = "{\"source\":\"custom\",\"question\":\"Find people\"}";
    private static final HttpClient HTTP = HttpClient.newHttpClient();
    private static final ObjectMapper JSON = new ObjectMapper();
    private static AnnotationConfigWebApplicationContext context;
    private static WebServer server;
    private static Text2GqlController controller;
    private static HugeClient client;
    private static HugeClientPoolService clients;
    private static AuthModeService auth;
    private static ThreadPoolTaskScheduler heartbeats;
    private Text2GqlService service;

    @BeforeClass
    public static void startServer() {
        controller = new Text2GqlController();
        client = Mockito.mock(HugeClient.class);
        clients = Mockito.mock(HugeClientPoolService.class);
        auth = Mockito.mock(AuthModeService.class);
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        ReflectionTestUtils.setField(controller, "config", config);
        ReflectionTestUtils.setField(controller, "authMode", auth);
        ReflectionTestUtils.setField(controller, "hugeClientPoolService", clients);
        ReflectionTestUtils.setField(controller, "settings", Mockito.mock(Text2GqlSettingsService.class));
        MessageSourceHandler messages = new MessageSourceHandler() {
            @Override
            public String getMessage(String message, Object... args) {
                return message;
            }
        };
        ReflectionTestUtils.setField(controller, "messages", messages);
        ExceptionAdvisor advice = new ExceptionAdvisor();
        ReflectionTestUtils.setField(advice, "messageSourceHandler", messages);
        LoginInterceptor login = new LoginInterceptor();
        ReflectionTestUtils.setField(login, "authMode", auth);
        context = new AnnotationConfigWebApplicationContext();
        context.register(WebConfig.class);
        // Keep graph/model boundaries isolated, while using the production MVC transport and advice.
        context.addBeanFactoryPostProcessor(factory -> {
            factory.registerSingleton("text2GqlController", controller);
            factory.registerSingleton("exceptionAdvisor", advice);
            factory.registerSingleton("responseAdvisor", new ResponseAdvisor());
            factory.registerSingleton("loginConfigurer", new WebMvcConfigurer() {
                @Override
                public void addInterceptors(InterceptorRegistry registry) {
                    registry.addInterceptor(login);
                }
            });
        });
        TomcatServletWebServerFactory factory = new TomcatServletWebServerFactory(0);
        server = factory.getWebServer(servletContext -> {
            context.setServletContext(servletContext);
            context.refresh();
            var servlet = servletContext.addServlet("dispatcher", new DispatcherServlet(context));
            servlet.setAsyncSupported(true);
            servlet.setLoadOnStartup(1);
            servlet.addMapping("/");
        });
        heartbeats = context.getBean("text2GqlHeartbeats", ThreadPoolTaskScheduler.class);
        ReflectionTestUtils.setField(controller, "heartbeats", heartbeats);
        server.start();
    }

    @AfterClass
    public static void stopServer() {
        if (server != null) {
            server.stop();
        }
        if (context != null) {
            context.close();
        }
    }

    @Before
    public void resetBoundaries() {
        Mockito.reset(auth, clients, client);
        Mockito.when(auth.anonymous()).thenReturn(true);
        Mockito.when(clients.createUnauthClient("space", "graph")).thenReturn(client);
        this.service = Mockito.mock(Text2GqlService.class);
        Mockito.when(this.service.streamTimeoutMillis()).thenReturn(60_000L);
        ReflectionTestUtils.setField(controller, "service", this.service);
    }

    @Test
    public void testLoginFailureRemainsJsonWithStreamingAccept() throws Exception {
        Mockito.when(auth.anonymous()).thenReturn(false);
        assertJsonFailure(post(BODY), 401, 401);
        Mockito.verifyNoInteractions(this.service);
    }

    @Test
    public void testPrestreamGraphFailureRemainsJsonWithStreamingAccept() throws Exception {
        Mockito.when(clients.createUnauthClient("space", "graph"))
               .thenThrow(new ExternalException(403, "graph-denied"));
        assertJsonFailure(post(BODY), 403, 403);
        Mockito.verifyNoInteractions(this.service);
    }

    @Test
    public void testPrestreamModelFailureRemainsJsonWithStreamingAccept() throws Exception {
        Mockito.when(this.service.prepare(any(), any()))
               .thenThrow(new ExternalException(503, "model-unavailable"));
        assertJsonFailure(post(BODY), 503, 503);
        Mockito.verify(client).close();
    }

    @Test
    public void testInvalidRequestRemainsJsonWithStreamingAccept() throws Exception {
        assertJsonFailure(post("{\"source\":\"invalid\"}"), 400, 400);
        Mockito.verifyNoInteractions(this.service);
        Mockito.verify(client).close();
    }

    @Test
    public void testFastCompletionStreamsAndCancelsHeartbeatBeforeControlAttaches() throws Exception {
        Text2GqlService.StreamControl control = Mockito.mock(Text2GqlService.StreamControl.class);
        Mockito.when(this.service.stream(any(), any())).thenAnswer(invocation -> {
            Text2GqlService.StreamListener listener = invocation.getArgument(1);
            listener.onDelta("g.V()");
            listener.onResult(new Text2GqlResult("g.V()", QueryLanguage.GREMLIN, true));
            return control;
        });
        HttpResponse<String> response = post(BODY);
        assertEquals(200, response.statusCode());
        assertTrue(response.headers().firstValue("content-type").orElse("").startsWith("text/event-stream"));
        assertTrue(response.body().contains("\"type\":\"waiting\""));
        assertTrue(response.body().contains("\"type\":\"delta\""));
        assertTrue(response.body().contains("\"type\":\"result\""));
        Mockito.verify(control, Mockito.atLeastOnce()).cancel();
        assertNoHeartbeatTasks();
    }

    @Test
    public void testDisconnectBeforeFirstDeltaCancelsRealUpstreamWithoutWaitingForTimeout() throws Exception {
        CountDownLatch upstreamStarted = new CountDownLatch(1);
        CountDownLatch upstreamRelease = new CountDownLatch(1);
        CountDownLatch canceled = new CountDownLatch(1);
        HttpServer upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        upstream.createContext("/v1/chat/completions", exchange -> {
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.sendResponseHeaders(200, 0);
            exchange.getResponseBody().flush();
            upstreamStarted.countDown();
            try {
                upstreamRelease.await(15, TimeUnit.SECONDS);
            } catch (InterruptedException failure) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        upstream.start();
        try {
            SchemaManager schema = Mockito.mock(SchemaManager.class);
            Mockito.when(client.schema()).thenReturn(schema);
            Mockito.when(schema.getPropertyKeys()).thenReturn(List.of());
            Mockito.when(schema.getVertexLabels()).thenReturn(List.of());
            Mockito.when(schema.getEdgeLabels()).thenReturn(List.of());
            Text2GqlService actual = Mockito.spy(new Text2GqlService());
            Mockito.doAnswer(invocation -> {
                Text2GqlService.StreamControl control = (Text2GqlService.StreamControl) invocation.callRealMethod();
                return new Text2GqlService.StreamControl() {
                    @Override
                    public void cancel() {
                        control.cancel();
                        canceled.countDown();
                    }

                    @Override
                    public void timeout() {
                        control.timeout();
                    }
                };
            }).when(actual).stream(any(), any());
            ReflectionTestUtils.setField(controller, "service", actual);
            String body = "{\"source\":\"custom\",\"question\":\"Find people\",\"model\":\"fixture\"," +
                          "\"base_url\":\"http://127.0.0.1:" +
                          upstream.getAddress().getPort() + "/v1\"}";
            try (Socket browser = new Socket("127.0.0.1", server.getPort())) {
                browser.setSoTimeout(5_000);
                byte[] payload = body.getBytes(StandardCharsets.UTF_8);
                String headers = "POST " + PATH + " HTTP/1.0\r\nHost: localhost\r\n" +
                                 "Content-Type: application/json\r\nAccept: " + ACCEPT + "\r\n" +
                                 "Content-Length: " + payload.length + "\r\n\r\n";
                browser.getOutputStream().write(headers.getBytes(StandardCharsets.UTF_8));
                browser.getOutputStream().write(payload);
                browser.getOutputStream().flush();
                BufferedReader response = new BufferedReader(new InputStreamReader(
                        browser.getInputStream(), StandardCharsets.UTF_8));
                boolean waiting = false;
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
                while (System.nanoTime() < deadline) {
                    long remainingMillis = TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime());
                    browser.setSoTimeout((int) Math.max(1L, remainingMillis));
                    String line = response.readLine();
                    if (line == null) {
                        break;
                    }
                    if (line.startsWith("data:") && line.contains("waiting")) {
                        waiting = true;
                        break;
                    }
                }
                assertTrue("Browser must receive the initial SSE event", waiting);
                assertTrue(upstreamStarted.await(3, TimeUnit.SECONDS));
                // Simulate a tab being closed before the provider sends its first token.
                browser.setSoLinger(true, 0);
            }
            assertTrue("Disconnect must cancel the real upstream well before its 60-second timeout",
                       canceled.await(8, TimeUnit.SECONDS));
            assertNoHeartbeatTasks();
        } finally {
            upstreamRelease.countDown();
            upstream.stop(0);
        }
    }

    private static HttpResponse<String> post(String body) throws Exception {
        return HTTP.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + server.getPort() + PATH))
                .header("Accept", ACCEPT).header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(10))
                .POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }

    private static void assertJsonFailure(HttpResponse<String> response, int httpStatus, int status) throws Exception {
        assertEquals(httpStatus, response.statusCode());
        assertTrue(response.headers().firstValue("content-type").orElse("").startsWith("application/json"));
        assertEquals(status, JSON.readTree(response.body()).path("status").asInt());
        assertFalse(response.body().contains("data:"));
        assertNoHeartbeatTasks();
    }

    private static void assertNoHeartbeatTasks() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (System.nanoTime() < deadline) {
            if (heartbeats.getScheduledThreadPoolExecutor().getQueue().isEmpty()) {
                return;
            }
            Thread.sleep(10);
        }
        fail("Completed SSE requests must not retain recurring heartbeat tasks");
    }

    @Configuration
    @EnableWebMvc
    @Import(Text2GqlStreamConfig.class)
    static class WebConfig {
    }
}
