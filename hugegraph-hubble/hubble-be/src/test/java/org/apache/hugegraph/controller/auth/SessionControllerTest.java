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

package org.apache.hugegraph.controller.auth;

import java.util.Map;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.exception.ParameterizedException;
import org.apache.hugegraph.exception.UnauthorizedException;
import org.apache.hugegraph.handler.ExceptionAdvisor;
import org.apache.hugegraph.handler.ResponseAdvisor;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

public class SessionControllerTest {

    private MockHttpServletRequest request;
    private MockHttpSession session;
    private SessionController controller;

    @Before
    public void setup() {
        this.request = new MockHttpServletRequest();
        this.session = new MockHttpSession();
        this.session.setAttribute(Constant.USERNAME_KEY, "alice");
        this.session.setAttribute(Constant.TOKEN_KEY, "token");
        this.session.setMaxInactiveInterval(48 * 60 * 60);
        this.request.setSession(this.session);
        this.controller = new SessionController() {
            @Override
            protected jakarta.servlet.http.HttpServletRequest getRequest() {
                return SessionControllerTest.this.request;
            }
        };
    }

    @Test
    public void testReadPreservesDeploymentDefaultAndExposesBounds() {
        Map<String, Object> settings = this.controller.get();
        Assert.assertEquals(Integer.valueOf(48 * 60 * 60),
                            settings.get("idle_timeout_seconds"));
        Assert.assertEquals(Integer.valueOf(900), settings.get("min_idle_seconds"));
        Assert.assertEquals(Integer.valueOf(172800), settings.get("max_idle_seconds"));
    }

    @Test
    public void testActivityScopeIsStableAndDistinctFromTheSessionCredential() {
        Object first = this.controller.get().get("activity_scope");
        Assert.assertNotNull(first);
        Assert.assertEquals(first, this.controller.update(settings(3600)).get("activity_scope"));
        Assert.assertNotEquals(this.session.getId(), first);
        this.session.removeAttribute(SessionController.ACTIVITY_SCOPE_KEY);
        Assert.assertNotEquals(first, this.controller.get().get("activity_scope"));
    }

    @Test
    public void testNewLoginRestoresOriginalDeploymentTimeoutAndScope() {
        this.session.setMaxInactiveInterval(7200);
        Object scope = this.controller.get().get("activity_scope");
        this.controller.update(settings(3600));
        this.controller.update(settings(900));
        SessionController.resetPreferences(this.session, 0);
        Assert.assertEquals(7200, this.session.getMaxInactiveInterval());
        Assert.assertNotEquals(scope, this.controller.get().get("activity_scope"));
    }

    @Test
    public void testUpdateOnlyChangesCurrentSession() {
        MockHttpSession other = new MockHttpSession();
        other.setMaxInactiveInterval(172800);
        this.controller.update(settings(3600));
        Assert.assertEquals(3600, this.session.getMaxInactiveInterval());
        Assert.assertEquals(172800, other.getMaxInactiveInterval());
        Assert.assertEquals("token", this.session.getAttribute(Constant.TOKEN_KEY));
    }

    @Test
    public void testInvalidAndUnlimitedTimeoutsAreRejectedWithoutMutation() {
        assertThrows(ParameterizedException.class,
                            () -> this.controller.update(null));
        for (Integer seconds : new Integer[]{null, -1, 0, 899, 604801, Integer.MAX_VALUE}) {
            assertThrows(ParameterizedException.class,
                                () -> this.controller.update(settings(seconds)));
            Assert.assertEquals(172800, this.session.getMaxInactiveInterval());
        }
        this.controller.update(settings(900));
        Assert.assertEquals(900, this.session.getMaxInactiveInterval());
        this.controller.update(settings(172800));
        Assert.assertEquals(172800, this.session.getMaxInactiveInterval());
    }

