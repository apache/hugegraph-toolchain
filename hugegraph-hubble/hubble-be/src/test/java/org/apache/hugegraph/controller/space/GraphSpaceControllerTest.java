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

package org.apache.hugegraph.controller.space;

import org.junit.Test;

import org.apache.hugegraph.entity.space.GraphSpaceEntity;
import org.apache.hugegraph.testutil.Assert;

public class GraphSpaceControllerTest {

    @Test
    public void testApplyDefaultsForOptionalResourceLimits() {
        GraphSpaceEntity graphSpace = new GraphSpaceEntity();

        GraphSpaceController.applyResourceDefaults(graphSpace);

        Assert.assertEquals(100, graphSpace.getMaxGraphNumber());
        Assert.assertEquals(100, graphSpace.getMaxRoleNumber());
        Assert.assertEquals(64, graphSpace.getCpuLimit());
        Assert.assertEquals(128, graphSpace.getMemoryLimit());
        Assert.assertEquals(64, graphSpace.getComputeCpuLimit());
        Assert.assertEquals(128, graphSpace.getComputeMemoryLimit());
        Assert.assertEquals(1000000, graphSpace.getStorageLimit());
    }

    @Test
    public void testApplyDefaultsPreservesExplicitResourceLimits() {
        GraphSpaceEntity graphSpace = new GraphSpaceEntity();
        graphSpace.setMaxGraphNumber(2);
        graphSpace.setMaxRoleNumber(3);
        graphSpace.setCpuLimit(4);
        graphSpace.setMemoryLimit(5);
        graphSpace.setComputeCpuLimit(6);
        graphSpace.setComputeMemoryLimit(7);
        graphSpace.setStorageLimit(8);

        GraphSpaceController.applyResourceDefaults(graphSpace);

        Assert.assertEquals(2, graphSpace.getMaxGraphNumber());
        Assert.assertEquals(3, graphSpace.getMaxRoleNumber());
        Assert.assertEquals(4, graphSpace.getCpuLimit());
        Assert.assertEquals(5, graphSpace.getMemoryLimit());
        Assert.assertEquals(6, graphSpace.getComputeCpuLimit());
        Assert.assertEquals(7, graphSpace.getComputeMemoryLimit());
        Assert.assertEquals(8, graphSpace.getStorageLimit());
    }
}
