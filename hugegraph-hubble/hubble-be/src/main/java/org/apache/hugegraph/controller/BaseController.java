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

import java.util.List;
import java.util.function.Function;
import javax.servlet.http.HttpServletRequest;

import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.factory.PDHugeClientFactory;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.auth.UserService;
import org.apache.commons.collections.CollectionUtils;
import org.apache.hugegraph.config.HugeConfig;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.exception.ParameterizedException;
import org.apache.hugegraph.exception.ForbiddenException;
import org.apache.hugegraph.service.HugeClientPoolService;
import org.apache.hugegraph.common.Identifiable;
import org.apache.hugegraph.common.Mergeable;
import org.apache.hugegraph.util.EntityUtil;
import org.apache.hugegraph.util.Ex;

@Component
public abstract class BaseController {

    @Autowired
    protected String cluster;
    @Autowired
    protected HugeClientPoolService hugeClientPoolService;
    @Autowired(required = false)
    protected PDHugeClientFactory pdHugeClientFactory;

    @Autowired
    private HugeConfig config;

    @Autowired
    protected UserService userService;

    public static final String ORDER_ASC = "asc";
    public static final String ORDER_DESC = "desc";

    public void checkIdSameAsBody(Object id, Identifiable newEntity) {
        Ex.check(newEntity.getId() != null, () -> id.equals(newEntity.getId()),
                "common.param.path-id-should-same-as-body",
                id, newEntity.getId());
    }

    public void checkParamsNotEmpty(String name, String value,
            boolean creating) {
        if (creating) {
            Ex.check(!StringUtils.isEmpty(value),
                    "common.param.cannot-be-null-or-empty", name);
        } else {
            // The default null and user-passed null indicate no update
            Ex.check(value == null || !value.isEmpty(),
                    "common.param.cannot-be-empty", name);
        }
    }

    public void checkParamsNotEmpty(String name, List<?> values) {
        Ex.check(values != null && !values.isEmpty(),
                "common.param.cannot-be-null-or-empty", name);
    }

    public <T extends Mergeable> T mergeEntity(T oldEntity, T newEntity) {
        return EntityUtil.merge(oldEntity, newEntity);
    }

    protected void setSession(String key, Object value) {
        HttpServletRequest request = getRequest();
        request.getSession().setAttribute(key, value);
    }

    protected Object getSession(String key) {
        HttpServletRequest request = getRequest();
        return request.getSession().getAttribute(key);

    }

    protected String getUser() {
        return (String) getSession(Constant.USERNAME_KEY);
    }

    protected void setUser(String username) {
        setSession(Constant.USERNAME_KEY, username);
    }

    protected void delSession(String key) {
        HttpServletRequest request = getRequest();
        request.getSession().removeAttribute(key);
    }

    protected HttpServletRequest getRequest() {
        return ((ServletRequestAttributes) RequestContextHolder
                .getRequestAttributes()).getRequest();
    }

    protected String getToken() {
        return (String) getSession(Constant.TOKEN_KEY);
    }

    protected void setToken(String token) {
        this.setSession(Constant.TOKEN_KEY, token);
    }

    protected void delToken() {
        this.delSession(Constant.TOKEN_KEY);
    }

    protected void clearAuthSession() {
        this.delSession(Constant.TOKEN_KEY);
        this.delSession(Constant.USERNAME_KEY);
    }

    protected HugeClient authClient(String graphSpace, String graph) {
        HttpServletRequest request = getRequest();
        if (request.getAttribute("hugeClient") != null) {
            HugeClient client = (HugeClient) request.getAttribute("hugeClient");
            client.assignGraph(graphSpace, graph);
            return client;
        }
        HugeClient client = this.hugeClientPoolService.createAuthClient(
                graphSpace, graph, this.getToken());
        request.setAttribute("hugeClient", client);
        return client;
    }

    protected HugeClient requireAccountManager() {
        HugeClient client = this.authClient(null, null);
        String level = this.userService.userLevel(client, this.getUser());
        if (!"ADMIN".equals(level)) {
            throw new ForbiddenException("Permission denied: manage accounts");
        }
        return client;
    }

    protected HugeClient requireGraphSpaceManager(String graphSpace) {
        HugeClient client = this.authClient(null, null);
        if (!this.userService.isSuperAdmin(client) &&
            !this.userService.isAssignSpaceAdmin(client, graphSpace)) {
            throw new ForbiddenException(
                    "Permission denied: manage graphspace members");
        }
        client.assignGraph(graphSpace, null);
        return client;
    }

