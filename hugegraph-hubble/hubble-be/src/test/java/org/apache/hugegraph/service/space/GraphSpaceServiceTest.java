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

package org.apache.hugegraph.service.space;

import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import com.baomidou.mybatisplus.core.metadata.IPage;
import org.apache.hugegraph.driver.AuthManager;
import org.apache.hugegraph.driver.GraphSpaceManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.space.GraphSpaceEntity;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.service.auth.UserService;
import org.apache.hugegraph.service.graphs.GraphsService;
import org.apache.hugegraph.structure.space.GraphSpace;
import org.apache.hugegraph.util.PageUtil;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

public class GraphSpaceServiceTest {

    private GraphSpaceService service;
    private GraphsService graphsService;
    private UserService userService;
    private HugeClient client;

    @Before
    public void setup() {
        this.service = new GraphSpaceService();
        this.graphsService = Mockito.mock(GraphsService.class);
        this.userService = Mockito.mock(UserService.class);
        this.client = Mockito.mock(HugeClient.class);
        ReflectionTestUtils.setField(this.service, "graphsService",
                                     this.graphsService);
        ReflectionTestUtils.setField(this.service, "userService",
                                     this.userService);
    }

    @Test
    public void testViewNeverContainsDataPlaneSecrets() {
        GraphSpaceEntity entity = new GraphSpaceEntity();
        entity.setName("public");
        entity.setDpUserName("dp-user");
        entity.setDpPassWord("dp-secret");
        entity.setConfigs(new HashMap<>());

        Map<String, Object> view = this.service.toView(entity);

        Assert.assertEquals("public", view.get("name"));
        Assert.assertFalse(view.containsKey("dp_username"));
        Assert.assertFalse(view.containsKey("dp_password"));
        Assert.assertFalse(view.containsKey("dpUserName"));
        Assert.assertFalse(view.containsKey("dpPassWord"));
        Assert.assertFalse(view.containsKey("configs"));
    }

    @Test
    public void testPdListResponseNeverContainsDataPlaneSecrets() {
        GraphSpaceManager manager = Mockito.mock(GraphSpaceManager.class);
        Map<String, Object> profile = new HashMap<>();
        profile.put("name", "public");
        profile.put("create_time", "20260712");
        profile.put("dp_username", "dp-user");
        profile.put("dp_password", "dp-secret");
        profile.put("dpUserName", "dp-user-camel");
        profile.put("dpPassWord", "dp-secret-camel");
        profile.put("configs", new HashMap<>());
        Mockito.when(this.client.graphSpace()).thenReturn(manager);
        Mockito.when(manager.listProfile("")).thenReturn(
                java.util.Collections.singletonList(profile));
        Mockito.when(this.graphsService.listGraphNames(this.client,
                                                       "public", ""))
               .thenReturn(java.util.Collections.emptySet());
        Mockito.when(this.userService.listGraphSpaceAdmin(this.client,
                                                          "public"))
               .thenReturn(java.util.Collections.emptyList());

        List<Map<String, Object>> response =
                this.service.queryAllGs(this.client, "", "");

        Assert.assertEquals(1, response.size());
        Assert.assertEquals("public", response.get(0).get("name"));
        Assert.assertFalse(response.get(0).containsKey("dp_username"));
        Assert.assertFalse(response.get(0).containsKey("dp_password"));
        Assert.assertFalse(response.get(0).containsKey("dpUserName"));
        Assert.assertFalse(response.get(0).containsKey("dpPassWord"));
        Assert.assertFalse(response.get(0).containsKey("configs"));
    }

