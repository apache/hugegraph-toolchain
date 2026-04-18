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

package org.apache.hugegraph.api.graphs;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.api.API;
import org.apache.hugegraph.client.RestClient;
import org.apache.hugegraph.exception.InvalidResponseException;
import org.apache.hugegraph.rest.RestHeaders;
import org.apache.hugegraph.rest.RestResult;
import org.apache.hugegraph.structure.constant.GraphMode;
import org.apache.hugegraph.structure.constant.GraphReadMode;
import org.apache.hugegraph.structure.constant.HugeType;
import org.apache.hugegraph.util.E;
import org.apache.hugegraph.util.JsonUtil;

import com.google.common.collect.ImmutableMap;

public class GraphsAPI extends API {

    private static final String DELIMITER = "/";
    private static final String MODE = "mode";
    private static final String GRAPH_READ_MODE = "graph_read_mode";
    private static final String CLEAR = "clear";
    private static final String CONFIRM_MESSAGE = "confirm_message";
    private static final String CLEARED = "cleared";
    private static final String RELOADED = "reloaded";
    private static final String UPDATED = "updated";
    private static final String GRAPHS = "graphs";
    private static final String MANAGE = "manage";
    private static final String PATH = "graphspaces/%s/graphs";

    public GraphsAPI(RestClient client, String graphSpace) {
        super(client);
        this.path(String.format(PATH, graphSpace));
    }

    private static String joinPath(String path, String graph) {
        return String.join(DELIMITER, path, graph);
    }

    private static String joinPath(String path, String graph, String action) {
        return String.join(DELIMITER, path, graph, action);
    }

    @Override
    protected String type() {
        return HugeType.GRAPHS.string();
    }

    // TODO(@Thespcia): in inner version, clone is split into a single method, and doesn't have
    // this parameter
    @SuppressWarnings("unchecked")
    public Map<String, String> create(String name, String cloneGraphName, String configText) {
        this.client.checkApiVersion("0.67", "dynamic graph add");
        RestHeaders headers = new RestHeaders().add(RestHeaders.CONTENT_TYPE,
                                                    RestHeaders.APPLICATION_JSON);
        Map<String, Object> params = null;
        if (StringUtils.isNotEmpty(cloneGraphName)) {
            params = ImmutableMap.of("clone_graph_name", cloneGraphName);
        }
        RestResult result = this.client.post(joinPath(this.path(), name),
                                             configText, headers, params);
        return result.readObject(Map.class);
    }

    @SuppressWarnings("unchecked")
    public Map<String, String> get(String name) {
        RestResult result = this.client.get(this.path(), name);
        return result.readObject(Map.class);
    }

    public List<String> list() {
        RestResult result = this.client.get(this.path());
        return result.readList(this.type(), String.class);
    }

    public List<Map<String, Object>> listProfile(String prefix) {
        String profilePath = joinPath(this.path(), "profile");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("prefix", prefix);
        RestResult result = this.client.get(profilePath, params);
        List<Map> results = result.readList(Map.class);
        List<Map<String, Object>> profiles = new ArrayList<>();
        for (Object entry : results) {
            profiles.add(JsonUtil.fromJson(JsonUtil.toJson(entry), Map.class));
        }
        return profiles;
    }

    public Map<String, String> setDefault(String name) {
        String defaultPath = joinPath(this.path(), name, "default");
        RestResult result = this.client.get(defaultPath);
        return result.readObject(Map.class);
    }

    public Map<String, String> unSetDefault(String name) {
        String unDefaultPath = joinPath(this.path(), name, "undefault");
        RestResult result = this.client.get(unDefaultPath);
        return result.readObject(Map.class);
    }

    public Map<String, String> getDefault() {
        String defaultPath = joinPath(this.path(), "default");
        RestResult result = this.client.get(defaultPath);
        return result.readObject(Map.class);
    }

    public void clear(String graph) {
        this.clear(graph, "I'm sure to delete all data");
    }

    // TODO: clearSchema is not supported yet, will always be true
    public void clear(String graph, boolean clearSchema) {
        this.clear(graph, "I'm sure to delete all data");
    }

    public void clear(String graph, String message) {
        this.client.delete(joinPath(this.path(), graph, CLEAR),
                           ImmutableMap.of(CONFIRM_MESSAGE, message));
    }

