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

import org.apache.hugegraph.driver.GraphSpaceManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.space.GraphSpaceEntity;
import org.apache.hugegraph.service.auth.UserService;
import org.apache.hugegraph.service.graphs.GraphsService;
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
}
