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

import org.apache.hugegraph.api.graph.VertexAPI;
import org.apache.hugegraph.client.RestClient;
import org.apache.hugegraph.exception.InvalidResponseException;
import org.apache.hugegraph.rest.RestHeaders;
import org.apache.hugegraph.rest.RestResult;
import org.apache.hugegraph.structure.graph.BatchOlapPropertyRequest;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Before;
import org.junit.Test;
import org.mockito.Mockito;

import com.google.common.collect.ImmutableMap;

public class VertexAPITest {

    private RestClient client;
    private RestResult result;
    private VertexAPI vertexAPI;

    @Before
    public void setup() {
        this.client = Mockito.mock(RestClient.class);
        this.result = Mockito.mock(RestResult.class);
        Mockito.when(this.client.put(Mockito.anyString(), Mockito.isNull(),
                                     Mockito.any(), Mockito.any(RestHeaders.class)))
               .thenReturn(this.result);
        this.vertexAPI = new VertexAPI(this.client, "DEFAULT", "hugegraph");
    }

    @Test
    public void testOlapUpdateReturnsSize() {
        Mockito.when(this.result.readObject(Map.class))
               .thenReturn(ImmutableMap.of("size", 3));
        int size = this.vertexAPI.update(new BatchOlapPropertyRequest());
        Assert.assertEquals(3, size);
    }

    @Test
    public void testOlapUpdateWithoutSize() {
        Mockito.when(this.result.readObject(Map.class))
               .thenReturn(ImmutableMap.of());
        Assert.assertThrows(InvalidResponseException.class, () -> {
            this.vertexAPI.update(new BatchOlapPropertyRequest());
        }, e -> {
            Assert.assertContains("must be int, but got: null(null)", e.getMessage());
        });
    }

    @Test
    public void testOlapUpdateWithNonIntSize() {
        Mockito.when(this.result.readObject(Map.class))
               .thenReturn(ImmutableMap.of("size", "3"));
        Assert.assertThrows(InvalidResponseException.class, () -> {
            this.vertexAPI.update(new BatchOlapPropertyRequest());
        }, e -> {
            Assert.assertContains("but got: 3(class java.lang.String)", e.getMessage());
        });
    }
}
