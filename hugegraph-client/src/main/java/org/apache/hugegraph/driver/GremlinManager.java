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

package org.apache.hugegraph.driver;

import org.apache.hugegraph.api.gremlin.GremlinAPI;
import org.apache.hugegraph.api.gremlin.GremlinRequest;
import org.apache.hugegraph.api.job.GremlinJobAPI;
import org.apache.hugegraph.client.RestClient;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.structure.gremlin.Response;
import org.apache.hugegraph.structure.gremlin.ResultSet;

public class GremlinManager {

    public static final String IDEMPOTENT_TRAVERSAL_FALLBACK_MARKER =
            "// hugegraph-client:idempotent-traversal-fallback\n";

    private final GraphManager graphManager;

    private final GremlinAPI gremlinAPI;
    private final GremlinJobAPI gremlinJobAPI;
    private final String graphSpace;
    private final String graph;

    public GremlinManager(RestClient client, String graphSpace, String graph,
                          GraphManager graphManager) {
        this.graphManager = graphManager;
        this.gremlinAPI = new GremlinAPI(client);
        this.gremlinJobAPI = new GremlinJobAPI(client, graphSpace, graph);
        this.graphSpace = graphSpace;
        this.graph = graph;
    }

    public ResultSet execute(GremlinRequest request) {
        bindAliases(request, this.gremlinAPI.isSupportGs(), this.graphSpace,
                    this.graph);

        Response response;
        try {
            response = this.gremlinAPI.post(request);
        } catch (ServerException e) {
            if (!this.gremlinAPI.isSupportGs() ||
                !allowTraversalFallback(request, e.getMessage())) {
                throw e;
            }
            prepareTraversalFallback(request);
            response = this.gremlinAPI.post(request);
        }
        response.graphManager(this.graphManager);
        // TODO: Can add some checks later
        return response.result();
    }

    static void bindAliases(GremlinRequest request, boolean supportGraphSpace,
                            String graphSpace, String graph) {
        if (supportGraphSpace) {
            // Bind "graph" and graph space to all graphs
            request.aliases.put("graph", graphSpace + "-" + graph);
            // Bind "g" and graph space to all graphs by custom rule which define in gremlin server.
            request.aliases.put("g", "__g_" + graphSpace + "-" + graph);
        } else {
            // Bind "graph" to all graphs
            request.aliases.put("graph", graph);
            // Bind "g" to all graphs by custom rule which define in gremlin server.
            request.aliases.put("g", "__g_" + graph);
        }
    }

    static void prepareTraversalFallback(GremlinRequest request) {
        request.aliases.remove("g");
        request.gremlin = "g = graph.traversal();\n" + request.gremlin;
    }

    static boolean allowTraversalFallback(GremlinRequest request,
                                          String message) {
        return request.gremlin.startsWith(IDEMPOTENT_TRAVERSAL_FALLBACK_MARKER) &&
               message != null && message.contains("Could not rebind [g]");
    }

    public long executeAsTask(GremlinRequest request) {
        return this.gremlinJobAPI.execute(request);
    }

    public GremlinRequest.Builder gremlin(String gremlin) {
        return new GremlinRequest.Builder(gremlin, this);
    }
}
