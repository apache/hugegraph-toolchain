/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to you under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hugegraph.service.query;

import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.Proxy;
import java.net.UnknownHostException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import dev.langchain4j.exception.HttpException;
import dev.langchain4j.http.client.HttpClient;
import dev.langchain4j.http.client.HttpClientBuilder;
import dev.langchain4j.http.client.HttpMethod;
import dev.langchain4j.http.client.HttpRequest;
import dev.langchain4j.http.client.SuccessfulHttpResponse;
import dev.langchain4j.http.client.sse.ServerSentEvent;
import dev.langchain4j.http.client.sse.ServerSentEventContext;
import dev.langchain4j.http.client.sse.ServerSentEventListener;
import dev.langchain4j.http.client.sse.ServerSentEventParser;
import dev.langchain4j.http.client.sse.ServerSentEventParsingHandle;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.ConnectionPool;
import okhttp3.Headers;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * LangChain4j HTTP transport that pins each connection to IP addresses
 * resolved and validated during OkHttp's DNS lookup.
 */
public final class Text2GqlHttpClient implements HttpClientBuilder {

    static final int MAX_RESPONSE_BODY_BYTES = 2 * 1024 * 1024;

    private static final MediaType DEFAULT_CONTENT_TYPE =
            MediaType.parse("application/json; charset=utf-8");

    private final DnsResolver resolver;
    private final AtomicReference<Call> streamingCall = new AtomicReference<>();
    private final AtomicBoolean cancelled = new AtomicBoolean();
    private Duration connectTimeout = Duration.ofSeconds(10);
    private Duration readTimeout = Duration.ofSeconds(60);

    public Text2GqlHttpClient(DnsResolver resolver) {
        this.resolver = Objects.requireNonNull(resolver, "resolver");
    }

    @Override
    public Duration connectTimeout() {
        return this.connectTimeout;
    }

    @Override
    public HttpClientBuilder connectTimeout(Duration timeout) {
        this.connectTimeout = Objects.requireNonNull(timeout, "timeout");
        return this;
    }

    @Override
    public Duration readTimeout() {
        return this.readTimeout;
    }

    @Override
    public HttpClientBuilder readTimeout(Duration timeout) {
        this.readTimeout = Objects.requireNonNull(timeout, "timeout");
        return this;
    }

    @Override
    public HttpClient build() {
        OkHttpClient client = new OkHttpClient.Builder()
                .dns(host -> resolveAndValidate(host))
                // A proxy resolves the target host remotely, bypassing our pinned DNS result.
                .proxy(Proxy.NO_PROXY)
                .connectionPool(new ConnectionPool(0, 1, TimeUnit.SECONDS))
                .followRedirects(false)
                .followSslRedirects(false)
                .retryOnConnectionFailure(false)
                .connectTimeout(this.connectTimeout)
                .readTimeout(this.readTimeout)
                .callTimeout(this.readTimeout)
                .build();
        return new OkHttpTransport(client, this.streamingCall, this.cancelled);
    }

    /** Cancel streaming work owned by this request-scoped builder, including before the first byte. */
    public void cancel() {
        this.cancelled.set(true);
        Call call = this.streamingCall.get();
        if (call != null) {
            call.cancel();
        }
    }

    private List<InetAddress> resolveAndValidate(String host) throws UnknownHostException {
        List<InetAddress> addresses;
        try {
            addresses = this.resolver.resolveAndValidate(host);
        } catch (UnknownHostException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            UnknownHostException rejected = new UnknownHostException("Host resolution was rejected");
            rejected.initCause(exception);
            throw rejected;
        }
        if (addresses == null || addresses.isEmpty()) {
            throw new UnknownHostException("Host resolution returned no approved addresses");
        }
        try {
            // OkHttp connects directly to this immutable snapshot. The request URL keeps
            // its original host, which remains the HTTP Host and TLS SNI name.
            return List.copyOf(addresses);
        } catch (NullPointerException exception) {
            UnknownHostException rejected = new UnknownHostException("Host resolution returned an invalid address");
            rejected.initCause(exception);
            throw rejected;
        }
    }

    @FunctionalInterface
    public interface DnsResolver {

        /**
         * Resolve {@code host} and validate every returned address at connection time.
         * The returned addresses are used directly for this connection.
         */
        List<InetAddress> resolveAndValidate(String host) throws UnknownHostException;
    }

    private static final class OkHttpTransport implements HttpClient {

