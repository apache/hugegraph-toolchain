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

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.exception.UnauthorizedException;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.service.auth.AuthModeService;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

public class LoginInterceptor implements HandlerInterceptor {

    @Autowired
    private AuthModeService authMode;

    @Override
    public boolean preHandle(HttpServletRequest request,
                             HttpServletResponse response,
                             Object handler) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        if (this.authMode != null && this.authMode.anonymous()) {
            if (isAnonymousAuthManagement(request.getRequestURI())) {
                throw new ExternalException(HttpStatus.FORBIDDEN.value(),
                                            "Authentication is disabled");
            }
            return true;
        }

        if (!this.hasTextSessionAttribute(request, Constant.TOKEN_KEY) ||
            !this.hasTextSessionAttribute(request, Constant.USERNAME_KEY)) {
            throw new UnauthorizedException();
        }

        return true;
    }

    private boolean hasTextSessionAttribute(HttpServletRequest request,
                                            String key) {
        Object value = request.getSession().getAttribute(key);
        return value instanceof String && StringUtils.hasText((String) value);
    }

    private static boolean isAnonymousAuthManagement(String uri) {
        int apiIndex = uri.indexOf(Constant.API_VERSION);
        if (apiIndex < 0) {
            return false;
        }
        String apiPath = uri.substring(apiIndex);
        String globalAuth = Constant.API_VERSION + "auth";
        if (apiPath.equals(globalAuth + "/context") ||
            apiPath.equals(globalAuth + "/status") ||
            apiPath.equals(globalAuth + "/logout")) {
            return false;
        }
        if (apiPath.equals(globalAuth) ||
            apiPath.startsWith(globalAuth + "/")) {
            return true;
        }

        String graphSpaces = Constant.API_VERSION + "graphspaces/";
        if (!apiPath.startsWith(graphSpaces)) {
            return false;
        }
        int graphSpaceEnd = apiPath.indexOf('/', graphSpaces.length());
        if (graphSpaceEnd < 0) {
            return false;
        }
        String scopedAuth = apiPath.substring(0, graphSpaceEnd) + "/auth";
        return apiPath.startsWith(scopedAuth + "/");
    }
}
