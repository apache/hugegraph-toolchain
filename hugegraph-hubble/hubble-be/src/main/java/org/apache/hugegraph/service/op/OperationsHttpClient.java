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
import java.net.InetAddress;
import java.net.Proxy;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import okhttp3.Dns;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

public class OperationsHttpClient {

    private final int connectTimeoutMillis;
    private final int readTimeoutMillis;
    private final int maxResponseBytes;
    private final OkHttpClient client;

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
        this.client = new OkHttpClient.Builder()
                .connectTimeout(this.connectTimeoutMillis,
                                TimeUnit.MILLISECONDS)
                .readTimeout(this.readTimeoutMillis, TimeUnit.MILLISECONDS)
                .followRedirects(false)
                .followSslRedirects(false)
                .proxy(Proxy.NO_PROXY)
                .build();
    }

    public String get(URI target, String username, String password) {
        return this.get(target, username, password, Set.of());
    }

    public String get(URI target, String username, String password,
                      Set<String> allowedOrigins) {
        return this.get(target, username, password, allowedOrigins,
                        "application/json");
    }

    public String get(URI target, String username, String password,
                      Set<String> allowedOrigins, String accept) {
        validateTarget(target, allowedOrigins);
        if (!"application/json".equals(accept) &&
            !"text/plain".equals(accept)) {
            throw new IllegalArgumentException("Invalid operations media type");
        }
        try {
            InetAddress[] addresses = InetAddress.getAllByName(target.getHost());
            validateResolvedAddresses(target.getHost(), addresses);
            OkHttpClient requestClient = this.client.newBuilder()
                    .dns(pinnedDns(target.getHost(), addresses))
                    .build();
            Request.Builder request = new Request.Builder()
                    .url(target.toString())
                    .get()
                    .header("Accept", accept);
            if (username != null && !username.trim().isEmpty()) {
                String credential = username + ':' +
                                    (password == null ? "" : password);
                String encoded = Base64.getEncoder().encodeToString(
                        credential.getBytes(StandardCharsets.UTF_8));
                request.header("Authorization", "Basic " + encoded);
            }
            try (Response response = requestClient.newCall(request.build())
                                              .execute()) {
                int status = response.code();
                if (status < 200 || status >= 300) {
                    throw new UpstreamRequestException(
                              "upstream_http_status_" + status);
                }
                ResponseBody body = response.body();
                if (body == null) {
                    throw new UpstreamRequestException("upstream_empty_body");
                }
                if (body.contentLength() > this.maxResponseBytes) {
                    throw new UpstreamResponseTooLargeException();
                }
                try (InputStream input = body.byteStream()) {
                    return this.readLimited(input);
                }
            }
        } catch (UpstreamRequestException e) {
            throw e;
        } catch (SocketTimeoutException e) {
            throw new UpstreamRequestException("upstream_timeout", e);
        } catch (UnknownHostException e) {
            throw new IllegalArgumentException("Unresolvable operations target",
                                               e);
        } catch (IOException e) {
            throw new UpstreamRequestException("upstream_unavailable", e);
        }
    }

    public static void validateTarget(URI target, Set<String> allowedOrigins) {
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
        String origin = scheme + "://" + normalizedHost(target) + ':' + port;
        if (allowedOrigins != null && !allowedOrigins.isEmpty() &&
            !allowedOrigins.contains(origin)) {
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

    public static String origin(URI target) {
        validateTarget(target, Set.of());
        return target.getScheme().toLowerCase(Locale.ROOT) + "://" +
               authority(target);
    }

    static URI resolveTarget(URI target) {
        validateTarget(target, Set.of());
        try {
            InetAddress[] addresses = InetAddress.getAllByName(target.getHost());
            return resolveTarget(target, addresses);
        } catch (UnknownHostException e) {
            throw new IllegalArgumentException("Unresolvable operations target",
                                               e);
        }
    }

    static URI resolveTarget(URI target, InetAddress[] addresses) {
        validateTarget(target, Set.of());
        validateResolvedAddresses(target.getHost(), addresses);
        return target;
    }

    static Dns pinnedDns(String expectedHost, InetAddress[] addresses) {
        List<InetAddress> pinned = Arrays.asList(addresses.clone());
        return hostname -> {
            if (!expectedHost.equalsIgnoreCase(hostname)) {
                throw new UnknownHostException("Unexpected operations host");
            }
            return pinned;
        };
    }

    static void validateResolvedAddresses(String requestedHost,
                                          InetAddress[] addresses) {
        if (addresses == null || addresses.length == 0) {
            throw new IllegalArgumentException("Unresolvable operations target");
        }
        boolean literal = isIpLiteral(requestedHost);
        for (InetAddress address : addresses) {
            if (address.isAnyLocalAddress() || address.isLinkLocalAddress() ||
                address.isMulticastAddress() ||
                address.isLoopbackAddress() && !literal) {
                throw new IllegalArgumentException("Untrusted operations address");
            }
        }
    }

    private static boolean isIpLiteral(String host) {
        if (host.indexOf(':') >= 0) {
            return true;
        }
        return host.matches("(?:\\d{1,3}\\.){3}\\d{1,3}");
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