    @Test
    public void testAccessibleGraphSpacesHonorDefaultAndCustomRoles() {
        GraphSpaceManager manager = Mockito.mock(GraphSpaceManager.class);
        AuthManager auth = Mockito.mock(AuthManager.class);
        Map<String, GraphSpace> spaces = new HashMap<>();
        spaces.put("public", graphSpace("public", false, "20260712"));
        spaces.put("admin", graphSpace("admin", true, "20260712"));
        spaces.put("analyst", graphSpace("analyst", true, "20260712"));
        spaces.put("observer", graphSpace("observer", true, "20260712"));
        spaces.put("custom", graphSpace("custom", true, "20260712"));
        spaces.put("denied", graphSpace("denied", true, "20260712"));

        Mockito.when(this.client.graphSpace()).thenReturn(manager);
        Mockito.when(this.client.auth()).thenReturn(auth);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(true);
        Mockito.when(manager.listGraphSpace())
               .thenReturn(java.util.Arrays.asList("public", "admin",
                                                   "analyst", "observer",
                                                   "custom", "denied"));
        Mockito.when(manager.getGraphSpace(Mockito.anyString()))
               .thenAnswer(invocation -> spaces.get(invocation.getArgument(0)));
        Mockito.when(auth.isSpaceAdmin("admin")).thenReturn(true);
        Mockito.when(auth.checkDefaultRole("analyst", "analyst"))
               .thenReturn(true);
        Mockito.when(auth.checkDefaultRole("observer", "observer"))
               .thenReturn(true);
        Mockito.when(auth.isSpaceMember("custom")).thenReturn(true);
        Mockito.when(this.graphsService.listGraphNames(
                             Mockito.eq(this.client), Mockito.anyString(),
                             Mockito.eq("")))
               .thenReturn(java.util.Collections.emptySet());

        List<Map<String, Object>> response =
                this.service.queryAccessibleGs(this.client, "", "");

        Assert.assertEquals(java.util.Arrays.asList(
                                    "admin", "analyst", "custom",
                                    "observer", "public"),
                            response.stream().map(item -> item.get("name"))
                                    .collect(java.util.stream.Collectors
                                                      .toList()));
        Assert.assertTrue((Boolean) response.get(0).get("authed"));
        Assert.assertFalse((Boolean) response.get(0).get("default"));
        Assert.assertEquals(java.util.Arrays.asList(
                                    "admin", "analyst", "custom",
                                    "observer", "public"),
                            this.service.listAccessible(this.client));
        Mockito.verify(auth, Mockito.times(2)).isSpaceMember("custom");
        Mockito.verify(auth, Mockito.times(2)).isSpaceMember("denied");
        Mockito.verify(auth, Mockito.never())
               .checkDefaultRole(Mockito.anyString(), Mockito.eq("observer"),
                                 Mockito.anyString());
    }

    @Test
    public void testLegacyMemberGraphSpaceRemainsVisible() {
        GraphSpaceManager manager = Mockito.mock(GraphSpaceManager.class);
        AuthManager auth = Mockito.mock(AuthManager.class);
        GraphSpace space = graphSpace("legacy", true, "20260712");
        Mockito.when(this.client.graphSpace()).thenReturn(manager);
        Mockito.when(this.client.auth()).thenReturn(auth);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(false);
        Mockito.when(manager.listGraphSpace())
               .thenReturn(java.util.Collections.singletonList("legacy"));
        Mockito.when(manager.getGraphSpace("legacy")).thenReturn(space);
        Mockito.when(auth.isSpaceMember("legacy")).thenReturn(true);
        Mockito.when(this.graphsService.listGraphNames(this.client, "legacy",
                                                       ""))
               .thenReturn(java.util.Collections.emptySet());

        List<Map<String, Object>> response =
                this.service.queryAccessibleGs(this.client, "", "");

        Assert.assertEquals(1, response.size());
        Assert.assertEquals("legacy", response.get(0).get("name"));
        Mockito.verify(auth, Mockito.never())
               .checkDefaultRole(Mockito.anyString(), Mockito.anyString());
    }

