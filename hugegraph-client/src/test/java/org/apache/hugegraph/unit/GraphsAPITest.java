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

import java.io.InputStream;
import java.io.OutputStream;
import java.io.StringReader;
import java.net.InetSocketAddress;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.atomic.AtomicReference;

import org.apache.commons.configuration2.PropertiesConfiguration;
import org.apache.commons.io.IOUtils;

import org.apache.hugegraph.api.graphs.GraphsAPI;
import org.apache.hugegraph.client.RestClient;
import org.apache.hugegraph.driver.GraphsManager;
import org.apache.hugegraph.rest.RestHeaders;
import org.apache.hugegraph.rest.RestResult;
import org.apache.hugegraph.testutil.Assert;
import org.apache.hugegraph.util.JsonUtil;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

import com.google.common.collect.ImmutableMap;
import com.sun.net.httpserver.HttpServer;

public class GraphsAPITest extends BaseUnitTest {

    private RestClient mockClient;
    private GraphsAPI graphsAPI;

    @Before
    public void setup() {
        this.mockClient = Mockito.mock(RestClient.class);
        Mockito.when(this.mockClient.apiVersionLt(Mockito.anyString()))
               .thenReturn(false);
        Mockito.when(this.mockClient.isSupportGs()).thenReturn(true);
        this.graphsAPI = new GraphsAPI(this.mockClient, "DEFAULT");
    }

