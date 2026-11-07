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

import org.apache.hugegraph.structure.traverser.CountRequest;
import org.apache.hugegraph.structure.traverser.KneighborRequest;
import org.apache.hugegraph.structure.traverser.KoutRequest;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;

public class TraverserRequestTest {

    @Test
    public void testKoutCountOnlyRejectsVertexMessage() {
        KoutRequest.Builder builder = KoutRequest.builder();
        builder.source("1:marko").maxDepth(2).countOnly(true).withVertex(true);
        builder.steps();
        Assert.assertThrows(IllegalArgumentException.class, builder::build, e -> {
            Assert.assertEquals("Can't return vertex or path or edge " +
                                "when count only is true", e.getMessage());
        });
    }

    @Test
    public void testKoutToString() {
        KoutRequest.Builder builder = KoutRequest.builder();
        builder.source("1:marko").maxDepth(2);
        builder.steps();
        String str = builder.build().toString();
        Assert.assertTrue(str, str.startsWith("KoutRequest{source=1:marko,"));
        Assert.assertContains(",maxDepth=2,nearest=true,", str);
        Assert.assertTrue(str, str.endsWith("}"));
    }

    @Test
    public void testKneighborToString() {
        KneighborRequest.Builder builder = KneighborRequest.builder();
        builder.source("1:marko").maxDepth(3);
        builder.steps();
        String str = builder.build().toString();
        Assert.assertTrue(str, str.startsWith("KneighborRequest{source=1:marko,"));
        Assert.assertContains(",maxDepth=3,countOnly=false,", str);
        Assert.assertTrue(str, str.endsWith("}"));
    }

    @Test
    public void testCountToString() {
        CountRequest.Builder builder = CountRequest.builder();
        builder.source("1:marko").dedupSize(10L);
        builder.steps();
        String str = builder.build().toString();
        Assert.assertTrue(str, str.startsWith("CountRequest{source=1:marko,"));
        Assert.assertTrue(str, str.endsWith("containsTraversed=false,dedupSize=10}"));
    }
}
