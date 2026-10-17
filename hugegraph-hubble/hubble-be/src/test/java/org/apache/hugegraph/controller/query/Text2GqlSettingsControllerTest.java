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

import java.util.Map;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.query.Text2GqlRequest;
import org.apache.hugegraph.entity.query.Text2GqlSettingsRequest;
import org.apache.hugegraph.exception.ForbiddenException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.auth.AuthModeService;
import org.apache.hugegraph.service.auth.AuthContextService;
import org.apache.hugegraph.service.auth.UserService;
import org.apache.hugegraph.service.query.Text2GqlSettingsService;
import org.apache.hugegraph.service.query.Text2GqlService;
import org.apache.hugegraph.service.space.GraphSpaceService;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

public class Text2GqlSettingsControllerTest {

    @Test
    public void testOrdinaryAndSpaceAdminCannotReadOrWriteModelSettings() {
        for (String level : new String[]{"USER", "SPACEADMIN"}) {
            Text2GqlSettingsService settings = Mockito.mock(Text2GqlSettingsService.class);
            TestController controller = new TestController(level);
            ReflectionTestUtils.setField(controller, "settings", settings);
            assertForbidden(controller::get);
            assertForbidden(() -> controller.update(new Text2GqlSettingsRequest()));
            assertForbidden(controller::test);
            Mockito.verifyNoInteractions(settings);
        }
    }

    @Test
    public void testVerifiedAnonymousAndAdministratorCanReadAndUpdateSafeDescriptor() {
        for (String level : new String[]{"ANONYMOUS", "ADMIN"}) {
            Text2GqlSettingsService settings = Mockito.mock(Text2GqlSettingsService.class);
            TestController controller = new TestController(level);
            ReflectionTestUtils.setField(controller, "settings", settings);
            Map<String, Object> safe = Map.of("has_api_key", true, "model", "shared-model");
            Text2GqlSettingsRequest request = new Text2GqlSettingsRequest();
            Mockito.when(settings.settings()).thenReturn(safe);
            Mockito.when(settings.save(request)).thenReturn(safe);
            assertEquals(safe, controller.get());
            assertEquals(safe, controller.update(request));
            Mockito.verify(settings).settings();
            Mockito.verify(settings).save(request);
        }
    }

    @Test
    public void testMissingCredentialsCannotPretendAnAuthenticatedServerIsAnonymous() {
        for (boolean missingUser : new boolean[]{false, true}) {
            Text2GqlSettingsService settings = Mockito.mock(Text2GqlSettingsService.class);
            TestController controller = new TestController("ADMIN");
            if (missingUser) {
                controller.username = null;
            } else {
                controller.token = null;
            }
            ReflectionTestUtils.setField(controller, "settings", settings);
            assertForbidden(controller::get);
            assertForbidden(() -> controller.update(new Text2GqlSettingsRequest()));
            assertForbidden(controller::test);
            Mockito.verifyNoInteractions(settings, controller.client, controller.users);
        }
    }

    @Test
    public void testFreshServerProbeRejectsCachedAnonymousModeAfterAuthIsEnabledOrUnavailable() {
        for (boolean unavailable : new boolean[]{false, true}) {
            HugeClient probe = Mockito.mock(HugeClient.class);
            Mockito.when(probe.isServerAuthEnabled()).thenReturn(false);
            AuthModeService mode = new AuthModeService(null) {
                @Override
                protected HugeClient createUnauthClient() {
                    return probe;
                }
            };
            org.junit.Assert.assertTrue(mode.anonymous());
            if (unavailable) {
                Mockito.when(probe.isServerAuthEnabled()).thenThrow(new IllegalStateException("Server unavailable"));
            } else {
                Mockito.when(probe.isServerAuthEnabled()).thenReturn(true);
            }
            Text2GqlSettingsService settings = Mockito.mock(Text2GqlSettingsService.class);
            TestController controller = new TestController("ANONYMOUS");
            controller.useMode(mode);
            ReflectionTestUtils.setField(controller, "settings", settings);
            assertForbidden(controller::get);
            assertForbidden(() -> controller.update(new Text2GqlSettingsRequest()));
            assertForbidden(controller::test);
            org.junit.Assert.assertTrue(mode.enabled());
            Mockito.verify(probe, Mockito.times(4)).isServerAuthEnabled();
            Mockito.verifyNoInteractions(settings, controller.client, controller.users);
        }
    }

