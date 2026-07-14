/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
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

package org.apache.hugegraph.unit;

import java.util.Arrays;

import com.baomidou.mybatisplus.core.metadata.IPage;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.AuthManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.auth.UserEntity;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.auth.UserService;
import org.apache.hugegraph.structure.auth.User;

public class UserServiceCompatibilityTest {

    private HugeConfig config;
    private HugeClient client;
    private AuthManager auth;
    private UserService service;

    @Before
    public void setup() {
        this.config = Mockito.mock(HugeConfig.class);
        this.client = Mockito.mock(HugeClient.class);
        this.auth = Mockito.mock(AuthManager.class);
        Mockito.when(this.client.auth()).thenReturn(this.auth);
        Mockito.when(this.auth.createUser(Mockito.any(User.class)))
               .thenReturn(new User());
        this.service = new UserService();
        ReflectionTestUtils.setField(this.service, "config", this.config);
    }

    @Test
    public void testStandaloneUserCreationOmitsPdOnlyNickname() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);

        this.service.add(this.client, userEntity("display-name"));

        ArgumentCaptor<User> request = ArgumentCaptor.forClass(User.class);
        Mockito.verify(this.auth).createUser(request.capture());
        Assert.assertNull(request.getValue().nickname());
    }

    @Test
    public void testPdUserCreationKeepsNickname() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(true);

        this.service.add(this.client, userEntity("display-name"));

        ArgumentCaptor<User> request = ArgumentCaptor.forClass(User.class);
        Mockito.verify(this.auth).createUser(request.capture());
        Assert.assertEquals("display-name", request.getValue().nickname());
    }

    @Test
    public void testStandaloneAccountLevelsMatchServerRoles() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        Mockito.when(this.auth.listUsers())
               .thenReturn(Arrays.asList(user("admin"), user("hubbleuser")));

        @SuppressWarnings("unchecked")
        IPage<UserEntity> result = (IPage<UserEntity>)
                this.service.queryPage(this.client, "", 1, 10);

        Assert.assertTrue(result.getRecords().get(0).isSuperadmin());
        Assert.assertFalse(result.getRecords().get(1).isSuperadmin());
    }

    @Test
    public void testStandaloneUserUpdateOmitsPdOnlyNickname() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        UserEntity user = UserEntity.builder()
                                    .id("user-id")
                                    .name("user")
                                    .nickname("display-name")
                                    .build();

        this.service.update(this.client, user);

        ArgumentCaptor<User> request = ArgumentCaptor.forClass(User.class);
        Mockito.verify(this.auth).updateUser(request.capture());
        Assert.assertNull(request.getValue().nickname());
    }

    @Test
    public void testStandalonePersonalUpdateOmitsPdOnlyNickname() {
        Mockito.when(this.config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        Mockito.when(this.auth.getUserByName("user"))
               .thenReturn(user("user"));

        this.service.updatePersonal(this.client, "user", "display-name",
                                    "description");

        ArgumentCaptor<User> request = ArgumentCaptor.forClass(User.class);
        Mockito.verify(this.auth).updateUser(request.capture());
        Assert.assertNull(request.getValue().nickname());
        Assert.assertEquals("description", request.getValue().description());
    }

    private static UserEntity userEntity(String nickname) {
        return UserEntity.builder()
                         .name("user")
                         .nickname(nickname)
                         .password("password")
                         .build();
    }

    private static User user(String name) {
        User user = new User();
        user.setId(name);
        user.name(name);
        return user;
    }
}
