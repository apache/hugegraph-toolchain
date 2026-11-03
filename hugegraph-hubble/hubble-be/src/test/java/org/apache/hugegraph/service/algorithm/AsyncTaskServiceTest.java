/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
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

package org.apache.hugegraph.service.algorithm;

import java.util.List;
import java.util.stream.LongStream;

import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.TaskManager;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.service.space.DirectVermeerService;
import org.apache.hugegraph.structure.Task;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

public class AsyncTaskServiceTest {

    private AsyncTaskService service;
    private HugeClient client;
    private TaskManager tasks;

    @Before
    public void setup() {
        this.service = new AsyncTaskService();
        this.client = Mockito.mock(HugeClient.class);
        this.tasks = Mockito.mock(TaskManager.class);
        Mockito.when(this.client.task()).thenReturn(this.tasks);
        Mockito.when(this.tasks.list((String) null)).thenReturn(List.of());
    }

    @Test
    public void testFindsSubmittedTaskBeforeItAppearsInList() {
        Task submitted = task(80001L, "g.V().limit(100002)", "running");
        Mockito.when(this.tasks.list(List.of(80001L))).thenReturn(List.of(submitted));

        Assert.assertEquals(List.of(submitted), this.service.list(
                this.client, 1, 10, " 80001 ", "", "").getRecords());
        Mockito.verify(this.tasks, Mockito.never()).get(Mockito.anyLong());
    }

    @Test
    public void testSearchByDisplayedIdFindsBothTaskSources() {
        DirectVermeerService vermeer = Mockito.mock(DirectVermeerService.class);
        ReflectionTestUtils.setField(this.service, "vermeer", vermeer);
        Task server = task(7L, "query", "running");
        Task compute = task(-7L, "pagerank", "running");
        Mockito.when(this.tasks.list((String) null)).thenReturn(List.of(server));
        Mockito.when(vermeer.configured()).thenReturn(true);
        Mockito.when(vermeer.supported()).thenReturn(true);
        Mockito.when(vermeer.tasks(this.client)).thenReturn(List.of(compute));

        Assert.assertEquals(2, this.service.list(this.client, 1, 10, "7", "", "")
                                         .getTotal());
        Assert.assertEquals(1, this.service.list(this.client, 1, 10, "-7", "", "")
                                         .getTotal());
        Assert.assertEquals(List.of(server), this.service.list(
                this.client, 1, 10, "Server #7", "", "").getRecords());
        Assert.assertEquals(List.of(compute), this.service.list(
                this.client, 1, 10, "Vermeer #7", "", "").getRecords());
        Assert.assertTrue(this.service.list(this.client, 1, 10, "Vermeer #8", "", "")
                                      .getRecords().isEmpty());
    }

    @Test
    public void testKeepsNumericNameMatchesAndAppliesStatusAfterIdLookup() {
        Task named = task(70001L, "query 80001", "failed");
        Task submitted = task(80001L, "g.V()", "running");
        Mockito.when(this.tasks.list("FAILED")).thenReturn(List.of(named));
        Mockito.when(this.tasks.list(List.of(80001L))).thenReturn(List.of(submitted));

        Assert.assertEquals(List.of(named), this.service.list(
                this.client, 1, 10, "80001", "gremlin", "FAILED").getRecords());
        Mockito.when(this.tasks.list((String) null)).thenReturn(List.of(named));
        Assert.assertEquals(2, this.service.list(
                this.client, 1, 10, "80001", "", "").getTotal());
    }

    @Test
    public void testQualifiedIdentityDoesNotMatchOtherTaskNames() {
        Task identified = task(7L, "query", "running");
        Task named = task(8L, "retry Server #7", "running");
        Mockito.when(this.tasks.list((String) null)).thenReturn(List.of(identified, named));

        Assert.assertEquals(List.of(identified), this.service.list(
                this.client, 1, 10, "Server #7", "", "").getRecords());
    }

    @Test
    public void testDoesNotFetchAnIdAlreadyInTheList() {
        Task submitted = task(80001L, "g.V()", "failed");
        Mockito.when(this.tasks.list((String) null)).thenReturn(List.of(submitted));

        Assert.assertEquals(List.of(submitted), this.service.list(
                this.client, 1, 10, "80001", "", "").getRecords());
        Mockito.verify(this.tasks, Mockito.never()).list(List.of(80001L));
    }

    @Test
    public void testMissingIdDoesNotHideNumericNameMatches() {
        Task named = task(70001L, "query 80001", "failed");
        Mockito.when(this.tasks.list((String) null)).thenReturn(List.of(named));
        ServerException missing = missingTask(80001L);
        Mockito.when(this.tasks.list(List.of(80001L))).thenThrow(missing);

        Assert.assertEquals(List.of(named), this.service.list(
                this.client, 1, 10, "80001", "", "").getRecords());
    }

