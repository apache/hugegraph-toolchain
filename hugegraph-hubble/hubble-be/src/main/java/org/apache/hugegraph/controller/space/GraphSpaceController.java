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

import com.google.common.collect.ImmutableMap;
import com.google.common.collect.ImmutableSet;
import org.apache.commons.collections4.SetUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.controller.BaseController;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.GraphConnection;
import org.apache.hugegraph.entity.space.BuiltInEntity;
import org.apache.hugegraph.entity.space.GraphSpaceEntity;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.auth.UserService;
import org.apache.hugegraph.service.graphs.GraphsService;
import org.apache.hugegraph.service.space.GraphSpaceService;
import org.apache.hugegraph.util.E;
import org.apache.hugegraph.util.PageUtil;
import org.apache.hugegraph.util.UrlUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collections;
import java.util.List;

@RestController
@RequestMapping(Constant.API_VERSION + "graphspaces")
public class GraphSpaceController extends BaseController {
    private static final int DEFAULT_MAX_GRAPH_NUMBER = 100;
    private static final int DEFAULT_MAX_ROLE_NUMBER = 100;
    private static final int DEFAULT_STORAGE_VALUE = 1000000;
    private static final int DEFAULT_MEMORY_VALUE = 128;
    private static final int DEFAULT_CPU_VALUE = 64;

    @Autowired
    private GraphSpaceService graphSpaceService;

    @Autowired
    private UserService userService;

    @Autowired
    GraphsService graphsService;
    @Autowired
    HugeConfig config;

    private boolean isPdEnabled() {
        return config.get(HubbleOptions.PD_ENABLED);
    }

    @GetMapping("list")
    public Object list() {
        if (!isPdEnabled()) {
            return ImmutableMap.of("graphspaces",
                                   Collections.singletonList("DEFAULT"));
        }

        List<String> graphSpaces =
                this.graphSpaceService.listAll(this.authClient(null, null));
        return ImmutableMap.of("graphspaces", graphSpaces);
    }

    @GetMapping
    public Object queryPage(@RequestParam(name = "query", required = false,
                                    defaultValue = "") String query,
                            @RequestParam(name = "create_time", required = false,
                                    defaultValue = "") String createTime,
                            @RequestParam(name = "page_no", required = false,
                                    defaultValue = "1") int pageNo,
                            @RequestParam(name = "page_size", required = false,
                                    defaultValue = "10") int pageSize,
                            @RequestParam(name = "all", required = false,
                                          defaultValue = "false") boolean all) {
        if (!isPdEnabled()) {
            return ImmutableMap.of("records", Collections.emptyList(),
                                  "total", 0);
        }
        if (all) {
            HugeClient client = this.authClient(null, null);
            return this.userService.isSuperAdmin(client) ?
                   this.graphSpaceService.queryAllGs(client, query,
                                                     createTime) :
                   this.graphSpaceService.queryAccessibleGs(client, query,
                                                            createTime);
        }
        HugeClient client = this.authClient(null, null);
        return this.userService.isSuperAdmin(client) ?
               graphSpaceService.queryPage(client, query, createTime,
                                           pageNo, pageSize) :
               PageUtil.page(graphSpaceService.queryAccessibleGs(
                       client, query, createTime), pageNo, pageSize);
    }

    @GetMapping("{graphspace}/auth")
    public Object isAuth(@PathVariable("graphspace") String graphSpace) {
        if (!isPdEnabled()) {
            return ImmutableMap.of("auth", false);
        }
        boolean isAuth = graphSpaceService.isAuth(this.authClient(null, null),
                                                  graphSpace);
        return ImmutableMap.of("auth", isAuth);
    }

    @GetMapping("{graphspace}")
    public Object get(@PathVariable("graphspace") String graphspace) {
        if (!isPdEnabled()) {
            // Return a minimal stub entity for non-PD mode
            GraphSpaceEntity stub = new GraphSpaceEntity();
            stub.setName(graphspace);
            stub.setNickname(graphspace);
            return this.graphSpaceService.toView(stub);
        }
        HugeClient client = this.authClient(null, null);
        // Get GraphSpace Info
        return graphSpaceService.toView(
                graphSpaceService.getWithAdmins(client, graphspace));
    }

    @PostMapping
    public Object add(@RequestBody GraphSpaceEntity graphSpaceEntity) {
        E.checkArgument(isPdEnabled(),
                "GraphSpace management is not supported in standalone mode");
        HugeClient client = this.requireGraphSpaceAdministrator();
        // Create GraphSpace
        applyResourceDefaults(graphSpaceEntity);

        graphSpaceService.create(client, graphSpaceEntity.convertGraphSpace());

        // Add GraphSpace Admin
        graphSpaceEntity.graphspaceAdmin.forEach(u -> {
            client.auth().addSpaceAdmin(u, graphSpaceEntity.getName());
        });

        return get(graphSpaceEntity.getName());
    }

