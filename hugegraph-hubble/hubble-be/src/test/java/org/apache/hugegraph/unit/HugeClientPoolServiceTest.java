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

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.config.ConfigException;
import org.apache.hugegraph.driver.factory.PDHugeClientFactory;
import org.apache.hugegraph.exception.ParameterizedException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.HugeClientPoolService;
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
