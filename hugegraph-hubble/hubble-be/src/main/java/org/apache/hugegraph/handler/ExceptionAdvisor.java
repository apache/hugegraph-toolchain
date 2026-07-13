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

import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.exception.ForbiddenException;
import org.apache.hugegraph.exception.IllegalGremlinException;
import org.apache.hugegraph.exception.InternalException;
import org.apache.hugegraph.exception.LoginThrottledException;
import org.apache.hugegraph.exception.ParameterizedException;
import org.apache.hugegraph.exception.ServerCapabilityUnavailableException;
import org.apache.hugegraph.exception.UnauthorizedException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.common.Response;
import org.apache.hugegraph.util.JsonUtil;
import org.apache.hugegraph.util.HubbleUtil;

import lombok.extern.log4j.Log4j2;

import java.util.List;
import java.util.Map;

import javax.servlet.http.HttpServletRequest;

@Log4j2
@RestControllerAdvice
public class ExceptionAdvisor {

    @Autowired
    private MessageSourceHandler messageSourceHandler;

    @ExceptionHandler(LoginThrottledException.class)
    public ResponseEntity<Response> exceptionHandler(LoginThrottledException e) {
        String message = this.handleMessage(e.getMessage(),
                                            new Object[]{e.getRetrySeconds()});
        Response response = Response.builder()
                                    .status(HttpStatus.TOO_MANY_REQUESTS.value())
                                    .message(message)
                                    .cause(null)
                                    .build();
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                             .header("Retry-After",
                                     String.valueOf(e.getRetrySeconds()))
                             .body(response);
    }

    // FIXME: Map business failures to HTTP status codes only after auditing frontend
    // compatibility; clients currently depend on the status field in the JSON body.

    @ExceptionHandler(InternalException.class)
    @ResponseStatus(HttpStatus.OK)
    public Response exceptionHandler(InternalException e) {
        log.warn("Internal request failure");
        String message = this.handleMessage(e.getMessage(), e.args());
        closeRequestClient();
        return Response.builder()
                       .status(Constant.STATUS_INTERNAL_ERROR)
                       .message(message)
                       .cause(null)
                       .build();
    }

    @ExceptionHandler(ExternalException.class)
    @ResponseStatus(HttpStatus.OK)
    public Response exceptionHandler(ExternalException e) {
        log.debug("External request failure: {}", e.getMessage());
        String message = this.handleMessage(e.getMessage(), e.args());
        closeRequestClient();
        return Response.builder()
                       .status(e.status())
                       .message(message)
                       .cause(null)
                       .build();
    }

    @ExceptionHandler(ForbiddenException.class)
    @ResponseStatus(HttpStatus.FORBIDDEN)
    public Response exceptionHandler(ForbiddenException e) {
        log.debug("Forbidden request: {}", e.getMessage());
        closeRequestClient();
        return Response.builder()
                       .status(HttpStatus.FORBIDDEN.value())
                       .message(e.getMessage())
                       .cause(null)
                       .build();
    }

    @ExceptionHandler(ParameterizedException.class)
    @ResponseStatus(HttpStatus.OK)
    public Response exceptionHandler(ParameterizedException e) {
        String message = this.handleMessage(e.getMessage(), e.args());
        closeRequestClient();
        return Response.builder()
                       .status(Constant.STATUS_BAD_REQUEST)
                       .message(message)
                       .cause(null)
                       .build();
    }

    @ExceptionHandler(ServerException.class)
    @ResponseStatus(HttpStatus.OK)
    public Response exceptionHandler(ServerException e) {
        log.warn("HugeGraph Server request failed");

        String message = this.handleMessage(e.getMessage(), null);
        closeRequestClient();
        return Response.builder()
                       .status(serverStatus(e.status()))
                       .message(message)
                       .cause(null)
                       .build();
    }

