/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
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

import java.lang.reflect.Field;

import org.junit.Before;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.util.NestedServletException;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.controller.auth.UserController;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.exception.UnauthorizedException;
import org.apache.hugegraph.service.auth.UserService;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

public class UserApiContractTest {

    private MockMvc mvc;
    private HugeClient client;
    private UserService userService;
    private RequestPostProcessor withClient;

    @Before
    public void setup() throws Exception {
        UserController controller = new UserController();
        this.userService = Mockito.mock(UserService.class);
        this.setField(controller, "userService", this.userService);
        this.client = Mockito.mock(HugeClient.class);
        this.withClient = request -> {
            request.setAttribute("hugeClient", this.client);
            return request;
        };
        this.mvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    public void testUpdatePersonalUsesPutAndJsonBody() throws Exception {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(Constant.USERNAME_KEY, "alice");

        this.mvc.perform(put("/api/v1.3/auth/users/personal")
                         .with(this.withClient)
                         .session(session)
                         .contentType(MediaType.APPLICATION_JSON)
                         .content("{\"nickname\":\"Alice\"," +
                                  "\"description\":\"owner\"}"))
                .andExpect(status().isOk());

        Mockito.verify(this.userService)
               .updatePersonal(this.client, "alice", "Alice", "owner");
    }

    @Test
    public void testUpdatePersonalRequiresAuthentication() throws Exception {
        this.assertRequestCause(UnauthorizedException.class,
                                () -> this.mvc.perform(
                                        put("/api/v1.3/auth/users/personal")
                                        .with(this.withClient)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content("{\"nickname\":\"Alice\"}")));
    }

    @Test
    public void testUpdatePersonalRejectsEmptyNickname() throws Exception {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(Constant.USERNAME_KEY, "alice");

        this.assertRequestCause(ExternalException.class,
                                () -> this.mvc.perform(
                                        put("/api/v1.3/auth/users/personal")
                                        .with(this.withClient)
                                        .session(session)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content("{\"nickname\":\"\"}")));
    }

    @Test
    public void testRetiredUserRoutesAreUnavailable() throws Exception {
        this.mvc.perform(post("/api/v1.3/auth/users/uuap"))
                .andExpect(status().isMethodNotAllowed());
        this.mvc.perform(delete("/api/v1.3/auth/users/super/alice"))
                .andExpect(status().isNotFound());
        Mockito.verifyNoMoreInteractions(this.userService);
    }

    private void assertRequestCause(Class<? extends Throwable> expected,
                                    Request request) throws Exception {
        try {
            request.perform();
            org.junit.Assert.fail("Expected request to throw " +
                                  expected.getName());
        } catch (NestedServletException e) {
            org.apache.hugegraph.testutil.Assert.assertInstanceOf(expected,
                                                                  e.getCause());
        }
    }

    @FunctionalInterface
    private interface Request {

        void perform() throws Exception;
    }

    private void setField(Object target, String name, Object value)
                          throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }
}