        private final OkHttpClient client;
        private final AtomicReference<Call> streamingCall;
        private final AtomicBoolean cancelled;

        private OkHttpTransport(OkHttpClient client, AtomicReference<Call> streamingCall,
                                AtomicBoolean cancelled) {
            this.client = client;
            this.streamingCall = streamingCall;
            this.cancelled = cancelled;
        }

        @Override
        public SuccessfulHttpResponse execute(HttpRequest request) {
            Request okHttpRequest = toOkHttpRequest(request);
            try (Response response = this.client.newCall(okHttpRequest).execute()) {
                ResponseBody responseBody = response.body();
                int statusCode = response.code();
                boolean successful = response.isSuccessful();
                byte[] body;
                try {
                    body = readBoundedBody(responseBody, successful);
                } catch (ResponseBodyTooLargeException exception) {
                    if (successful) {
                        throw new IllegalStateException("Upstream response exceeds the size limit");
                    }
                    throw new HttpException(statusCode, "Upstream error response exceeds the size limit");
                }
                if (!successful) {
                    throw new HttpException(statusCode, "Upstream HTTP request failed");
                }
                return SuccessfulHttpResponse.builder()
                        .statusCode(statusCode)
                        .headers(response.headers().toMultimap())
                        .body(body)
                        .build();
            } catch (IOException exception) {
                // Keep SocketTimeoutException in the cause chain for Hubble's 504 mapping.
                throw new RuntimeException("HTTP request failed", exception);
            }
        }

        private static byte[] readBoundedBody(ResponseBody responseBody, boolean retain)
                throws IOException {
            if (responseBody == null) {
                return new byte[0];
            }
            if (responseBody.contentLength() > MAX_RESPONSE_BODY_BYTES) {
                throw new ResponseBodyTooLargeException();
            }

            long declaredLength = responseBody.contentLength();
            int initialCapacity = declaredLength < 0 ? 8192 :
                                  (int) Math.min(declaredLength, 8192);
            ByteArrayOutputStream output = retain ? new ByteArrayOutputStream(initialCapacity) : null;
            byte[] buffer = new byte[8192];
            int total = 0;
            try (InputStream input = responseBody.byteStream()) {
                while (total < MAX_RESPONSE_BODY_BYTES) {
                    int requested = Math.min(buffer.length, MAX_RESPONSE_BODY_BYTES - total);
                    int count = input.read(buffer, 0, requested);
                    if (count < 0) {
                        return retain ? output.toByteArray() : new byte[0];
                    }
                    if (count == 0) {
                        continue;
                    }
                    if (retain) {
                        output.write(buffer, 0, count);
                    }
                    total += count;
                }

                // Read one sentinel byte to distinguish an exact-limit body from an
                // oversized body without buffering or processing the rest of it.
                if (input.read() >= 0) {
                    throw new ResponseBodyTooLargeException();
                }
                return retain ? output.toByteArray() : new byte[0];
            }
        }

        @Override
        public void execute(HttpRequest request, ServerSentEventParser parser,
                            ServerSentEventListener listener) {
            Objects.requireNonNull(parser, "parser");
            Objects.requireNonNull(listener, "listener");
            Call call = this.client.newCall(toOkHttpRequest(request));
            if (!this.streamingCall.compareAndSet(null, call)) {
                throw new IllegalStateException("A streaming request is already active");
            }
            if (this.cancelled.get()) {
                call.cancel();
            }
            StreamListener streamListener = new StreamListener(listener, call);
            call.enqueue(new Callback() {
                @Override
                public void onFailure(Call failedCall, IOException exception) {
                    streamingCall.compareAndSet(call, null);
                    streamListener.onError(exception);
                }

                @Override
                public void onResponse(Call completedCall, Response response) {
                    try (response) {
                        if (!response.isSuccessful()) {
                            // Do not read, retain or expose an upstream error body.
                            throw new HttpException(response.code(), "Upstream HTTP request failed");
                        }
                        ResponseBody body = response.body();
                        if (body == null) {
                            throw new IllegalStateException("Upstream returned an empty response");
                        }
                        if (body.contentLength() > MAX_RESPONSE_BODY_BYTES) {
                            throw new ResponseBodyTooLargeException();
                        }
                        listener.onOpen(SuccessfulHttpResponse.builder()
                                .statusCode(response.code())
                                .headers(response.headers().toMultimap())
                                .build());
                        try (InputStream input = new BoundedInputStream(body.byteStream())) {
                            parser.parse(input, streamListener);
                        }
                        streamListener.onClose();
                    } catch (Exception exception) {
                        streamListener.onError(exception);
                    } finally {
                        streamingCall.compareAndSet(call, null);
                    }
                }
            });
        }

