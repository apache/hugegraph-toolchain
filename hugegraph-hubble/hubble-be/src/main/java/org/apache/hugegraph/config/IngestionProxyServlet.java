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

package org.apache.hugegraph.config;

import org.apache.commons.lang3.StringUtils;
import org.apache.http.HttpHeaders;
import org.apache.http.HttpRequest;
import org.apache.http.HttpResponse;
import org.apache.http.HttpVersion;
import org.apache.http.entity.StringEntity;
import org.apache.http.message.BasicHttpResponse;
import org.apache.hugegraph.common.Constant;
import org.mitre.dsmiley.httpproxy.ProxyServlet;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.io.IOException;

public class IngestionProxyServlet extends ProxyServlet {

    @Override
    protected String rewriteQueryStringFromRequest(
            HttpServletRequest servletRequest, String queryString) {
        String username = this.sessionString(servletRequest,
                                             Constant.USERNAME_KEY);

        String requestQueryString = servletRequest.getQueryString();

        if (StringUtils.isEmpty(requestQueryString)) {
            requestQueryString = String.format("user=%s", username);
        } else {
            requestQueryString += String.format("&user=%s", username);
        }

        return requestQueryString;
    }

    @Override
    protected HttpResponse doExecute(HttpServletRequest servletRequest,
                                     HttpServletResponse servletResponse,
                                     HttpRequest proxyRequest) throws IOException {
        if (!this.authenticated(servletRequest)) {
            // check user login
            HttpResponse response =  new BasicHttpResponse(HttpVersion.HTTP_1_1,
                                                           Constant.STATUS_UNAUTHORIZED,
                                                           "Unauthorized");

            response.setHeader(HttpHeaders.CONTENT_TYPE, "application/json");
            response.setEntity(new StringEntity("{\"status\": 401}",
                                                StandardCharsets.UTF_8));

            return response;
        }

        return super.doExecute(servletRequest, servletResponse, proxyRequest);
    }

    private boolean authenticated(HttpServletRequest servletRequest) {
        return StringUtils.isNotBlank(this.sessionString(servletRequest,
                                                        Constant.USERNAME_KEY)) &&
               StringUtils.isNotBlank(this.sessionString(servletRequest,
                                                        Constant.TOKEN_KEY));
    }

    private String sessionString(HttpServletRequest servletRequest,
                                 String key) {
        Object value = servletRequest.getSession().getAttribute(key);
        return value instanceof String ? (String) value : null;
    }
}
