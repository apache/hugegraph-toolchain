/*
 *
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

package org.apache.hugegraph.controller.space;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.controller.BaseController;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.loader.util.JsonUtil;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.space.VermeerService;
import org.apache.hugegraph.util.HubbleUtil;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.extern.log4j.Log4j2;

@RestController
@RequestMapping(Constant.API_VERSION + "vermeer")
@Log4j2
public class VermeerController extends BaseController {

    @Autowired
    VermeerService vermeerService;
    @Autowired
    private HugeConfig config;

    private static final String GRAPH_LOADED = "loaded";

    @GetMapping
    public Map<String, Object> getStatus(@RequestParam(value = "check",
                                                       required = false,
                                                       defaultValue = "false")
                                                     boolean check) {
        return vermeerService.getVermeer(this.getToken(), check);
    }

    @PostMapping("task")
    public void load(@RequestBody JsonLoad body) {
        String graphspace = body.graphspace;
        String graph = body.graph;
        String vGraph = vermeerService.convert2VG(graphspace, graph);
        HugeClient client = this.authClient(null, null);

        Map<String, Object> graphInfo = HubbleUtil.uncheckedCast(
                client.vermeer().getGraphInfoByName(vGraph).get("graph"));

        // if (graphInfo != null && !graphInfo.isEmpty()) {
        //     E.checkArgument(body.force || !GRAPH_LOADED.equals(graphInfo.get(
        //             "status")), "graph already loaded");
        //     vermeerService.deleteGraph(client, graphspace, graph);
        // }

        Map<String, Object> params = new HashMap<>();
        String pdPeers = config.get(HubbleOptions.PD_PEERS);
        String pdJson = JsonUtil.toJson(Arrays.asList(pdPeers.split(",")));
        params.put("load.parallel", "50");
        params.put("load.type", "hugegraph");
        params.put("load.hg_pd_peers", pdJson);
        params.put("load.use_outedge", "1");
        params.put("load.use_out_degree", "1");
        params.put("load.hugegraph_name", graphspace + "/" + graph + "/g");
        if (body.params != null) {
            params.putAll(body.analyze());
        }

        vermeerService.load(client, graphspace, graph, body.taskType, params);
        try {
            Thread.sleep(1000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Interrupted while waiting for the Vermeer load task", e);
        }
    }

    @DeleteMapping("{name}")
    public void deleteGraph(@RequestBody Map<String, String> body) {
        String graphspace = body.get("graphspace");
        String graph = body.get("graph");
        HugeClient client = this.authClient(graphspace, graph);
        vermeerService.deleteGraph(client, graphspace, graph);
    }

    private static class JsonLoad {
        @JsonProperty("graphspace")
        public String graphspace;
        @JsonProperty("graph")
        public String graph;
        @JsonProperty("force")
        public boolean force = false;
        @JsonProperty("params")
        public Map<String, Object> params;

        @JsonProperty("task_type")
        public String taskType;

        public Map<String, Object> analyze() {
            for (Map.Entry<String, Object> entry : params.entrySet()) {
                entry.setValue(entry.getValue().toString());
            }
            return params;
        }
    }
}
