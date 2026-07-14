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

package org.apache.hugegraph.service.space;

import com.google.common.collect.ImmutableMap;
import lombok.extern.log4j.Log4j2;
import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.client.RestClient;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.HugeClientBuilder;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.util.E;
import org.apache.hugegraph.util.HubbleUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Log4j2
@Service
public class VermeerService {
    @Autowired
    private HugeConfig config;

    private static final String GET_SYS_CFG = "api/v1.0/memt_clu/config/getsyscfg";

    public boolean isVermeerEnabled(String token) {
        Map<String, Object> vermeer = this.getVermeer(token, false);
        if (vermeer != null) {
            return (Boolean) vermeer.get("enable");
        }
        return false;
    }

    public Map<String, Object> getVermeer(String token,
                                          boolean throwIfNoConfig) {
        String dashboard = config.get(HubbleOptions.DASHBOARD_ADDRESS);
        String protocol = config.get(HubbleOptions.SERVER_PROTOCOL);
        if (throwIfNoConfig) {
            E.checkArgument(StringUtils.isNotEmpty(dashboard),
                            "Please set 'dashboard.address' in config file " +
                            "conf/hugegraph-hubble.properties.");
        } else if (StringUtils.isEmpty(dashboard)) {
            return ImmutableMap.of("enable", false);
        }
        HugeClientBuilder builder = HugeClient.builder(protocol + "://" + dashboard,
                                                       null,
                                                       null,
                                                       true)
                                              .configToken(token);
        RestClient client = new RestClient(builder.url(), builder.token(),
                                           builder.timeout(),
                                           builder.maxConns(),
                                           builder.maxConnsPerRoute(),
                                           builder.trustStoreFile(),
                                           builder.trustStorePassword());
        Map<String, Object> sertMap = ImmutableMap.of("sertype", "vermeer");
        boolean enable = false;
        try {
            Map<String, Object> result = HubbleUtil.uncheckedCast(
                    client.post(GET_SYS_CFG, sertMap).readObject(Map.class));
            Map<String, String> data =
                    HubbleUtil.uncheckedCast(result.get("data"));
            if (data == null || data.isEmpty()) {
                enable = false;
            } else {
                enable = "true".equals(data.get("cfgvalue"));
            }
        } catch (Exception e) {
            log.warn("Dashboard Vermeer configuration is unavailable; " +
                     "Vermeer integration is disabled for this request");
            enable = false;
        } finally {
            client.close();
        }
        return ImmutableMap.of("enable", enable);
    }

    public Map<String, Object> load(HugeClient client,
                                    String graphspace, String graph, String taskType,
                                    Map<String, Object> params) {
        Map<String, Object> jsonTask = new HashMap<>();
        jsonTask.put("task_type", taskType);
        jsonTask.put("graph", convert2VG(graphspace, graph));
        jsonTask.put("params", params);
        return client.vermeer().post(jsonTask);
    }

    public Map<String, Object> compute(HugeClient client,
                                    String graphspace, String graph,
                                    Map<String, Object> params) {
        Map<String, Object> jsonTask = new HashMap<>();
        jsonTask.put("task_type", "compute");
        jsonTask.put("graph", convert2VG(graphspace, graph));
        jsonTask.put("params", params);
        return client.vermeer().post(jsonTask);
    }

    public void deleteGraph(HugeClient client, String graphspace,
                            String graph) {
        client.vermeer().deleteGraphByName(convert2VG(graphspace, graph));
    }

    public String convert2VG(String space, String graph) {
        return space + "-" + graph;
    }
}