    @Test
    public void testDirectHttpCannotRaiseDeploymentCeilingOrMutateIt() throws Exception {
        MockMvc mvc = httpEndpoint(0);
        assertHttpTimeout(mvc, 604800, 400);
        Assert.assertEquals(172800, this.session.getMaxInactiveInterval());
        assertHttpTimeout(mvc, 3600, 200);
        assertHttpTimeout(mvc, 900, 200);
        assertHttpTimeout(mvc, 172801, 400);
        Assert.assertEquals(900, this.session.getMaxInactiveInterval());
        assertHttpTimeout(mvc, 172800, 200);
        Assert.assertEquals(172800, this.session.getMaxInactiveInterval());
    }

    @Test
    public void testExplicitAdministratorCeilingCapsInitialAndNewLoginTimeouts() throws Exception {
        ReflectionTestUtils.setField(this.controller, "configuredMaxIdleSeconds", 7200);
        Assert.assertEquals(7200, this.controller.get().get("idle_timeout_seconds"));
        Assert.assertEquals(7200, this.session.getMaxInactiveInterval());
        Assert.assertEquals(7200, this.controller.get().get("max_idle_seconds"));
        this.controller.update(settings(900));
        SessionController.resetPreferences(this.session, 7200);
        Assert.assertEquals(7200, this.session.getMaxInactiveInterval());
        this.controller.update(settings(7200));
        assertThrows(ParameterizedException.class, () -> this.controller.update(settings(7201)));
        Assert.assertEquals(7200, this.session.getMaxInactiveInterval());
        MockMvc mvc = httpEndpoint(7200);
        assertHttpTimeout(mvc, 7201, 400);
        Assert.assertEquals(7200, this.session.getMaxInactiveInterval());
        assertHttpTimeout(mvc, 3600, 200);
        assertHttpTimeout(mvc, 7201, 400);
        Assert.assertEquals(3600, this.session.getMaxInactiveInterval());
        assertHttpTimeout(mvc, 7200, 200);
    }

    @Test
    public void testAdministratorCanAuthorizeMoreThanSevenDays() {
        ReflectionTestUtils.setField(this.controller, "configuredMaxIdleSeconds", 14 * 86400);
        Assert.assertEquals(14 * 86400, this.controller.get().get("max_idle_seconds"));
        this.controller.update(settings(10 * 86400));
        Assert.assertEquals(10 * 86400, this.session.getMaxInactiveInterval());
        SessionController.resetPreferences(this.session, 14 * 86400);
        Assert.assertEquals(172800, this.session.getMaxInactiveInterval());
    }

    @Test
    public void testThirtyDayCeilingAllowsLongerSessionWithoutChangingDefault() {
        int max = 30 * 86400;
        ReflectionTestUtils.setField(this.controller, "configuredMaxIdleSeconds", max);
        Assert.assertEquals(172800, this.controller.get().get("idle_timeout_seconds"));
        Assert.assertEquals(max, this.controller.get().get("max_idle_seconds"));
        this.controller.update(settings(max));
        Assert.assertEquals(max, this.session.getMaxInactiveInterval());
        assertThrows(ParameterizedException.class, () -> this.controller.update(settings(max + 1)));
        SessionController.resetPreferences(this.session, max);
        Assert.assertEquals(172800, this.session.getMaxInactiveInterval());
    }

    @Test
    public void testUnconfiguredCeilingInheritsLongDeploymentDefault() {
        this.session.setMaxInactiveInterval(30 * 86400);
        Assert.assertEquals(30 * 86400, this.controller.get().get("max_idle_seconds"));
        this.controller.update(settings(10 * 86400));
        this.controller.update(settings(30 * 86400));
        assertThrows(ParameterizedException.class,
                     () -> this.controller.update(settings(30 * 86400 + 1)));
        Assert.assertEquals(30 * 86400, this.session.getMaxInactiveInterval());
    }

    @Test
    public void testShortDeploymentAndCeilingStayReadOnly() {
        this.session.setMaxInactiveInterval(600);
        Assert.assertEquals(600, this.controller.get().get("max_idle_seconds"));
        assertThrows(ParameterizedException.class, () -> this.controller.update(settings(900)));
        Assert.assertEquals(600, this.session.getMaxInactiveInterval());
        ReflectionTestUtils.setField(this.controller, "configuredMaxIdleSeconds", 300);
        Assert.assertEquals(300, this.controller.get().get("idle_timeout_seconds"));
        assertThrows(ParameterizedException.class, () -> this.controller.update(settings(900)));
        Assert.assertEquals(300, this.session.getMaxInactiveInterval());
    }

