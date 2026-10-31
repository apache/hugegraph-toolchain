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

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.net.InetSocketAddress;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import com.sun.net.httpserver.HttpServer;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.exception.ForbiddenException;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.space.DirectVermeerService;
import org.apache.hugegraph.service.space.VermeerClient;
import org.apache.hugegraph.service.algorithm.AsyncTaskService;
import org.apache.hugegraph.service.space.VermeerService;
import org.apache.hugegraph.service.auth.AuthModeService;
import org.apache.hugegraph.structure.Task;
import org.junit.Assert;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

public class DirectVermeerServiceTest {

    private static void expect(Class<? extends RuntimeException> type, Runnable action) {
        try {
            action.run();
            Assert.fail("Expected " + type.getSimpleName());
        } catch (RuntimeException e) {
            Assert.assertTrue(e.toString(), type.isInstance(e));
        }
    }

    private HugeClient graphClient() {
        HugeClient client = Mockito.mock(HugeClient.class, Mockito.RETURNS_DEEP_STUBS);
        Mockito.when(client.getGraphSpaceName()).thenReturn("DEFAULT");
        Mockito.when(client.getGraphName()).thenReturn("graph-with-dash");
        return client;
    }

    private DirectVermeerService service(VermeerClient backend) {
        DirectVermeerService service = new DirectVermeerService();
        ReflectionTestUtils.setField(service, "backend", backend);
        AuthModeService mode = Mockito.mock(AuthModeService.class);
        Mockito.when(mode.anonymous()).thenReturn(true);
        ReflectionTestUtils.setField(service, "authMode", mode);
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        ReflectionTestUtils.setField(service, "config", config);
        return service;
    }

    @Test
    public void testLoadedGraphStatisticsUseVermeerSnapshotWithoutServerScan() {
        VermeerClient backend = Mockito.mock(VermeerClient.class);
        Mockito.when(backend.configured()).thenReturn(true);
        Mockito.when(backend.request("GET", "workers/availability", null))
               .thenReturn(Map.of("available", true));
        Mockito.when(backend.request("GET", "graphs", null)).thenReturn(Map.of("graphs", List.of(
                Map.of("name", "other-graph", "status", "loaded", "vertex_count", 999),
                Map.of("name", "DEFAULT-graph-with-dash", "status", "loaded",
                       "vertex_count", 3000, "edge_count", 6000, "update_time", "2026-10-29T08:00:00Z"))));
        DirectVermeerService direct = service(backend);
        HugeClient client = graphClient();
        Map<String, Object> result = direct.statistics(client);
        Assert.assertEquals("3000", result.get("vertex_count"));
        Assert.assertEquals("6000", result.get("edge_count"));
        Assert.assertEquals("vermeer", result.get("source"));
        Assert.assertEquals("2026-10-29T08:00:00Z", result.get("update_time"));
        Mockito.verify(client.graph()).listVertices(1);
        Mockito.verifyNoMoreInteractions(client.graph());
        Mockito.verify(backend, Mockito.never()).request(Mockito.eq("POST"), Mockito.anyString(), Mockito.any());
    }

    @Test
    public void testNativeZeroCountsAreOmittedAndUnavailableGraphsAreRejected() {
        VermeerClient backend = Mockito.mock(VermeerClient.class);
        Mockito.when(backend.configured()).thenReturn(true);
        Mockito.when(backend.request("GET", "workers/availability", null))
               .thenReturn(Map.of("available", true));
        Mockito.when(backend.request("GET", "graphs", null)).thenReturn(Map.of("graphs", List.of(
                Map.of("name", "DEFAULT-graph-with-dash", "status", "loaded"))));
        DirectVermeerService direct = service(backend);
        Assert.assertEquals("0", direct.statistics(graphClient()).get("vertex_count"));
        Assert.assertEquals("0", direct.statistics(graphClient()).get("edge_count"));
        Mockito.when(backend.request("GET", "graphs", null)).thenReturn(Map.of("graphs", List.of(
                Map.of("name", "DEFAULT-graph-with-dash", "status", "loading", "vertex_count", 99))));
        expect(IllegalStateException.class, () -> direct.statistics(graphClient()));
        Mockito.when(backend.request("GET", "graphs", null)).thenReturn(Map.of("graphs", List.of()));
        expect(IllegalStateException.class, () -> direct.statistics(graphClient()));
        Mockito.when(backend.request("GET", "workers/availability", null))
               .thenReturn(Map.of("available", false));
        expect(IllegalStateException.class, () -> direct.statistics(graphClient()));
    }

