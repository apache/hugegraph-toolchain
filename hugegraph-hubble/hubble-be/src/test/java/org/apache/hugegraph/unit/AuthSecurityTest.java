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

package org.apache.hugegraph.unit;

import java.io.IOException;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.apache.http.HttpResponse;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.util.EntityUtils;
import org.junit.After;
import org.junit.Assert;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.common.Response;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.config.IngestionProxyServlet;
import org.apache.hugegraph.controller.BaseController;
import org.apache.hugegraph.controller.auth.LoginController;
import org.apache.hugegraph.driver.AuthManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.GraphConnection;
import org.apache.hugegraph.entity.auth.PasswordEntity;
import org.apache.hugegraph.entity.auth.UserEntity;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.exception.InternalException;
import org.apache.hugegraph.exception.LoginThrottledException;
import org.apache.hugegraph.exception.ParameterizedException;
import org.apache.hugegraph.exception.ServerCapabilityUnavailableException;
import org.apache.hugegraph.exception.UnauthorizedException;
import org.apache.hugegraph.handler.CustomInterceptor;
import org.apache.hugegraph.handler.ExceptionAdvisor;
import org.apache.hugegraph.handler.LoginInterceptor;
import org.apache.hugegraph.handler.MessageSourceHandler;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.auth.AuthContextService;
import org.apache.hugegraph.service.auth.LoginAttemptGuard;
import org.apache.hugegraph.service.auth.UserService;
import org.apache.hugegraph.structure.auth.Login;
import org.apache.hugegraph.structure.auth.LoginResult;

public class AuthSecurityTest {

    @After
    public void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    public void testUserPasswordIsWriteOnlyInJson() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        UserEntity user = mapper.readValue(
                          "{\"user_name\":\"alice\",\"user_password\":\"secret\"}",
                          UserEntity.class);

