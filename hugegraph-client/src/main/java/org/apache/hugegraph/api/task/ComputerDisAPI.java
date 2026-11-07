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

package org.apache.hugegraph.api.task;

import com.google.common.collect.ImmutableMap;

import org.apache.hugegraph.client.RestClient;
import org.apache.hugegraph.api.API;
import org.apache.hugegraph.rest.RestResult;
import org.apache.hugegraph.structure.Task;
import org.apache.hugegraph.util.E;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ComputerDisAPI extends API {

    private static final String PATH = "graphspaces/%s/graphs/%s/jobs/computerdis";
    private final String graphSpace;
    private final String graph;
    public static final String TASKS = "tasks";
    public static final String TASK_ID = "task_id";

    public ComputerDisAPI(RestClient client, String graphSpace, String graph) {
        super(client);
        this.graphSpace = graphSpace;
        this.graph = graph;
        this.path(String.format(PATH, this.graphSpace, this.graph));
    }

    @Override
    protected String type() {
        return "computerdis";
    }

    public long create(String algorithm, long worker,
                       Map<String, Object> params) {
        Map<String, Object> innerParams = new LinkedHashMap<>();
        innerParams.put("algorithm", algorithm);
        innerParams.put("worker", worker);
        innerParams.put("params", params);
        RestResult result = this.client.post(this.path(), innerParams);
        @SuppressWarnings("unchecked")
        Map<String, Object> task = result.readObject(Map.class);
        return parseTaskId(task);
    }

    public void delete(long id) {
        this.client.delete(this.path(), String.valueOf(id));
    }

    public Task cancel(long id) {
        RestResult result = this.client.put(this.path(), String.valueOf(id),
                                            ImmutableMap.of());
        return result.readObject(Task.class);
    }

    public List<Task> list(long limit) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("limit", limit);
        RestResult result = this.client.get(this.path(), params);
        return result.readList(TASKS, Task.class);
    }

    public TasksWithPage list(String page, long limit) {
        E.checkArgument(page != null, "The page can not be null");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("limit", limit);
        params.put("page", page);
        RestResult result = this.client.get(this.path(), params);
        return result.readObject(TasksWithPage.class);
    }

    public Task get(long id) {
        RestResult result = this.client.get(this.path(), String.valueOf(id));
        return result.readObject(Task.class);
    }

    public static long parseTaskId(Map<String, Object> task) {
        return TaskAPI.parseTaskId(task);
    }
}