    @Test
    public void testMalformedSnapshotCountsHaveAnActionableBoundedError() {
        VermeerClient backend = Mockito.mock(VermeerClient.class);
        Mockito.when(backend.configured()).thenReturn(true);
        Mockito.when(backend.request("GET", "workers/availability", null))
               .thenReturn(Map.of("available", true));
        DirectVermeerService direct = service(backend);
        for (Object value : java.util.Arrays.asList(null, "1.5", -1, "sensitive-invalid-value")) {
            Map<String, Object> graph = new java.util.HashMap<>();
            graph.put("name", "DEFAULT-graph-with-dash");
            graph.put("status", "loaded");
            graph.put("vertex_count", value);
            Mockito.when(backend.request("GET", "graphs", null))
                   .thenReturn(Map.of("graphs", List.of(graph)));
            try {
                direct.statistics(graphClient());
                Assert.fail("Expected invalid graph counts");
            } catch (ExternalException e) {
                Assert.assertEquals(400, e.status());
                Assert.assertTrue(e.getMessage().contains("reload the graph"));
                Assert.assertFalse(e.getMessage().contains("sensitive-invalid-value"));
            }
        }
    }

    @Test
    public void testStatisticsRejectOrdinaryUserBeforeUsingSharedVermeerCredential() {
        VermeerClient backend = Mockito.mock(VermeerClient.class);
        DirectVermeerService direct = service(backend);
        AuthModeService mode = Mockito.mock(AuthModeService.class);
        Mockito.when(mode.anonymous()).thenReturn(false);
        ReflectionTestUtils.setField(direct, "authMode", mode);
        HugeClient client = graphClient();
        Mockito.when(client.auth().isSuperAdmin()).thenReturn(false);
        expect(ForbiddenException.class, () -> direct.statistics(client));
        Mockito.verifyNoInteractions(backend);
    }

    @Test
    public void testComputeDoesNotForwardServerCredentials() {
        VermeerClient backend = Mockito.mock(VermeerClient.class);
        Mockito.when(backend.request(Mockito.eq("POST"), Mockito.eq("tasks/create"), Mockito.anyMap()))
               .thenReturn(Map.of("task", Map.of("id", 12)));
        DirectVermeerService service = service(backend);
        HugeClient client = graphClient();
        Map<String, Object> result = service.compute(client,
                Map.of("compute.algorithm", "pagerank", "pagerank.damping", 0.85));
        Assert.assertEquals(-12, result.get("task_id"));
        Mockito.verify(client.graph()).listVertices(1);
        ArgumentCaptor<Map> body = ArgumentCaptor.forClass(Map.class);
        Mockito.verify(backend).request(Mockito.eq("POST"), Mockito.eq("tasks/create"), body.capture());
        Assert.assertEquals("DEFAULT-graph-with-dash", body.getValue().get("graph"));
        Map<?, ?> params = (Map<?, ?>) body.getValue().get("params");
        Assert.assertEquals("local", params.get("output.type"));
        Assert.assertEquals("1", params.get("output.need_query"));
        Assert.assertEquals("0.85", params.get("pagerank.damping"));
        Assert.assertFalse(params.containsKey("output.hugegraph_password"));
        Assert.assertFalse(params.containsKey("output.hugegraph_token"));
    }

    @Test
    public void testPersonalPageRankUsesVermeerParameters() {
        VermeerClient backend = Mockito.mock(VermeerClient.class);
        Mockito.when(backend.request(Mockito.eq("POST"), Mockito.eq("tasks/create"), Mockito.anyMap()))
               .thenReturn(Map.of("task", Map.of("id", 12)));
        DirectVermeerService service = service(backend);
        Map<String, Object> result = service.compute(graphClient(),
                Map.of("compute.algorithm", "ppr", "ppr.source", "marko",
                       "ppr.damping", 0.85, "ppr.diff_threshold", 0.00001));
        Assert.assertEquals(-12, result.get("task_id"));
        ArgumentCaptor<Map> body = ArgumentCaptor.forClass(Map.class);
        Mockito.verify(backend).request(Mockito.eq("POST"), Mockito.eq("tasks/create"), body.capture());
        Map<?, ?> params = (Map<?, ?>) body.getValue().get("params");
        Assert.assertEquals("ppr", params.get("compute.algorithm"));
        Assert.assertEquals("marko", params.get("ppr.source"));
        Assert.assertEquals("0.85", params.get("ppr.damping"));
        Assert.assertEquals("1.0E-5", params.get("ppr.diff_threshold"));
        Assert.assertEquals("1", params.get("output.need_query"));
    }

