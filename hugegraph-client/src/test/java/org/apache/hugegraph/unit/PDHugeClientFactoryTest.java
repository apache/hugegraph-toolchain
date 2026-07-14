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

import java.lang.reflect.Field;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.apache.hugegraph.driver.factory.PDHugeClientFactory;
import org.apache.hugegraph.pd.client.DiscoveryClient;
import org.apache.hugegraph.pd.grpc.discovery.Query;
import org.apache.hugegraph.testutil.Assert;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.Mockito;

public class PDHugeClientFactoryTest {

    private TestPDHugeClientFactory factory;
    private DiscoveryClient discoveryClient;

    @Before
    public void setup() throws Exception {
        this.factory = new TestPDHugeClientFactory("127.0.0.1:8686");
        this.factory.close();
        this.discoveryClient = Mockito.mock(DiscoveryClient.class);
        Field client = PDHugeClientFactory.class.getDeclaredField("client");
        client.setAccessible(true);
        client.set(this.factory, this.discoveryClient);
        Mockito.when(this.discoveryClient.getNodeInfos(Mockito.any(Query.class)))
               .thenReturn(null);
    }

    @After
    public void teardown() {
        this.factory.close();
    }

    @Test
    public void testGetURLsReturnsEmptyWhenDiscoveryReturnsNull() {
        List<String> urls = this.factory.getURLs("cluster", "space", "service");

        Assert.assertEquals(Collections.emptyList(), urls);
    }

    @Test
    public void testGetURLsWithConfigReturnsEmptyWhenDiscoveryReturnsNull() {
        List<String> urls = this.factory.urlsWithConfig(
                "cluster", Collections.singletonMap("SERVICE_NAME", "service"));

        Assert.assertEquals(Collections.emptyList(), urls);
    }

    private static class TestPDHugeClientFactory extends PDHugeClientFactory {

        TestPDHugeClientFactory(String pdAddrs) {
            super(pdAddrs);
        }

        List<String> urlsWithConfig(String cluster, Map<String, String> configs) {
            return this.getURLsWithConfig(cluster, configs);
        }
    }
}
