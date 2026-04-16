/*
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

import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.HugeClientBuilder;
import org.junit.Assert;
import org.junit.Test;

public class HugeClientBuilderTest {

    @Test
    public void testBuilderWithSkipRequiredChecks() {
        // Constructor should NOT throw when skipRequiredChecks=true, even with null graph/url.
        // No build() call here to avoid triggering HTTP (no server available in unit tests).
        HugeClientBuilder builder = new HugeClientBuilder(
                "http://127.0.0.1:8080", "DEFAULT", null, true);
        Assert.assertNotNull(builder);
        // Also verify null url is accepted when skipRequiredChecks=true
        HugeClientBuilder builder2 = new HugeClientBuilder(
                null, "DEFAULT", "hugegraph", true);
        Assert.assertNotNull(builder2);
    }

    @Test(expected = IllegalArgumentException.class)
    public void testConstructorCheckWithoutSkip() {
        // Constructor should throw when graph is null and skipRequiredChecks=false
        new HugeClientBuilder("http://127.0.0.1:8080", "DEFAULT", null, false);
    }

    @Test(expected = IllegalArgumentException.class)
    public void testBuildCheckWithoutSkip_nullGraph() {
        // Construct with valid params, null out graph afterwards to test build() check path
        HugeClientBuilder builder = new HugeClientBuilder(
                "http://127.0.0.1:8080", "DEFAULT", "hugegraph", false);
        builder.configGraph(null);
        builder.build();
    }

    @Test(expected = IllegalArgumentException.class)
    public void testBuildCheckWithoutSkip_nullUrl() {
        // Construct with valid params, null out url afterwards to test build() check path
        HugeClientBuilder builder = new HugeClientBuilder(
                "http://127.0.0.1:8080", "DEFAULT", "hugegraph", false);
        builder.configUrl(null);
        builder.build();
    }

    @Test
    public void testHugeClientBuilderMethod() {
        // HugeClient.builder factory should NOT throw when skipRequiredChecks=true.
        // No build() call here to avoid triggering HTTP (no server available in unit tests).
        HugeClientBuilder builder = HugeClient.builder(
                "http://127.0.0.1:8080", "DEFAULT", null, true);
        Assert.assertNotNull(builder);
    }

    @Test(expected = IllegalArgumentException.class)
    public void testHugeClientBuilderMethodWithoutSkip() {
        // build() should throw when graph is null and skipRequiredChecks defaults to false
        HugeClientBuilder builder = HugeClient.builder(
                "http://127.0.0.1:8080", "DEFAULT", "hugegraph");
        builder.configGraph(null);
        builder.build();
    }
}