    @Test(expected = ServerException.class)
    public void testDoesNotTurnLookupFailureIntoEmptySuccess() {
        ServerException unavailable = new ServerException("Server unavailable");
        unavailable.status(503);
        Mockito.when(this.tasks.list(List.of(80001L))).thenThrow(unavailable);
        this.service.list(this.client, 1, 10, "80001", "", "");
    }

    @Test
    public void testIdsPollingTreatsAnUndiscoveredServerTaskAsEmpty() {
        ServerException missing = missingTask(80001L);
        Task submitted = task(80001L, "g.V()", "running");
        Mockito.when(this.tasks.list(List.of(80001L))).thenThrow(missing)
               .thenReturn(List.of(submitted));

        Assert.assertTrue(this.service.list(this.client, List.of(80001L)).isEmpty());
        Assert.assertEquals(List.of(submitted), this.service.list(this.client, List.of(80001L)));
    }

    @Test
    public void testMissingTaskAcceptsExceptionNameWithoutClassPrefix() {
        ServerException missing = missingTask(80001L);
        ReflectionTestUtils.setField(missing, "exception",
                                     "org.apache.hugegraph.exception.NotFoundException");
        Mockito.when(this.tasks.list(List.of(80001L))).thenThrow(missing);

        Assert.assertTrue(this.service.list(this.client, List.of(80001L)).isEmpty());
    }

    @Test
    public void testBothIdLookupPathsPreserveUnrelatedNotFoundResponses() {
        for (String message : List.of("Graph 'hugegraph' does not exist",
                                      "Graph space 'DEFAULT' does not exist",
                                      "HTTP 404 Not Found",
                                      "Can't find task with id '90001'")) {
            ServerException failure = missingTask(80001L);
            ReflectionTestUtils.setField(failure, "message", message);
            this.assertBothLookupsFail(failure);
        }
        ServerException untyped = missingTask(80001L);
        ReflectionTestUtils.setField(untyped, "exception", null);
        this.assertBothLookupsFail(untyped);
        ServerException route = missingTask(80001L);
        ReflectionTestUtils.setField(route, "exception", "class jakarta.ws.rs.NotFoundException");
        this.assertBothLookupsFail(route);
    }

    @Test
    public void testIdsPollingPreservesPermissionAndServerFailures() {
        for (int status : List.of(403, 503)) {
            ServerException failure = missingTask(80001L);
            failure.status(status);
            Mockito.doThrow(failure).when(this.tasks).list(List.of(80001L));

            try {
                this.service.list(this.client, List.of(80001L));
                Assert.fail("Expected task lookup failure to propagate");
            } catch (ServerException e) {
                Assert.assertSame(failure, e);
            }
        }
    }

    @Test
    public void testExistingIdsUseOneMetadataRequest() {
        List<Long> ids = List.of(80001L, 80002L);
        List<Task> existing = List.of(task(80001L, "first", "running"),
                                      task(80002L, "second", "success"));
        Mockito.when(this.tasks.list(ids)).thenReturn(existing);

        Assert.assertEquals(existing, this.service.list(this.client, ids));
        Mockito.verify(this.tasks).list(ids);
        Mockito.verifyNoMoreInteractions(this.tasks);
    }

    @Test
    public void testOversizedIdBatchesAreRejectedBeforeAnyUpstreamRequest() {
        DirectVermeerService vermeer = Mockito.mock(DirectVermeerService.class);
        ReflectionTestUtils.setField(this.service, "vermeer", vermeer);
        for (boolean negative : List.of(false, true)) {
            List<Long> ids = LongStream.rangeClosed(1, 33)
                    .map(id -> negative ? -id : id).boxed().toList();
            try {
                this.service.list(this.client, ids);
                Assert.fail("Expected oversized batch to be rejected");
            } catch (IllegalArgumentException failure) {
                Assert.assertTrue(failure.getMessage().contains("At most 32 task IDs"));
            }
        }
        Mockito.verifyNoInteractions(this.tasks, vermeer);
    }

    @Test
    public void testMaximumMissingBatchUsesAtMostThirtyTwoRequests() {
        List<Long> ids = LongStream.rangeClosed(1, 32).boxed().toList();
        Mockito.when(this.tasks.list(Mockito.<List<Long>>any())).thenAnswer(invocation -> {
            List<Long> remaining = invocation.getArgument(0);
            throw missingTask(remaining.get(0));
        });

        Assert.assertTrue(this.service.list(this.client, ids).isEmpty());
        Mockito.verify(this.tasks, Mockito.times(32)).list(Mockito.<List<Long>>any());
        Mockito.verifyNoMoreInteractions(this.tasks);
    }

