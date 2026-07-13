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
import java.util.Map;

import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.space.GraphSpaceEntity;
import org.apache.hugegraph.service.graphs.GraphsService;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

public class GraphSpaceServiceTest {

    private GraphSpaceService service;
    private GraphsService graphsService;
    private HugeClient client;

    @Before
    public void setup() {
        this.service = new GraphSpaceService();
        this.graphsService = Mockito.mock(GraphsService.class);
        this.client = Mockito.mock(HugeClient.class);
        ReflectionTestUtils.setField(this.service, "graphsService",
                                     this.graphsService);
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
        Assert.assertFalse(view.containsKey("configs"));
    }

    @Test
    public void testStatisticUsesActualFallbackDate() {
        Mockito.when(this.graphsService.listGraphNames(this.client, "space", ""))
               .thenReturn(new LinkedHashSet<>(java.util.Collections
                                                       .singletonList("g1")));
        Mockito.when(this.graphsService.evCount(this.client, "space", "g1"))
               .thenReturn(statistic("2026-07-12", 2L, 3L));

        Map<String, Object> result = this.service.evCount(this.client, "space");

        Assert.assertEquals("2026-07-12", result.get("date"));
        Assert.assertEquals(2L, result.get("vertex"));
        Assert.assertEquals(3L, result.get("edge"));
    }

    @Test
    public void testStatisticDoesNotClaimMixedDates() {
        LinkedHashSet<String> graphs = new LinkedHashSet<>();
        graphs.add("g1");
        graphs.add("g2");
        Mockito.when(this.graphsService.listGraphNames(this.client, "space", ""))
               .thenReturn(graphs);
        Mockito.when(this.graphsService.evCount(this.client, "space", "g1"))
               .thenReturn(statistic("2026-07-12", 2L, 3L));
        Mockito.when(this.graphsService.evCount(this.client, "space", "g2"))
               .thenReturn(statistic("2026-07-13", 5L, 7L));

        Map<String, Object> result = this.service.evCount(this.client, "space");

        Assert.assertNull(result.get("date"));
        Assert.assertEquals(7L, result.get("vertex"));
        Assert.assertEquals(10L, result.get("edge"));
    }

    private static Map<String, Object> statistic(String date, long vertex,
                                                 long edge) {
        Map<String, Object> statistic = new HashMap<>();
        statistic.put("date", date);
        statistic.put("vertex", vertex);
        statistic.put("edge", edge);
        return statistic;
    }
}
