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

package org.apache.hugegraph.controller;

import java.util.HashMap;
import java.util.Map;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.HugeClientPoolService;
import org.apache.hugegraph.service.auth.AuthModeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(Constant.API_VERSION + "config")
public class ConfigController {

    private static final int CAPABILITY_PROBE_TIMEOUT_SECONDS = 3;

    @Autowired
    private HugeConfig config;

    @Autowired(required = false)
    private HugeClientPoolService hugeClientPoolService;

    @Autowired
    private AuthModeService authModeService;

    @GetMapping
    public Map<String, Object> getConfig() {
        Map<String, Object> result = new HashMap<>();
        result.put("pd_enabled", config.get(HubbleOptions.PD_ENABLED));
        result.putAll(this.serverCapabilities());
        return result;
    }

    private Map<String, Object> serverCapabilities() {
        Map<String, Object> capabilities = new HashMap<>();
        boolean pdEnabled = config.get(HubbleOptions.PD_ENABLED);
        if (pdEnabled) {
            capabilities.put("server_capabilities_verified", false);
            capabilities.put("auth_enabled", true);
            capabilities.put("graph_create_enabled", false);
            capabilities.put("schema_clone_enabled", false);
            capabilities.put("cypher_enabled", false);
            if (hugeClientPoolService == null) {
                return capabilities;
            }
            try (HugeClient client = this.createUnauthClient()) {
                capabilities.put("auth_enabled",
                                 this.authModeService.update(
                                 client.isServerAuthEnabled()));
                capabilities.put("graph_create_enabled",
                                 client.supportsGraphCreate());
                capabilities.put("schema_clone_enabled",
                                 client.supportsSchemaClone());
                capabilities.put("cypher_enabled", client.supportsCypher());
                capabilities.put("server_capabilities_verified", true);
                return capabilities;
            } catch (RuntimeException ignored) {
                // Let the frontend retry after transient Server failures.
                return capabilities;
            }
        }
        capabilities.put("server_capabilities_verified", false);
        capabilities.put("auth_enabled", true);
        capabilities.put("graph_create_enabled", false);
        capabilities.put("schema_clone_enabled", false);
        capabilities.put("cypher_enabled", false);
        if (hugeClientPoolService == null) {
            return capabilities;
        }

        try (HugeClient client = this.createUnauthClient()) {
            capabilities.put("auth_enabled",
                             this.authModeService.update(
                             client.isServerAuthEnabled()));
            capabilities.put("graph_create_enabled",
                             client.supportsGraphCreate());
            capabilities.put("schema_clone_enabled",
                             client.supportsSchemaClone());
            capabilities.put("cypher_enabled", client.supportsCypher());
            capabilities.put("server_capabilities_verified", true);
            return capabilities;
        } catch (RuntimeException ignored) {
            // Keep bootstrap resilient when the Server is temporarily unavailable.
            return capabilities;
        }
    }

    protected HugeClient createUnauthClient() {
        return this.hugeClientPoolService.createUnauthClient(
               CAPABILITY_PROBE_TIMEOUT_SECONDS);
    }
}
