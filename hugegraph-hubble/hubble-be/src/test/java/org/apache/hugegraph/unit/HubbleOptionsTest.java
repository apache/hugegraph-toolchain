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

import org.apache.hugegraph.config.ConfigException;
import org.apache.hugegraph.config.ConfigOption;
import org.junit.Test;

import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.testutil.Assert;

public class HubbleOptionsTest {

    @Test
    public void testUploadFormatDefaultIncludesCsvAndTxt() {
        Assert.assertTrue(HubbleOptions.UPLOAD_FILE_FORMAT_LIST.defaultValue()
                              .contains("csv"));
        Assert.assertTrue(HubbleOptions.UPLOAD_FILE_FORMAT_LIST.defaultValue()
                              .contains("txt"));
    }

    @Test
    public void testOperationsCollectionUsesBoundedDefaults() {
        Assert.assertEquals(1500,
                            HubbleOptions.OPERATIONS_CONNECT_TIMEOUT.defaultValue());
        Assert.assertEquals(2500,
                            HubbleOptions.OPERATIONS_READ_TIMEOUT.defaultValue());
        Assert.assertEquals(1024 * 1024,
                            HubbleOptions.OPERATIONS_MAX_RESPONSE_BYTES.defaultValue());
        Assert.assertEquals(5,
                            HubbleOptions.OPERATIONS_CACHE_TTL.defaultValue());
        Assert.assertEquals(1024,
                            HubbleOptions.OPERATIONS_CACHE_MAX_ENTRIES
                                         .defaultValue());
        Assert.assertEquals(16,
                            HubbleOptions.OPERATIONS_STORE_THREADS.defaultValue());
        Assert.assertEquals(5000,
                            HubbleOptions.OPERATIONS_STORE_DEADLINE.defaultValue());
        Assert.assertEquals(java.util.Arrays.asList(
                            "http://127.0.0.1:8520",
                            "http://[::1]:8520"),
                            HubbleOptions.OPERATIONS_STORE_ALLOWED_TARGETS
                                         .defaultValue());
        Assert.assertEquals("hubble",
                            HubbleOptions.OPERATIONS_PD_USERNAME.defaultValue());
        Assert.assertEquals("",
                            HubbleOptions.OPERATIONS_PD_PASSWORD.defaultValue());
        Assert.assertEquals("hubble",
                            HubbleOptions.OPERATIONS_STORE_USERNAME.defaultValue());
        Assert.assertEquals("",
                            HubbleOptions.OPERATIONS_STORE_PASSWORD.defaultValue());
    }

    @Test
    public void testOperationsCacheEntryBoundIsPositive() {
        ConfigOption<Integer> option =
                HubbleOptions.OPERATIONS_CACHE_MAX_ENTRIES;

        Assert.assertEquals(1024, option.defaultValue());
        Assert.assertThrows(ConfigException.class,
                            () -> option.parseConvert("0"));
        Assert.assertThrows(ConfigException.class,
                            () -> option.parseConvert("-1"));
        Assert.assertEquals(1, option.parseConvert("1"));
    }

    @Test
    public void testOperationsStoreFanoutLimitsArePositive() {
        assertPositive(HubbleOptions.OPERATIONS_STORE_THREADS);
        assertPositive(HubbleOptions.OPERATIONS_STORE_DEADLINE);
    }

    @Test
    public void testOperationsStoreAllowedTargetsRequireExactOrigins() {
        Assert.assertThrows(ConfigException.class, () ->
                HubbleOptions.OPERATIONS_STORE_ALLOWED_TARGETS.parseConvert(
                        "[store.internal]"));
        Assert.assertThrows(ConfigException.class, () ->
                HubbleOptions.OPERATIONS_STORE_ALLOWED_TARGETS.parseConvert(
                        "[http://*.internal:8520]"));
        Assert.assertThrows(ConfigException.class, () ->
                HubbleOptions.OPERATIONS_STORE_ALLOWED_TARGETS.parseConvert(
                        "[http://store.internal]"));
        Assert.assertThrows(ConfigException.class, () ->
                HubbleOptions.OPERATIONS_STORE_ALLOWED_TARGETS.parseConvert(
                        "[http://store.internal:8520/metrics]"));
        Assert.assertEquals(java.util.Arrays.asList(
                            "http://store.internal:8520",
                            "https://store.internal:9443"),
                HubbleOptions.OPERATIONS_STORE_ALLOWED_TARGETS.parseConvert(
                        "[http://store.internal:8520," +
                        "https://store.internal:9443]"));
        Assert.assertEquals(java.util.Arrays.asList(
                            "http://127.0.0.1:8520",
                            "http://[::1]:8520"),
                HubbleOptions.OPERATIONS_STORE_ALLOWED_TARGETS.parseConvert(
                        "[http://127.0.0.1:8520,http://[::1]:8520]"));
    }

    private static void assertPositive(ConfigOption<Integer> option) {
        Assert.assertThrows(ConfigException.class,
                            () -> option.parseConvert("0"));
        Assert.assertThrows(ConfigException.class,
                            () -> option.parseConvert("-1"));
        Assert.assertEquals(1, option.parseConvert("1"));
    }
}