    public Map<String, String> update(String name, String nickname) {
        Map<String, String> actionMap = new HashMap<>();
        actionMap.put("name", name);
        actionMap.put("nickname", nickname);
        RestResult result = this.client.put(this.path(), name,
                                            ImmutableMap.of("action", "update",
                                                            "update", actionMap));
        Map<String, String> response = result.readObject(Map.class);

        E.checkState(response.size() == 1 && response.containsKey(name),
                     "Response must be formatted to {\"%s\" : status}, " +
                     "but got %s", name, response);
        String status = response.get(name);
        E.checkState(UPDATED.equals(status),
                     "Server status must be '%s', but got '%s'", UPDATED, status);
        return response;
    }

    // wrapper for inner server
    public void delete(String graph) {
        this.drop(graph, "I'm sure to drop the graph");
    }

    public void drop(String graph, String message) {
        this.client.checkApiVersion("0.67", "dynamic graph delete");
        this.client.delete(joinPath(this.path(), graph),
                           ImmutableMap.of(CONFIRM_MESSAGE, message));
    }

    public Map<String, String> reload(String name) {
        RestResult result = this.client.put(this.path(), name,
                                            ImmutableMap.of("action", "reload"));
        Map<String, String> response = result.readObject(Map.class);

        E.checkState(response.size() == 1 && response.containsKey(name),
                     "Response must be formatted to {\"%s\" : status}, " +
                     "but got %s", name, response);
        String status = response.get(name);
        E.checkState(RELOADED.equals(status),
                     "Graph %s status must be %s, but got '%s'", name, RELOADED, status);
        return response;
    }

    public Map<String, String> reload() {
        RestResult result = this.client.put(this.path(), MANAGE,
                                            ImmutableMap.of("action", "reload"));
        Map<String, String> response = result.readObject(Map.class);

        E.checkState(response.size() == 1 && response.containsKey(GRAPHS),
                     "Response must be formatted to {\"%s\" : status}, " +
                     "but got %s", GRAPHS, response);
        String status = response.get(GRAPHS);
        E.checkState(RELOADED.equals(status),
                     "Server status must be '%s', but got '%s'", RELOADED, status);
        return response;
    }

    public void mode(String graph, GraphMode mode) {
        // NOTE: Must provide id for PUT. If you use "graph/mode", "/" will
        // be encoded to "%2F". So use "mode" here, although inaccurate.
        this.client.put(joinPath(this.path(), graph, MODE), null, mode);
    }

    public GraphMode mode(String graph) {
        RestResult result = this.client.get(joinPath(this.path(), graph), MODE);
        @SuppressWarnings("unchecked")
        Map<String, String> mode = result.readObject(Map.class);
        String value = mode.get(MODE);
        if (value == null) {
            throw new InvalidResponseException("Invalid response, expect 'mode' in response");
        }
        try {
            return GraphMode.valueOf(value);
        } catch (IllegalArgumentException e) {
            throw new InvalidResponseException("Invalid GraphMode value '%s'", value);
        }
    }

    public void readMode(String graph, GraphReadMode readMode) {
        this.client.checkApiVersion("0.59", "graph read mode");
        // NOTE: Must provide id for PUT. If you use "graph/graph_read_mode", "/"
        // will be encoded to "%2F". So use "graph_read_mode" here, although
        // inaccurate.
        this.client.put(joinPath(this.path(), graph, GRAPH_READ_MODE), null, readMode);
    }

    public GraphReadMode readMode(String graph) {
        this.client.checkApiVersion("0.59", "graph read mode");
        RestResult result = this.client.get(joinPath(this.path(), graph), GRAPH_READ_MODE);
        @SuppressWarnings("unchecked")
        Map<String, String> readMode = result.readObject(Map.class);
        String value = readMode.get(GRAPH_READ_MODE);
        if (value == null) {
            throw new InvalidResponseException("Invalid response, expect 'graph_read_mode' " +
                                               "in response");
        }
        try {
            return GraphReadMode.valueOf(value);
        } catch (IllegalArgumentException e) {
            throw new InvalidResponseException("Invalid GraphReadMode value '%s'", value);
        }
    }

    public String clone(String graph, Map<String, Object> body) {
        RestResult result = this.client.post(joinPath(this.path(), graph,
                                                      "clone"), body);
        Map<String, Object> resultMap = result.readObject(Map.class);
        String taskId = (String) resultMap.get("task_id");
        return taskId;
    }
}
