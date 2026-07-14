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

import java.util.Collections;
import java.util.Map;

import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.exception.ForbiddenException;
import org.apache.hugegraph.service.auth.UserService;
import org.apache.hugegraph.service.op.OperationsDataService;
import org.apache.hugegraph.testutil.Assert;
import org.junit.After;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.controller.op.OperationsController;

public class OperationsControllerTest {

    @After
    public void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    public void testCapabilitiesAreDerivedByBackend() {
        Fixture fixture = fixture("SPACEADMIN");

        Map<String, Object> response = fixture.controller.capabilities();

        Assert.assertEquals(Collections.emptySet(),
                            response.get("capabilities"));
    }

    @Test(expected = ForbiddenException.class)
    public void testDirectOverviewUrlRejectsOrdinaryUser() {
        fixture("USER").controller.overview(false);
    }

    @Test(expected = ForbiddenException.class)
    public void testSpaceAdminCannotReadNodeTopology() {
        fixture("SPACEADMIN").controller.nodes(null, null, null, 1, 20,
                                                "name", "asc");
    }

    @Test
    public void testAdminCanReadNodes() {
        Fixture fixture = fixture("ADMIN");
        Mockito.when(fixture.dataService.nodes(Mockito.any(), Mockito.anySet(),
                                                Mockito.isNull(), Mockito.isNull(),
                                                Mockito.isNull(), Mockito.eq(1),
                                                Mockito.eq(20), Mockito.eq("name"),
                                                Mockito.eq("asc")))
               .thenReturn(Collections.singletonMap("total", 0));

        Map<String, Object> response = fixture.controller.nodes(null, null, null,
                                                                 1, 20,
                                                                 "name", "asc");

        Assert.assertEquals(0, response.get("total"));
    }

    private static Fixture fixture(String level) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession().setAttribute(Constant.USERNAME_KEY, "operator");
        request.getSession().setAttribute(Constant.TOKEN_KEY, "token");
        HugeClient client = Mockito.mock(HugeClient.class);
        request.setAttribute("hugeClient", client);
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(request));

        UserService userService = Mockito.mock(UserService.class);
        Mockito.when(userService.userLevel(client, "operator")).thenReturn(level);
        OperationsDataService dataService = Mockito.mock(
                                             OperationsDataService.class);
        OperationsController controller = new OperationsController();
        ReflectionTestUtils.setField(controller, "userService", userService);
        ReflectionTestUtils.setField(controller, "dataService", dataService);
        return new Fixture(controller, dataService);
    }

    private static final class Fixture {

        private final OperationsController controller;
        private final OperationsDataService dataService;

        private Fixture(OperationsController controller,
                        OperationsDataService dataService) {
            this.controller = controller;
            this.dataService = dataService;
        }
    }
}
