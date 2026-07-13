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
        Mockito.when(client.get(path.capture(), Mockito.anyMap()))
               .thenReturn(result);

        AuthManager auth = new AuthManager(client, "DEFAULT", null);
        Assert.assertTrue(auth.isSpaceAdmin("space_a"));
        Assert.assertTrue(auth.checkDefaultRole("space_b", "analyst"));

        Assert.assertEquals("graphspaces/space_a/auth/managers/check",
                            path.getAllValues().get(0));
        Assert.assertEquals("graphspaces/space_b/auth/managers/default",
                            path.getAllValues().get(1));
    }
}