    protected HugeClient requireGraphSpaceAdministrator() {
        HugeClient client = this.authClient(null, null);
        if (!this.userService.isSuperAdmin(client)) {
            throw new ForbiddenException(
                    "Permission denied: manage graphspaces");
        }
        return client;
    }

    protected HugeClient authGremlinClient(String graphSpace, String graph) {
        return this.authClient(graphSpace, graph);
    }

    protected HugeClient unauthClient() {
        HttpServletRequest request = getRequest();
        if (request.getAttribute("hugeClient") != null) {
            HugeClient client = (HugeClient) request.getAttribute("hugeClient");
            return client;
        }
        HugeClient client = this.hugeClientPoolService.createUnauthClient();
        request.setAttribute("hugeClient", client);
        return client;
    }

    protected HugeClient tempTokenClient() {
        HttpServletRequest request = getRequest();
        if (request.getAttribute("hugeClient") != null) {
            HugeClient client = (HugeClient) request.getAttribute("hugeClient");
            client.setAuthContext("Basic " + this.getToken());
            return client;
        }
        HugeClient client = this.hugeClientPoolService.createTempTokenClient(this.getToken());
        request.setAttribute("hugeClient", client);
        return client;
    }

    protected void clearRequestHugeClient() {
        HttpServletRequest request = getRequest();
        if (request.getAttribute("hugeClient") != null) {
            HugeClient client = (HugeClient) request.getAttribute("hugeClient");
            client.close();
        }
        request.setAttribute("hugeClient", null);
    }

    protected HugeClient createAuthClient(String graphSpace, String graph) {
        return this.hugeClientPoolService.create(null, graphSpace, graph,
                this.getToken());
    }

    protected HugeClient createUnauthClient(String graphSpace, String graph) {
        return this.hugeClientPoolService.create(null, graphSpace, graph, null);
    }

    public <T> T doAuthRequest(Function<HugeClient, T> func) {
        try (HugeClient client = createAuthClient(null, null)) {
            return func.apply(client);
        } catch (Throwable t) {
            throw t;
        }
    }

    public <T> T doUnauthRequest(Function<HugeClient, T> func) {
        try (HugeClient client = createUnauthClient(null, null)) {
            return func.apply(client);
        } catch (Throwable t) {
            throw t;
        }
    }

    protected HugeClient defaultClient(String graphSpace, String graph) {
        boolean pdEnabled = config.get(HubbleOptions.PD_ENABLED);
        if (!pdEnabled) {
            String url = config.get(HubbleOptions.SERVER_URL);
            return hugeClientPoolService.create(url, graphSpace, graph,
                    this.getToken());
        }

        // PD mode: get URL from service discovery
        List<String> urls = pdHugeClientFactory.getURLs(this.cluster,
                PDHugeClientFactory.DEFAULT_GRAPHSPACE,
                PDHugeClientFactory.DEFAULT_SERVICE);

        if (CollectionUtils.isEmpty(urls)) {
            throw new ParameterizedException("No url in service(%s/%s)",
                    PDHugeClientFactory.DEFAULT_GRAPHSPACE,
                    PDHugeClientFactory.DEFAULT_SERVICE);
        }

        String url = urls.get((int) (Math.random() * urls.size()));

        HugeClient client = hugeClientPoolService.create(url, graphSpace, graph,
                this.getToken());

        return client;
    }

    public String getUrl() {
        boolean pdEnabled = config.get(HubbleOptions.PD_ENABLED);
        if (!pdEnabled) {
            return config.get(HubbleOptions.SERVER_URL);
        }

        List<String> urls = pdHugeClientFactory.getURLs(this.cluster,
                PDHugeClientFactory.DEFAULT_GRAPHSPACE,
                PDHugeClientFactory.DEFAULT_SERVICE);

        if (CollectionUtils.isEmpty(urls)) {
            throw new ParameterizedException("No url in service(%s/%s)",
                    PDHugeClientFactory.DEFAULT_GRAPHSPACE,
                    PDHugeClientFactory.DEFAULT_SERVICE);
        }

        String url = urls.get((int) (Math.random() * urls.size()));
        return url;
    }

}