    @Test
    public void testAnonymousGraphSpacesApplyQueryAndTimeFilters() {
        GraphSpaceManager manager = Mockito.mock(GraphSpaceManager.class);
        GraphSpace visible = graphSpace("public", false, "20260712");
        visible.setNickname("visible space");
        GraphSpace old = graphSpace("visible-old", true, "20260701");
        Mockito.when(this.client.graphSpace()).thenReturn(manager);
        Mockito.when(manager.listGraphSpace())
               .thenReturn(java.util.Arrays.asList("public", "visible-old"));
        Mockito.when(manager.getGraphSpace("public")).thenReturn(visible);
        Mockito.when(manager.getGraphSpace("visible-old")).thenReturn(old);
        Mockito.when(this.graphsService.listGraphNames(
                             Mockito.eq(this.client), Mockito.anyString(),
                             Mockito.eq("")))
               .thenReturn(java.util.Collections.emptySet());

        List<Map<String, Object>> response =
                this.service.queryAnonymousGs(this.client, "visible",
                                              "20260702");

        Assert.assertEquals(1, response.size());
        Assert.assertEquals("public", response.get(0).get("name"));
        Assert.assertTrue((Boolean) response.get(0).get("authed"));
    }

    @Test
    public void testAnonymousGraphSpacesExcludeProtectedSpaces() {
        GraphSpaceManager manager = Mockito.mock(GraphSpaceManager.class);
        GraphSpace visible = graphSpace("public", false, "20260712");
        GraphSpace protectedSpace = graphSpace("protected", true, "20260712");
        Mockito.when(this.client.graphSpace()).thenReturn(manager);
        Mockito.when(manager.listGraphSpace())
               .thenReturn(java.util.Arrays.asList("public", "protected"));
        Mockito.when(manager.getGraphSpace("public")).thenReturn(visible);
        Mockito.when(manager.getGraphSpace("protected"))
               .thenReturn(protectedSpace);
        Mockito.when(this.graphsService.listGraphNames(this.client, "public", ""))
               .thenReturn(java.util.Collections.emptySet());

        List<Map<String, Object>> response =
                this.service.queryAnonymousGs(this.client, "", "");

        Assert.assertEquals(1, response.size());
        Assert.assertEquals("public", response.get(0).get("name"));
        Assert.assertEquals(java.util.Collections.singletonList("public"),
                            this.service.listAnonymous(this.client));
        Mockito.verify(this.graphsService, Mockito.never())
               .listGraphNames(this.client, "protected", "");
    }

    @Test
    public void testAnonymousDetailRejectsProtectedSpaceBeforeStatistics() {
        GraphSpaceManager manager = Mockito.mock(GraphSpaceManager.class);
        GraphSpace protectedSpace = graphSpace("protected", true, "20260712");
        Mockito.when(this.client.graphSpace()).thenReturn(manager);
        Mockito.when(manager.getGraphSpace("protected"))
               .thenReturn(protectedSpace);

        try {
            this.service.getAnonymous(this.client, "protected");
            Assert.fail("Expected protected GraphSpace to be unavailable");
        } catch (ExternalException e) {
            Assert.assertEquals(404, e.status());
        }
        try {
            this.service.isAuthForAnonymous(this.client, "protected");
            Assert.fail("Expected protected GraphSpace auth to be unavailable");
        } catch (ExternalException e) {
            Assert.assertEquals(404, e.status());
        }
        Mockito.verifyNoInteractions(this.graphsService);
    }

    @Test
    public void testAuthenticatedDetailRejectsUnassignedProtectedSpace() {
        GraphSpaceManager manager = Mockito.mock(GraphSpaceManager.class);
        AuthManager auth = Mockito.mock(AuthManager.class);
        GraphSpace protectedSpace = graphSpace("protected", true,
                                               "20260712");
        Mockito.when(this.client.graphSpace()).thenReturn(manager);
        Mockito.when(this.client.auth()).thenReturn(auth);
        Mockito.when(this.client.supportsDefaultRole()).thenReturn(false);
        Mockito.when(manager.getGraphSpace("protected"))
               .thenReturn(protectedSpace);

        try {
            this.service.getAccessibleWithAdmins(this.client, "protected");
            Assert.fail("Expected protected GraphSpace to be unavailable");
        } catch (ExternalException e) {
            Assert.assertEquals(404, e.status());
        }
        try {
            this.service.isAuthForAccessible(this.client, "protected");
            Assert.fail("Expected protected GraphSpace auth to be unavailable");
        } catch (ExternalException e) {
            Assert.assertEquals(404, e.status());
        }
        Mockito.verify(auth, Mockito.times(2)).isSpaceMember("protected");
        Mockito.verifyNoInteractions(this.graphsService);
    }