        Assert.assertEquals("secret", user.getPassword());
        String json = mapper.writeValueAsString(user);
        Assert.assertFalse(json.contains("user_password"));
        Assert.assertFalse(json.contains("secret"));
    }

    @Test
    public void testCredentialDtosDoNotExposeSecretsInLogs() {
        UserEntity user = new UserEntity();
        user.setPassword("user-secret-canary");
        PasswordEntity password = PasswordEntity.builder()
                                                .username("alice")
                                                .oldpwd("old-secret-canary")
                                                .newpwd("new-secret-canary")
                                                .build();
        GraphConnection connection = new GraphConnection();
        connection.setPassword("connection-secret-canary");
        connection.setToken("token-secret-canary");
        connection.setTrustStorePassword("trust-secret-canary");

        String diagnostic = user + " " + password + " " + connection;

        Assert.assertFalse(diagnostic.contains("secret-canary"));
    }

    @Test
    public void testLoginInterceptorRejectsMissingSessionAuth() {
        LoginInterceptor interceptor = new LoginInterceptor();
        MockHttpServletRequest request = new MockHttpServletRequest(
                                            "GET", "/api/v1.3/auth/status");

        assertThrows(UnauthorizedException.class, () -> {
            interceptor.preHandle(request, new MockHttpServletResponse(), null);
        });
    }

    @Test
    public void testLoginInterceptorRequiresTokenAndUsername() {
        LoginInterceptor interceptor = new LoginInterceptor();
        MockHttpServletRequest request = new MockHttpServletRequest(
                                            "GET", "/api/v1.3/auth/status");
        request.getSession().setAttribute(Constant.TOKEN_KEY, "token");

        assertThrows(UnauthorizedException.class, () -> {
            interceptor.preHandle(request, new MockHttpServletResponse(), null);
        });

        request.getSession().setAttribute(Constant.USERNAME_KEY, "admin");
        Assert.assertTrue(interceptor.preHandle(request,
                                               new MockHttpServletResponse(),
                                               null));
    }

    @Test
    public void testLoginInterceptorRejectsBlankSessionAuth() {
        LoginInterceptor interceptor = new LoginInterceptor();
        MockHttpServletRequest request = new MockHttpServletRequest(
                                            "GET", "/api/v1.3/auth/status");
        request.getSession().setAttribute(Constant.TOKEN_KEY, " ");
        request.getSession().setAttribute(Constant.USERNAME_KEY, "admin");

        assertThrows(UnauthorizedException.class, () -> {
            interceptor.preHandle(request, new MockHttpServletResponse(), null);
        });

        request.getSession().setAttribute(Constant.TOKEN_KEY, "token");
        request.getSession().setAttribute(Constant.USERNAME_KEY, " ");

        assertThrows(UnauthorizedException.class, () -> {
            interceptor.preHandle(request, new MockHttpServletResponse(), null);
        });
    }

    @Test
    public void testLoginInterceptorAllowsOptionsPreflight() {
        LoginInterceptor interceptor = new LoginInterceptor();
        MockHttpServletRequest request = new MockHttpServletRequest(
                                            "OPTIONS", "/api/v1.3/auth/status");

        Assert.assertTrue(interceptor.preHandle(request,
                                               new MockHttpServletResponse(),
                                               null));
    }

    @Test
    public void testCustomInterceptorDoesNotCreateClientForMissingSession()
           throws Exception {
        TestCustomInterceptor interceptor = new TestCustomInterceptor();
        MockHttpServletRequest request = new MockHttpServletRequest(
                                            "GET", "/api/v1.3/auth/status");

        Assert.assertTrue(interceptor.preHandle(request,
                                                new MockHttpServletResponse(),
                                                null));

        Assert.assertEquals(0, interceptor.authClients);
        Assert.assertEquals(0, interceptor.unauthClients);
        Assert.assertNull(request.getAttribute("hugeClient"));
    }

    @Test
    public void testCustomInterceptorDoesNotCreateClientForPartialSession()
           throws Exception {
        TestCustomInterceptor interceptor = new TestCustomInterceptor();
        MockHttpServletRequest request = new MockHttpServletRequest(
                                            "GET", "/api/v1.3/auth/status");
        request.getSession().setAttribute(Constant.TOKEN_KEY, "token");

        Assert.assertTrue(interceptor.preHandle(request,
                                                new MockHttpServletResponse(),
                                                null));

        Assert.assertEquals(0, interceptor.authClients);
        Assert.assertEquals(0, interceptor.unauthClients);
        Assert.assertNull(request.getAttribute("hugeClient"));
    }

    @Test
    public void testCustomInterceptorDoesNotCreateClientWithoutToken()
           throws Exception {
        TestCustomInterceptor interceptor = new TestCustomInterceptor();
        MockHttpServletRequest request = new MockHttpServletRequest(
                                            "GET", "/api/v1.3/auth/status");
        request.getSession().setAttribute(Constant.USERNAME_KEY, "admin");

        Assert.assertTrue(interceptor.preHandle(request,
                                                new MockHttpServletResponse(),
                                                null));

        Assert.assertEquals(0, interceptor.authClients);
        Assert.assertEquals(0, interceptor.unauthClients);
        Assert.assertNull(request.getAttribute("hugeClient"));
    }

    @Test
    public void testCustomInterceptorDoesNotCreateClientForBlankSession()
           throws Exception {
        TestCustomInterceptor interceptor = new TestCustomInterceptor();
        MockHttpServletRequest request = new MockHttpServletRequest(
                                            "GET", "/api/v1.3/auth/status");
        request.getSession().setAttribute(Constant.TOKEN_KEY, " ");
        request.getSession().setAttribute(Constant.USERNAME_KEY, "admin");

        Assert.assertTrue(interceptor.preHandle(request,
                                                new MockHttpServletResponse(),
                                                null));

        Assert.assertEquals(0, interceptor.authClients);
        Assert.assertEquals(0, interceptor.unauthClients);
        Assert.assertNull(request.getAttribute("hugeClient"));

        request.getSession().setAttribute(Constant.TOKEN_KEY, "token");
        request.getSession().setAttribute(Constant.USERNAME_KEY, " ");

        Assert.assertTrue(interceptor.preHandle(request,
                                                new MockHttpServletResponse(),
                                                null));

        Assert.assertEquals(0, interceptor.authClients);
        Assert.assertEquals(0, interceptor.unauthClients);
        Assert.assertNull(request.getAttribute("hugeClient"));
    }

    @Test
    public void testCustomInterceptorDoesNotCreateClientForOptions()
           throws Exception {
        TestCustomInterceptor interceptor = new TestCustomInterceptor();
        MockHttpServletRequest request = new MockHttpServletRequest(
                                            "OPTIONS",
                                            "/api/v1.3/graphspaces/space1");
        request.getSession().setAttribute(Constant.TOKEN_KEY, "token");
        request.getSession().setAttribute(Constant.USERNAME_KEY, "admin");

        Assert.assertTrue(interceptor.preHandle(request,
                                                new MockHttpServletResponse(),
                                                null));

        Assert.assertEquals(0, interceptor.authClients);
        Assert.assertEquals(0, interceptor.unauthClients);
        Assert.assertNull(request.getAttribute("hugeClient"));
    }

    @Test
    public void testCustomInterceptorKeepsUnauthClientForLogin()
           throws Exception {
        TestCustomInterceptor interceptor = new TestCustomInterceptor();
        MockHttpServletRequest request = new MockHttpServletRequest(
                                            "POST", "/api/v1.3/auth/login");

        Assert.assertTrue(interceptor.preHandle(request,
                                                new MockHttpServletResponse(),
                                                null));

        Assert.assertEquals(0, interceptor.authClients);
        Assert.assertEquals(1, interceptor.unauthClients);
        Assert.assertNull(request.getAttribute("hugeClient"));
    }

    @Test
    public void testCustomInterceptorCreatesClientForAuthenticatedApi()
           throws Exception {
        TestCustomInterceptor interceptor = new TestCustomInterceptor();
        MockHttpServletRequest request = new MockHttpServletRequest(
                                            "GET",
                                            "/api/v1.3/graphspaces/space1" +
                                            "/graphs/graph1/schema");
        request.getSession().setAttribute(Constant.TOKEN_KEY, "token");
        request.getSession().setAttribute(Constant.USERNAME_KEY, "admin");

        Assert.assertTrue(interceptor.preHandle(request,
                                                new MockHttpServletResponse(),
                                                null));

        Assert.assertEquals(1, interceptor.authClients);
        Assert.assertEquals(0, interceptor.unauthClients);
        Assert.assertEquals("space1", interceptor.graphSpace);
        Assert.assertEquals("graph1", interceptor.graph);
        Assert.assertEquals("token", interceptor.token);
    }

    @Test
    public void testCustomInterceptorDoesNotCreateClientForLogout()
           throws Exception {
        TestCustomInterceptor interceptor = new TestCustomInterceptor();
        MockHttpServletRequest request = new MockHttpServletRequest(
                                            "POST", "/api/v1.3/auth/logout");
        request.getSession().setAttribute(Constant.TOKEN_KEY, "token");
        request.getSession().setAttribute(Constant.USERNAME_KEY, "admin");

        Assert.assertTrue(interceptor.preHandle(request,
                                                new MockHttpServletResponse(),
                                                null));

        Assert.assertEquals(0, interceptor.authClients);
        Assert.assertEquals(0, interceptor.unauthClients);
        Assert.assertNull(request.getAttribute("hugeClient"));
    }

    @Test
    public void testUnauthorizedExceptionUsesHttp401() throws Exception {
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(new MockHttpServletRequest()));
        ExceptionAdvisor advisor = new ExceptionAdvisor();
        Response response = advisor.exceptionHandler(new UnauthorizedException());

        Assert.assertEquals(Constant.STATUS_UNAUTHORIZED, response.getStatus());

        Method method = ExceptionAdvisor.class.getMethod("exceptionHandler",
                                                        UnauthorizedException.class);
        ResponseStatus status = method.getAnnotation(ResponseStatus.class);
        Assert.assertEquals(HttpStatus.UNAUTHORIZED, status.value());
    }

    @Test
    public void testLoginThrottleUsesHttp429AndRetryAfter() {
        ExceptionAdvisor advisor = new ExceptionAdvisor();
        MessageSourceHandler messageSource =
                Mockito.mock(MessageSourceHandler.class);
        Mockito.when(messageSource.getMessage(Mockito.anyString(),
                                              Mockito.<Object[]>any()))
               .thenReturn("retry later");
        ReflectionTestUtils.setField(advisor, "messageSourceHandler",
                                     messageSource);

        ResponseEntity<Response> response = advisor.exceptionHandler(
                new LoginThrottledException(5L));

        Assert.assertEquals(HttpStatus.TOO_MANY_REQUESTS,
                            response.getStatusCode());
        Assert.assertEquals("5", response.getHeaders().getFirst("Retry-After"));
        Assert.assertEquals(HttpStatus.TOO_MANY_REQUESTS.value(),
                            response.getBody().getStatus());
    }

    @Test
    public void testMissingRequestParameterUsesActionableHttp400()
           throws Exception {
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(new MockHttpServletRequest()));
        ExceptionAdvisor advisor = new ExceptionAdvisor();
        MessageSourceHandler messageSource =
                Mockito.mock(MessageSourceHandler.class);
        Mockito.when(messageSource.getMessage(Mockito.anyString(),
                                              Mockito.<Object[]>any()))
               .thenAnswer(invocation -> invocation.getArgument(0));
        ReflectionTestUtils.setField(advisor, "messageSourceHandler",
                                     messageSource);
        Method method = ExceptionAdvisor.class.getMethod(
                "exceptionHandler",
                MissingServletRequestParameterException.class);
        ResponseStatus status = method.getAnnotation(ResponseStatus.class);

        Response response = (Response) method.invoke(
                advisor,
                new MissingServletRequestParameterException("type", "int"));

        Assert.assertEquals(HttpStatus.BAD_REQUEST, status.value());
        Assert.assertEquals(Constant.STATUS_BAD_REQUEST, response.getStatus());
        Assert.assertEquals("request.parameter.required", response.getMessage());
        Assert.assertNull(response.getCause());
    }

    @Test
    public void testExceptionResponsesDoNotExposeInternalCause() {
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(new MockHttpServletRequest()));
        ExceptionAdvisor advisor = new ExceptionAdvisor();
        MessageSourceHandler messageSource =
                Mockito.mock(MessageSourceHandler.class);
        Mockito.when(messageSource.getMessage(Mockito.anyString(),
                                              Mockito.<Object[]>any()))
               .thenAnswer(invocation -> invocation.getArgument(0));
        ReflectionTestUtils.setField(advisor, "messageSourceHandler",
                                     messageSource);
        RuntimeException cause = new RuntimeException("internal-secret");

        Assert.assertNull(advisor.exceptionHandler(
                new InternalException("internal", cause)).getCause());
        Assert.assertNull(advisor.exceptionHandler(
                new ExternalException("external", cause)).getCause());
        Assert.assertNull(advisor.exceptionHandler(
                new ParameterizedException("parameter", cause)).getCause());
        Assert.assertNull(advisor.exceptionHandler((Exception) cause).getCause());
    }

    @Test
    public void testMissingServerCapabilityUsesHttp503WithoutCause()
           throws Exception {
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(new MockHttpServletRequest()));
        ExceptionAdvisor advisor = new ExceptionAdvisor();
        MessageSourceHandler messageSource =
                Mockito.mock(MessageSourceHandler.class);
        Mockito.when(messageSource.getMessage(Mockito.anyString(),
                                              Mockito.<Object[]>any()))
               .thenAnswer(invocation -> invocation.getArgument(0));
        ReflectionTestUtils.setField(advisor, "messageSourceHandler",
                                     messageSource);
        Method method = ExceptionAdvisor.class.getMethod(
                "exceptionHandler",
                ServerCapabilityUnavailableException.class);
        ResponseStatus status = method.getAnnotation(ResponseStatus.class);

        Response response = (Response) method.invoke(
                advisor,
                new ServerCapabilityUnavailableException(
                        "server.capability.pd-status.unavailable",
                        new RuntimeException("downstream details")));

        Assert.assertEquals(HttpStatus.SERVICE_UNAVAILABLE, status.value());
        Assert.assertEquals(HttpStatus.SERVICE_UNAVAILABLE.value(),
                            response.getStatus());
        Assert.assertEquals("server.capability.pd-status.unavailable",
                            response.getMessage());
        Assert.assertNull(response.getCause());
    }

    @Test
    public void testIngestionProxyRejectsMissingSessionWithHttp401()
           throws Exception {
        TestIngestionProxyServlet servlet = new TestIngestionProxyServlet();
        MockHttpServletRequest request = new MockHttpServletRequest(
                                            "GET", "/ingest/tasks");

        HttpResponse response = servlet.execute(request);

        Assert.assertEquals(Constant.STATUS_UNAUTHORIZED,
                            response.getStatusLine().getStatusCode());
        Assert.assertEquals("{\"status\": 401}",
                            EntityUtils.toString(response.getEntity()));
    }

    @Test
    public void testIngestionProxyRejectsUsernameWithoutToken()
           throws Exception {
        TestIngestionProxyServlet servlet = new TestIngestionProxyServlet();
        MockHttpServletRequest request = new MockHttpServletRequest(
                                            "GET", "/ingest/tasks");
        request.getSession().setAttribute(Constant.USERNAME_KEY, "admin");

        HttpResponse response = servlet.execute(request);

        Assert.assertEquals(Constant.STATUS_UNAUTHORIZED,
                            response.getStatusLine().getStatusCode());
        Assert.assertEquals("{\"status\": 401}",
                            EntityUtils.toString(response.getEntity()));
    }

    @Test
    public void testClearAuthSessionClearsIdentityAndToken() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(request));
        TestBaseController controller = new TestBaseController();

        request.getSession().setAttribute(Constant.TOKEN_KEY, "token");
        request.getSession().setAttribute(Constant.USERNAME_KEY, "admin");

        controller.clearAuth();

        Assert.assertNull(request.getSession().getAttribute(Constant.TOKEN_KEY));
        Assert.assertNull(request.getSession().getAttribute(Constant.USERNAME_KEY));
    }

    @Test
    public void testStandaloneLoginUsesServerPr3008Payload()
           throws Exception {
        AtomicReference<String> bodyRef = new AtomicReference<>();
        AtomicReference<String> authRef = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1",
                                                                    0),
                                              0);
        server.createContext("/auth/login", exchange -> {
            authRef.set(exchange.getRequestHeaders()
                                .getFirst("Authorization"));
            bodyRef.set(new String(exchange.getRequestBody().readAllBytes(),
                                   StandardCharsets.UTF_8));
            byte[] body = "{\"token\":\"server-token\"}".getBytes(
                          StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(Constant.STATUS_OK, body.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(body);
            }
        });
        server.start();
        try {
            TestLoginController controller = new TestLoginController();
            controller.useNetwork = true;
            HugeConfig config = Mockito.mock(HugeConfig.class);
            Mockito.when(config.get(HubbleOptions.SERVER_URL))
                   .thenReturn("http://127.0.0.1:" +
                               server.getAddress().getPort());
            setField(controller, "config", config);
            Login login = new Login();
            login.name("admin");
            login.password("pa");

            LoginResult result = controller.standalone(login);

            Assert.assertEquals("server-token", result.token());
            Assert.assertTrue(authRef.get().startsWith("Basic "));
            Assert.assertTrue(bodyRef.get().contains("\"user_name\":\"admin\""));
            Assert.assertTrue(bodyRef.get().contains("\"user_password\":\"pa\""));
            Assert.assertTrue(bodyRef.get().contains("\"token_expire\":"));
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void testLoginCommitsAuthAndRotatesSessionAfterValidation()
           throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        String oldSessionId = request.getSession().getId();
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(request));
        TestLoginController controller = new TestLoginController();
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        setField(controller, "config", config);
        Login login = new Login();
        login.name("admin");
        login.password("pa");

        controller.login(login);

        Assert.assertNotEquals(oldSessionId, request.getSession().getId());
        Assert.assertEquals("admin", request.getSession().getAttribute(
                            Constant.USERNAME_KEY));
        Assert.assertEquals("server-token", request.getSession().getAttribute(
                            Constant.TOKEN_KEY));
        Assert.assertNull(request.getSession().getAttribute("auth_password"));
        Assert.assertNull(request.getSession().getAttribute(
                          "auth_password_expire_at"));
    }

    @Test
    public void testAuthContextUsesCurrentSessionIdentity() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession().setAttribute(Constant.USERNAME_KEY, "alice");
        request.getSession().setAttribute(Constant.TOKEN_KEY, "server-token");
        HugeClient client = Mockito.mock(HugeClient.class);
        request.setAttribute("hugeClient", client);
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(request));
        TestLoginController controller = new TestLoginController();
        AuthContextService contexts = Mockito.mock(AuthContextService.class);
        Map<String, Object> expected = Map.of("role", "USER");
        Mockito.when(contexts.context(client, "alice")).thenReturn(expected);
        setField(controller, "authContextService", contexts);

        ResponseEntity<Object> actual = controller.context();

        Assert.assertSame(expected, actual.getBody());
        Assert.assertEquals("no-store", actual.getHeaders()
                                             .getCacheControl());
        Assert.assertEquals("no-cache", actual.getHeaders()
                                             .getPragma());
        Mockito.verify(contexts).context(client, "alice");
    }

    @Test
    public void testPdLoginValidatesUserWithFreshLoginToken()
           throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession().setAttribute(Constant.TOKEN_KEY, "old-token");
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(request));
        TestLoginController controller = new TestLoginController();
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        setField(controller, "config", config);

        LoginResult loginResult = new LoginResult();
        loginResult.token("server-token");
        AuthManager auth = Mockito.mock(AuthManager.class);
        Mockito.when(auth.login(Mockito.any())).thenReturn(loginResult);
        HugeClient loginClient = Mockito.mock(HugeClient.class);
        Mockito.when(loginClient.auth()).thenReturn(auth);
        controller.loginClient = loginClient;

        HugeClient userClient = Mockito.mock(HugeClient.class);
        controller.userClient = userClient;
        UserService users = Mockito.mock(UserService.class);
        UserEntity entity = new UserEntity();
        Mockito.when(users.getpersonal(userClient, "admin")).thenReturn(entity);
        ReflectionTestUtils.setField(controller, "userService", users);
        Login login = new Login();
        login.name("admin");
        login.password("pa");

        controller.login(login);

        Assert.assertEquals("server-token", controller.validationToken);
        Mockito.verify(userClient).close();
        Assert.assertEquals("server-token", request.getSession().getAttribute(
                            Constant.TOKEN_KEY));
    }

    @Test
    public void testLoginFailureClearsExistingAuthentication() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession().setAttribute(Constant.USERNAME_KEY, "old-user");
        request.getSession().setAttribute(Constant.TOKEN_KEY, "old-token");
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(request));
        TestLoginController controller = new TestLoginController();
        controller.failStandalone = true;
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        setField(controller, "config", config);
        Login login = new Login();
        login.name("admin");
        login.password("pa");

        try {
            controller.login(login);
            Assert.fail("Expected login failure");
        } catch (RuntimeException ignored) {
            // Expected.
        }

        Assert.assertNull(request.getSession().getAttribute(
                          Constant.USERNAME_KEY));
        Assert.assertNull(request.getSession().getAttribute(Constant.TOKEN_KEY));
        Mockito.verify(controller.attemptGuard)
               .recordFailure("admin", "127.0.0.1");
    }

    @Test
    public void testPdLoginClosesClientsWhenUserValidationFails()
           throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(request));
        TestLoginController controller = new TestLoginController();
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);
        setField(controller, "config", config);

        LoginResult loginResult = new LoginResult();
        loginResult.token("server-token");
        AuthManager auth = Mockito.mock(AuthManager.class);
        Mockito.when(auth.login(Mockito.any())).thenReturn(loginResult);
        HugeClient loginClient = Mockito.mock(HugeClient.class);
        Mockito.when(loginClient.auth()).thenReturn(auth);
        HugeClient userClient = Mockito.mock(HugeClient.class);
        controller.loginClient = loginClient;
        controller.userClient = userClient;
        UserService users = Mockito.mock(UserService.class);
        Mockito.when(users.getpersonal(userClient, "admin"))
               .thenThrow(new ExternalException(HttpStatus.UNAUTHORIZED.value(),
                                                "expected validation failure"));
        ReflectionTestUtils.setField(controller, "userService", users);
        Login login = new Login();
        login.name("admin");
        login.password("pa");

        try {
            controller.login(login);
            Assert.fail("Expected user validation failure");
        } catch (RuntimeException ignored) {
            // Expected.
        }

        Mockito.verify(loginClient).close();
        Mockito.verify(userClient).close();
        Mockito.verify(controller.attemptGuard, Mockito.never())
               .recordFailure(Mockito.anyString(), Mockito.anyString());
        Assert.assertNull(request.getSession().getAttribute(Constant.TOKEN_KEY));
    }

    @Test
    public void testStandaloneLoginConfiguresTimeoutsAndDisconnects()
           throws Exception {
        TestLoginController controller = new TestLoginController();
        controller.connection = new StubHttpURLConnection(
                new URL("http://unused/auth/login"));
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.SERVER_URL))
               .thenReturn("http://unused");
        setField(controller, "config", config);
        Login login = new Login();
        login.name("admin");
        login.password("pa");

        controller.standalone(login);

        Assert.assertTrue(controller.connection.getConnectTimeout() > 0);
        Assert.assertTrue(controller.connection.getReadTimeout() > 0);
        Assert.assertTrue(controller.connection.disconnected);
    }

    private static class TestIngestionProxyServlet
                   extends IngestionProxyServlet {

        public HttpResponse execute(MockHttpServletRequest request)
               throws IOException {
            return this.doExecute(request, new MockHttpServletResponse(),
                                  new HttpGet("/ingest/tasks"));
        }
    }

    private static class TestBaseController extends BaseController {

        public void clearAuth() {
            this.clearAuthSession();
        }
    }

    private static class TestLoginController extends LoginController {

        private boolean failStandalone;
        private boolean useNetwork;
        private StubHttpURLConnection connection;
        private HugeClient loginClient;
        private HugeClient userClient;
        private String validationToken;
        private LoginAttemptGuard attemptGuard;

        private TestLoginController() {
            this.attemptGuard = Mockito.mock(LoginAttemptGuard.class);
            ReflectionTestUtils.setField(this, "loginAttemptGuard",
                                         this.attemptGuard);
        }

        public LoginResult standalone(Login login) {
            return this.loginStandalone(login);
        }

        @Override
        protected LoginResult loginStandalone(Login login) {
            if (this.failStandalone) {
                throw new ExternalException(HttpStatus.UNAUTHORIZED.value(),
                                            "expected login failure");
            }
            if (this.connection != null || this.useNetwork) {
                return super.loginStandalone(login);
            }
            LoginResult result = new LoginResult();
            result.token("server-token");
            return result;
        }

        @Override
        protected HttpURLConnection openConnection(URL endpoint)
                                               throws IOException {
            if (this.useNetwork) {
                return super.openConnection(endpoint);
            }
            if (this.connection == null) {
                this.connection = new StubHttpURLConnection(endpoint);
            }
            return this.connection;
        }

        @Override
        protected HugeClient createLoginClient(String username,
                                               String password) {
            return this.loginClient != null ? this.loginClient :
                   super.createLoginClient(username, password);
        }

        @Override
        protected HugeClient createLoginTokenClient(String token) {
            if (this.userClient == null) {
                return super.createLoginTokenClient(token);
            }
            this.validationToken = token;
            return this.userClient;
        }
    }

    private static class StubHttpURLConnection extends HttpURLConnection {

        private final ByteArrayOutputStream request = new ByteArrayOutputStream();
        private boolean disconnected;

        protected StubHttpURLConnection(URL url) {
            super(url);
        }

        @Override
        public void disconnect() {
            this.disconnected = true;
        }

        @Override
        public boolean usingProxy() {
            return false;
        }

        @Override
        public void connect() {
            // No-op test connection.
        }

        @Override
        public OutputStream getOutputStream() {
            return this.request;
        }

        @Override
        public int getResponseCode() {
            return Constant.STATUS_OK;
        }

        @Override
        public ByteArrayInputStream getInputStream() {
            return new ByteArrayInputStream(
                    "{\"token\":\"server-token\"}".getBytes(
                            StandardCharsets.UTF_8));
        }
    }

    private static class TestCustomInterceptor extends CustomInterceptor {

        private int authClients;
        private int unauthClients;
        private String graphSpace;
        private String graph;
        private String token;

        @Override
        protected org.apache.hugegraph.driver.HugeClient authClient(
                  String graphSpace, String graph, String token) {
            this.authClients++;
            this.graphSpace = graphSpace;
            this.graph = graph;
            this.token = token;
            return null;
        }

        @Override
        protected org.apache.hugegraph.driver.HugeClient unauthClient() {
            this.unauthClients++;
            return null;
        }
    }

    private static void setField(Object object, String name, Object value)
                                 throws Exception {
        Class<?> type = object.getClass();
        while (type != null) {
            try {
                Field field = type.getDeclaredField(name);
                field.setAccessible(true);
                field.set(object, value);
                return;
            } catch (NoSuchFieldException ignored) {
                type = type.getSuperclass();
            }
        }
        throw new NoSuchFieldException(name);
    }

    private static void assertThrows(Class<? extends Throwable> expected,
                                     ThrowingRunnable runnable) {
        try {
            runnable.run();
        } catch (Throwable actual) {
            if (expected.isInstance(actual)) {
                return;
            }
            throw new AssertionError("Unexpected exception type", actual);
        }
        throw new AssertionError("Expected exception: " + expected.getName());
    }

    private interface ThrowingRunnable {

        void run() throws Throwable;
    }
}
