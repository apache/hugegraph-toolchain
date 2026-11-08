/*
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

package org.apache.hugegraph.loader.test.unit;

import org.junit.Test;

import org.apache.hugegraph.loader.metrics.RangesTimer;
import org.apache.hugegraph.testutil.Assert;

public class RangesTimerTest {

    @Test
    public void testTimeRangeWithOverlap() {
        RangesTimer timer = new RangesTimer(3);
        timer.addTimeRange(1, 2);
        timer.addTimeRange(2, 4);
        timer.addTimeRange(5, 8);
        Assert.assertEquals(6, timer.totalTime());
    }

    @Test
    public void testTimeRangeWithStartsFarApart() {
        // The gap between the starts does not fit in an int
        RangesTimer timer = new RangesTimer(2);
        timer.addTimeRange(3_000_000_000L, 3_000_000_001L);
        timer.addTimeRange(0L, 1L);
        Assert.assertEquals(2, timer.totalTime());
    }

    @Test
    public void testTimeRangeWithoutOverlap() {
        RangesTimer timer = new RangesTimer(2);
        timer.addTimeRange(1, 2);
        timer.addTimeRange(3, 4);

        timer.addTimeRange(5, 6);
        timer.addTimeRange(7, 8);
        Assert.assertEquals(4, timer.totalTime());
    }

    @Test
    public void testTimeRangeWithMixedMode() {
        RangesTimer timer = new RangesTimer(2);
        timer.addTimeRange(1, 3);
        timer.addTimeRange(2, 4);

        timer.addTimeRange(3, 5);
        timer.addTimeRange(5, 8);

        timer.addTimeRange(6, 7);
        timer.addTimeRange(6, 9);

        timer.addTimeRange(10, 12);
        Assert.assertEquals(10, timer.totalTime());
    }
}