    @Test
    public void testAnonymousAuthHidesMissingGraphSpaceLikeProtectedSpace() {
        GraphSpaceManager manager = Mockito.mock(GraphSpaceManager.class);
        Mockito.when(this.client.graphSpace()).thenReturn(manager);
        ServerException missing = new ServerException("missing");
        missing.status(400);
        Mockito.when(manager.getGraphSpace("missing")).thenThrow(missing);

        try {
            this.service.isAuthForAnonymous(this.client, "missing");
            Assert.fail("Expected missing GraphSpace auth to be unavailable");
        } catch (ExternalException e) {
            Assert.assertEquals(404, e.status());
        }
        try {
            this.service.getAnonymous(this.client, "missing");
            Assert.fail("Expected missing GraphSpace detail to be unavailable");
        } catch (ExternalException e) {
            Assert.assertEquals(404, e.status());
        }
    }

    @Test
    public void testAnonymousGraphSpacesCollectStatisticsAfterPaging() {
        GraphSpaceManager manager = Mockito.mock(GraphSpaceManager.class);
        Mockito.when(this.client.graphSpace()).thenReturn(manager);
        Mockito.when(manager.listGraphSpace())
               .thenReturn(java.util.Arrays.asList("a", "b", "c"));
        Mockito.when(manager.getGraphSpace(Mockito.anyString()))
               .thenAnswer(invocation -> graphSpace(
                       invocation.getArgument(0), false, "20260712"));
        Mockito.when(this.graphsService.listGraphNames(
                             Mockito.eq(this.client), Mockito.anyString(),
                             Mockito.eq("")))
               .thenReturn(java.util.Collections.emptySet());

        IPage<Map<String, Object>> response =
                this.service.queryAnonymousGsPage(this.client, "", "",
                                                  2, 1);

        Assert.assertEquals(3L, response.getTotal());
        Assert.assertEquals(1, response.getRecords().size());
        Assert.assertEquals("b", response.getRecords().get(0).get("name"));
        Mockito.verify(this.graphsService)
               .listGraphNames(this.client, "b", "");
        Mockito.verify(this.graphsService, Mockito.never())
               .listGraphNames(this.client, "a", "");
        Mockito.verify(this.graphsService, Mockito.never())
               .listGraphNames(this.client, "c", "");
    }

    @Test
    public void testAccessibleGraphSpacesCollectStatisticsAfterPaging() {
        GraphSpaceManager manager = Mockito.mock(GraphSpaceManager.class);
        AuthManager auth = Mockito.mock(AuthManager.class);
        Mockito.when(this.client.graphSpace()).thenReturn(manager);
        Mockito.when(this.client.auth()).thenReturn(auth);
        Mockito.when(manager.listGraphSpace())
               .thenReturn(java.util.Arrays.asList("a", "b", "c"));
        Mockito.when(manager.getGraphSpace(Mockito.anyString()))
               .thenAnswer(invocation -> graphSpace(
                       invocation.getArgument(0), false, "20260712"));
        Mockito.when(this.graphsService.listGraphNames(
                             Mockito.eq(this.client), Mockito.anyString(),
                             Mockito.eq("")))
               .thenReturn(java.util.Collections.emptySet());

        IPage<Map<String, Object>> response =
                this.service.queryAccessibleGsPage(this.client, "", "",
                                                   2, 1);

        Assert.assertEquals(3L, response.getTotal());
        Assert.assertEquals("b", response.getRecords().get(0).get("name"));
        Mockito.verify(this.graphsService)
               .listGraphNames(this.client, "b", "");
        Mockito.verify(this.graphsService, Mockito.never())
               .listGraphNames(this.client, "a", "");
        Mockito.verify(this.graphsService, Mockito.never())
               .listGraphNames(this.client, "c", "");
    }

