/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
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

import org.apache.hugegraph.api.gremlin.GremlinRequest;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;

public class GremlinManagerTest {

    @Test
    public void testBindGraphSpaceAliasesForDefaultGraphSpace() {
        GremlinRequest request = new GremlinRequest("g.V().count()");

        GremlinManager.bindAliases(request, true, "DEFAULT", "hugegraph");

        Assert.assertEquals("DEFAULT-hugegraph",
                            request.aliases.get("graph"));
        Assert.assertEquals("__g_DEFAULT-hugegraph",
                            request.aliases.get("g"));
    }

    @Test
    public void testBindGraphSpaceAliasesForNamedGraphSpace() {
        GremlinRequest request = new GremlinRequest("g.V().count()");

        GremlinManager.bindAliases(request, true, "analytics", "hugegraph");

        Assert.assertEquals("analytics-hugegraph",
                            request.aliases.get("graph"));
        Assert.assertEquals("__g_analytics-hugegraph",
                            request.aliases.get("g"));
    }

    @Test
    public void testPrepareTraversalFallback() {
        GremlinRequest request = new GremlinRequest(
                GremlinManager.IDEMPOTENT_TRAVERSAL_FALLBACK_MARKER +
                "g.V().count()");
        GremlinManager.bindAliases(request, true, "DEFAULT", "hugegraph");

        GremlinManager.prepareTraversalFallback(request);

        Assert.assertEquals("DEFAULT-hugegraph",
                            request.aliases.get("graph"));
        Assert.assertFalse(request.aliases.containsKey("g"));
        Assert.assertEquals("g = graph.traversal();\n" +
                            GremlinManager.IDEMPOTENT_TRAVERSAL_FALLBACK_MARKER +
                            "g.V().count()",
                            request.gremlin);
    }

    @Test
    public void testTraversalFallbackRequiresExplicitIdempotentMarker() {
        GremlinRequest ordinary = new GremlinRequest("g.V().count()");
        GremlinRequest idempotent = new GremlinRequest(
                GremlinManager.IDEMPOTENT_TRAVERSAL_FALLBACK_MARKER +
                "g.V().count()");

        Assert.assertFalse(GremlinManager.allowTraversalFallback(
                           ordinary, "Could not rebind [g]"));
        Assert.assertFalse(GremlinManager.allowTraversalFallback(
                           idempotent, null));
        Assert.assertFalse(GremlinManager.allowTraversalFallback(
                           idempotent, "runtime failure"));
        Assert.assertTrue(GremlinManager.allowTraversalFallback(
                          idempotent, "Could not rebind [g]"));
    }
}
