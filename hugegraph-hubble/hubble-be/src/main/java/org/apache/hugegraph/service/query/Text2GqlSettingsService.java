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

package org.apache.hugegraph.service.query;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Function;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.entity.enums.QueryLanguage;
import org.apache.hugegraph.entity.query.Text2GqlConfiguration;
import org.apache.hugegraph.entity.query.Text2GqlRequest;
import org.apache.hugegraph.entity.query.Text2GqlSettingsRequest;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.mapper.query.Text2GqlConfigMapper;
import org.apache.hugegraph.options.HubbleOptions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class Text2GqlSettingsService {

    private final HugeConfig config;
    private final Text2GqlConfigMapper mapper;
    private final Text2GqlSecretStore secrets;
    private final Function<String, String> environment;

    @Autowired
    public Text2GqlSettingsService(HugeConfig config, Text2GqlConfigMapper mapper,
                                   Text2GqlSecretStore secrets) {
        this(config, mapper, secrets, System::getenv);
    }

    Text2GqlSettingsService(HugeConfig config, Text2GqlConfigMapper mapper,
                            Text2GqlSecretStore secrets, Function<String, String> environment) {
        this.config = config;
        this.mapper = mapper;
        this.secrets = secrets;
        this.environment = environment;
    }

    public Map<String, Object> availability() {
        try {
            Snapshot current = this.current();
            if (!current.configuration.isEnabled()) {
                return Map.of("available", false, "reason", "not_configured");
            }
            Text2GqlRequest resolved = this.connection(current, "");
            return Map.of("available", true, "model", resolved.getModel());
        } catch (RuntimeException exception) {
            return Map.of("available", false, "reason", "unavailable");
        }
    }

    public Text2GqlRequest sharedRequest(Text2GqlRequest request) {
        if (request == null || !"shared".equals(request.getSource()) ||
            hasText(request.getBaseUrl()) || hasText(request.getModel()) || hasText(request.getApiKey()) ||
            hasText(request.getPrompt())) {
            throw new ExternalException("text2gql.shared.mixed-configuration");
        }
        Text2GqlPrompts.validate(request.getPrompt());
        Snapshot current = this.current();
        if (!current.configuration.isEnabled()) {
            throw new ExternalException(503, "text2gql.shared.not-configured");
        }
        if (request.getLanguage() == null) {
            throw new ExternalException("text2gql.invalid-language");
        }
        Text2GqlRequest resolved = this.connection(current, request.getQuestion());
        resolved.setLanguage(request.getLanguage());
        resolved.setRepair(request.getRepair());
        resolved.setPrompt(prompt(current.configuration, request.getLanguage()));
        return resolved;
    }

    /** Custom models use shared templates unless this request carries a temporary override. */
    public void applyCustomPrompt(Text2GqlRequest request) {
        Text2GqlPrompts.validate(request.getPrompt());
        if (!hasText(request.getPrompt())) {
            request.setPrompt(prompt(this.current().configuration, request.getLanguage()));
        }
    }

    /** Safe graph-context descriptor: templates are readable without exposing connection credentials. */
    public Map<String, Object> promptSettings() {
        return Map.of("prompts", prompts(this.current().configuration),
                      "default_prompts", Text2GqlPrompts.defaults());
    }

    /** Management descriptor. This deliberately never decrypts or serializes a secret. */
    public Map<String, Object> settings() {
        return this.descriptor(this.current());
    }

    /** Replace the complete snapshot in one statement; never merge a client URL with a server secret. */
    public synchronized Map<String, Object> save(Text2GqlSettingsRequest request) {
        if (request == null || request.getEnabled() == null) {
            throw new ExternalException("text2gql.shared.invalid-settings");
        }
        String type = optional(request.getConnectionType(), 16);
        if (!"openai".equals(type) && !"ollama".equals(type)) {
            throw new ExternalException("text2gql.shared.invalid-settings");
        }
        String baseUrl = optional(request.getBaseUrl(), 2048);
        String model = optional(request.getModel(), 256);
        if (!baseUrl.isEmpty()) {
            baseUrl = request.getEnabled() ? Text2GqlService.validateBaseUrl(baseUrl) : normalized(baseUrl);
        }
        if (request.getEnabled() && (baseUrl.isEmpty() || model.isEmpty())) {
            throw new ExternalException("text2gql.shared.invalid-settings");
        }
        String suppliedKey = apiKey(request.getApiKey());
        if (request.isClearApiKey() && !suppliedKey.isEmpty()) {
            throw new ExternalException("text2gql.shared.invalid-settings");
        }
        Snapshot previous = this.current();
        Map<String, String> suppliedPrompts = request.getPrompts();
        if (suppliedPrompts != null) {
            suppliedPrompts.values().forEach(Text2GqlPrompts::validate);
        }
        boolean sameUrl = baseUrl.equals(normalized(previous.configuration.getBaseUrl()));
        boolean previousHasKey = this.hasKey(previous);
        if (!sameUrl && previousHasKey && suppliedKey.isEmpty() && !request.isClearApiKey()) {
            throw new ExternalException("text2gql.shared.new-key-required");
        }
        String encrypted = "";
        if (!suppliedKey.isEmpty()) {
            encrypted = this.secrets.encrypt(suppliedKey);
        } else if (!request.isClearApiKey() && sameUrl && previousHasKey) {
            if (previous.managed) {
                encrypted = previous.configuration.getEncryptedApiKey();
                if (request.getEnabled()) {
                    this.secrets.decrypt(encrypted);
                }
            } else {
                try {
                    String deploymentKey = this.deploymentKey();
                    if (!deploymentKey.isEmpty()) {
                        encrypted = this.secrets.encrypt(deploymentKey);
                    }
                } catch (ExternalException exception) {
                    if (request.getEnabled()) {
                        throw exception;
                    }
                    // Closing an unusable deployment must not depend on recovering or encrypting its key.
                }
            }
        }
        if (request.getEnabled() && "openai".equals(type) && encrypted.isEmpty()) {
            throw new ExternalException("text2gql.shared.api-key-required");
        }
        Text2GqlConfiguration updated = new Text2GqlConfiguration();
        updated.setEnabled(request.getEnabled());
        updated.setConnectionType(type);
        updated.setBaseUrl(baseUrl);
        updated.setModel(model);
        updated.setEncryptedApiKey(encrypted);
        updated.setGremlinPrompt(updatedPrompt(previous.configuration, suppliedPrompts, QueryLanguage.GREMLIN));
        updated.setCypherPrompt(updatedPrompt(previous.configuration, suppliedPrompts, QueryLanguage.CYPHER));
        try {
            this.mapper.save(updated);
        } catch (RuntimeException exception) {
            throw new ExternalException(503, "text2gql.shared.settings-unavailable");
        }
        return this.descriptor(new Snapshot(updated, true));
    }

    private Snapshot current() {
        Text2GqlConfiguration managed;
        try {
            managed = this.mapper.current();
        } catch (RuntimeException exception) {
            throw new ExternalException(503, "text2gql.shared.settings-unavailable");
        }
        if (managed != null) {
            return new Snapshot(managed, true);
        }
        Text2GqlConfiguration deployment = new Text2GqlConfiguration();
        deployment.setEnabled(Boolean.TRUE.equals(this.config.get(HubbleOptions.TEXT2GQL_SHARED_ENABLED)));
        deployment.setConnectionType(this.config.get(HubbleOptions.TEXT2GQL_SHARED_CONNECTION_TYPE));
        deployment.setBaseUrl(this.config.get(HubbleOptions.TEXT2GQL_SHARED_BASE_URL));
        deployment.setModel(this.config.get(HubbleOptions.TEXT2GQL_SHARED_MODEL));
        return new Snapshot(deployment, false);
    }

    private Map<String, Object> descriptor(Snapshot snapshot) {
        Text2GqlConfiguration configuration = snapshot.configuration;
        Map<String, Object> descriptor = new LinkedHashMap<>();
        descriptor.put("prompts", prompts(configuration));
        descriptor.put("default_prompts", Text2GqlPrompts.defaults());
        descriptor.put("enabled", configuration.isEnabled());
        descriptor.put("connection_type", hasText(configuration.getConnectionType()) ?
                                          configuration.getConnectionType() : "openai");
        descriptor.put("base_url", normalized(configuration.getBaseUrl()));
        descriptor.put("model", configuration.getModel() == null ? "" : configuration.getModel());
        descriptor.put("has_api_key", this.hasKey(snapshot));
        descriptor.put("source", snapshot.managed ? "managed" : "deployment");
        return descriptor;
    }

    private static Map<String, String> prompts(Text2GqlConfiguration configuration) {
        return Map.of("gremlin", prompt(configuration, QueryLanguage.GREMLIN),
                      "cypher", prompt(configuration, QueryLanguage.CYPHER));
    }

    private static String prompt(Text2GqlConfiguration configuration, QueryLanguage language) {
        String stored = language == QueryLanguage.GREMLIN ?
                        configuration.getGremlinPrompt() : configuration.getCypherPrompt();
        return Text2GqlPrompts.effective(language, stored);
    }

    private static String updatedPrompt(Text2GqlConfiguration previous, Map<String, String> supplied,
                                        QueryLanguage language) {
        if (supplied == null || !supplied.containsKey(language.value())) {
            return language == QueryLanguage.GREMLIN ? previous.getGremlinPrompt() : previous.getCypherPrompt();
        }
        return Text2GqlPrompts.stored(language, supplied.get(language.value()));
    }

    private boolean hasKey(Snapshot snapshot) {
        if (snapshot.managed) {
            return hasText(snapshot.configuration.getEncryptedApiKey());
        }
        if (hasText(this.environment.apply("HUBBLE_TEXT2GQL_API_KEY"))) {
            return true;
        }
        String file = this.config.get(HubbleOptions.TEXT2GQL_SHARED_API_KEY_FILE);
        if (!hasText(file)) {
            return false;
        }
        try {
            Path path = Path.of(file);
            return Files.isRegularFile(path) && Files.size(path) > 0;
        } catch (IOException | RuntimeException exception) {
            return false;
        }
    }

    private Text2GqlRequest connection(Snapshot snapshot, String question) {
        try {
            Text2GqlConfiguration configuration = snapshot.configuration;
            String type = configuration.getConnectionType();
            if (!"openai".equals(type) && !"ollama".equals(type)) {
                throw new IllegalArgumentException();
            }
            String baseUrl = optional(configuration.getBaseUrl(), 2048);
            String model = optional(configuration.getModel(), 256);
            if (baseUrl.isEmpty() || model.isEmpty()) {
                throw new IllegalArgumentException();
            }
            baseUrl = Text2GqlService.validateBaseUrl(baseUrl);
            String key = snapshot.managed ?
                         (hasText(configuration.getEncryptedApiKey()) ?
                          this.secrets.decrypt(configuration.getEncryptedApiKey()) : "") : this.deploymentKey();
            if ("openai".equals(type) && key.isEmpty()) {
                throw new IllegalArgumentException();
            }
            Text2GqlRequest resolved = new Text2GqlRequest();
            resolved.setQuestion(question);
            resolved.setBaseUrl(baseUrl);
            resolved.setModel(model);
            resolved.setApiKey(key);
            return resolved;
        } catch (RuntimeException exception) {
            throw new ExternalException(503, "text2gql.shared.unavailable");
        }
    }

    private String deploymentKey() {
        try {
            String environmentKey = this.environment.apply("HUBBLE_TEXT2GQL_API_KEY");
            if (hasText(environmentKey)) {
                return apiKey(environmentKey);
            }
            String file = this.config.get(HubbleOptions.TEXT2GQL_SHARED_API_KEY_FILE);
            if (!hasText(file)) {
                return "";
            }
            Path path = Path.of(file);
            if (!Files.isRegularFile(path) || Files.size(path) > 16384) {
                throw new IllegalArgumentException();
            }
            return apiKey(Files.readString(path, StandardCharsets.UTF_8).trim());
        } catch (IOException | RuntimeException exception) {
            throw new ExternalException(503, "text2gql.shared.secret-unavailable");
        }
    }

    private static String apiKey(String key) {
        if (key == null) {
            return "";
        }
        if (key.length() > 4096 || key.chars().anyMatch(Character::isISOControl)) {
            throw new ExternalException("text2gql.shared.invalid-settings");
        }
        return key.trim();
    }

    private static String optional(String value, int limit) {
        if (value == null) {
            return "";
        }
        if (value.length() > limit) {
            throw new ExternalException("text2gql.shared.invalid-settings");
        }
        return value.trim();
    }

    private static String normalized(String value) {
        return value == null ? "" : Text2GqlService.stripTrailingSlashes(value.trim());
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static final class Snapshot {

        private final Text2GqlConfiguration configuration;
        private final boolean managed;

        private Snapshot(Text2GqlConfiguration configuration, boolean managed) {
            this.configuration = configuration;
            this.managed = managed;
        }
    }
}
