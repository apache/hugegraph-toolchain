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
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hugegraph.unit;

import org.junit.After;
import org.junit.Assert;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.controller.BaseController;
import org.apache.hugegraph.driver.HugeClient;

public class BaseControllerGremlinClientTest {

    @After
    public void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    public void testGremlinClientIgnoresLegacyPasswordAndUsesToken() {
        HugeClient tokenClient = Mockito.mock(HugeClient.class);

        MockHttpServletRequest request = this.requestWithAuth();
        request.setAttribute("hugeClient", tokenClient);
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(request));

        TestController controller = new TestController();
        controller.authClient = tokenClient;

        HugeClient client = controller.gremlinClient("DEFAULT", "hugegraph");

        Assert.assertSame(tokenClient, client);
        Assert.assertSame(tokenClient, request.getAttribute("hugeClient"));
        Assert.assertTrue(controller.authClientCreated);
        Assert.assertEquals("DEFAULT", controller.graphSpace);
        Assert.assertEquals("hugegraph", controller.graph);
        Mockito.verify(tokenClient, Mockito.never()).close();
    }

    @Test
    public void testGremlinClientFallsBackToAuthClientWithoutCredential() {
        HugeClient tokenClient = Mockito.mock(HugeClient.class);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession().setAttribute(Constant.USERNAME_KEY, "admin");
        request.getSession().setAttribute(Constant.TOKEN_KEY, "jwt");
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(request));

        TestController controller = new TestController();
        controller.authClient = tokenClient;

        HugeClient client = controller.gremlinClient("DEFAULT", "hugegraph");

        Assert.assertSame(tokenClient, client);
        Assert.assertSame(tokenClient, request.getAttribute("hugeClient"));
        Assert.assertTrue(controller.authClientCreated);
        Assert.assertEquals("DEFAULT", controller.graphSpace);
        Assert.assertEquals("hugegraph", controller.graph);
    }

    private MockHttpServletRequest requestWithAuth() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession().setAttribute(Constant.USERNAME_KEY, "admin");
        request.getSession().setAttribute(Constant.TOKEN_KEY, "jwt");
        request.getSession().setAttribute("auth_password", "pa");
        request.getSession().setAttribute("auth_password_expire_at",
                                          System.currentTimeMillis() + 10000L);
        return request;
    }

    private static class TestController extends BaseController {

        private HugeClient authClient;
        private boolean authClientCreated;
        private String graphSpace;
        private String graph;

        HugeClient gremlinClient(String graphSpace, String graph) {
            return this.authGremlinClient(graphSpace, graph);
        }

        @Override
        protected HugeClient authClient(String graphSpace, String graph) {
            this.authClientCreated = true;
            this.graphSpace = graphSpace;
            this.graph = graph;
            this.getRequest().setAttribute("hugeClient", this.authClient);
            return this.authClient;
        }
    }
}
