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

package org.apache.hugegraph.service.op;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Locale;
import java.util.Set;

public class OperationsHttpClient {

    private final int connectTimeoutMillis;
    private final int readTimeoutMillis;
    private final int maxResponseBytes;

    public OperationsHttpClient(int connectTimeoutMillis,
                                int readTimeoutMillis,
                                int maxResponseBytes) {
        if (connectTimeoutMillis <= 0 || readTimeoutMillis <= 0 ||
            maxResponseBytes <= 0) {
            throw new IllegalArgumentException(
                      "Operations HTTP limits must be positive");
        }
        this.connectTimeoutMillis = connectTimeoutMillis;
        this.readTimeoutMillis = readTimeoutMillis;
        this.maxResponseBytes = maxResponseBytes;
    }

    public String get(URI target, String username, String password) {
        return this.get(target, username, password, Set.of());
    }

    public String get(URI target, String username, String password,
                      Set<String> allowedTargets) {
        return this.get(target, username, password, allowedTargets,
                        "application/json");
    }

    public String get(URI target, String username, String password,
                      Set<String> allowedTargets, String accept) {
        validateTarget(target, allowedTargets);
        if (!"application/json".equals(accept) &&
            !"text/plain".equals(accept)) {
            throw new IllegalArgumentException("Invalid operations media type");
        }
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) target.toURL().openConnection();
            connection.setConnectTimeout(this.connectTimeoutMillis);
            connection.setReadTimeout(this.readTimeoutMillis);
            connection.setRequestMethod("GET");
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept", accept);
            if (username != null && !username.trim().isEmpty()) {
                String credential = username + ':' +
                                    (password == null ? "" : password);
                String encoded = Base64.getEncoder().encodeToString(
                        credential.getBytes(StandardCharsets.UTF_8));
                connection.setRequestProperty("Authorization",
                                              "Basic " + encoded);
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new UpstreamRequestException(
                          "upstream_http_status_" + status);
            }
            int contentLength = connection.getContentLength();
            if (contentLength > this.maxResponseBytes) {
                throw new UpstreamResponseTooLargeException();
            }
            try (InputStream input = connection.getInputStream()) {
                return this.readLimited(input);
            }
        } catch (UpstreamRequestException e) {
            throw e;
        } catch (SocketTimeoutException e) {
            throw new UpstreamRequestException("upstream_timeout", e);
        } catch (IOException e) {
            throw new UpstreamRequestException("upstream_unavailable", e);
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    public static void validateTarget(URI target, Set<String> allowedTargets) {
        if (target == null || target.getScheme() == null ||
            target.getHost() == null || target.getUserInfo() != null ||
            target.getFragment() != null) {
            throw new IllegalArgumentException("Invalid operations target");
        }
        String scheme = target.getScheme().toLowerCase(Locale.ROOT);
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            throw new IllegalArgumentException("Invalid operations protocol");
        }
        int port = target.getPort();
        if (port < 0) {
            port = "https".equals(scheme) ? 443 : 80;
        }
        String authority = normalizedHost(target) + ':' + port;
        if (allowedTargets != null && !allowedTargets.isEmpty() &&
            !allowedTargets.contains(authority)) {
            throw new IllegalArgumentException("Untrusted operations target");
        }
    }

    public static String authority(URI target) {
        validateTarget(target, Set.of());
        String scheme = target.getScheme().toLowerCase(Locale.ROOT);
        int port = target.getPort();
        if (port < 0) {
            port = "https".equals(scheme) ? 443 : 80;
        }
        return normalizedHost(target) + ':' + port;
    }

    private static String normalizedHost(URI target) {
        String host = target.getHost().toLowerCase(Locale.ROOT);
        if (host.indexOf(':') < 0 || host.startsWith("[")) {
            return host;
        }
        return '[' + host + ']';
    }

    private String readLimited(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[Math.min(4096, this.maxResponseBytes + 1)];
        int total = 0;
        int read;
        while ((read = input.read(buffer)) >= 0) {
            total += read;
            if (total > this.maxResponseBytes) {
                throw new UpstreamResponseTooLargeException();
            }
            output.write(buffer, 0, read);
        }
        return output.toString(StandardCharsets.UTF_8.name());
    }
}
