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

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.controller.BaseController;
import org.apache.hugegraph.options.HubbleOptions;

@RestController
@RequestMapping(Constant.API_VERSION + "dashboard")
public class DashboardController extends BaseController {

    private static final int HEALTH_TIMEOUT_MILLIS = 1500;

    @Autowired
    private HugeConfig config;

    @GetMapping
    public Map<String, Object> listOperations() {
        String address = config.get(HubbleOptions.DASHBOARD_ADDRESS);
        Map<String, Object> result = new HashMap<>();
        result.put("configured", StringUtils.isNotEmpty(address));
        if (StringUtils.isEmpty(address)) {
            return result;
        }
        result.put("address", address);
        String protocol = config.get(HubbleOptions.SERVER_PROTOCOL);
        result.put("protocol", protocol);
        result.put("available", this.isAvailable(protocol, address));
        return result;
    }

    private boolean isAvailable(String protocol, String address) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(
                    protocol + "://" + address).openConnection();
            connection.setConnectTimeout(HEALTH_TIMEOUT_MILLIS);
            connection.setReadTimeout(HEALTH_TIMEOUT_MILLIS);
            connection.setRequestMethod("GET");
            connection.setInstanceFollowRedirects(false);
            int status = connection.getResponseCode();
            return status >= 200 && status < 400;
        } catch (IOException e) {
            return false;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }
}
