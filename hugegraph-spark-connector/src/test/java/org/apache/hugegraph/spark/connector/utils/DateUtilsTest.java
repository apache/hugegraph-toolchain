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

package org.apache.hugegraph.spark.connector.utils;

import java.util.Date;

import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;

public class DateUtilsTest {

    private static final String PATTERN = "yyyy-MM-dd HH:mm:ss";

    @Test
    public void testParseWithTimeZone() {
        Date gmt0 = DateUtils.parse("1970-01-02 00:00:00", PATTERN, "GMT+0");
        Date gmt8 = DateUtils.parse("1970-01-02 00:00:00", PATTERN, "GMT+8");

        Assert.assertEquals(86400000L, gmt0.getTime());
        Assert.assertEquals(8 * 3600 * 1000L, gmt0.getTime() - gmt8.getTime());
        Assert.assertEquals(0L, DateUtils.parse("1970-01-01", "yyyy-MM-dd", "GMT+0")
                                         .getTime());
    }

    @Test
    public void testParseInvalidDate() {
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            DateUtils.parse("1970/01/02", PATTERN, "GMT+0");
        });
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            DateUtils.parse("", PATTERN, "GMT+0");
        });
    }
}
