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
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;
import org.springframework.http.HttpStatus;

public class ExceptionAdvisorStatusTest {

    @Test
    public void testPreserveServerAuthenticationAndPermissionStatus() {
        Assert.assertEquals(HttpStatus.UNAUTHORIZED.value(),
                            ExceptionAdvisor.serverStatus(401));
        Assert.assertEquals(HttpStatus.FORBIDDEN.value(),
                            ExceptionAdvisor.serverStatus(403));
        Assert.assertEquals(Constant.STATUS_BAD_REQUEST,
                            ExceptionAdvisor.serverStatus(500));
    }
}