    @Test
    public void testGraphSpaceAllSentinelUsesHardCap() {
        List<Integer> values = IntStream.rangeClosed(0, PageUtil.HARD_CAP)
                                        .boxed()
                                        .collect(Collectors.toList());
        AtomicInteger mapped = new AtomicInteger();

        try {
            GraphSpaceService.pageAndMap(values, 1, -1, value -> {
                mapped.incrementAndGet();
                return value;
            });
            Assert.fail("Expected the all-record hard cap to reject the request");
        } catch (IllegalArgumentException e) {
            Assert.assertTrue(e.getMessage().contains("10000"));
        }
        Assert.assertEquals(0, mapped.get());
    }

    @Test
    public void testStatisticUsesActualFallbackDate() {
        Mockito.when(this.graphsService.listGraphNames(this.client, "space", ""))
               .thenReturn(new LinkedHashSet<>(java.util.Collections
                                                       .singletonList("g1")));
        Mockito.when(this.graphsService.evCount(this.client, "space", "g1"))
               .thenReturn(statistic("20260712", Integer.valueOf(2),
                                     Long.valueOf(3L)));

        Map<String, Object> result = this.service.evCount(this.client, "space");

        Assert.assertEquals("2026-07-12", result.get("date"));
        Assert.assertEquals(2L, result.get("vertex"));
        Assert.assertEquals(3L, result.get("edge"));
    }

    @Test
    public void testMetricsAcceptsIntegerAndLongCountValues() {
        GraphSpaceService spy = Mockito.spy(this.service);
        Mockito.doReturn(java.util.Collections.singletonList("space"))
               .when(spy).listAll(this.client);
        Map<String, Object> counts = new HashMap<>();
        counts.put("vertex", Integer.valueOf(2));
        counts.put("edge", Long.valueOf(3L));
        Mockito.doReturn(counts).when(spy).evCount(this.client, "space");
        Mockito.when(this.graphsService.listGraphNames(this.client, "space", ""))
               .thenReturn(java.util.Collections.emptySet());

        Map<String, Long> result = spy.metrics(this.client);

        Assert.assertEquals(Long.valueOf(2L), result.get("vCount"));
        Assert.assertEquals(Long.valueOf(3L), result.get("eCount"));
    }

    @Test
    public void testMetricsPreservesUnavailableElementCounts() {
        GraphSpaceService spy = Mockito.spy(this.service);
        Mockito.doReturn(java.util.Arrays.asList("available", "unavailable"))
               .when(spy).listAll(this.client);
        Mockito.doReturn(statistic("20260712", 2L, 3L))
               .when(spy).evCount(this.client, "available");
        Mockito.doReturn(statistic(null, null, null))
               .when(spy).evCount(this.client, "unavailable");
        Mockito.when(this.graphsService.listGraphNames(
                             Mockito.eq(this.client), Mockito.anyString(),
                             Mockito.eq("")))
               .thenReturn(java.util.Collections.emptySet());

        Map<String, Long> result = spy.metrics(this.client);

        Assert.assertNull(result.get("vCount"));
        Assert.assertNull(result.get("eCount"));
    }

    @Test
    public void testStatisticDoesNotClaimMixedDates() {
        LinkedHashSet<String> graphs = new LinkedHashSet<>();
        graphs.add("g1");
        graphs.add("g2");
        Mockito.when(this.graphsService.listGraphNames(this.client, "space", ""))
               .thenReturn(graphs);
        Mockito.when(this.graphsService.evCount(this.client, "space", "g1"))
               .thenReturn(statistic("20260712", 2L, 3L));
        Mockito.when(this.graphsService.evCount(this.client, "space", "g2"))
               .thenReturn(statistic("20260713", 5L, 7L));

        Map<String, Object> result = this.service.evCount(this.client, "space");

        Assert.assertNull(result.get("date"));
        Assert.assertEquals(7L, result.get("vertex"));
        Assert.assertEquals(10L, result.get("edge"));
    }