    static int serverStatus(int status) {
        if (status == HttpStatus.UNAUTHORIZED.value() ||
            status == HttpStatus.FORBIDDEN.value()) {
            return status;
        }
        return Constant.STATUS_BAD_REQUEST;
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.OK)
    public Response exceptionHandler(Exception e) {
        log.error("Unexpected request failure", e);
        String message = this.handleMessage(e.getMessage(), null);
        closeRequestClient();
        return Response.builder()
                       .status(Constant.STATUS_BAD_REQUEST)
                       .message(message)
                       .cause(null)
                       .build();
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Response exceptionHandler(
            MissingServletRequestParameterException e) {
        String message = this.handleMessage("request.parameter.required",
                                            new Object[]{e.getParameterName()});
        closeRequestClient();
        return Response.builder()
                       .status(Constant.STATUS_BAD_REQUEST)
                       .message(message)
                       .cause(null)
                       .build();
    }

    @ExceptionHandler(ServerCapabilityUnavailableException.class)
    @ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
    public Response exceptionHandler(
            ServerCapabilityUnavailableException e) {
        log.warn("Required HugeGraph Server capability is unavailable", e);
        String message = this.handleMessage(e.getMessage(), e.args());
        closeRequestClient();
        return Response.builder()
                       .status(HttpStatus.SERVICE_UNAVAILABLE.value())
                       .message(message)
                       .cause(null)
                       .build();
    }

    @ExceptionHandler(IllegalGremlinException.class)
    @ResponseStatus(HttpStatus.OK)
    public Response exceptionHandler(IllegalGremlinException e) {
        log.debug("Illegal Gremlin request: {}", e.getMessage());
        String message = this.handleMessage(e.getMessage(), e.args());
        closeRequestClient();
        return Response.builder()
                       .status(Constant.STATUS_ILLEGAL_GREMLIN)
                       .message(message)
                       .cause(null)
                       .build();
    }

    @ExceptionHandler(UnauthorizedException.class)
    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    public Response exceptionHandler(UnauthorizedException e) {
        log.debug("Unauthorized request: {}", e.getMessage());
        String message = e.getMessage();
        closeRequestClient();
        return Response.builder()
                       .status(Constant.STATUS_UNAUTHORIZED)
                       .message(message)
                       .cause(null)
                       .build();
    }

    protected HttpServletRequest getRequest() {
        return ((ServletRequestAttributes)
                RequestContextHolder.getRequestAttributes()).getRequest();
    }

    public void closeRequestClient() {
        HttpServletRequest httpRequest = getRequest();
        if (httpRequest.getAttribute("hugeClient") != null) {
            HugeClient client = (HugeClient) httpRequest.getAttribute(
                    "hugeClient");
            client.close();
            httpRequest.removeAttribute("hugeClient");
        }
    }

    private String handleMessage(String message, Object[] args) {
        String[] strArgs = null;
        if (args != null && args.length > 0) {
            strArgs = new String[args.length];
            for (int i = 0; i < args.length; i++) {
                strArgs[i] = args[i] != null ? args[i].toString() : "?";
            }
        }
        message = handleErrorCode(message);

        try {
            message = this.messageSourceHandler.getMessage(message, strArgs);
        } catch (Throwable e) {
            log.error(e.getMessage(), e);
        }
        return message;
    }

    private String handleErrorCode(String message) {
        // message with ErrorCode is Json String
        if (message != null && message.startsWith("{\"")) {
            try {
                Map<String, Object> result = HubbleUtil.uncheckedCast(
                        JsonUtil.fromJson(message, Map.class));
                if (result.containsKey("code") && result.containsKey("message")) {
                    String code = result.get("code").toString();
                    String origin = result.get("message").toString();
                    List<String> attach =
                            HubbleUtil.uncheckedCast(result.get("attach"));
                    message = ErrorCodeMessage.getErrorMessage(code, origin,
                                                               attach.toArray());
                }
            } catch (Exception e) {
                throw new RuntimeException(
                        String.format("Fail to handle error code for message " +
                                      "%s, error: %s", message,
                                      e.getMessage()));
            }
        }
        return message;
    }
}
