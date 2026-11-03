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

import java.io.IOException;
import java.io.ByteArrayOutputStream;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.Map;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.util.E;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class VermeerClient {

    @Autowired
    private HugeConfig config;

    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5)).build();

    public boolean configured() {
        String url = this.config.get(HubbleOptions.VERMEER_URL);
        return url != null && !url.isBlank();
    }

    public Map<String, Object> request(String method, String path,
                                      Map<String, ?> body) {
        return this.request(method, path, body, false);
    }

    /** Bounded response and wall-clock wait for interactive preview requests. */
    public Map<String, Object> requestPreview(String method, String path, Map<String, ?> body) {
        return this.request(method, path, body, true);
    }

    private Map<String, Object> request(String method, String path, Map<String, ?> body,
                                        boolean preview) {
        try {
            E.checkState(this.configured(), "Configure vermeer.url first");
            URI base = URI.create(this.config.get(HubbleOptions.VERMEER_URL));
            E.checkArgument(("http".equals(base.getScheme()) ||
                             "https".equals(base.getScheme())) &&
                            base.getHost() != null && base.getUserInfo() == null &&
                            base.getQuery() == null && base.getFragment() == null,
                            "Invalid vermeer.url");
            HttpRequest.Builder request = HttpRequest.newBuilder(
                    URI.create(base.toString().replaceAll("/+$", "") +
                               "/api/v1/" + path))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "application/json");
            String tokenFile = this.config.get(HubbleOptions.VERMEER_TOKEN_FILE);
            if (tokenFile != null && !tokenFile.isBlank()) {
                String token;
                try {
                    token = Files.readString(Path.of(tokenFile)).trim();
                } catch (IOException e) {
                    throw new ConfigurationException("Unable to read Vermeer token file");
                }
                E.checkState(!token.isEmpty(), "Vermeer token file is empty");
                request.header("Authorization", "Bearer " + token);
            }
            request.method(method, body == null ?
                    HttpRequest.BodyPublishers.noBody() :
                    HttpRequest.BodyPublishers.ofString(
                            this.mapper.writeValueAsString(body)));
            HttpResponse<String> response = preview ? this.boundedResponse(request.build()) :
                    this.http.send(request.build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                if (preview && response.statusCode() == 404 && path.contains("/preview-edges")) {
                    throw new ExternalException("Vermeer snapshot edge preview is unavailable; " +
                                                "upgrade Vermeer to a version supporting it");
                }
                if (response.statusCode() == 401 || response.statusCode() == 403) {
                    throw new ConfigurationException("Vermeer service authentication failed");
                }
                if (response.statusCode() == 404 && "GET".equals(method) &&
                    "workers/availability".equals(path)) {
                    throw new ConfigurationException(
                            "Vermeer readiness endpoint is unavailable; check version and URL");
                }
                if (this.valuesNotFound(method, path, response)) {
                    throw new ValuesNotFoundException();
                }
                if (this.loadPermissionDenied(method, path, body, response)) {
                    throw new ConfigurationException(
                            "Vermeer HugeGraph loading requires an administrator service token; " +
                            "check vermeer.token_file");
                }
                throw new ExternalException("Vermeer request failed (HTTP " +
                                            response.statusCode() + ")");
            }
            Map<String, Object> result = this.mapper.readValue(response.body(),
                    new TypeReference<Map<String, Object>>() { });
            Object code = result.get("errcode");
            if (code != null && !"0".equals(code.toString())) {
                throw new ExternalException("Vermeer request failed");
            }
            return result;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ExternalException("Vermeer request interrupted", e);
        } catch (IOException e) {
            throw new ExternalException("Vermeer service is unavailable");
        } catch (IllegalArgumentException | IllegalStateException | SecurityException e) {
            // Adapter validation can include URLs, token values or file paths.
            // Preserve the availability boundary without exposing those details.
            throw new ConfigurationException("Invalid Vermeer configuration or request");
        }
    }

    private HttpResponse<String> boundedResponse(HttpRequest request)
            throws IOException, InterruptedException {
        final int maxBytes = 128 * 1024;
        AtomicBoolean tooLarge = new AtomicBoolean();
        CompletableFuture<HttpResponse<String>> pending = this.http.sendAsync(request, info -> {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            return HttpResponse.BodySubscribers.mapping(
                    HttpResponse.BodySubscribers.ofByteArrayConsumer(chunk -> chunk.ifPresent(value -> {
                        if (value.length > maxBytes - bytes.size()) {
                            tooLarge.set(true);
                            throw new UncheckedIOException(new IOException("Response exceeds preview limit"));
                        }
                        bytes.write(value, 0, value.length);
                    })), ignored -> bytes.toString(java.nio.charset.StandardCharsets.UTF_8));
        });
        try {
            return pending.get(5, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            pending.cancel(true);
            throw new IOException("Vermeer preview timed out", e);
        } catch (ExecutionException e) {
            if (tooLarge.get()) {
                throw new PreviewTooLargeException();
            }
            throw new IOException("Vermeer preview request failed", e);
        } catch (InterruptedException e) {
            pending.cancel(true);
            throw e;
        }
    }

    static class PreviewTooLargeException extends ExternalException {
        private static final long serialVersionUID = 1L;

        PreviewTooLargeException() {
            super("Vermeer preview response exceeds the size limit");
        }
    }

    private boolean loadPermissionDenied(String method, String path, Map<String, ?> body,
                                         HttpResponse<String> response) {
        if (response.statusCode() != 400 || !"POST".equals(method) ||
            !"tasks/create".equals(path) || body == null ||
            !("load".equals(body.get("task_type")) || "reload".equals(body.get("task_type")))) {
            return false;
        }
        try {
            Map<String, Object> error = this.mapper.readValue(response.body(),
                    new TypeReference<Map<String, Object>>() { });
            return error != null && "1".equals(String.valueOf(error.get("errcode"))) &&
                   "admin permission is required to load from HugeGraph".equals(error.get("message"));
        } catch (IOException e) {
            return false;
        }
    }

    private boolean valuesNotFound(String method, String path, HttpResponse<String> response) {
        String endpoint = path.split("\\?", 2)[0];
        String prefix = "tasks/value/";
        if (response.statusCode() != 400 || !"GET".equals(method) || !endpoint.startsWith(prefix)) {
            return false;
        }
        String taskId = endpoint.substring(prefix.length());
        if (!taskId.matches("[1-9][0-9]*")) {
            return false;
        }
        try {
            Map<String, Object> error = this.mapper.readValue(response.body(),
                    new TypeReference<Map<String, Object>>() { });
            return error != null && "1".equals(String.valueOf(error.get("errcode"))) &&
                   (("task_id error:" + taskId).equals(error.get("message")) ||
                    ("compute value not exist, task_id:" + taskId).equals(error.get("message")));
        } catch (IOException e) {
            return false;
        }
    }

    public static final class ValuesNotFoundException extends ExternalException {

        public ValuesNotFoundException() {
            super("Vermeer task values are no longer available");
        }
    }

    public static final class ConfigurationException extends ExternalException {

        public ConfigurationException(String message) {
            super(message);
        }
    }
}