    @Test
    public void testCreateGraphUsesJsonContentType() {
        RestResult mockResult = Mockito.mock(RestResult.class);
        Mockito.when(mockResult.readObject(Map.class))
               .thenReturn(null);

        ArgumentCaptor<String> pathCaptor =
                ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object> bodyCaptor =
                ArgumentCaptor.forClass(Object.class);
        ArgumentCaptor<RestHeaders> headersCaptor =
                ArgumentCaptor.forClass(RestHeaders.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> paramsCaptor =
                ArgumentCaptor.forClass(Map.class);

        Mockito.when(this.mockClient.post(
                pathCaptor.capture(),
                bodyCaptor.capture(),
                headersCaptor.capture(),
                paramsCaptor.capture()
        )).thenReturn(mockResult);

        this.graphsAPI.create("test-graph", null, "{}");

        RestHeaders capturedHeaders = headersCaptor.getValue();
        Assert.assertEquals("application/json",
                            capturedHeaders.get(RestHeaders.CONTENT_TYPE));

        Assert.assertTrue(
                pathCaptor.getValue().contains("test-graph"));
        Assert.assertEquals("{}", bodyCaptor.getValue());
        Assert.assertNull(paramsCaptor.getValue());
    }

    @Test
    public void testCloneGraphUsesJsonContentTypeAndParams() {
        RestResult mockResult = Mockito.mock(RestResult.class);
        Mockito.when(mockResult.readObject(Map.class))
               .thenReturn(null);

        ArgumentCaptor<RestHeaders> headersCaptor =
                ArgumentCaptor.forClass(RestHeaders.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> paramsCaptor =
                ArgumentCaptor.forClass(Map.class);

        Mockito.when(this.mockClient.post(
                Mockito.anyString(),
                Mockito.any(),
                headersCaptor.capture(),
                paramsCaptor.capture()
        )).thenReturn(mockResult);

        this.graphsAPI.create("new-graph", "source-graph", "{}");

        RestHeaders capturedHeaders = headersCaptor.getValue();
        Assert.assertEquals("application/json",
                            capturedHeaders.get(RestHeaders.CONTENT_TYPE));

        Map<String, Object> capturedParams = paramsCaptor.getValue();
        Assert.assertNotNull(capturedParams);
        Assert.assertEquals("source-graph",
                            capturedParams.get("clone_graph_name"));
    }

    @Test
    public void testLegacyCreateConvertsJsonToProperties() throws Exception {
        Mockito.when(this.mockClient.isSupportGs()).thenReturn(false);
        RestResult result = Mockito.mock(RestResult.class);
        ArgumentCaptor<Object> body = ArgumentCaptor.forClass(Object.class);
        ArgumentCaptor<RestHeaders> headers = ArgumentCaptor.forClass(RestHeaders.class);
        Mockito.when(this.mockClient.post(Mockito.anyString(), body.capture(),
                                          headers.capture(), Mockito.isNull())).thenReturn(result);
        this.graphsAPI.create("legacy", null, JsonUtil.toJson(
                ImmutableMap.of("backend", "rocksdb", "path", "C:\\data\\graph", "note", "a=b\nnext")));
        Assert.assertEquals("text/plain", headers.getValue().get(RestHeaders.CONTENT_TYPE));
        Properties parsed = new Properties();
        parsed.load(new StringReader((String) body.getValue()));
        Assert.assertEquals("rocksdb", parsed.getProperty("backend"));
        Assert.assertEquals("C:\\data\\graph", parsed.getProperty("path"));
        Assert.assertEquals("a=b\nnext", parsed.getProperty("note"));
    }

    @Test
    public void testLegacyConfigPreservesWhitespaceWithServerParser() throws Exception {
        Mockito.when(this.mockClient.isSupportGs()).thenReturn(false);
        RestResult result = Mockito.mock(RestResult.class);
        ArgumentCaptor<Object> body = ArgumentCaptor.forClass(Object.class);
        Mockito.when(this.mockClient.post(Mockito.anyString(), body.capture(),
                                          Mockito.any(), Mockito.isNull())).thenReturn(result);
        for (String password : new String[]{" pa", "pa ", " pa ", "   ",
                                           "\\ pa ", "\\\\ pa ", "\\u0020 ",
                                           "李四 a=b\nnext\t ", "李四é😀"}) {
            this.graphsAPI.create("legacy", null,
                                  JsonUtil.toJson(ImmutableMap.of("jdbc.password", password)));
            String config = (String) body.getValue();
            Assert.assertTrue(StandardCharsets.US_ASCII.newEncoder().canEncode(config));
            for (String charset : new String[]{"UTF-8", "windows-1252", "GBK"}) {
                String received = new String(config.getBytes(Charset.forName(charset)),
                                             StandardCharsets.UTF_8);
                PropertiesConfiguration parsed = new PropertiesConfiguration();
                parsed.read(new StringReader(received));
                Assert.assertEquals(password, parsed.getString("jdbc.password"));
            }
        }
    }

    @Test
    public void testLegacyPropertiesAndClonePreserveBody() {
        Mockito.when(this.mockClient.isSupportGs()).thenReturn(false);
        RestResult result = Mockito.mock(RestResult.class);
        ArgumentCaptor<Object> body = ArgumentCaptor.forClass(Object.class);
        ArgumentCaptor<RestHeaders> headers = ArgumentCaptor.forClass(RestHeaders.class);
        ArgumentCaptor<Map> params = ArgumentCaptor.forClass(Map.class);
        Mockito.when(this.mockClient.post(Mockito.anyString(), body.capture(),
                                          headers.capture(), params.capture())).thenReturn(result);
        String config = "backend=rocksdb\nstore=legacy\n";
        this.graphsAPI.create("legacy", null, config);
        Assert.assertEquals(config, body.getValue());
        Assert.assertEquals("text/plain", headers.getValue().get(RestHeaders.CONTENT_TYPE));
        this.graphsAPI.create("copy", "legacy", null);
        Assert.assertEquals("", body.getValue());
        Assert.assertEquals("legacy", params.getValue().get("clone_graph_name"));
        Assert.assertEquals("text/plain", headers.getValue().get(RestHeaders.CONTENT_TYPE));
    }

    @Test
    public void testLegacyCloneSendsEmptyHttpEntity() throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>();
        AtomicReference<String> contentType = new AtomicReference<>();
        AtomicReference<String> query = new AtomicReference<>();
        AtomicReference<String> path = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/graphs/copy", exchange -> {
            path.set(exchange.getRequestURI().getPath());
            try (InputStream input = exchange.getRequestBody()) {
                requestBody.set(IOUtils.toString(input, StandardCharsets.UTF_8));
            }
            contentType.set(exchange.getRequestHeaders().getFirst("Content-Type"));
            query.set(exchange.getRequestURI().getQuery());
            byte[] response = "{}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(201, response.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(response);
            }
        });
        server.start();
        RestClient client = new RestClient(
                "http://127.0.0.1:" + server.getAddress().getPort(), "", "", 1);
        try (AutoCloseable closeClient = client::close) {
            client.setSupportGs(false);
            new GraphsAPI(client, "DEFAULT").create("copy", "legacy", null);
            Assert.assertEquals("", requestBody.get());
            Assert.assertTrue(contentType.get().startsWith("text/plain"));
            Assert.assertEquals("clone_graph_name=legacy", query.get());
            Assert.assertEquals("/graphs/copy", path.get());
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void testLegacyConfigRejectsNullAndNestedValues() {
        Mockito.when(this.mockClient.isSupportGs()).thenReturn(false);
        for (String value : new String[]{"null", "[1]", "{\"nested\":1}"}) {
            Assert.assertThrows(IllegalArgumentException.class,
                                () -> this.graphsAPI.create("legacy", null, "{\"a\":" + value + "}"),
                                e -> Assert.assertEquals("Legacy graph config option 'a' must be a scalar value",
                                                         e.getMessage()));
        }
        Mockito.verify(this.mockClient, Mockito.never()).post(
                Mockito.anyString(), Mockito.any(), Mockito.any(), Mockito.any());
    }

    @Test
    public void testSetDefaultGraphUsesCanonicalPost() {
        RestResult mockResult = Mockito.mock(RestResult.class);
        Mockito.when(mockResult.readObject(Map.class))
               .thenReturn(null);

        ArgumentCaptor<String> pathCaptor =
                ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object> bodyCaptor =
                ArgumentCaptor.forClass(Object.class);

        Mockito.when(this.mockClient.post(pathCaptor.capture(),
                                          bodyCaptor.capture()))
               .thenReturn(mockResult);

        this.graphsAPI.setDefault("test-graph");

        Assert.assertEquals("graphspaces/DEFAULT/graphs/test-graph/default",
                            pathCaptor.getValue());
        Assert.assertTrue(((Map<?, ?>) bodyCaptor.getValue()).isEmpty());
        Mockito.verify(mockResult).readObject(Map.class);
    }

    @Test
    public void testUnsetDefaultGraphUsesCanonicalDelete() {
        RestResult mockResult = Mockito.mock(RestResult.class);
        Mockito.when(mockResult.readObject(Map.class))
               .thenReturn(null);

        ArgumentCaptor<String> pathCaptor =
                ArgumentCaptor.forClass(String.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> paramsCaptor =
                ArgumentCaptor.forClass(Map.class);

        Mockito.when(this.mockClient.delete(pathCaptor.capture(),
                                            paramsCaptor.capture()))
               .thenReturn(mockResult);

        this.graphsAPI.unSetDefault("test-graph");

        Assert.assertEquals("graphspaces/DEFAULT/graphs/test-graph/default",
                            pathCaptor.getValue());
        Assert.assertTrue(paramsCaptor.getValue().isEmpty());
        Mockito.verify(mockResult).readObject(Map.class);
    }

    @Test
    public void testPerGraphReloadIsDeprecated() throws NoSuchMethodException {
        Assert.assertNotNull(GraphsAPI.class.getMethod("reload", String.class)
                                            .getAnnotation(Deprecated.class));
        Assert.assertNotNull(GraphsManager.class.getMethod("reload", String.class)
                                                .getAnnotation(Deprecated.class));
        Assert.assertNull(GraphsAPI.class.getMethod("reload")
                                         .getAnnotation(Deprecated.class));
        Assert.assertNull(GraphsManager.class.getMethod("reload")
                                             .getAnnotation(Deprecated.class));
    }
}