    @Test
    public void testUnlimitedDeploymentStaysReadOnlyUnlessAdministratorSetsCeiling() {
        for (int disabled : new int[]{0, -1}) {
            this.setup();
            this.session.setMaxInactiveInterval(disabled);
            Assert.assertEquals(disabled, this.controller.get().get("idle_timeout_seconds"));
            Assert.assertEquals(0, this.controller.get().get("max_idle_seconds"));
            assertThrows(ParameterizedException.class, () -> this.controller.update(settings(900)));
            Assert.assertEquals(disabled, this.session.getMaxInactiveInterval());
            ReflectionTestUtils.setField(this.controller, "configuredMaxIdleSeconds", 7200);
            Assert.assertEquals(7200, this.controller.get().get("idle_timeout_seconds"));
            this.controller.update(settings(900));
            SessionController.resetPreferences(this.session, 7200);
            Assert.assertEquals(7200, this.session.getMaxInactiveInterval());
        }
    }

    private void assertHttpTimeout(MockMvc mvc, int seconds, int expectedStatus) throws Exception {
        mvc.perform(put(Constant.API_VERSION + "auth/session").session(this.session)
                       .contentType(MediaType.APPLICATION_JSON)
                       .content("{\"idle_timeout_seconds\":" + seconds + "}"))
           .andExpect(status().is(expectedStatus))
           .andExpect(jsonPath("$.status").value(expectedStatus));
    }

    private static MockMvc httpEndpoint(int configuredMax) {
        SessionController endpoint = new SessionController();
        ReflectionTestUtils.setField(endpoint, "configuredMaxIdleSeconds", configuredMax);
        return MockMvcBuilders.standaloneSetup(endpoint)
                              .setControllerAdvice(new ExceptionAdvisor(), new ResponseAdvisor())
                              .build();
    }

    @Test
    public void testRequiresActualAuthenticatedSession() {
        this.request.setSession(null);
        assertThrows(UnauthorizedException.class, () -> this.controller.get());
        assertThrows(UnauthorizedException.class,
                            () -> this.controller.update(settings(3600)));
        Assert.assertNull(this.request.getSession(false));
        this.request.setSession(this.session);
        this.session.setAttribute(Constant.TOKEN_KEY, " ");
        assertThrows(UnauthorizedException.class, () -> this.controller.get());
    }

    @Test
    public void testAnOldTabCannotLogOutANewerSessionScope() {
        LoginController login = new LoginController() {
            @Override
            protected jakarta.servlet.http.HttpServletRequest getRequest() {
                return SessionControllerTest.this.request;
            }
        };
        String scope = (String) this.controller.get().get("activity_scope");
        login.logout("scope-from-an-earlier-login");
        Assert.assertEquals("token", this.session.getAttribute(Constant.TOKEN_KEY));
        login.logout(scope);
        Assert.assertNull(this.session.getAttribute(Constant.TOKEN_KEY));
        Assert.assertNull(this.session.getAttribute(Constant.USERNAME_KEY));
    }

    @Test
    public void testExplicitLogoutDoesNotRequireAnActivityScope() {
        LoginController login = new LoginController() {
            @Override
            protected jakarta.servlet.http.HttpServletRequest getRequest() {
                return SessionControllerTest.this.request;
            }
        };
        login.logout(null);
        Assert.assertNull(this.session.getAttribute(Constant.TOKEN_KEY));
    }

    private static void assertThrows(Class<? extends RuntimeException> type,
                                     Runnable operation) {
        try {
            operation.run();
        } catch (RuntimeException error) {
            Assert.assertTrue(type.isInstance(error));
            return;
        }
        Assert.fail("Expected " + type.getSimpleName());
    }

    private static SessionController.Settings settings(Integer seconds) {
        SessionController.Settings settings = new SessionController.Settings();
        settings.setIdleTimeoutSeconds(seconds);
        return settings;
    }
}