    static void applyResourceDefaults(GraphSpaceEntity graphSpaceEntity) {
        if (graphSpaceEntity.getMaxGraphNumber() <= 0) {
            graphSpaceEntity.setMaxGraphNumber(DEFAULT_MAX_GRAPH_NUMBER);
        }
        if (graphSpaceEntity.getMaxRoleNumber() <= 0) {
            graphSpaceEntity.setMaxRoleNumber(DEFAULT_MAX_ROLE_NUMBER);
        }
        if (graphSpaceEntity.getCpuLimit() <= 0) {
            graphSpaceEntity.setCpuLimit(DEFAULT_CPU_VALUE);
        }
        if (graphSpaceEntity.getMemoryLimit() <= 0) {
            graphSpaceEntity.setMemoryLimit(DEFAULT_MEMORY_VALUE);
        }
        if (graphSpaceEntity.getComputeCpuLimit() <= 0) {
            graphSpaceEntity.setComputeCpuLimit(DEFAULT_CPU_VALUE);
        }
        if (graphSpaceEntity.getComputeMemoryLimit() <= 0) {
            graphSpaceEntity.setComputeMemoryLimit(DEFAULT_MEMORY_VALUE);
        }
        if (graphSpaceEntity.getStorageLimit() <= 0) {
            graphSpaceEntity.setStorageLimit(DEFAULT_STORAGE_VALUE);
        }
    }

    @PutMapping("{graphspace}")
    public Object update(@PathVariable("graphspace") String graphspace,
                         @RequestBody GraphSpaceEntity graphSpaceEntity) {
        E.checkArgument(isPdEnabled(),
                "GraphSpace management is not supported in standalone mode");
        HugeClient client = this.requireGraphSpaceAdministrator();

        graphSpaceEntity.setName(graphspace);
        applyResourceDefaults(graphSpaceEntity);

        // Update graphspace
        graphSpaceService.update(client, graphSpaceEntity.convertGraphSpace());

        // Update graphspace admin
        ImmutableSet<String> oldSpaceAdmins
                = ImmutableSet.copyOf(userService.listGraphSpaceAdmin(client,
                                                                      graphspace));
        ImmutableSet<String> curSpaceAdmins
                = ImmutableSet.copyOf(graphSpaceEntity.graphspaceAdmin);

        // a. Del
        SetUtils.difference(oldSpaceAdmins, curSpaceAdmins).forEach(u -> {
            client.auth().delSpaceAdmin(u, graphspace);
        });
        // b. Add
        SetUtils.difference(curSpaceAdmins, oldSpaceAdmins).forEach(u -> {
            client.auth().addSpaceAdmin(u, graphspace);
        });

        return get(graphSpaceEntity.getName());
    }

    @DeleteMapping("{graphspace}")
    public void delete(@PathVariable("graphspace") String graphspace) {
        E.checkArgument(isPdEnabled(),
                "GraphSpace management is not supported in standalone mode");
        HugeClient client = this.requireGraphSpaceAdministrator();
        E.checkArgument(StringUtils.isNotEmpty(graphspace), "graphspace " +
                "must not null");

        // Delete graphspace admin
        userService.listGraphSpaceAdmin(client, graphspace).forEach(u -> {
            client.auth().delSpaceAdmin(u, graphspace);
        });

        // delete graphspace
        graphSpaceService.delete(client, graphspace);
    }

    @PostMapping("builtin")
    public Object initBuiltIn(@RequestBody BuiltInEntity entity) {
        E.checkArgument(isPdEnabled(),
                "Built-in initialization is not supported in standalone mode");
        HugeClient client = this.requireGraphSpaceAdministrator();
        GraphConnection connection = new GraphConnection();

        String url = this.getUrl();
        UrlUtil.Host host = UrlUtil.parseHost(url);
        connection.setProtocol(host.getScheme());
        connection.setHost(host.getHost());
        connection.setPort(host.getPort());

        connection.setCluster(config.get(HubbleOptions.PD_CLUSTER));
        connection.setRouteType(config.get(HubbleOptions.ROUTE_TYPE));
        connection.setPdPeers(config.get(HubbleOptions.PD_PEERS));
        connection.setGraphSpace(Constant.BUILT_IN);
        connection.setToken(this.getToken());

        if (entity.initSpace) {
            graphSpaceService.initBuiltIn(client);
        }
        client.assignGraph(Constant.BUILT_IN, null);
        graphsService.initBuiltIn(client, connection, entity);
        return null;
    }
}
