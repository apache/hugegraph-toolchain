/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
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

import java.util.Map;

import org.apache.hugegraph.client.RestClient;
import org.apache.hugegraph.driver.AuthManager;
import org.apache.hugegraph.rest.RestResult;
import org.apache.hugegraph.structure.auth.Access;
import org.apache.hugegraph.structure.auth.Belong;
import org.apache.hugegraph.structure.auth.HugePermission;
import org.apache.hugegraph.structure.auth.Group;
import org.apache.hugegraph.structure.auth.Target;
import org.apache.hugegraph.structure.auth.UserManager;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

public class ManagerAPITest extends BaseUnitTest {

    @Test
    public void testScopedTargetGraphSpaceIsResponseOnly() {
        Target target = new Target();
        target.name("target");
        target.graphSpace("SPACE_A");
        target.graph("hugegraph");
        target.description("description");

        String payload = serialize(target);

        Assert.assertFalse(payload.contains("\"graphspace\""));
        Assert.assertContains("\"target_description\":\"description\"",
                              payload);

        Target response = deserialize("{\"graphspace\":\"SPACE_A\"}",
                                      Target.class);
        Assert.assertEquals("SPACE_A", response.graphSpace());

        Access access = new Access();
        access.graphSpace("SPACE_A");
        Assert.assertFalse(serialize(access).contains("\"graphspace\""));
        Assert.assertEquals("SPACE_A", deserialize(
                "{\"graphspace\":\"SPACE_A\"}", Access.class)
                .graphSpace());

        Belong belong = new Belong();
        belong.graphSpace("SPACE_A");
        Assert.assertFalse(serialize(belong).contains("\"graphspace\""));
        Assert.assertEquals("SPACE_A", deserialize(
                "{\"graphspace\":\"SPACE_A\"}", Belong.class)
                .graphSpace());
    }

