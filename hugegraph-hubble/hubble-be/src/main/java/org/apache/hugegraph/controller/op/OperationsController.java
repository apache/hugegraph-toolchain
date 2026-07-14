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

package org.apache.hugegraph.controller.op;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.controller.BaseController;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.exception.ForbiddenException;
import org.apache.hugegraph.service.op.OperationsCapabilityService;
import org.apache.hugegraph.service.op.OperationsDataService;

@RestController
@RequestMapping(Constant.API_VERSION + "operations")
public class OperationsController extends BaseController {

    @Autowired
    private OperationsDataService dataService;

    @GetMapping("capabilities")
    public Map<String, Object> capabilities() {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("capabilities", this.currentCapabilities());
        return response;
    }

    @GetMapping("overview")
    public Map<String, Object> overview(
            @RequestParam(defaultValue = "false") boolean refresh) {
        HugeClient client = this.authClient(null, null);
        Set<String> capabilities = this.currentCapabilities(client);
        OperationsCapabilityService.requireHealth(capabilities);
        return this.dataService.overview(client, capabilities, refresh);
    }

    @GetMapping("nodes")
    public Map<String, Object> nodes(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(name = "page_size", defaultValue = "20")
            int pageSize,
            @RequestParam(defaultValue = "name") String sort,
            @RequestParam(defaultValue = "asc") String order) {
        HugeClient client = this.authClient(null, null);
        Set<String> capabilities = this.currentCapabilities(client);
        this.requireTopology(capabilities);
        if (page < 1 || pageSize < 1 || pageSize > 100 ||
            query != null && query.length() > 256 ||
            !sort.matches("name|type|status|observed_at") ||
            !order.matches("asc|desc")) {
            throw new IllegalArgumentException("Invalid operations page");
        }
        return this.dataService.nodes(client, capabilities, type, status,
                                      query, page, pageSize, sort, order);
    }

    @GetMapping("nodes/{nodeId}")
    public Map<String, Object> node(
            @PathVariable String nodeId,
            @RequestParam(defaultValue = "false") boolean refresh) {
        HugeClient client = this.authClient(null, null);
        Set<String> capabilities = this.currentCapabilities(client);
        this.requireTopology(capabilities);
        if (nodeId == null || !nodeId.matches("(server|pd|store)-[0-9a-f]{12}")) {
            throw new IllegalArgumentException("Invalid operations node id");
        }
        return this.dataService.node(client, capabilities, nodeId, refresh);
    }

    private Set<String> currentCapabilities() {
        return this.currentCapabilities(this.authClient(null, null));
    }

    private Set<String> currentCapabilities(HugeClient client) {
        String level = this.userService.userLevel(client, this.getUser());
        return OperationsCapabilityService.forLevel(level);
    }

    private void requireTopology(Set<String> capabilities) {
        if (!capabilities.contains(
                OperationsCapabilityService.TOPOLOGY_READ)) {
            throw new ForbiddenException(
                      "Permission denied: operations topology read");
        }
    }
}
