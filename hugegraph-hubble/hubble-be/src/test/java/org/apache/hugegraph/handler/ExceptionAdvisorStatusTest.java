/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hugegraph.handler;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.common.Response;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.service.op.OperationsNodeNotFoundException;
import org.apache.hugegraph.testutil.Assert;
import org.junit.After;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

public class ExceptionAdvisorStatusTest {

    @After
    public void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    public void testPreserveServerAuthenticationAndPermissionStatus() {
        Assert.assertEquals(HttpStatus.UNAUTHORIZED.value(),
                            ExceptionAdvisor.serverStatus(401));
        Assert.assertEquals(HttpStatus.FORBIDDEN.value(),
                            ExceptionAdvisor.serverStatus(403));
        Assert.assertEquals(Constant.STATUS_BAD_REQUEST,
                            ExceptionAdvisor.serverStatus(500));
    }

    @Test
    public void testOperationsMissingNodeIsAQuietNotFound() {
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(
                new MockHttpServletRequest()));

        Response response = new ExceptionAdvisor().exceptionHandler(
                            new OperationsNodeNotFoundException());

        Assert.assertEquals(HttpStatus.NOT_FOUND.value(),
                            response.getStatus());
        Assert.assertEquals("operations_node_not_found",
                            response.getMessage());
        Assert.assertNull(response.getCause());
    }

    @Test
    public void testServerConnectionFailureDoesNotExposeAddress() {
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(
                new MockHttpServletRequest()));
        ServerException failure = new ServerException(
                "Failed to connect to /127.0.0.1:8080/private");
        failure.status(HttpStatus.INTERNAL_SERVER_ERROR.value());

        Response response = advisor().exceptionHandler(failure);

        Assert.assertEquals(Constant.STATUS_BAD_REQUEST,
                            response.getStatus());
        Assert.assertEquals("upstream_unavailable", response.getMessage());
        Assert.assertFalse(response.getMessage().contains("127.0.0.1"));
        Assert.assertFalse(response.getMessage().contains("8080"));
        Assert.assertFalse(response.getMessage().contains("private"));
    }

    @Test
    public void testServerAuthenticationFailureKeepsStatusWithoutBody() {
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(
                new MockHttpServletRequest()));
        ServerException failure = new ServerException(
                                  "Authentication failed secret-canary");
        failure.status(HttpStatus.UNAUTHORIZED.value());

        Response response = advisor().exceptionHandler(failure);

        Assert.assertEquals(HttpStatus.UNAUTHORIZED.value(),
                            response.getStatus());
        Assert.assertEquals("upstream_unauthorized", response.getMessage());
        Assert.assertFalse(response.getMessage().contains("secret-canary"));
    }

    @Test
    public void testServerPermissionFailureKeepsStatusWithoutBody() {
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(
                new MockHttpServletRequest()));
        ServerException failure = new ServerException(
                                  "Forbidden http://user:secret@host/private");
        failure.status(HttpStatus.FORBIDDEN.value());

        Response response = advisor().exceptionHandler(failure);

        Assert.assertEquals(HttpStatus.FORBIDDEN.value(), response.getStatus());
        Assert.assertEquals("upstream_forbidden", response.getMessage());
        Assert.assertFalse(response.getMessage().contains("secret"));
        Assert.assertFalse(response.getMessage().contains("private"));
    }

    @Test
    public void testUnexpectedFailureUsesStableSafeMessage() {
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(
                new MockHttpServletRequest()));
        RuntimeException failure = new RuntimeException(
                "http://user:secret@127.0.0.1:8080/private secret-canary");

        Response response = advisor().exceptionHandler(failure);

        Assert.assertEquals(Constant.STATUS_BAD_REQUEST, response.getStatus());
        Assert.assertEquals("unexpected_request_failure",
                            response.getMessage());
        Assert.assertFalse(response.getMessage().contains("127.0.0.1"));
        Assert.assertFalse(response.getMessage().contains("secret-canary"));
    }

    private static ExceptionAdvisor advisor() {
        MessageSourceHandler messages = Mockito.mock(
                                        MessageSourceHandler.class);
        Mockito.when(messages.getMessage(Mockito.anyString(),
                                          Mockito.nullable(Object[].class)))
               .thenAnswer(invocation -> invocation.getArgument(0));
        ExceptionAdvisor advisor = new ExceptionAdvisor();
        ReflectionTestUtils.setField(advisor, "messageSourceHandler", messages);
        return advisor;
    }
}
