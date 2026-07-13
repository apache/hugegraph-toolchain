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

package org.apache.hugegraph.api.auth;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.commons.lang.StringUtils;
import org.apache.hugegraph.client.RestClient;
import org.apache.hugegraph.rest.RestResult;
import org.apache.hugegraph.structure.auth.HugePermission;
import org.apache.hugegraph.structure.auth.UserManager;
import org.apache.hugegraph.structure.constant.HugeType;

public class ManagerAPI extends AuthAPI {

    public ManagerAPI(RestClient client, String graphSpace) {
        super(client, graphSpace);
    }

    public UserManager create(UserManager userManager) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("user", userManager.user());
        payload.put("type", userManager.type());
        RestResult result = this.client.post(this.path(), payload);
        return result.readObject(UserManager.class);
    }

    public void delete(String user, HugePermission type, String graphSpace) {
        Map<String, Object> params = new HashMap<>();
        params.put("user", user);
        params.put("type", type);
        params.put("graphspace", graphSpace);
        this.client.delete(this.path(), params);
    }

    public List<String> list(HugePermission type, String graphSpace) {

        Map<String, Object> params = new HashMap<>();
        params.put("type", type);
        params.put("graphspace", graphSpace);

        RestResult result = this.client.get(this.path(), params);

        return result.readList("admins", String.class);
    }

    public boolean checkPermission(HugePermission type, String graphSpace) {

        Map<String, Object> params = new HashMap<>();
        params.put("type", type);
        params.put("graphspace", graphSpace);

        String path = this.path() + PATH_SPLITOR + "check";
        RestResult result = this.client.get(path, params);

        return (boolean) result.readObject(Map.class).getOrDefault("check", false);
    }

    public boolean checkDefaultRole(String graphSpace, String role,
                                    String graph) {
        String path = joinPath(this.path(), "default");
        Map<String, Object> params = new HashMap<>();
        params.put("graphspace", graphSpace);
        params.put("role", role);
        if (StringUtils.isNotEmpty(graph)) {
            params.put("graph", graph);
        }
        RestResult result = this.client.get(path, params);
        return (boolean) result.readObject(Map.class).getOrDefault("check", false);
    }

    @Override
    protected String type() {
        return HugeType.MANAGER.string();
    }
}
