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

package org.apache.hugegraph.handler;

import java.util.regex.Pattern;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

//import org.apache.hugegraph.license.LicenseVerifier; // TODO C Remove Licence
import org.apache.hugegraph.service.HugeClientPoolService;
import org.apache.hugegraph.service.auth.AuthModeService;
import org.apache.hugegraph.service.space.GraphSpaceService;
//import org.apache.hugegraph.service.license.LicenseService;// TODO C Remove Licence
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.HandlerInterceptor;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.util.PageUtil;

import lombok.extern.log4j.Log4j2;

@Log4j2
@Component
public class CustomInterceptor implements HandlerInterceptor {

    //@Autowired
    //private LicenseService licenseService;// TODO C Remove Licence
    @Autowired
    protected HugeClientPoolService hugeClientPoolService;
    @Autowired
    protected AuthModeService authMode;
    @Autowired
    protected HugeConfig config;
    @Autowired
    protected GraphSpaceService graphSpaceService;

    private static final Pattern CHECK_API_PATTERN =
                         Pattern.compile(".*/graph-connections/\\d+/.+");

    @Override
    public boolean preHandle(HttpServletRequest request,
                             HttpServletResponse response,
                             Object handler) {
        validatePage(request, "page_no", false);
        validatePage(request, "page_size", true);
        String url = request.getRequestURI();
        if (url.endsWith("/config")) {
            return true;
        }
        if (!CHECK_API_PATTERN.matcher(url).matches()) {
            setHugeClientToRequest(request);
            return true;
        }

        // String connIdValue = StringUtils.substringBetween(
        //                      url, "/graph-connections/", "/");
        // if (StringUtils.isEmpty(connIdValue)) {
        //     throw new InternalException("Not found conn id in url");
        // }

        // int connId = Integer.parseInt(connIdValue);
        // Check graph connection valid
        // this.licenseService.checkGraphStatus(connId);
        //LicenseVerifier.instance().verifyIfNeeded(); // TODO C Remove Licence
        setHugeClientToRequest(request);
        return true;
    }

    private void validatePage(HttpServletRequest request, String name,
                              boolean size) {
        String value = request.getParameter(name);
        if (!StringUtils.hasText(value)) {
            return;
        }
        try {
            int number = Integer.parseInt(value);
            boolean invalid = size ? number != -1 &&
                                     (number < 1 || number > PageUtil.MAX_PAGE_SIZE) :
                                     number < 1;
            if (invalid) {
                throw new ExternalException("Invalid pagination parameter: %s", name);
            }
        } catch (NumberFormatException e) {
            throw new ExternalException("Invalid pagination parameter: %s", name);
        }
    }

    @Override
    public void afterCompletion(HttpServletRequest request,
                                HttpServletResponse response,
                                Object handler, Exception exception) {
        Object value = request.getAttribute("hugeClient");
        if (value instanceof HugeClient) {
            ((HugeClient) value).close();
            request.removeAttribute("hugeClient");
        }
    }

    public void setHugeClientToRequest(HttpServletRequest request) {
        String uri = request.getRequestURI();
        HugeClient client = null;
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return;
        }
        if (this.isLoginRequest(uri)) {
            client = unauthClient();
        } else {
            if (this.isLogoutRequest(uri)) {
                return;
            }
            if (this.authMode != null && this.authMode.anonymous() &&
                uri.endsWith("/auth/status")) {
                return;
            }
            String[] scope = this.requestScope(uri);
            String graphSpace = scope[0];
            String graph = scope[1];
            boolean anonymous = this.authMode != null &&
                                this.authMode.anonymous();
            if (anonymous) {
                client = unauthClient(graphSpace, graph);
            } else if (!this.hasAuthSession(request)) {
                return;
            } else {
                String token =
                        (String) request.getSession().getAttribute(Constant.TOKEN_KEY);
                client = this.authClient(graphSpace, graph, token);
            }
            this.requireGraphSpaceAccess(client, graphSpace, anonymous);
            request.setAttribute(Constant.GRAPHSPACE_ACCESS_KEY, graphSpace);
        }

        request.setAttribute("hugeClient", client);
    }

    protected void requireGraphSpaceAccess(HugeClient client,
                                           String graphSpace,
                                           boolean anonymous) {
        if (graphSpace == null || this.config == null ||
            !this.config.get(HubbleOptions.PD_ENABLED)) {
            return;
        }
        try {
            if (anonymous) {
                this.graphSpaceService.requirePublicSpace(client, graphSpace);
            } else {
                this.graphSpaceService.requireAccessibleSpace(client,
                                                              graphSpace);
            }
        } catch (RuntimeException e) {
            if (client != null) {
                client.close();
            }
            throw e;
        }
    }

    private boolean isLoginRequest(String uri) {
        return (Constant.API_VERSION + "auth/login").equals(uri) ||
               uri.endsWith("/auth/login");
    }

    private boolean isLogoutRequest(String uri) {
        return (Constant.API_VERSION + "auth/logout").equals(uri) ||
               uri.endsWith("/auth/logout");
    }

    private boolean hasAuthSession(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return false;
        }
        return this.hasTextSessionAttribute(session, Constant.TOKEN_KEY) &&
               this.hasTextSessionAttribute(session, Constant.USERNAME_KEY);
    }

    private boolean hasTextSessionAttribute(HttpSession session, String key) {
        Object value = session.getAttribute(key);
        return value instanceof String && StringUtils.hasText((String) value);
    }

    protected HugeClient authClient(String graphSpace, String graph,
                                    String token) {
        return this.hugeClientPoolService.createAuthClient(graphSpace, graph,
                                                           token);
    }

    protected HugeClient unauthClient() {
        return this.hugeClientPoolService.createUnauthClient();
    }

    protected HugeClient unauthClient(String graphSpace, String graph) {
        return this.hugeClientPoolService.createUnauthClient(graphSpace, graph);
    }

    private String[] requestScope(String uri) {
        String graphSpace = null;
        String graph = null;
        String[] parts = uri.split("/");
        for (int i = 0; i < parts.length; i++) {
            if ("graphspaces".equals(parts[i]) && i < parts.length - 1) {
                String candidate = parts[i + 1];
                boolean collectionAction = i + 1 == parts.length - 1 &&
                                           ("list".equals(candidate) ||
                                            "builtin".equals(candidate));
                if (!collectionAction) {
                    graphSpace = decodeSegment(candidate);
                }
            }
            if ("graphs".equals(parts[i]) && i < parts.length - 1) {
                String candidate = parts[i + 1];
                boolean collectionAction = i + 1 == parts.length - 1 &&
                                           ("list".equals(candidate) ||
                                            "default".equals(candidate));
                if (!collectionAction) {
                    graph = decodeSegment(candidate);
                }
            }
        }
        return new String[]{graphSpace, graph};
    }

    private static String decodeSegment(String segment) {
        try {
            return URLDecoder.decode(segment, StandardCharsets.UTF_8.name());
        } catch (java.io.UnsupportedEncodingException ignored) {
            return segment;
        }
    }
}
