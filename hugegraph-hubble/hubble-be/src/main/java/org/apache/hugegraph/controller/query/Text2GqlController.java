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

package org.apache.hugegraph.controller.query;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.controller.BaseController;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.query.Text2GqlRequest;
import org.apache.hugegraph.entity.query.Text2GqlResult;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.handler.MessageSourceHandler;
import org.apache.hugegraph.service.query.Text2GqlSettingsService;
import org.apache.hugegraph.service.query.Text2GqlService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(Constant.API_VERSION + "graphspaces/{graphspace}/graphs/{graph}/text2gql")
public class Text2GqlController extends BaseController {

    @Autowired
    private Text2GqlService service;

    @Autowired
    private Text2GqlSettingsService settings;

    @Autowired
    private MessageSourceHandler messages;

    @Autowired
    @Qualifier("text2GqlHeartbeats")
    private TaskScheduler heartbeats;

    @PostMapping
    public Text2GqlResult generate(@PathVariable("graphspace") String graphSpace,
                                        @PathVariable("graph") String graph,
                                        @RequestBody Text2GqlRequest request) {
        HugeClient client = this.authClient(graphSpace, graph);
        return this.service.generate(client, this.resolveRequest(request));
    }

    @PostMapping(value = "stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@PathVariable("graphspace") String graphSpace,
                             @PathVariable("graph") String graph,
                             @RequestBody Text2GqlRequest request,
                             HttpServletResponse response) {
        HugeClient client = this.authClient(graphSpace, graph);
        HttpServletRequest servletRequest = this.getRequest();
        Text2GqlService.PreparedGeneration prepared;
        try {
            prepared = this.service.prepare(client, this.resolveRequest(request));
        } finally {
            // ResponseBodyAdvice does not own SseEmitter completion. No graph client escapes to callbacks.
            servletRequest.removeAttribute("hugeClient");
            client.close();
        }
        Map<String, String> safeMessages = new LinkedHashMap<>();
        for (String key : new String[]{"text2gql.model-failed", "text2gql.model-timeout",
                                       "text2gql.model-authentication-failed", "text2gql.model-rate-limited"}) {
            safeMessages.put(key, this.messages.getMessage(key));
        }
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("X-Accel-Buffering", "no");
        SseEmitter emitter = new SseEmitter(this.service.streamTimeoutMillis());
        StreamEvents events = new StreamEvents(emitter, Map.copyOf(safeMessages));
        emitter.onTimeout(events::timeout);
        emitter.onError(failure -> events.cancel());
        emitter.onCompletion(events::cancel);
        events.waiting();
        events.startHeartbeat(this.heartbeats);
        try {
            if (!events.finished.get()) {
                events.attach(this.service.stream(prepared, events));
            }
        } catch (RuntimeException failure) {
            events.cancel();
            throw failure;
        }
        return emitter;
    }

    private Text2GqlRequest resolveRequest(Text2GqlRequest request) {
        if (request == null) {
            throw new ExternalException("text2gql.invalid-request");
        }
        if (request.getLanguage() == null) {
            throw new ExternalException("text2gql.invalid-language");
        }
        if ("shared".equals(request.getSource())) {
            return this.settings.sharedRequest(request);
        }
        if (!"custom".equals(request.getSource())) {
            throw new ExternalException("text2gql.invalid-request");
        }
        this.settings.applyCustomPrompt(request);
        return request;
    }

    private static final class StreamEvents implements Text2GqlService.StreamListener {

        // Preparation/schema reads have finished before this stream's model timer starts.
        private final long startedNanos = System.nanoTime();
        private final SseEmitter emitter;
        private final Map<String, String> messages;
        private final AtomicBoolean finished = new AtomicBoolean();
        private final AtomicReference<Text2GqlService.StreamControl> control = new AtomicReference<>();
        private final AtomicReference<ScheduledFuture<?>> heartbeat = new AtomicReference<>();

        private StreamEvents(SseEmitter emitter, Map<String, String> messages) {
            this.emitter = emitter;
            this.messages = messages;
        }

        private void attach(Text2GqlService.StreamControl control) {
            this.control.set(control);
            if (this.finished.get()) {
                control.cancel();
            }
        }

        private void startHeartbeat(TaskScheduler scheduler) {
            ScheduledFuture<?> task = scheduler.scheduleAtFixedRate(() -> {
                if (!this.finished.get()) {
                    this.send(SseEmitter.event().comment("keep-alive"));
                }
            }, Instant.now().plusSeconds(2), Duration.ofSeconds(2));
            this.heartbeat.set(task);
            // Completion or a disconnect can race with scheduler registration.
            if (this.finished.get()) {
                this.stopHeartbeat();
            }
        }

        private void stopHeartbeat() {
            ScheduledFuture<?> task = this.heartbeat.getAndSet(null);
            if (task != null) {
                task.cancel(false);
            }
        }

        private void waiting() {
            this.send(Map.of("type", "waiting"));
        }

        @Override
        public void onDelta(String text) {
            if (!this.finished.get() && !this.send(Map.of("type", "delta", "text", text))) {
                throw new IllegalStateException("SSE connection closed");
            }
        }

        @Override
        public void onResult(Text2GqlResult result) {
            if (this.finished.compareAndSet(false, true)) {
                this.stopHeartbeat();
                this.send(Map.of("type", "result", "query", result.getQuery(),
                                 "language", result.getLanguage().value(), "valid", result.isValid(),
                                 "duration_ms", this.durationMillis()));
                this.emitter.complete();
            }
        }

        @Override
        public void onError(ExternalException failure) {
            if (this.finished.compareAndSet(false, true)) {
                this.stopHeartbeat();
                String message = this.messages.getOrDefault(failure.getMessage(),
                                                           this.messages.get("text2gql.model-failed"));
                this.send(Map.of("type", "error", "message", message, "status", failure.status(),
                                 "duration_ms", this.durationMillis()));
                this.emitter.complete();
            }
        }

        private long durationMillis() {
            return TimeUnit.NANOSECONDS.toMillis(Math.max(0L, System.nanoTime() - this.startedNanos));
        }

        private boolean send(Map<String, ?> event) {
            return this.send(SseEmitter.event().data(event, MediaType.APPLICATION_JSON));
        }

        private boolean send(SseEmitter.SseEventBuilder event) {
            try {
                this.emitter.send(event);
                return true;
            } catch (IOException | IllegalStateException ignored) {
                this.cancel();
                this.emitter.complete();
                return false;
            }
        }

        private void timeout() {
            this.stopHeartbeat();
            Text2GqlService.StreamControl current = this.control.get();
            if (current == null) {
                this.onError(new ExternalException(504, "text2gql.model-timeout"));
            } else {
                current.timeout();
            }
        }

        private void cancel() {
            this.finished.set(true);
            this.stopHeartbeat();
            Text2GqlService.StreamControl current = this.control.get();
            if (current != null) {
                current.cancel();
            }
        }
    }

    @GetMapping("config")
    public Map<String, Object> config(@PathVariable("graphspace") String graphSpace,
                                      @PathVariable("graph") String graph) {
        HugeClient client = this.authClient(graphSpace, graph);
        client.schema().getPropertyKeys();
        Map<String, Object> descriptor = new LinkedHashMap<>(this.settings.availability());
        descriptor.putAll(this.settings.promptSettings());
        descriptor.put("custom_available", true);
        return descriptor;
    }
}
