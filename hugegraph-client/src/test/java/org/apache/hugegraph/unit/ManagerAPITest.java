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
import org.apache.hugegraph.structure.auth.HugePermission;
import org.apache.hugegraph.structure.auth.UserManager;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

public class ManagerAPITest extends BaseUnitTest {

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

        AuthManager auth = new AuthManager(client, "DEFAULT", null);
        auth.delSpaceAdmin("alice", "space_a");
        Assert.assertEquals(java.util.Collections.singletonList("alice"),
                            auth.listSpaceAdmin("space_b"));
        Assert.assertTrue(auth.checkDefaultRole("space_c", "analyst",
                                                "graph_1"));

        Mockito.verify(client).delete(deletePath.capture(),
                                      deleteParams.capture());
        Assert.assertEquals("graphspaces/space_a/auth/managers",
                            deletePath.getValue());
        Assert.assertEquals("space_a",
                            deleteParams.getValue().get("graphspace"));
        Assert.assertEquals("alice",
                            deleteParams.getValue().get("user"));
        Assert.assertEquals(HugePermission.SPACE,
                            deleteParams.getValue().get("type"));
        Assert.assertEquals("graphspaces/space_b/auth/managers",
                            getPath.getAllValues().get(0));
        Assert.assertEquals("space_b",
                            getParams.getAllValues().get(0).get("graphspace"));
        Assert.assertEquals(HugePermission.SPACE,
                            getParams.getAllValues().get(0).get("type"));
        Assert.assertEquals("graphspaces/space_c/auth/managers/default",
                            getPath.getAllValues().get(1));
        Assert.assertEquals("space_c",
                            getParams.getAllValues().get(1).get("graphspace"));
        Assert.assertEquals("analyst",
                            getParams.getAllValues().get(1).get("role"));
        Assert.assertEquals("graph_1",
                            getParams.getAllValues().get(1).get("graph"));
    }
}
