/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
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
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

public class ResponseAdvisorStatusTest {

    @Test
    public void testErrorResponseSetsMatchingHttpStatus() {
        MockHttpServletResponse servletResponse = write(
                Response.builder()
                        .status(HttpStatus.NOT_FOUND.value())
                        .message("not found")
                        .build());

        Assert.assertEquals(HttpStatus.NOT_FOUND.value(),
                            servletResponse.getStatus());
    }

    @Test
    public void testCustomErrorResponseUsesBadRequestHttpStatus() {
        MockHttpServletResponse servletResponse = write(
                Response.builder()
                        .status(Constant.STATUS_ILLEGAL_GREMLIN)
                        .message("illegal gremlin")
                        .build());

        Assert.assertEquals(HttpStatus.BAD_REQUEST.value(),
                            servletResponse.getStatus());
    }

    @Test
    public void testSuccessResponseKeepsSuccessfulHttpStatus() {
        MockHttpServletResponse servletResponse = write(
                Response.builder()
                        .status(HttpStatus.OK.value())
                        .data("ok")
                        .build());

        Assert.assertEquals(HttpStatus.OK.value(), servletResponse.getStatus());
    }

    @Test
    public void testExternalExceptionCannotExposeSuccessfulStatus() {
        Assert.assertEquals(HttpStatus.BAD_REQUEST.value(),
                            ExceptionAdvisor.errorStatus(
                            HttpStatus.CREATED.value()));
        Assert.assertEquals(HttpStatus.BAD_GATEWAY.value(),
                            ExceptionAdvisor.errorStatus(
                            HttpStatus.BAD_GATEWAY.value()));
    }

    @SuppressWarnings("unchecked")
    private static MockHttpServletResponse write(Response body) {
        ResponseAdvisor advisor = new ResponseAdvisor();
        MockHttpServletRequest servletRequest = new MockHttpServletRequest();
        MockHttpServletResponse servletResponse = new MockHttpServletResponse();
        advisor.beforeBodyWrite(
                body,
                Mockito.mock(MethodParameter.class),
                MediaType.APPLICATION_JSON,
                (Class<? extends HttpMessageConverter<?>>) (Class<?>)
                HttpMessageConverter.class,
                new ServletServerHttpRequest(servletRequest),
                new ServletServerHttpResponse(servletResponse));
        return servletResponse;
    }
}
