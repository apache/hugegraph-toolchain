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

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.nio.file.Files;
import java.nio.file.AccessDeniedException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.entity.enums.QueryLanguage;
import org.apache.hugegraph.entity.query.Text2GqlConfiguration;
import org.apache.hugegraph.entity.query.Text2GqlRequest;
import org.apache.hugegraph.entity.query.Text2GqlSettingsRequest;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.mapper.query.Text2GqlConfigMapper;
import org.apache.hugegraph.options.HubbleOptions;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

import com.fasterxml.jackson.databind.ObjectMapper;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class Text2GqlSettingsServiceTest {

    @Rule
    public TemporaryFolder temporary = new TemporaryFolder();

    private HugeConfig config;
    private Text2GqlConfigMapper mapper;
    private AtomicReference<Text2GqlConfiguration> stored;
    private Text2GqlSettingsService service;
    private Path masterFile;

    @Before
    public void setup() {
        this.config = Mockito.mock(HugeConfig.class);
        Mockito.when(this.config.get(HubbleOptions.TEXT2GQL_SHARED_ENABLED)).thenReturn(false);
        Mockito.when(this.config.get(HubbleOptions.TEXT2GQL_SHARED_CONNECTION_TYPE)).thenReturn("openai");
        Mockito.when(this.config.get(HubbleOptions.TEXT2GQL_SHARED_BASE_URL)).thenReturn("http://127.0.0.1:11434/v1");
        Mockito.when(this.config.get(HubbleOptions.TEXT2GQL_SHARED_MODEL)).thenReturn("deployment-model");
        Mockito.when(this.config.get(HubbleOptions.TEXT2GQL_SHARED_API_KEY_FILE)).thenReturn("");
        this.mapper = Mockito.mock(Text2GqlConfigMapper.class);
        this.stored = new AtomicReference<>();
        Mockito.when(this.mapper.current()).thenAnswer(ignored -> this.stored.get());
        Mockito.when(this.mapper.save(Mockito.any())).thenAnswer(invocation -> {
            this.stored.set(invocation.getArgument(0));
            return 1;
        });
        this.masterFile = this.temporary.getRoot().toPath().resolve("master.key");
        this.service = this.service(Map.of());
    }

    @Test
    public void testManagedKeyIsEncryptedAndDescriptorsDoNotRevealSecrets() throws Exception {
        assertFalse(Files.exists(this.masterFile));
        assertEquals("deployment", this.service.settings().get("source"));
        assertEquals(false, this.service.settings().get("enabled"));
        Map<String, Object> descriptor = this.service.save(settings("openai", "private-model-key"));
        assertEquals("managed", descriptor.get("source"));
        assertEquals(true, descriptor.get("has_api_key"));
        assertFalse(new ObjectMapper().writeValueAsString(descriptor).contains("private-model-key"));
        assertFalse(descriptor.containsKey("api_key"));
        assertFalse(this.stored.get().getEncryptedApiKey().contains("private-model-key"));
        Text2GqlRequest resolved = this.service.sharedRequest(shared());
        assertEquals("private-model-key", resolved.getApiKey());
        assertEquals("http://127.0.0.1:11434/v1", resolved.getBaseUrl());
        assertEquals("managed-model", resolved.getModel());
        assertEquals("Find people", resolved.getQuestion());
        assertEquals(Map.of("available", true, "model", "managed-model"), this.service.availability());
        assertFalse(new ObjectMapper().writeValueAsString(this.service.availability()).contains("base_url"));
    }

    @Test
    public void testOmittedOrEmptyKeyPreservesKeyOnlyForSameUrlAndModelCanChange() {
        this.service.save(settings("openai", "private-model-key"));
        String encrypted = this.stored.get().getEncryptedApiKey();
        Text2GqlSettingsRequest changed = settings("openai", null);
        changed.setModel("second-model");
        this.service.save(changed);
        assertEquals(encrypted, this.stored.get().getEncryptedApiKey());
        changed.setApiKey("");
        this.service.save(changed);
        assertEquals("private-model-key", this.service.sharedRequest(shared()).getApiKey());
        assertEquals("second-model", this.service.sharedRequest(shared()).getModel());
    }

    @Test
    public void testChangingUrlNeverReusesKeyAndOllamaRequiresExplicitClear() {
        this.service.save(settings("openai", "private-model-key"));
        Text2GqlSettingsRequest changed = settings("ollama", null);
        changed.setBaseUrl("http://127.0.0.1:11435/v1");
        assertEquals("text2gql.shared.new-key-required", failure(() -> this.service.save(changed)).getMessage());
        assertEquals("http://127.0.0.1:11434/v1", this.stored.get().getBaseUrl());
        changed.setClearApiKey(true);
        this.service.save(changed);
        assertEquals(false, this.service.settings().get("has_api_key"));
        assertEquals("", this.service.sharedRequest(shared()).getApiKey());
        assertEquals("http://127.0.0.1:11435/v1", this.service.sharedRequest(shared()).getBaseUrl());
    }

    @Test
    public void testManagedDisabledNeverFallsBackToEnabledDeployment() {
        Mockito.when(this.config.get(HubbleOptions.TEXT2GQL_SHARED_ENABLED)).thenReturn(true);
        this.service = this.service(Map.of("HUBBLE_TEXT2GQL_API_KEY", "deployment-secret"));
        assertEquals(true, this.service.availability().get("available"));
        Text2GqlSettingsRequest disabled = settings("openai", null);
        disabled.setEnabled(false);
        this.service.save(disabled);
        assertEquals("managed", this.service.settings().get("source"));
        assertEquals(Map.of("available", false, "reason", "not_configured"), this.service.availability());
        assertEquals(503, failure(() -> this.service.sharedRequest(shared())).status());
    }

    @Test
    public void testDeploymentSecretFileAndEnvironmentPrecedenceAndSafeAdoption() throws Exception {
        Path secret = this.temporary.getRoot().toPath().resolve("api-key.txt");
        Files.writeString(secret, "file-secret\n");
        Mockito.when(this.config.get(HubbleOptions.TEXT2GQL_SHARED_API_KEY_FILE)).thenReturn(secret.toString());
        Mockito.when(this.config.get(HubbleOptions.TEXT2GQL_SHARED_ENABLED)).thenReturn(true);
        assertEquals("file-secret", this.service.sharedRequest(shared()).getApiKey());
        this.service = this.service(Map.of("HUBBLE_TEXT2GQL_API_KEY", "environment-secret"));
        assertEquals("environment-secret", this.service.sharedRequest(shared()).getApiKey());
        this.service.save(settings("openai", null));
        assertEquals("environment-secret", this.service.sharedRequest(shared()).getApiKey());
        assertTrue(this.stored.get().getEncryptedApiKey().startsWith("v1:"));
    }

    @Test
    public void testManagedModelIsAvailableAfterAuthorizedSaveWithoutAnonymousOptIn() {
        assertEquals(Map.of("available", false, "reason", "not_configured"), this.service.availability());
        this.service.save(settings("ollama", null));
        assertEquals(true, this.service.availability().get("available"));
        assertEquals("managed-model", this.service.sharedRequest(shared()).getModel());
    }

    @Test
    public void testProbeConnectionResolutionCannotModifySavedSettingsOrEnableDisabledDefaults() {
        assertEquals(503, failure(() -> this.service.sharedRequest(shared())).status());
        this.service.save(settings("openai", "private-model-key"));
        org.apache.hugegraph.entity.query.Text2GqlConfiguration before = this.stored.get();
        Mockito.clearInvocations(this.mapper);
        Text2GqlRequest resolved = this.service.sharedRequest(shared());
        assertEquals("private-model-key", resolved.getApiKey());
        org.junit.Assert.assertSame(before, this.stored.get());
        Mockito.verify(this.mapper).current();
        Mockito.verifyNoMoreInteractions(this.mapper);
        Text2GqlSettingsRequest disabled = settings("openai", null);
        disabled.setEnabled(false);
        this.service.save(disabled);
        Mockito.clearInvocations(this.mapper);
        assertEquals(503, failure(() -> this.service.sharedRequest(shared())).status());
        Mockito.verify(this.mapper).current();
        Mockito.verifyNoMoreInteractions(this.mapper);
    }

    @Test
    public void testSharedRequestsCannotOverrideServerConnectionOrSecret() {
        this.service.save(settings("openai", "private-model-key"));
        for (String field : new String[]{"url", "model", "key"}) {
            Text2GqlRequest request = shared();
            if ("url".equals(field)) {
                request.setBaseUrl("http://127.0.0.1:9999/v1");
            } else if ("model".equals(field)) {
                request.setModel("foreign-model");
            } else {
                request.setApiKey("foreign-secret");
            }
            assertEquals(400, failure(() -> this.service.sharedRequest(request)).status());
        }
    }

    @Test
    public void testMissingMasterFailsClosedAndDoesNotGenerateReplacement() throws Exception {
        this.service.save(settings("openai", "private-model-key"));
        Files.delete(this.masterFile);
        assertEquals(Map.of("available", false, "reason", "unavailable"), this.service.availability());
        assertEquals(503, failure(() -> this.service.sharedRequest(shared())).status());
        assertFalse(Files.exists(this.masterFile));
        assertEquals("text2gql.shared.secret-unavailable",
                     failure(() -> this.service.save(settings("openai", null))).getMessage());
        assertFalse(Files.exists(this.masterFile));
    }

    @Test
    public void testClearAndReplaceAreExplicitAndOpenAiNeedsAKey() {
        assertEquals(400, failure(() -> this.service.save(settings("openai", null))).status());
        Text2GqlSettingsRequest request = settings("openai", "private-model-key");
        request.setClearApiKey(true);
        assertEquals(400, failure(() -> this.service.save(request)).status());
        request.setApiKey(null);
        request.setEnabled(false);
        request.setBaseUrl("");
        request.setModel("");
        this.service.save(request);
        assertEquals(false, this.service.settings().get("enabled"));
        assertEquals("", this.stored.get().getEncryptedApiKey());
        assertFalse(Files.exists(this.masterFile));
    }

    @Test
    public void testDatabaseErrorsAreSafeAndDoNotActivateDeploymentFallback() {
        Mockito.when(this.config.get(HubbleOptions.TEXT2GQL_SHARED_ENABLED)).thenReturn(true);
        Mockito.when(this.mapper.current()).thenThrow(new IllegalStateException("private database error"));
        assertEquals(Map.of("available", false, "reason", "unavailable"), this.service.availability());
        ExternalException failure = failure(() -> this.service.settings());
        assertEquals(503, failure.status());
        assertEquals("text2gql.shared.settings-unavailable", failure.getMessage());
        assertNull(failure.getCause());
    }

    @Test
    public void testEmptyDeploymentSecretCannotBeAdoptedAsAnEnabledOpenAiKey() throws Exception {
        Path secret = this.temporary.getRoot().toPath().resolve("empty-api-key.txt");
        Files.writeString(secret, "\n \n");
        Mockito.when(this.config.get(HubbleOptions.TEXT2GQL_SHARED_API_KEY_FILE)).thenReturn(secret.toString());
        assertEquals("text2gql.shared.api-key-required",
                     failure(() -> this.service.save(settings("openai", null))).getMessage());
        assertNull(this.stored.get());
        assertFalse(Files.exists(this.masterFile));
    }

    @Test
    public void testUnresolvableModelEndpointCanBeDisabledButCannotBeEnabled() {
        this.service.save(settings("openai", "private-model-key"));
        String encrypted = this.stored.get().getEncryptedApiKey();
        String offlineHost = "offline.text2gql.test";
        String offlineUrl = "https://" + offlineHost + "/v1";
        this.stored.get().setBaseUrl(offlineUrl);
        Text2GqlSettingsRequest request = settings("openai", null);
        request.setBaseUrl(offlineUrl + "/");
        try (MockedStatic<InetAddress> dns = Mockito.mockStatic(InetAddress.class)) {
            dns.when(() -> InetAddress.getAllByName(offlineHost)).thenThrow(new UnknownHostException("offline"));
            request.setEnabled(false);
            this.service.save(request);
            assertFalse(this.stored.get().isEnabled());
            assertEquals(offlineUrl, this.stored.get().getBaseUrl());
            assertEquals(encrypted, this.stored.get().getEncryptedApiKey());
            assertEquals(Map.of("available", false, "reason", "not_configured"), this.service.availability());
            dns.verifyNoInteractions();
            request.setEnabled(true);
            assertEquals("text2gql.invalid-base-url", failure(() -> this.service.save(request)).getMessage());
            assertFalse(this.stored.get().isEnabled());
            dns.verify(() -> InetAddress.getAllByName(offlineHost));
        }
    }

    @Test
    public void testSharedModelPreservesRequestedQueryLanguageAndRepair() {
        this.service.save(settings("openai", "private-model-key"));
        Text2GqlRequest question = shared();
        question.setLanguage(QueryLanguage.CYPHER);
        Text2GqlRequest.Repair repair = new Text2GqlRequest.Repair("MATCH (n) RETURN x", "Unknown variable x");
        question.setRepair(repair);
        Text2GqlRequest resolved = this.service.sharedRequest(question);
        assertEquals(QueryLanguage.CYPHER, resolved.getLanguage());
        org.junit.Assert.assertSame(repair, resolved.getRepair());
        assertEquals("private-model-key", resolved.getApiKey());
    }

    @Test
    public void testOversizedDeploymentSecretCannotPreventDisabling() throws Exception {
        Path file = this.temporary.getRoot().toPath().resolve("oversized-api-key.txt");
        Files.writeString(file, "x".repeat(16385));
        Mockito.when(this.config.get(HubbleOptions.TEXT2GQL_SHARED_ENABLED)).thenReturn(true);
        Mockito.when(this.config.get(HubbleOptions.TEXT2GQL_SHARED_API_KEY_FILE)).thenReturn(file.toString());
        Text2GqlSettingsRequest request = settings("openai", null);
        assertEquals(503, failure(() -> this.service.save(request)).status());
        assertNull(this.stored.get());
        request.setEnabled(false);
        assertEquals(false, this.service.save(request).get("has_api_key"));
        assertFalse(this.stored.get().isEnabled());
        assertEquals("", this.stored.get().getEncryptedApiKey());
        assertEquals(Map.of("available", false, "reason", "not_configured"), this.service.availability());
        assertFalse(Files.exists(this.masterFile));
    }

    @Test
    public void testUnreadableDeploymentSecretCannotPreventDisabling() throws Exception {
        Path file = this.temporary.getRoot().toPath().resolve("unreadable-api-key.txt");
        Files.writeString(file, "private-model-key");
        Mockito.when(this.config.get(HubbleOptions.TEXT2GQL_SHARED_ENABLED)).thenReturn(true);
        Mockito.when(this.config.get(HubbleOptions.TEXT2GQL_SHARED_API_KEY_FILE)).thenReturn(file.toString());
        Text2GqlSettingsRequest request = settings("openai", null);
        try (MockedStatic<Files> files = Mockito.mockStatic(Files.class, Mockito.CALLS_REAL_METHODS)) {
            files.when(() -> Files.readString(file, StandardCharsets.UTF_8))
                 .thenThrow(new AccessDeniedException("unreadable fixture"));
            assertEquals(503, failure(() -> this.service.save(request)).status());
            assertNull(this.stored.get());
            request.setEnabled(false);
            assertEquals(false, this.service.save(request).get("has_api_key"));
            assertFalse(this.stored.get().isEnabled());
            assertEquals("", this.stored.get().getEncryptedApiKey());
            assertEquals(Map.of("available", false, "reason", "not_configured"), this.service.availability());
        }
        assertFalse(Files.exists(this.masterFile));
    }

    @Test
    public void testSharedAndTemporaryTemplatesAreSeparateAndResettable() throws Exception {
        Map<String, String> defaults = Text2GqlPrompts.defaults();
        assertEquals(defaults, this.service.promptSettings().get("prompts"));
        Text2GqlSettingsRequest saved = settings("openai", "private-model-key");
        saved.setPrompts(Map.of("gremlin", "Shared Gremlin policy", "cypher", "Shared Cypher policy"));
        this.service.save(saved);
        String encrypted = this.stored.get().getEncryptedApiKey();
        assertEquals("Shared Gremlin policy", this.service.sharedRequest(shared()).getPrompt());
        Text2GqlRequest cypher = shared();
        cypher.setLanguage(QueryLanguage.CYPHER);
        assertEquals("Shared Cypher policy", this.service.sharedRequest(cypher).getPrompt());
        this.service.save(settings("openai", null));
        assertEquals("Shared Gremlin policy", this.stored.get().getGremlinPrompt());
        assertEquals(encrypted, this.stored.get().getEncryptedApiKey());

        Text2GqlRequest custom = new Text2GqlRequest();
        custom.setPrompt("Temporary policy");
        this.service.applyCustomPrompt(custom);
        assertEquals("Temporary policy", custom.getPrompt());
        assertEquals("Shared Gremlin policy", this.stored.get().getGremlinPrompt());
        custom.setPrompt("  ");
        this.service.applyCustomPrompt(custom);
        assertEquals("Shared Gremlin policy", custom.getPrompt());
        Text2GqlRequest mixed = shared();
        mixed.setPrompt("forbidden override");
        assertEquals(400, failure(() -> this.service.sharedRequest(mixed)).status());

        saved.setApiKey(null);
        saved.setEnabled(false);
        saved.setPrompts(Map.of("gremlin", "", "cypher", defaults.get("cypher")));
        this.service.save(saved);
        assertNull(this.stored.get().getGremlinPrompt());
        assertNull(this.stored.get().getCypherPrompt());
        assertEquals(defaults, this.service.promptSettings().get("prompts"));
        assertEquals(encrypted, this.stored.get().getEncryptedApiKey());
        custom.setPrompt(null);
        this.service.applyCustomPrompt(custom);
        assertEquals(defaults.get("gremlin"), custom.getPrompt());
        assertFalse(new ObjectMapper().writeValueAsString(this.service.promptSettings()).contains("private-model-key"));
    }

    @Test
    public void testMalformedAndOversizedTemplatesFailBeforeSavingOrModelAccess() throws Exception {
        ObjectMapper json = new ObjectMapper();
        for (String malformed : new String[]{"null", "[]", "42", "{\"sql\":\"select\"}",
                                             "{\"gremlin\":null}", "{\"gremlin\":false}",
                                             "{\"cypher\":123}", "{\"cypher\":{}}"}) {
            try {
                json.readValue("{\"prompts\":" + malformed + "}", Text2GqlSettingsRequest.class);
                fail("Expected strict template validation: " + malformed);
            } catch (com.fasterxml.jackson.core.JsonProcessingException expected) {
                // Invalid JSON values are not coerced into editable template text.
            }
        }
        for (String malformed : new String[]{"42", "false", "{}", "[]"}) {
            try {
                json.readValue("{\"prompt\":" + malformed + "}", Text2GqlRequest.class);
                fail("Expected string prompt");
            } catch (com.fasterxml.jackson.core.JsonProcessingException expected) {
                // A temporary override must be explicit text too.
            }
        }
        Text2GqlSettingsRequest request = settings("ollama", null);
        request.setPrompts(Map.of("gremlin", "x".repeat(16001)));
        assertEquals(400, failure(() -> this.service.save(request)).status());
        Mockito.verify(this.mapper, Mockito.never()).save(Mockito.any());
        Text2GqlRequest custom = new Text2GqlRequest();
        custom.setPrompt("x".repeat(16001));
        Mockito.clearInvocations(this.mapper);
        assertEquals(400, failure(() -> this.service.applyCustomPrompt(custom)).status());
        Mockito.verifyNoInteractions(this.mapper);
        Text2GqlSettingsRequest valid = json.readValue("{\"prompts\":{\"gremlin\":\"sample\"}}",
                                                      Text2GqlSettingsRequest.class);
        assertEquals("sample", valid.getPrompts().get("gremlin"));
        assertEquals("sample", json.readValue("{\"prompt\":\"sample\"}", Text2GqlRequest.class).getPrompt());
    }

    private Text2GqlSettingsService service(Map<String, String> environment) {
        return new Text2GqlSettingsService(this.config, this.mapper,
                new Text2GqlSecretStore(this.masterFile, environment::get), environment::get);
    }

    private static Text2GqlSettingsRequest settings(String type, String key) {
        Text2GqlSettingsRequest request = new Text2GqlSettingsRequest();
        request.setEnabled(true);
        request.setConnectionType(type);
        request.setBaseUrl("http://127.0.0.1:11434/v1");
        request.setModel("managed-model");
        request.setApiKey(key);
        return request;
    }

    private static Text2GqlRequest shared() {
        Text2GqlRequest request = new Text2GqlRequest();
        request.setSource("shared");
        request.setQuestion("Find people");
        return request;
    }

    private static ExternalException failure(Runnable action) {
        try {
            action.run();
            fail("Expected a safe shared-model failure");
            return null;
        } catch (ExternalException exception) {
            return exception;
        }
    }
}