    @Test
    public void testAnonymousAndAdministratorCanProbeOnlyTheResolvedSavedConfiguration() throws Exception {
        for (String level : new String[]{"ANONYMOUS", "ADMIN"}) {
            Text2GqlSettingsService settings = Mockito.mock(Text2GqlSettingsService.class);
            Text2GqlService model = Mockito.mock(Text2GqlService.class);
            TestController controller = new TestController(level);
            ReflectionTestUtils.setField(controller, "settings", settings);
            ReflectionTestUtils.setField(controller, "service", model);
            Text2GqlRequest resolved = new Text2GqlRequest();
            resolved.setBaseUrl("http://127.0.0.1:11434/v1");
            resolved.setModel("saved-model");
            resolved.setApiKey("private-saved-key");
            Mockito.when(settings.sharedRequest(Mockito.any())).thenReturn(resolved);
            Mockito.when(model.testConnection(resolved)).thenReturn(12L);
            MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();
            String response = mvc.perform(post("/api/v1.3/settings/text2gql/test")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"base_url\":\"https://attacker.invalid/v1\",\"api_key\":\"client-key\"}"))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            assertEquals("{\"duration_ms\":12}", response);
            org.mockito.ArgumentCaptor<Text2GqlRequest> request =
                    org.mockito.ArgumentCaptor.forClass(Text2GqlRequest.class);
            Mockito.verify(settings).sharedRequest(request.capture());
            assertEquals("shared", request.getValue().getSource());
            org.junit.Assert.assertNull(request.getValue().getBaseUrl());
            org.junit.Assert.assertNull(request.getValue().getApiKey());
            Mockito.verifyNoMoreInteractions(settings);
            Mockito.verify(model).testConnection(resolved);
            Mockito.verifyNoMoreInteractions(model);
            Mockito.verify(controller.client, Mockito.never()).schema();
        }
    }

    @Test
    public void testMutationRequiresPutWithJsonAndHasNoPostAlias() throws Exception {
        Text2GqlSettingsService settings = Mockito.mock(Text2GqlSettingsService.class);
        TestController controller = new TestController("ADMIN");
        ReflectionTestUtils.setField(controller, "settings", settings);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(post("/api/v1.3/settings/text2gql").contentType(MediaType.APPLICATION_JSON)
                   .content("{}"))
           .andExpect(status().isMethodNotAllowed());
        mvc.perform(put("/api/v1.3/settings/text2gql").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                   .content("enabled=true&api_key=secret"))
           .andExpect(status().isUnsupportedMediaType());
        Mockito.verifyNoInteractions(settings);
    }

    private static void assertForbidden(Runnable operation) {
        try {
            operation.run();
            fail("Expected server-side administrator authorization");
        } catch (ForbiddenException expected) {
            // Both descriptor reads and writes are privileged.
        }
    }

    private static final class TestController extends Text2GqlSettingsController {

        private final HugeClient client = Mockito.mock(HugeClient.class);
        private final UserService users = Mockito.mock(UserService.class);
        private String username = "current-user";
        private String token = "current-session-token";

        private TestController(String level) {
            this.authMode = Mockito.mock(AuthModeService.class);
            Mockito.when(this.authMode.anonymous()).thenReturn("ANONYMOUS".equals(level));
            Mockito.when(this.authMode.refresh()).thenReturn(!"ANONYMOUS".equals(level));
            if ("ANONYMOUS".equals(level)) {
                this.username = null;
                this.token = null;
            }
            this.userService = this.users;
            Mockito.when(this.userService.userLevel(this.client, "current-user")).thenReturn(level);
            HugeConfig config = Mockito.mock(HugeConfig.class);
            Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
            this.authContextService = new AuthContextService(config, this.userService,
                                                            this.authMode, Mockito.mock(GraphSpaceService.class));
        }

        private void useMode(AuthModeService mode) {
            this.authMode = mode;
        }

        @Override
        protected HugeClient authClient(String graphSpace, String graph) {
            return this.client;
        }

        @Override
        protected String getToken() {
            return this.token;
        }

        @Override
        protected String getUser() {
            return this.username;
        }
    }
}
