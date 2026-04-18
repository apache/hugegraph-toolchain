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
    public void testConstructorAcceptsNullUrlAndGraph() {
        HugeClientBuilder builder = new HugeClientBuilder(null, "DEFAULT", null);
        Assert.assertNotNull(builder);
    }

    @Test
    public void testGraphRequiredFalseSkipsBuildValidation() {
        // graphRequired(false) must skip IllegalArgumentException — only connection-level
        // failure is expected since no server is available in unit tests
        try {
            HugeClient.builder(null, "DEFAULT", null).graphRequired(false).build();
            Assert.fail("Expected connection-level exception");
        } catch (IllegalArgumentException e) {
            Assert.fail("Should not throw IllegalArgumentException — validation must be skipped");
        } catch (Exception e) {
            // Expected: validation was skipped, failed at HTTP connection as intended
        }
    }

    @Test(expected = IllegalArgumentException.class)
    public void testBuildFailsWithNullUrl() {
        HugeClient.builder(null, "DEFAULT", "hugegraph").build();
    }

    @Test(expected = IllegalArgumentException.class)
    public void testBuildFailsWithNullGraph() {
        HugeClient.builder("http://127.0.0.1:8080", "DEFAULT", null).build();
    }

    @Test(expected = IllegalArgumentException.class)
    public void testBuildFailsWithEmptyUrl() {
        HugeClient.builder("", "DEFAULT", "hugegraph").build();
    }

    @Test(expected = IllegalArgumentException.class)
    public void testBuildFailsWithEmptyGraph() {
        HugeClient.builder("http://127.0.0.1:8080", "DEFAULT", "").build();
    }

    @Test(expected = IllegalArgumentException.class)
    public void testBuildFailsAfterConfigGraphNull() {
        HugeClient.builder("http://127.0.0.1:8080", "DEFAULT", "hugegraph")
                  .configGraph(null).build();
    }

    @Test(expected = IllegalArgumentException.class)
    public void testBuildFailsAfterConfigUrlNull() {
        HugeClient.builder("http://127.0.0.1:8080", "DEFAULT", "hugegraph")
                  .configUrl(null).build();
    }
}