    @Test
    public void testComputeReusesSafeOutputFilesPerGraph() {
        VermeerClient backend = Mockito.mock(VermeerClient.class);
        Mockito.when(backend.request(Mockito.eq("POST"), Mockito.eq("tasks/create"), Mockito.anyMap()))
               .thenReturn(Map.of("task", Map.of("id", 12)));
        DirectVermeerService direct = service(backend);
        HugeClient client = graphClient();
        direct.compute(client, Map.of("compute.algorithm", "pagerank"));
        direct.compute(client, Map.of("compute.algorithm", "degree"));
        Mockito.when(client.getGraphSpaceName()).thenReturn("OTHER");
        direct.compute(client, Map.of("compute.algorithm", "pagerank"));
        Mockito.when(client.getGraphName()).thenReturn("../../escape/graph");
        direct.compute(client, Map.of("compute.algorithm", "pagerank"));
        ArgumentCaptor<Map> bodies = ArgumentCaptor.forClass(Map.class);
        Mockito.verify(backend, Mockito.times(4)).request(
                Mockito.eq("POST"), Mockito.eq("tasks/create"), bodies.capture());
        List<String> paths = bodies.getAllValues().stream().map(body -> {
            Map<?, ?> params = (Map<?, ?>) body.get("params");
            return (String) params.get("output.file_path");
        }).toList();
        Assert.assertEquals(paths.get(0), paths.get(1));
        Assert.assertNotEquals(paths.get(0), paths.get(2));
        Assert.assertNotEquals(paths.get(2), paths.get(3));
        paths.forEach(path -> Assert.assertTrue(path.matches("\\./data/hubble/[0-9a-f]{64}")));
    }

    @Test
    public void testExpiredQueryValuesKeepTaskMetadataButExplicitReadsFail() {
        VermeerClient backend = Mockito.mock(VermeerClient.class);
        Mockito.when(backend.request("GET", "task/12", null)).thenReturn(Map.of("task", Map.of(
                "id", 12, "graph_name", "DEFAULT-graph-with-dash",
                "task_type", "compute", "status", "complete")));
        Mockito.when(backend.request("GET", "tasks/value/12?cursor=0&limit=1001", null))
               .thenThrow(new VermeerClient.ValuesNotFoundException());
        DirectVermeerService direct = service(backend);
        HugeClient client = graphClient();
        AsyncTaskService tasks = new AsyncTaskService();
        ReflectionTestUtils.setField(tasks, "vermeer", direct);
        Task task = tasks.get(client, -12);
        Assert.assertEquals(-12L, task.id());
        Assert.assertEquals("success", task.status());
        Assert.assertNull(task.result());
        List<Task> listed = tasks.list(client, List.of(-12L));
        Assert.assertEquals(1, listed.size());
        Assert.assertEquals("success", listed.get(0).status());
        Assert.assertNull(listed.get(0).result());
        expect(ExternalException.class, () -> direct.results(client, -12, 0, 1000));
    }