    @Test
    public void testGraphSpaceGroupsUseScopedPathWithoutChangingGlobalPath() {
        RestClient client = Mockito.mock(RestClient.class);
        RestResult result = Mockito.mock(RestResult.class);
        Group group = new Group();
        group.name("role");
        Mockito.when(result.readObject(Group.class)).thenReturn(group);
        Mockito.when(result.readList("groups", Group.class))
               .thenReturn(java.util.Collections.emptyList());

        ArgumentCaptor<String> postPaths =
                ArgumentCaptor.forClass(String.class);
        Mockito.when(client.post(postPaths.capture(),
                                 Mockito.any(Group.class)))
               .thenReturn(result);
        ArgumentCaptor<String> listPath =
                ArgumentCaptor.forClass(String.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> params =
                ArgumentCaptor.forClass(Map.class);
        Mockito.when(client.get(listPath.capture(), params.capture()))
               .thenReturn(result);

        AuthManager auth = new AuthManager(client, "SPACE_A", null);
        auth.createGraphSpaceGroup(group);
        auth.createGroup(group);
        auth.listGraphSpaceGroups(10);

        Assert.assertEquals("graphspaces/SPACE_A/auth/groups",
                            postPaths.getAllValues().get(0));
        Assert.assertEquals("auth/groups",
                            postPaths.getAllValues().get(1));
        Assert.assertEquals("graphspaces/SPACE_A/auth/groups",
                            listPath.getValue());
        Assert.assertEquals(10, params.getValue().get("limit"));
    }

    @Test
    public void testSpaceAdminUsesPathGraphSpaceAndMinimalBody() {
        RestClient client = Mockito.mock(RestClient.class);
        RestResult result = Mockito.mock(RestResult.class);
        Mockito.when(result.readObject(UserManager.class))
               .thenReturn(new UserManager());

        ArgumentCaptor<String> path = ArgumentCaptor.forClass(String.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> payload =
                ArgumentCaptor.forClass(Map.class);
        Mockito.when(client.post(path.capture(), payload.capture()))
               .thenReturn(result);

        AuthManager auth = new AuthManager(client, "DEFAULT", null);
        auth.addSpaceAdmin("alice", "demo_space");

        Assert.assertEquals("graphspaces/demo_space/auth/managers",
                            path.getValue());
        Assert.assertEquals("alice", payload.getValue().get("user"));
        Assert.assertEquals(HugePermission.SPACE,
                            payload.getValue().get("type"));
        Assert.assertFalse(payload.getValue().containsKey("graphspace"));
    }

    @Test
    public void testSpaceChecksUseEachTargetGraphSpacePath() {
        RestClient client = Mockito.mock(RestClient.class);
        RestResult result = Mockito.mock(RestResult.class);
        Mockito.when(result.readObject(Map.class))
               .thenReturn(java.util.Collections.singletonMap("check", true));

        ArgumentCaptor<String> path = ArgumentCaptor.forClass(String.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> params =
                ArgumentCaptor.forClass(Map.class);
        Mockito.when(client.get(path.capture(), params.capture()))
               .thenReturn(result);

        AuthManager auth = new AuthManager(client, "DEFAULT", null);
        Assert.assertTrue(auth.isSpaceAdmin("space_a"));
        Assert.assertTrue(auth.checkDefaultRole("space_b", "analyst"));

        Assert.assertEquals("graphspaces/space_a/auth/managers/check",
                            path.getAllValues().get(0));
        Assert.assertEquals("graphspaces/space_b/auth/managers/default",
                            path.getAllValues().get(1));
        Assert.assertEquals(HugePermission.SPACE,
                            params.getAllValues().get(0).get("type"));
        Assert.assertEquals("space_a",
                            params.getAllValues().get(0).get("graphspace"));
        Assert.assertEquals("space_b",
                            params.getAllValues().get(1).get("graphspace"));
        Assert.assertEquals("analyst",
                            params.getAllValues().get(1).get("role"));
        Assert.assertFalse(params.getAllValues().get(1).containsKey("graph"));
    }

    @Test
    public void testAllSpaceOperationsUseTargetGraphSpacePath() {
        RestClient client = Mockito.mock(RestClient.class);
        RestResult result = Mockito.mock(RestResult.class);
        Mockito.when(result.readList("admins", String.class))
               .thenReturn(java.util.Collections.singletonList("alice"));
        Mockito.when(result.readObject(Map.class))
               .thenReturn(java.util.Collections.singletonMap("check", true));

        ArgumentCaptor<String> deletePath =
                ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> getPath = ArgumentCaptor.forClass(String.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> deleteParams =
                ArgumentCaptor.forClass(Map.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> getParams =
                ArgumentCaptor.forClass(Map.class);
        Mockito.when(client.get(getPath.capture(), getParams.capture()))
               .thenReturn(result);
        Mockito.when(client.post(Mockito.anyString(), Mockito.anyMap()))
               .thenReturn(result);

        AuthManager auth = new AuthManager(client, "DEFAULT", null);
        auth.delSpaceAdmin("alice", "space_a");
        auth.addSpaceMember("bob", "space_a");
        auth.delSpaceMember("bob", "space_a");
        Assert.assertEquals(java.util.Collections.singletonList("alice"),
                            auth.listSpaceAdmin("space_b"));
        Assert.assertEquals(java.util.Collections.singletonList("alice"),
                            auth.listSpaceMember("space_b"));
        Assert.assertTrue(auth.checkDefaultRole("space_c", "analyst",
                                                "graph_1"));

        Mockito.verify(client, Mockito.times(2)).delete(deletePath.capture(),
                                                        deleteParams.capture());
        Assert.assertEquals("graphspaces/space_a/auth/managers",
                            deletePath.getAllValues().get(0));
        Assert.assertEquals("space_a",
                            deleteParams.getAllValues().get(0)
                                        .get("graphspace"));
        Assert.assertEquals("alice",
                            deleteParams.getAllValues().get(0).get("user"));
        Assert.assertEquals(HugePermission.SPACE,
                            deleteParams.getAllValues().get(0).get("type"));
        Assert.assertEquals("bob",
                            deleteParams.getAllValues().get(1).get("user"));
        Assert.assertEquals(HugePermission.SPACE_MEMBER,
                            deleteParams.getAllValues().get(1).get("type"));
        Assert.assertEquals("graphspaces/space_b/auth/managers",
                            getPath.getAllValues().get(0));
        Assert.assertEquals("space_b",
                            getParams.getAllValues().get(0).get("graphspace"));
        Assert.assertEquals(HugePermission.SPACE,
                            getParams.getAllValues().get(0).get("type"));
        Assert.assertEquals(HugePermission.SPACE_MEMBER,
                            getParams.getAllValues().get(1).get("type"));
        Assert.assertEquals("graphspaces/space_c/auth/managers/default",
                            getPath.getAllValues().get(2));
        Assert.assertEquals("space_c",
                            getParams.getAllValues().get(2).get("graphspace"));
        Assert.assertEquals("analyst",
                            getParams.getAllValues().get(2).get("role"));
        Assert.assertEquals("graph_1",
                            getParams.getAllValues().get(2).get("graph"));
    }
}
