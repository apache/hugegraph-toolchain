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

import java.util.Map;

import org.apache.hugegraph.api.graphs.GraphsAPI;
import org.apache.hugegraph.client.RestClient;
import org.apache.hugegraph.rest.RestHeaders;
import org.apache.hugegraph.rest.RestResult;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

public class GraphsAPITest extends BaseUnitTest {

    private RestClient mockClient;
    private GraphsAPI graphsAPI;

    @Before
    public void setup() {
        this.mockClient = Mockito.mock(RestClient.class);
        Mockito.when(this.mockClient.apiVersionLt(Mockito.anyString()))
               .thenReturn(false);
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
}