    @Test
    public void testHttpValueCacheAbsencePreservesOnlyMetadata() throws Exception {
        AtomicInteger status = new AtomicInteger(400);
        AtomicReference<String> body = new AtomicReference<>(
                "{\"errcode\":1,\"message\":\"task_id error:12\"}");
        HttpServer server = resultServer(status, body);
        try {
            DirectVermeerService direct = httpResultService(server);
            Task task = direct.task(graphClient(), -12, true);
            Assert.assertEquals("success", task.status());
            Assert.assertNull(task.result());
            expect(VermeerClient.ValuesNotFoundException.class,
                    () -> direct.results(graphClient(), -12, 0, 1000));
            // The native service also retains a task whose values are absent.
            body.set("{\"errcode\":1,\"message\":\"compute value not exist, task_id:12\"}");
            Assert.assertEquals("success", direct.task(graphClient(), -12, true).status());
            Assert.assertNull(direct.task(graphClient(), -12, true).result());
            expect(VermeerClient.ValuesNotFoundException.class,
                    () -> direct.results(graphClient(), -12, 0, 1000));
            // Match both the exact native response and this task's ID only.
            body.set("{\"errcode\":1,\"message\":\"compute value not exist, task_id:13\"}");
            expect(ExternalException.class, () -> direct.task(graphClient(), -12, true));
            body.set("{\"errcode\":1,\"message\":\"cursor:0 must be >= 0 and <= 2\"}");
            expect(ExternalException.class, () -> direct.task(graphClient(), -12, true));
            status.set(403);
            body.set("{\"errcode\":1,\"message\":\"task_id error:12\"}");
            expect(ExternalException.class, () -> direct.task(graphClient(), -12, true));
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void testTransientHttpValueFailuresPropagateAndRetryRecovers() throws Exception {
        AtomicInteger status = new AtomicInteger(503);
        AtomicReference<String> body = new AtomicReference<>(
                "{\"errcode\":1,\"message\":\"task_id error:12\"}");
        HttpServer server = resultServer(status, body);
        try {
            DirectVermeerService direct = httpResultService(server);
            expect(ExternalException.class, () -> direct.task(graphClient(), -12, true));
            status.set(0); // Close the connection without an HTTP response.
            expect(ExternalException.class, () -> direct.task(graphClient(), -12, true));
            status.set(200);
            body.set("{\"errcode\":0,\"vertices\":[{\"ID\":\"fresh\",\"Value\":\"1\"}],\"cursor\":1}");
            Task retried = direct.task(graphClient(), -12, true);
            Assert.assertEquals("success", retried.status());
            Assert.assertTrue(String.valueOf(retried.result()).contains("fresh"));
        } finally {
            server.stop(0);
        }
    }

    private HttpServer resultServer(AtomicInteger status, AtomicReference<String> body) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/v1/task/12", exchange -> {
            byte[] value = ("{\"task\":{\"id\":12,\"graph_name\":\"DEFAULT-graph-with-dash\"," +
                            "\"task_type\":\"compute\",\"status\":\"complete\"}}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, value.length);
            exchange.getResponseBody().write(value);
            exchange.close();
        });
        server.createContext("/api/v1/tasks/value/12", exchange -> {
            if (status.get() == 0) {
                exchange.close();
                return;
            }
            byte[] value = body.get().getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status.get(), value.length);
            exchange.getResponseBody().write(value);
            exchange.close();
        });
        server.start();
        return server;
    }

    private DirectVermeerService httpResultService(HttpServer server) {
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.VERMEER_URL))
               .thenReturn("http://127.0.0.1:" + server.getAddress().getPort());
        VermeerClient backend = new VermeerClient();
        ReflectionTestUtils.setField(backend, "config", config);
        return service(backend);
    }

    @Test
    public void testTaskMetadataScopeAndNonResultFailuresStillPropagate() {
        VermeerClient backend = Mockito.mock(VermeerClient.class);
        Mockito.when(backend.request("GET", "task/12", null))
               .thenThrow(new ExternalException("Task metadata unavailable"));
        DirectVermeerService direct = service(backend);
        HugeClient client = graphClient();
        expect(ExternalException.class, () -> direct.task(client, -12, true));
        Mockito.doReturn(Map.of("task", Map.of("id", 12, "graph_name", "other-graph",
                                               "task_type", "compute", "status", "complete")))
               .when(backend).request("GET", "task/12", null);
        expect(ForbiddenException.class, () -> direct.task(client, -12, true));
        Mockito.verify(backend, Mockito.never()).request(
                Mockito.eq("GET"), Mockito.startsWith("tasks/value/"), Mockito.isNull());
        Mockito.doReturn(Map.of("task", Map.of("id", 12, "graph_name", "DEFAULT-graph-with-dash",
                                               "task_type", "compute", "status", "complete")))
               .when(backend).request("GET", "task/12", null);
        Mockito.when(backend.request("GET", "tasks/value/12?cursor=0&limit=1001", null))
               .thenThrow(new IllegalStateException("Unexpected result contract"));
        expect(IllegalStateException.class, () -> direct.task(client, -12, true));
    }

    @Test
    public void testRestrictedReaderCannotAccessUnfilteredStoreData() {
        VermeerClient backend = Mockito.mock(VermeerClient.class);
        DirectVermeerService service = service(backend);
        ReflectionTestUtils.setField(service, "authMode", Mockito.mock(AuthModeService.class));
        HugeClient client = graphClient();
        Mockito.when(client.isServerAuthEnabled()).thenReturn(true);
        expect(ForbiddenException.class,
                () -> service.compute(client, Map.of("compute.algorithm", "pagerank")));
        Mockito.verifyNoInteractions(backend);
    }

    @Test
    public void testRejectsCredentialAndTargetOverrides() {
        VermeerClient backend = Mockito.mock(VermeerClient.class);
        expect(IllegalArgumentException.class, () -> service(backend).compute(
                graphClient(), Map.of("compute.algorithm", "pagerank", "output.type", "hugegraph")));
        Mockito.verifyNoInteractions(backend);
    }

    @Test
    public void testCannotReadAnotherGraphsResultsOrCancelItsTask() {
        VermeerClient backend = Mockito.mock(VermeerClient.class);
        Mockito.when(backend.request("GET", "task/12", null))
               .thenReturn(Map.of("task", Map.of("id", 12, "graph_name", "other-graph")));
        DirectVermeerService service = service(backend);
        expect(ForbiddenException.class, () -> service.results(graphClient(), -12, 0, 10));
        expect(ForbiddenException.class, () -> service.cancel(graphClient(), -12));
        Mockito.verify(backend, Mockito.never()).request(Mockito.eq("GET"),
                Mockito.startsWith("tasks/value/"), Mockito.isNull());
        Mockito.verify(backend, Mockito.never()).request("GET", "task/cancel/12", null);
    }

    @Test
    public void testTaskListIsScopedAndConvertsStatus() {
        VermeerClient backend = Mockito.mock(VermeerClient.class);
        Mockito.when(backend.request("GET", "tasks?limit=10000", null)).thenReturn(Map.of(
                "tasks", List.of(
                        Map.of("id", 1, "graph_name", "DEFAULT-graph-with-dash",
                               "task_type", "compute", "status", "complete"),
                        Map.of("id", 2, "graph_name", "other-graph"))));
        DirectVermeerService direct = service(backend);
        ReflectionTestUtils.setField(direct, "authMode", Mockito.mock(AuthModeService.class));
        HugeClient client = graphClient();
        Mockito.when(client.auth().isSuperAdmin()).thenReturn(true);
        var tasks = direct.tasks(client);
        Assert.assertEquals(1, tasks.size());
        Assert.assertEquals(-1L, tasks.get(0).id());
        Assert.assertEquals("success", tasks.get(0).status());
        Mockito.verify(client.auth()).isSuperAdmin();
        Mockito.verify(client.graph(), Mockito.never()).listVertices(Mockito.anyInt());
    }

    @Test
    public void testServerTaskListFailurePreventsNativeHistoryRead() {
        VermeerClient backend = Mockito.mock(VermeerClient.class);
        Mockito.when(backend.configured()).thenReturn(true);
        HugeClient client = graphClient();
        Mockito.when(client.task().list((String) null)).thenThrow(new ExternalException("Source graph unavailable"));
        AsyncTaskService tasks = new AsyncTaskService();
        ReflectionTestUtils.setField(tasks, "vermeer", service(backend));
        expect(ExternalException.class, () -> tasks.list(client, 1, 10, "", "", ""));
        Mockito.verifyNoInteractions(backend);
    }

    @Test
    public void testRestrictedUserKeepsServerTasksAndHasNoDirectCapability() {
        VermeerClient backend = Mockito.mock(VermeerClient.class);
        Mockito.when(backend.configured()).thenReturn(true);
        DirectVermeerService direct = service(backend);
        ReflectionTestUtils.setField(direct, "authMode", Mockito.mock(AuthModeService.class));
        HugeClient client = graphClient();
        Mockito.when(client.isServerAuthEnabled()).thenReturn(true);
        Task serverTask = Mockito.mock(Task.class);
        Mockito.when(serverTask.type()).thenReturn("gremlin");
        Mockito.when(client.task().list((String) null)).thenReturn(List.of(serverTask));
        AsyncTaskService tasks = new AsyncTaskService();
        ReflectionTestUtils.setField(tasks, "vermeer", direct);
        Assert.assertEquals(List.of(serverTask), tasks.list(client, 1, 10, "", "", "").getRecords());
        VermeerService vermeer = new VermeerService();
        ReflectionTestUtils.setField(vermeer, "direct", direct);
        Assert.assertEquals(false, vermeer.getVermeer(client, "login-token", false).get("enable"));
        Mockito.verify(backend, Mockito.never()).request(Mockito.anyString(),
                Mockito.anyString(), Mockito.any());
    }

    @Test
    public void testVermeerOutageKeepsServerTasksWithLocalWarning() {
        DirectVermeerService direct = Mockito.mock(DirectVermeerService.class);
        Mockito.when(direct.configured()).thenReturn(true);
        Mockito.when(direct.supported()).thenReturn(true);
        HugeClient client = graphClient();
        Task serverTask = Mockito.mock(Task.class);
        Mockito.when(serverTask.type()).thenReturn("gremlin");
        Mockito.when(client.task().list((String) null)).thenReturn(List.of(serverTask));
        Mockito.when(direct.tasks(client)).thenThrow(new ExternalException("service unavailable"));
        AsyncTaskService tasks = new AsyncTaskService();
        ReflectionTestUtils.setField(tasks, "vermeer", direct);
        var page = tasks.list(client, 1, 10, "", "", "");
        Assert.assertEquals(List.of(serverTask), page.getRecords());
        Assert.assertTrue(((AsyncTaskService.TaskPage) page).isVermeerUnavailable());
    }

    @Test
    public void testResultPagesPreserveLookaheadAndStopAtExactFinalPage() {
        VermeerClient backend = Mockito.mock(VermeerClient.class);
        Mockito.when(backend.request("GET", "task/12", null)).thenReturn(
                Map.of("task", Map.of("graph_name", "DEFAULT-graph-with-dash")));
        Mockito.when(backend.request("GET", "tasks/value/12?cursor=2&limit=3", null))
               .thenReturn(Map.of("vertices", List.of("third", "fourth", "fifth"), "cursor", 5));
        DirectVermeerService direct = service(backend);
        Map<String, Object> page = direct.results(graphClient(), -12, 2, 2);
        Assert.assertEquals(List.of("third", "fourth"), page.get("vertices"));
        Assert.assertEquals(4, page.get("cursor"));
        Assert.assertEquals(true, page.get("has_more"));
        Mockito.when(backend.request("GET", "tasks/value/12?cursor=4&limit=3", null))
               .thenReturn(Map.of("vertices", List.of("fifth"), "cursor", 5));
        Map<String, Object> next = direct.results(graphClient(), -12, 4, 2);
        Assert.assertEquals(List.of("fifth"), next.get("vertices"));
        Assert.assertEquals(false, next.get("has_more"));

        Mockito.when(backend.request("GET", "tasks/value/12?cursor=2&limit=3", null))
               .thenReturn(Map.of("vertices", List.of("third", "fourth"), "cursor", 4));
        Map<String, Object> last = direct.results(graphClient(), -12, 2, 2);
        Assert.assertEquals(List.of("third", "fourth"), last.get("vertices"));
        Assert.assertEquals(4, last.get("cursor"));
        Assert.assertEquals(false, last.get("has_more"));
    }

    @Test
    public void testAuthenticatedClientProbeCannotDisablePermissionCheck() {
        VermeerClient backend = Mockito.mock(VermeerClient.class);
        DirectVermeerService direct = service(backend);
        ReflectionTestUtils.setField(direct, "authMode", Mockito.mock(AuthModeService.class));
        HugeClient client = graphClient();
        // An authenticated graph-list probe succeeds even when auth is enabled.
        Mockito.when(client.isServerAuthEnabled()).thenReturn(false);
        expect(ForbiddenException.class,
                () -> direct.compute(client, Map.of("compute.algorithm", "pagerank")));
        Mockito.verify(client, Mockito.never()).isServerAuthEnabled();
        Mockito.verifyNoInteractions(backend);
        Mockito.when(client.auth().isSuperAdmin()).thenReturn(true);
        Assert.assertTrue(direct.permitted(client));
    }

    @Test
    public void testWorkerStartupIsRetryableWithoutPollingDeniedCapability() {
        DirectVermeerService direct = Mockito.mock(DirectVermeerService.class);
        Mockito.when(direct.configured()).thenReturn(true);
        Mockito.when(direct.supported()).thenReturn(true);
        HugeClient client = graphClient();
        Mockito.when(direct.permitted(client)).thenReturn(true);
        Mockito.when(direct.available()).thenReturn(false, true);
        VermeerService service = new VermeerService();
        ReflectionTestUtils.setField(service, "direct", direct);
        Assert.assertEquals(Map.of("enable", false, "retryable", true),
                            service.getVermeer(client, "login-token", false));
        Assert.assertEquals(Map.of("enable", true, "retryable", false, "statistics_available", true),
                            service.getVermeer(client, "login-token", false));
        Mockito.when(direct.permitted(client)).thenReturn(false);
        Assert.assertEquals(Map.of("enable", false, "retryable", false),
                            service.getVermeer(client, "login-token", false));
        Mockito.verify(direct, Mockito.times(2)).available();
    }

    @Test
    public void testReadinessUsesCurrentSpaceAvailability() {
        VermeerClient backend = Mockito.mock(VermeerClient.class);
        Mockito.when(backend.configured()).thenReturn(true);
        Mockito.when(backend.request("GET", "workers", null))
               .thenReturn(Map.of("workers", List.of(Map.of("name", "other-space-worker"))));
        Mockito.when(backend.request("GET", "workers/availability", null))
               .thenReturn(Map.of("available", false), Map.of("available", true));
        DirectVermeerService direct = service(backend);
        Assert.assertFalse(direct.available());
        Assert.assertTrue(direct.available());
        Mockito.verify(backend, Mockito.never()).request("GET", "workers", null);
    }

    @Test
    public void testReadinessSeparatesConfigurationFailuresFromTransientStates() throws Exception {
        AtomicInteger status = new AtomicInteger(503);
        AtomicReference<String> body = new AtomicReference<>("{\"available\":false}");
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/v1/workers/availability", exchange -> {
            byte[] value = body.get().getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status.get(), value.length);
            exchange.getResponseBody().write(value);
            exchange.close();
        });
        server.start();
        Path token = Files.createTempFile("vermeer-missing-", ".token");
        Files.delete(token);
        try {
            HugeConfig config = Mockito.mock(HugeConfig.class);
            Mockito.when(config.get(HubbleOptions.VERMEER_URL))
                   .thenReturn("http://127.0.0.1:" + server.getAddress().getPort());
            VermeerClient backend = new VermeerClient();
            ReflectionTestUtils.setField(backend, "config", config);
            VermeerService service = new VermeerService();
            ReflectionTestUtils.setField(service, "direct", service(backend));
            HugeClient client = graphClient();
            Assert.assertEquals(Map.of("enable", false, "retryable", true),
                                service.getVermeer(client, "login-token", false));
            for (int denied : List.of(401, 403, 404)) {
                status.set(denied);
                Assert.assertEquals(Map.of("enable", false, "retryable", false, "error", true),
                                    service.getVermeer(client, "login-token", false));
            }
            status.set(200);
            Assert.assertEquals(Map.of("enable", false, "retryable", true),
                                service.getVermeer(client, "login-token", false));
            body.set("{\"available\":true}");
            Assert.assertEquals(Map.of("enable", true, "retryable", false, "statistics_available", true),
                                service.getVermeer(client, "login-token", false));
            try {
                backend.request("GET", "graphs", null);
                Assert.fail("Expected the unrelated route to be missing");
            } catch (ExternalException error) {
                Assert.assertFalse(error instanceof VermeerClient.ConfigurationException);
            }
            Mockito.when(config.get(HubbleOptions.VERMEER_TOKEN_FILE)).thenReturn(token.toString());
            Assert.assertEquals(Map.of("enable", false, "retryable", false, "error", true),
                                service.getVermeer(client, "login-token", false));
            try {
                backend.request("GET", "workers/availability", null);
                Assert.fail("Expected missing token file failure");
            } catch (VermeerClient.ConfigurationException e) {
                Assert.assertEquals("Unable to read Vermeer token file", e.getMessage());
                Assert.assertNull(e.getCause());
            }
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void testStandaloneDisablesNativeCapabilityAndRejectsOperations() {
        VermeerClient backend = Mockito.mock(VermeerClient.class);
        Mockito.when(backend.configured()).thenReturn(true);
        Mockito.when(backend.request("GET", "task/12", null)).thenReturn(Map.of("task", Map.of(
                "id", 12, "graph_name", "DEFAULT-graph-with-dash",
                "task_type", "compute", "status", "waiting")));
        DirectVermeerService direct = service(backend);
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        ReflectionTestUtils.setField(direct, "config", config);
        HugeClient client = graphClient();
        VermeerService service = new VermeerService();
        ReflectionTestUtils.setField(service, "direct", direct);
        Assert.assertEquals(Map.of("enable", false, "retryable", false),
                            service.getVermeer(client, "login-token", false));
        expect(ExternalException.class, () -> direct.load(client, false, Map.of()));
        expect(ExternalException.class,
                () -> direct.compute(client, Map.of("compute.algorithm", "pagerank")));
        expect(ExternalException.class, () -> direct.task(client, -12, true));
        expect(ExternalException.class, () -> direct.results(client, -12, 0, 10));
        expect(ExternalException.class, () -> direct.cancel(client, -12));
        expect(ExternalException.class, () -> direct.deleteGraph(client));
        Assert.assertTrue(direct.tasks(client).isEmpty());
        Mockito.verify(backend, Mockito.never()).request(Mockito.anyString(),
                Mockito.anyString(), Mockito.any());
    }

    @Test
    public void testStandaloneTaskHistoryIgnoresConfiguredNativeService() {
        for (boolean unavailable : List.of(false, true)) {
            VermeerClient backend = Mockito.mock(VermeerClient.class);
            Mockito.when(backend.configured()).thenReturn(true);
            var response = Mockito.when(backend.request("GET", "tasks?limit=10000", null));
            if (unavailable) {
                response.thenThrow(new ExternalException("Vermeer unavailable"));
            } else {
                response.thenReturn(Map.of("tasks", List.of(Map.of(
                        "id", 12, "graph_name", "DEFAULT-graph-with-dash",
                        "task_type", "compute", "status", "complete"))));
            }
            DirectVermeerService direct = service(backend);
            HugeConfig config = Mockito.mock(HugeConfig.class);
            Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
            ReflectionTestUtils.setField(direct, "config", config);
            HugeClient client = graphClient();
            Task serverTask = Mockito.mock(Task.class);
            Mockito.when(serverTask.type()).thenReturn("gremlin");
            Mockito.when(client.task().list((String) null)).thenReturn(List.of(serverTask));
            Mockito.when(client.task().get(7)).thenReturn(serverTask);
            AsyncTaskService tasks = new AsyncTaskService();
            ReflectionTestUtils.setField(tasks, "vermeer", direct);
            var page = tasks.list(client, 1, 10, "", "", "");
            Assert.assertEquals(List.of(serverTask), page.getRecords());
            Assert.assertFalse(((AsyncTaskService.TaskPage) page).isVermeerUnavailable());
            Assert.assertTrue(direct.tasks(client).isEmpty());
            Assert.assertSame(serverTask, tasks.get(client, 7));
            Mockito.verify(backend, Mockito.never()).request(Mockito.anyString(),
                    Mockito.anyString(), Mockito.any());
        }
    }

    @Test
    public void testInvalidVermeerConfigurationKeepsServerTasks() throws Exception {
        HugeConfig config = Mockito.mock(HugeConfig.class);
        for (String url : List.of("http://invalid host/private", "ftp://localhost/private")) {
            Mockito.when(config.get(HubbleOptions.VERMEER_URL)).thenReturn(url);
            assertInvalidConfigurationKeepsServerTasks(config);
        }
        Path token = Files.createTempFile("vermeer-test-", ".token");
        try {
            Mockito.when(config.get(HubbleOptions.VERMEER_URL)).thenReturn("http://127.0.0.1:1");
            Mockito.when(config.get(HubbleOptions.VERMEER_TOKEN_FILE)).thenReturn(token.toString());
            assertInvalidConfigurationKeepsServerTasks(config);
            Files.writeString(token, "private-token\ninvalid-header");
            assertInvalidConfigurationKeepsServerTasks(config);
        } finally {
            Files.delete(token);
        }
    }

    private void assertInvalidConfigurationKeepsServerTasks(HugeConfig config) {
        VermeerClient backend = new VermeerClient();
        ReflectionTestUtils.setField(backend, "config", config);
        try {
            backend.request("GET", "graphs", null);
            Assert.fail("Expected adapter configuration failure");
        } catch (ExternalException e) {
            Assert.assertTrue(e instanceof VermeerClient.ConfigurationException);
            Assert.assertEquals("Invalid Vermeer configuration or request", e.getMessage());
            Assert.assertNull(e.getCause());
        }
        DirectVermeerService direct = service(backend);
        HugeClient client = graphClient();
        Task serverTask = Mockito.mock(Task.class);
        Mockito.when(serverTask.type()).thenReturn("gremlin");
        Mockito.when(client.task().list((String) null)).thenReturn(List.of(serverTask));
        AsyncTaskService tasks = new AsyncTaskService();
        ReflectionTestUtils.setField(tasks, "vermeer", direct);
        var page = tasks.list(client, 1, 10, "", "", "");
        Assert.assertEquals(List.of(serverTask), page.getRecords());
        Assert.assertTrue(((AsyncTaskService.TaskPage) page).isVermeerUnavailable());
        VermeerService service = new VermeerService();
        ReflectionTestUtils.setField(service, "direct", direct);
        Assert.assertEquals(Map.of("enable", false, "retryable", false, "error", true),
                            service.getVermeer(client, "login-token", false));
    }

    @Test
    public void testVermeerUsesSeparateServiceToken() throws Exception {
        AtomicReference<String> authorization = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        Path token = Files.createTempFile("vermeer-test-", ".token");
        Files.writeString(token, "vermeer-service-token");
        server.createContext("/api/v1/graphs", exchange -> {
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] response = "{\"errcode\":0,\"graphs\":[]}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, response.length);
            try (var output = exchange.getResponseBody()) {
                output.write(response);
            }
        });
        server.start();
        try {
            HugeConfig config = Mockito.mock(HugeConfig.class);
            Mockito.when(config.get(HubbleOptions.VERMEER_URL))
                   .thenReturn("http://127.0.0.1:" + server.getAddress().getPort());
            Mockito.when(config.get(HubbleOptions.VERMEER_TOKEN_FILE)).thenReturn(token.toString());
            VermeerClient client = new VermeerClient();
            ReflectionTestUtils.setField(client, "config", config);
            Assert.assertNotNull(client.request("GET", "graphs", null).get("graphs"));
            Assert.assertEquals("Bearer vermeer-service-token", authorization.get());
        } finally {
            server.stop(0);
            Files.delete(token);
        }
    }
}
