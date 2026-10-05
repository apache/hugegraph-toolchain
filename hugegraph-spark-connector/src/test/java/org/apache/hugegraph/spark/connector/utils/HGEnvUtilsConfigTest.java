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

package org.apache.hugegraph.spark.connector.utils;

import java.net.URI;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.apache.hugegraph.driver.HugeClientBuilder;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;

public class HGEnvUtilsConfigTest {

    @Test
    public void testDefaultCharsetIsUtf8() {
        Assert.assertEquals(StandardCharsets.UTF_8, Charset.defaultCharset());
    }

    @Test
    public void testMixedCaseSchemesAndDefaultPorts() {
        URI https = HGEnvUtils.endpoint("HtTpS://localhost");
        Assert.assertEquals("https", https.getScheme());
        Assert.assertEquals("https://localhost", https.toString());
        Assert.assertEquals("443", HGEnvUtils.port(https));
        Assert.assertEquals("80", HGEnvUtils.port(HGEnvUtils.endpoint("HTTP://localhost")));
        Assert.assertEquals("8443", HGEnvUtils.port(HGEnvUtils.endpoint("HTTPS://localhost:8443")));
    }

    @Test
    public void testUnsupportedEndpointRejected() {
        Assert.assertThrows(IllegalArgumentException.class,
                            () -> HGEnvUtils.endpoint("ftp://localhost"));
        Assert.assertThrows(IllegalArgumentException.class,
                            () -> HGEnvUtils.endpoint("localhost:8080"));
    }

    @Test
    public void testPathPrefixRejectedBeforeFixtureAccess() {
        Assert.assertEquals("http://localhost:8080",
                            HGEnvUtils.endpoint("http://localhost:8080").toString());
        Assert.assertEquals("http://localhost:8080/",
                            HGEnvUtils.endpoint("http://localhost:8080/").toString());
        for (String path : new String[]{"/proxy", "/proxy/", "/%70roxy"}) {
            Assert.assertThrows(IllegalArgumentException.class,
                                () -> HGEnvUtils.endpoint("http://localhost:8080" + path));
        }
    }

    @Test
    public void testQueryRejectedBeforeFixtureAccess() {
        for (String suffix : new String[]{"?", "/?", "?token=private-query-value",
                                          "/?token=private-query-value"}) {
            Throwable error = Assert.assertThrows(IllegalArgumentException.class,
                                                 () -> HGEnvUtils.endpoint("HTTP://localhost:8080" + suffix));
            Assert.assertEquals("Test URL must not have a query", error.getMessage());
        }
    }

    @Test
    public void testFragmentRejectedBeforeFixtureAccess() {
        for (String suffix : new String[]{"#", "/#", "#private-fragment-value", "/#private-fragment-value"}) {
            Throwable error = Assert.assertThrows(IllegalArgumentException.class,
                                                 () -> HGEnvUtils.endpoint("HTTPS://localhost:8443" + suffix));
            Assert.assertEquals("Test URL must not have a fragment", error.getMessage());
        }
    }

    @Test
    public void testUserInfoRejectedBeforeFixtureAccess() {
        for (String userInfo : new String[]{"", "fixture", "fixture:private-user-info"}) {
            Throwable error = Assert.assertThrows(IllegalArgumentException.class,
                                                 () -> HGEnvUtils.endpoint("http://" + userInfo + "@localhost"));
            Assert.assertEquals("Test URL must not have user info", error.getMessage());
        }
    }

    @Test
    public void testMalformedEndpointDoesNotExposeInput() {
        for (String url : new String[]{"http://localhost?token=private-query-value%",
                                      "http://fixture:private-user-info%@localhost"}) {
            Throwable error = Assert.assertThrows(IllegalArgumentException.class, () -> HGEnvUtils.endpoint(url));
            Assert.assertTrue("Parse errors must use a sanitized message",
                              "Test URL must be a valid URI".equals(error.getMessage()));
            Assert.assertTrue("Parse errors must not retain a cause", error.getCause() == null);
            Assert.assertEquals(0, error.getSuppressed().length);
        }
    }

    @Test
    public void testHttpsTlsOptionsMatchReadbackBuilder() {
        URI uri = HGEnvUtils.endpoint("HTTPS://localhost:8443");
        Map<String, String> options = HGEnvUtils.tlsOptions(uri.getScheme(), "/tmp/test-store", "secret");
        HugeClientBuilder builder = HGEnvUtils.clientBuilder(uri, "test_graph", "/tmp/test-store", "secret");
        Assert.assertEquals("/tmp/test-store", options.get("trust-store-file"));
        Assert.assertEquals("secret", options.get("trust-store-token"));
        Assert.assertEquals(options.get("trust-store-file"), builder.trustStoreFile());
        Assert.assertEquals(options.get("trust-store-token"), builder.trustStorePassword());
        Assert.assertEquals("https://localhost:8443", builder.url());
    }

    @Test
    public void testHttpsRequiresTrustStore() {
        Assert.assertThrows(IllegalArgumentException.class,
                            () -> HGEnvUtils.tlsOptions("https", null, "hugegraph"));
        Assert.assertTrue(HGEnvUtils.tlsOptions("http", null, "hugegraph").isEmpty());
    }

    @Test
    public void testMavenFixtureAcceptsOnlyLocalMaster() {
        for (String master : new String[]{"local", "local[2]", "local[*]", "local[2,3]"}) {
            Assert.assertEquals(master, HGEnvUtils.localMaster(master));
        }
        for (String master : new String[]{"spark://localhost:7077", "yarn", "k8s://localhost",
                                           "local-cluster[1,1,512]", "local[0]"}) {
            Assert.assertThrows(IllegalArgumentException.class, () -> HGEnvUtils.localMaster(master));
        }
    }
}