    @Test
    public void testMissingIdRetainsExistingServerAndVermeerTasks() {
        DirectVermeerService vermeer = Mockito.mock(DirectVermeerService.class);
        ReflectionTestUtils.setField(this.service, "vermeer", vermeer);
        Task server = task(80001L, "g.V()", "running");
        Task compute = task(-7L, "pagerank", "success");
        Mockito.when(this.tasks.list(List.of(80001L, 80002L))).thenThrow(missingTask(80002L));
        Mockito.when(this.tasks.list(List.of(80001L))).thenReturn(List.of(server));
        Mockito.when(vermeer.task(this.client, -7, false)).thenReturn(compute);

        Assert.assertEquals(List.of(server, compute), this.service.list(
                this.client, List.of(80001L, 80002L, -7L)));
        Mockito.verify(this.tasks).list(List.of(80001L, 80002L));
        Mockito.verify(this.tasks).list(List.of(80001L));
        Mockito.verifyNoMoreInteractions(this.tasks);
    }

    @Test
    public void testMultipleMissingIdsAreExcludedUntilExistingMetadataIsFound() {
        Task existing = task(80001L, "g.V()", "running");
        Mockito.when(this.tasks.list(List.of(80001L, 80002L, 80003L)))
               .thenThrow(missingTask(80002L));
        Mockito.when(this.tasks.list(List.of(80001L, 80003L))).thenThrow(missingTask(80003L));
        Mockito.when(this.tasks.list(List.of(80001L))).thenReturn(List.of(existing));

        Assert.assertEquals(List.of(existing), this.service.list(
                this.client, List.of(80001L, 80002L, 80003L)));
        Mockito.verify(this.tasks).list(List.of(80001L, 80002L, 80003L));
        Mockito.verify(this.tasks).list(List.of(80001L, 80003L));
        Mockito.verify(this.tasks).list(List.of(80001L));
        Mockito.verifyNoMoreInteractions(this.tasks);
    }

    @Test
    public void testAllMissingIdsStopWithoutAnEmptyIdsRequest() {
        Mockito.when(this.tasks.list(List.of(80002L, 80003L))).thenThrow(missingTask(80002L));
        Mockito.when(this.tasks.list(List.of(80003L))).thenThrow(missingTask(80003L));

        Assert.assertTrue(this.service.list(this.client, List.of(80002L, 80003L)).isEmpty());
        Mockito.verify(this.tasks).list(List.of(80002L, 80003L));
        Mockito.verify(this.tasks).list(List.of(80003L));
        Mockito.verifyNoMoreInteractions(this.tasks);
    }

    @Test
    public void testBatchFallbackStillPropagatesUnrelatedFailure() {
        Mockito.when(this.tasks.list(List.of(80001L, 80002L))).thenThrow(missingTask(80002L));
        for (int status : List.of(404, 503)) {
            ServerException failure = new ServerException("Graph 'hugegraph' does not exist");
            failure.status(status);
            Mockito.doThrow(failure).when(this.tasks).list(List.of(80001L));
            try {
                this.service.list(this.client, List.of(80001L, 80002L));
                Assert.fail("Expected unrelated fallback failure to propagate");
            } catch (ServerException e) {
                Assert.assertSame(failure, e);
            }
        }
    }

    @Test
    public void testVermeerIdPollingDoesNotFetchResultValues() {
        DirectVermeerService vermeer = Mockito.mock(DirectVermeerService.class);
        ReflectionTestUtils.setField(this.service, "vermeer", vermeer);
        Task submitted = task(-7L, "pagerank", "success");
        Mockito.when(vermeer.task(this.client, -7, false)).thenReturn(submitted);

        Assert.assertEquals(List.of(submitted), this.service.list(this.client, List.of(-7L)));
        Mockito.verify(vermeer, Mockito.never()).task(this.client, -7, true);
        Mockito.verifyNoInteractions(this.tasks);
    }

    private void assertBothLookupsFail(ServerException failure) {
        Mockito.doThrow(failure).when(this.tasks).list(List.of(80001L));
        for (boolean direct : List.of(true, false)) {
            try {
                if (direct) {
                    this.service.list(this.client, List.of(80001L));
                } else {
                    this.service.list(this.client, 1, 10, "80001", "", "");
                }
                Assert.fail("Expected unrelated lookup failure to propagate");
            } catch (ServerException e) {
                Assert.assertSame(failure, e);
            }
        }
    }

    private static ServerException missingTask(long id) {
        ServerException missing = new ServerException("Can't find task with id '%s'", id);
        missing.status(404);
        ReflectionTestUtils.setField(missing, "exception",
                                     "class org.apache.hugegraph.exception.NotFoundException");
        return missing;
    }

    private static Task task(long id, String name, String status) {
        Task task = new Task();
        ReflectionTestUtils.setField(task, "id", id);
        ReflectionTestUtils.setField(task, "name", name);
        ReflectionTestUtils.setField(task, "status", status);
        task.type("gremlin");
        return task;
    }
}