        private static final class StreamListener implements ServerSentEventListener {

            private final ServerSentEventListener delegate;
            private final Call call;
            private final AtomicBoolean terminal = new AtomicBoolean();

            private StreamListener(ServerSentEventListener delegate, Call call) {
                this.delegate = delegate;
                this.call = call;
            }

            @Override
            public void onEvent(ServerSentEvent event, ServerSentEventContext context) {
                if (this.terminal.get() || this.call.isCanceled()) {
                    return;
                }
                ServerSentEventParsingHandle handle = context.parsingHandle();
                ServerSentEventContext cancellableContext = new ServerSentEventContext(
                        new ServerSentEventParsingHandle() {
                            @Override
                            public void cancel() {
                                call.cancel();
                                handle.cancel();
                            }

                            @Override
                            public boolean isCancelled() {
                                return call.isCanceled() || handle.isCancelled();
                            }
                        });
                try {
                    this.delegate.onEvent(event, cancellableContext);
                } catch (Exception exception) {
                    // The SDK parser deliberately suppresses listener exceptions. Stop
                    // the socket here so a failed consumer cannot keep reading tokens.
                    this.onError(exception);
                    cancellableContext.parsingHandle().cancel();
                }
            }

            @Override
            public void onError(Throwable exception) {
                if (this.terminal.compareAndSet(false, true)) {
                    this.call.cancel();
                    try {
                        this.delegate.onError(exception);
                    } catch (Exception ignored) {
                        // A failing terminal callback must not leak the connection.
                    }
                }
            }

            @Override
            public void onClose() {
                if (this.terminal.compareAndSet(false, true)) {
                    this.delegate.onClose();
                }
            }
        }

        private static final class BoundedInputStream extends FilterInputStream {

            private int remaining = MAX_RESPONSE_BODY_BYTES;

            private BoundedInputStream(InputStream input) {
                super(input);
            }

            @Override
            public int read() throws IOException {
                int value = this.in.read();
                if (value >= 0) {
                    if (this.remaining == 0) {
                        throw new ResponseBodyTooLargeException();
                    }
                    this.remaining--;
                }
                return value;
            }

            @Override
            public int read(byte[] buffer, int offset, int length) throws IOException {
                if (length == 0) {
                    return 0;
                }
                if (this.remaining == 0) {
                    return this.read();
                }
                int count = this.in.read(buffer, offset, Math.min(length, this.remaining));
                if (count > 0) {
                    this.remaining -= count;
                }
                return count;
            }
        }

        private static Request toOkHttpRequest(HttpRequest request) {
            Objects.requireNonNull(request, "request");
            if (!request.formDataFields().isEmpty() || !request.formDataFiles().isEmpty()) {
                throw new UnsupportedOperationException("Form data is not supported");
            }

            Headers.Builder headers = new Headers.Builder();
            for (Map.Entry<String, List<String>> entry : request.headers().entrySet()) {
                for (String value : entry.getValue()) {
                    headers.add(entry.getKey(), value);
                }
            }

            RequestBody body = null;
            String requestBody = request.body();
            if (requestBody != null) {
                String contentType = header(request.headers(), "Content-Type");
                MediaType mediaType = contentType == null ? DEFAULT_CONTENT_TYPE : MediaType.parse(contentType);
                body = RequestBody.create(requestBody, mediaType);
            } else if (request.method() == HttpMethod.POST) {
                body = RequestBody.create(new byte[0], DEFAULT_CONTENT_TYPE);
            }

            return new Request.Builder()
                    .url(request.url())
                    .headers(headers.build())
                    .method(request.method().name(), body)
                    .build();
        }

        private static String header(Map<String, List<String>> headers, String name) {
            for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
                if (name.equalsIgnoreCase(entry.getKey()) && !entry.getValue().isEmpty()) {
                    return entry.getValue().get(0);
                }
            }
            return null;
        }

        private static final class ResponseBodyTooLargeException extends IOException {

            private static final long serialVersionUID = 1L;

            private ResponseBodyTooLargeException() {
                super("Upstream response exceeds the size limit");
            }
        }
    }
}
