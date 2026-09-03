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

import org.apache.hugegraph.api.API;
import org.apache.hugegraph.client.RestClient;
import org.apache.hugegraph.structure.auth.AuthElement;

public abstract class AuthAPI extends API {

    private static final String PATH = "graphspaces/%s/auth/%s";
    private static final String LEGACY_PATH = "graphs/%s/auth/%s";
    private static final String USER_PATH = "auth/%s";

    private final boolean legacyGraphScoped;

    public AuthAPI(RestClient client) {
        super(client);
        this.legacyGraphScoped = false;
        this.path(USER_PATH, this.type());
    }

    public AuthAPI(RestClient client, String graphSpace) {
        super(client);
        this.legacyGraphScoped = false;
        this.path(PATH, graphSpace, this.type());
    }

    public AuthAPI(RestClient client, String graphSpace, String graph) {
        super(client);
        this.legacyGraphScoped = !client.isSupportGs() &&
                                 graph != null && !graph.isEmpty();
        if (this.legacyGraphScoped) {
            this.path(LEGACY_PATH, graph, this.type());
        } else {
            this.path(PATH, graphSpace, this.type());
        }
    }

    protected boolean legacyGraphScoped() {
        return this.legacyGraphScoped;
    }

    public static String formatEntityId(Object id) {
        if (id == null) {
            return null;
        } else if (id instanceof AuthElement) {
            id = ((AuthElement) id).id();
        }
        return String.valueOf(id);
    }

    public static String formatRelationId(Object id) {
        return formatEntityId(id);
    }
}
