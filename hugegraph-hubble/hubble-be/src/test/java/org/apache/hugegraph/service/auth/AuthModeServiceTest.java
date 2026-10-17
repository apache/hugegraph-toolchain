/*
 *
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

package org.apache.hugegraph.service.auth;

import org.apache.hugegraph.driver.HugeClient;
import org.junit.Assert;
import org.junit.Test;
import org.mockito.Mockito;

public class AuthModeServiceTest {

    @Test
    public void testUsesDetectedServerAuthState() {
        HugeClient client = Mockito.mock(HugeClient.class);
        Mockito.when(client.isServerAuthEnabled()).thenReturn(false);
        AuthModeService service = new AuthModeService(null) {
            @Override
            protected HugeClient createUnauthClient() {
                return client;
            }
        };

        Assert.assertFalse(service.enabled());
        Assert.assertTrue(service.anonymous());
        Mockito.verify(client).isServerAuthEnabled();
    }

    @Test
    public void testRefreshBypassesCachedAnonymousModeAndUpdatesItsConsumers() {
        HugeClient client = Mockito.mock(HugeClient.class);
        Mockito.when(client.isServerAuthEnabled()).thenReturn(false, true);
        AuthModeService service = new AuthModeService(null) {
            @Override
            protected HugeClient createUnauthClient() {
                return client;
            }
        };
        Assert.assertTrue(service.anonymous());
        Assert.assertTrue(service.anonymous());
        Assert.assertTrue(service.refresh());
        Assert.assertFalse(service.anonymous());
        Mockito.verify(client, Mockito.times(2)).isServerAuthEnabled();
    }

    @Test
    public void testFailsClosedWhenServerCannotBeProbed() {
        AuthModeService service = new AuthModeService(null) {
            @Override
            protected HugeClient createUnauthClient() {
                throw new IllegalStateException("unavailable");
            }
        };

        Assert.assertTrue(service.enabled());
    }
}
