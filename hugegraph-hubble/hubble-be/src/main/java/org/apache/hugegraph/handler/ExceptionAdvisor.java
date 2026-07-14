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

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import javax.servlet.http.HttpServletRequest;

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
import org.apache.hugegraph.service.op.OperationsNodeNotFoundException;
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

    @ExceptionHandler(OperationsNodeNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public Response exceptionHandler(OperationsNodeNotFoundException e) {
        log.debug("Operations node was not found");
        closeRequestClient();
        return Response.builder()
                       .status(HttpStatus.NOT_FOUND.value())
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
        boolean operations = this.isOperationsRequest();
        log.error("HugeGraph Server request failed: {}",
                  operations ? safeStackTraceWithoutMessage(e) :
                  safeStackTrace(e));

        String message = operations ? safeServerMessage(e) :
                         this.handleMessage(sanitize(e.getMessage()), null);
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

    private static boolean transportFailure(ServerException exception) {
        if (serverStatus(exception.status()) != Constant.STATUS_BAD_REQUEST) {
            return false;
        }
        String message = exception.getMessage();
        return message != null &&
               (message.startsWith("Failed to connect to ") ||
                message.contains("Connection refused"));
    }

    private static String safeServerMessage(ServerException exception) {
        if (exception.status() == HttpStatus.UNAUTHORIZED.value()) {
            return "upstream_unauthorized";
        }
        if (exception.status() == HttpStatus.FORBIDDEN.value()) {
            return "upstream_forbidden";
        }
        return transportFailure(exception) ? "upstream_unavailable" :
               "upstream_request_failed";
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.OK)
    public Response exceptionHandler(Exception e) {
        boolean operations = this.isOperationsRequest();
        log.error("Unexpected request failure: {}",
                  operations ? safeStackTraceWithoutMessage(e) :
                  safeStackTrace(e));
        String message = operations ?
                         "unexpected_request_failure" :
                         this.handleMessage(sanitize(e.getMessage()), null);
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

    private boolean isOperationsRequest() {
        HttpServletRequest request = this.getRequest();
        return request != null && request.getRequestURI() != null &&
               request.getRequestURI().startsWith("/api/v1.3/operations");
    }

    private static final Pattern URL = Pattern.compile(
            "(?i)https?://[^\\s]+", Pattern.CASE_INSENSITIVE);
    private static final String SENSITIVE_KEY =
            "(?:token|password|secret(?:[_-]?key)?|api[_-]?key|" +
            "client[_-]?secret|credential|endpoint)";
    private static final Pattern SECRET_PARAMETER = Pattern.compile(
            "(?i)([?&\\s]" + SENSITIVE_KEY + "=)[^&\\s]+",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern AUTHORIZATION_SECRET = Pattern.compile(
            "(?i)(authorization\\s*[:=]\\s*(?:basic|bearer)\\s+)[^\\s,;]+",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern JSON_SECRET = Pattern.compile(
            "(?i)([\"']" + SENSITIVE_KEY + "[\"']" +
            "\\s*:\\s*[\"'])[^\"']*([\"'])",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern KEY_VALUE_SECRET = Pattern.compile(
            "(?i)((?:" + SENSITIVE_KEY + ")\\s*[:=]\\s*)" +
            "(?:\"[^\"]*\"|'[^']*'|[^\\s,;}&]+)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern NETWORK_ENDPOINT = Pattern.compile(
            "(?i)(?:/)?(?:\\d{1,3}\\.){3}\\d{1,3}:\\d+(?:/[^\\s]*)?");

    static String safeStackTrace(Throwable failure) {
        StringWriter output = new StringWriter();
        failure.printStackTrace(new PrintWriter(output));
        return sanitize(output.toString());
    }

    private static String safeStackTraceWithoutMessage(Throwable failure) {
        StringBuilder output = new StringBuilder(failure.getClass().getName());
        for (StackTraceElement frame : failure.getStackTrace()) {
            output.append(System.lineSeparator()).append("\tat ").append(frame);
        }
        return output.toString();
    }

    private static String sanitize(String value) {
        if (value == null) {
            return "request_failure";
        }
        String sanitized = AUTHORIZATION_SECRET.matcher(value)
                                               .replaceAll("$1[REDACTED]");
        sanitized = JSON_SECRET.matcher(sanitized)
                               .replaceAll("$1[REDACTED]$2");
        sanitized = KEY_VALUE_SECRET.matcher(sanitized)
                                    .replaceAll("$1[REDACTED]");
        sanitized = SECRET_PARAMETER.matcher(sanitized)
                                           .replaceAll("$1[REDACTED]");
        sanitized = URL.matcher(sanitized).replaceAll("[REDACTED]");
        return NETWORK_ENDPOINT.matcher(sanitized)
                               .replaceAll("[REDACTED]");
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
