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
package org.apache.hugegraph.service.op;

import java.util.Set;

import org.junit.Test;

import org.apache.hugegraph.exception.ForbiddenException;
import org.apache.hugegraph.testutil.Assert;

public class OperationsCapabilityServiceTest {

    @Test
    public void testAdminReceivesAllReadCapabilities() {
        Set<String> capabilities = OperationsCapabilityService.forLevel("ADMIN");

        Assert.assertTrue(capabilities.contains("operations_health_read"));
        Assert.assertTrue(capabilities.contains("operations_topology_read"));
        Assert.assertTrue(capabilities.contains("operations_metrics_read"));
    }

    @Test
    public void testSpaceAdminHasNoGlobalOperationsCapability() {
        Set<String> capabilities = OperationsCapabilityService.forLevel(
                                           "SPACEADMIN");

        Assert.assertTrue(capabilities.isEmpty());
    }

    @Test
    public void testUserHasNoGlobalOperationsCapability() {
        Assert.assertTrue(OperationsCapabilityService.forLevel("USER").isEmpty());
    }

    @Test(expected = ForbiddenException.class)
    public void testHealthAccessRejectsOrdinaryUser() {
        OperationsCapabilityService.requireHealth(
                OperationsCapabilityService.forLevel("USER"));
    }
}
