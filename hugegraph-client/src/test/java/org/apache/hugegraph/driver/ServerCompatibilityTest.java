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

package org.apache.hugegraph.driver;

import org.junit.Assert;
import org.junit.Test;

public class ServerCompatibilityTest {

    @Test
    public void shouldKeepLegacyServersConservative() {
        Assert.assertFalse(ServerCompatibility.supportsGraphSpace("1.5.0"));
        Assert.assertFalse(ServerCompatibility.supportsCypher("1.5.0"));
        Assert.assertFalse(ServerCompatibility.supportsGraphSpace(null));
        Assert.assertFalse(ServerCompatibility.supportsCypher(null));
        Assert.assertFalse(ServerCompatibility.supportsGraphCreate(null));
        Assert.assertFalse(ServerCompatibility.supportsGraphSpace("not-a-version"));
        Assert.assertFalse(ServerCompatibility.supportsCypher("not-a-version"));
        Assert.assertFalse(ServerCompatibility.supportsGraphCreate("not-a-version"));
        Assert.assertFalse(ServerCompatibility.supportsGraphCreate("0.66"));
        Assert.assertFalse(ServerCompatibility.supportsSchemaClone(null));
        Assert.assertFalse(ServerCompatibility.supportsSchemaClone("not-a-version"));
        Assert.assertFalse(ServerCompatibility.supportsSchemaClone("0.72"));
        Assert.assertTrue(ServerCompatibility.supportsSchemaClone("0.73"));
        Assert.assertTrue(ServerCompatibility.supportsSchemaClone("0.74.0.0"));
    }

    @Test
    public void shouldExposeGraphSpaceForModernServers() {
        Assert.assertTrue(ServerCompatibility.supportsGraphSpace("1.7.0"));
        Assert.assertTrue(ServerCompatibility.supportsCypher("1.7.0"));
        Assert.assertTrue(ServerCompatibility.supportsGraphCreate("0.67"));
        Assert.assertTrue(ServerCompatibility.supportsGraphSpace(" 1.7.0 "));
        Assert.assertTrue(ServerCompatibility.supportsGraphSpace("1.8.0"));
        Assert.assertFalse(ServerCompatibility.supportsDefaultRole(
                           "1.7.0", "0.71.0.0"));
        Assert.assertTrue(ServerCompatibility.supportsDefaultRole(
                          "1.7.0", "0.72.0.0"));
        Assert.assertFalse(ServerCompatibility.supportsDefaultRole(
                           "1.8.0", "0.71.0.0"));
        Assert.assertFalse(
                ServerCompatibility.supportsPersonalProfileUpdate(
                        "1.7.0", "0.71.0.0"));
        Assert.assertTrue(
                ServerCompatibility.supportsPersonalProfileUpdate(
                        "1.8.0", "0.72.0.0"));
        Assert.assertEquals(ServerCompatibility.Profile.GRAPHSPACE,
                            ServerCompatibility.profile("1.7.1",
                                                        "0.71.0.0"));
        Assert.assertEquals(ServerCompatibility.Profile.MODERN,
                            ServerCompatibility.profile("1.7.0",
                                                        "0.72.0.0"));
        Assert.assertEquals(ServerCompatibility.Profile.GRAPHSPACE,
                            ServerCompatibility.profile("1.7.0",
                                                        "not-a-version"));
        Assert.assertFalse(ServerCompatibility.Profile.LEGACY
                                              .requiresBasicGremlinAuth());
        Assert.assertTrue(ServerCompatibility.Profile.GRAPHSPACE
                                             .requiresBasicGremlinAuth());
        Assert.assertFalse(ServerCompatibility.Profile.MODERN
                                              .requiresBasicGremlinAuth());
    }
}