    @Test
    public void testStatisticDoesNotDependOnUnknownDateOrder() {
        LinkedHashSet<String> graphs = new LinkedHashSet<>();
        graphs.add("g1");
        graphs.add("g2");
        LinkedHashSet<String> reversedGraphs = new LinkedHashSet<>();
        reversedGraphs.add("g2");
        reversedGraphs.add("g1");
        Mockito.when(this.graphsService.listGraphNames(this.client, "space", ""))
               .thenReturn(graphs);
        Mockito.when(this.graphsService.evCount(this.client, "space", "g1"))
               .thenReturn(statistic(null, 2L, 3L));
        Mockito.when(this.graphsService.evCount(this.client, "space", "g2"))
               .thenReturn(statistic("20260713", 5L, 7L));

        Map<String, Object> forward = this.service.evCount(this.client, "space");
        Mockito.when(this.graphsService.listGraphNames(this.client, "space", ""))
               .thenReturn(reversedGraphs);
        Map<String, Object> reversed = this.service.evCount(this.client, "space");

        Assert.assertNull(forward.get("date"));
        Assert.assertNull(reversed.get("date"));
        Assert.assertEquals(7L, forward.get("vertex"));
        Assert.assertEquals(10L, forward.get("edge"));
        Assert.assertEquals(7L, reversed.get("vertex"));
        Assert.assertEquals(10L, reversed.get("edge"));
    }

    @Test
    public void testStatisticKeepsUnknownDateWhenAllDatesAreUnknown() {
        LinkedHashSet<String> graphs = new LinkedHashSet<>();
        graphs.add("g1");
        graphs.add("g2");
        Mockito.when(this.graphsService.listGraphNames(this.client, "space", ""))
               .thenReturn(graphs);
        Mockito.when(this.graphsService.evCount(this.client, "space", "g1"))
               .thenReturn(statistic(null, 2L, 3L));
        Mockito.when(this.graphsService.evCount(this.client, "space", "g2"))
               .thenReturn(statistic(null, 5L, 7L));

        Map<String, Object> result = this.service.evCount(this.client, "space");

        Assert.assertNull(result.get("date"));
        Assert.assertEquals(7L, result.get("vertex"));
        Assert.assertEquals(10L, result.get("edge"));
    }

    @Test
    public void testStatisticKeepsUnavailableCountsForGraphSpace() {
        LinkedHashSet<String> graphs = new LinkedHashSet<>();
        graphs.add("available");
        graphs.add("unavailable");
        Mockito.when(this.graphsService.listGraphNames(this.client, "space", ""))
               .thenReturn(graphs);
        Mockito.when(this.graphsService.evCount(this.client, "space",
                                                "available"))
               .thenReturn(statistic("20260712", 2L, 3L));
        Mockito.when(this.graphsService.evCount(this.client, "space",
                                                "unavailable"))
               .thenReturn(statistic(null, null, null));

        Map<String, Object> result = this.service.evCount(this.client, "space");

        Assert.assertNull(result.get("date"));
        Assert.assertNull(result.get("vertex"));
        Assert.assertNull(result.get("edge"));
    }

    @Test
    public void testStatisticFormatsCurrentDateForEmptyGraphSpace() {
        Mockito.when(this.graphsService.listGraphNames(this.client, "space", ""))
               .thenReturn(java.util.Collections.emptySet());

        Map<String, Object> result = this.service.evCount(this.client, "space");

        Assert.assertTrue(((String) result.get("date"))
                                  .matches("\\d{4}-\\d{2}-\\d{2}"));
        Assert.assertEquals(0L, result.get("vertex"));
        Assert.assertEquals(0L, result.get("edge"));
    }

    private static Map<String, Object> statistic(String date, Number vertex,
                                                  Number edge) {
        Map<String, Object> statistic = new HashMap<>();
        statistic.put("date", date);
        statistic.put("vertex", vertex);
        statistic.put("edge", edge);
        return statistic;
    }

    private static GraphSpace graphSpace(String name, boolean auth,
                                         String createTime) {
        GraphSpace graphSpace = new GraphSpace(name);
        graphSpace.setAuth(auth);
        graphSpace.setCreateTime(createTime);
        return graphSpace;
    }
}
