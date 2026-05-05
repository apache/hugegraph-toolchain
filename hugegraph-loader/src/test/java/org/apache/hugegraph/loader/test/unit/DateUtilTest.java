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

import java.util.Date;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import org.apache.hugegraph.loader.util.DateUtil;
import org.junit.Test;

import org.apache.hugegraph.testutil.Assert;

public class DateUtilTest {

    @Test
    public void testNowUsesDefaultTimeZone() {
        String pattern = "Z";
        DateUtil.parse("+0000", pattern, "GMT");
        Assert.assertEquals("+0800", DateUtil.now(pattern));
    }

    @Test
    public void testCheckTimeZone() {
        Assert.assertTrue(DateUtil.checkTimeZone("JST"));
        Assert.assertTrue(DateUtil.checkTimeZone("UTC"));
        Assert.assertTrue(DateUtil.checkTimeZone("GMT"));
        // GMT+00:00
        Assert.assertTrue(DateUtil.checkTimeZone("GMT+0"));
        // GMT-00:00
        Assert.assertTrue(DateUtil.checkTimeZone("GMT-0"));
        // GMT+09:00
        Assert.assertTrue(DateUtil.checkTimeZone("GMT+9:00"));
        // GMT+10:30
        Assert.assertTrue(DateUtil.checkTimeZone("GMT+10:30"));
        // GMT-04:00
        Assert.assertTrue(DateUtil.checkTimeZone("GMT-0400"));
        // GMT+08:00
        Assert.assertTrue(DateUtil.checkTimeZone("GMT+8"));
        // GMT-13:00
        Assert.assertTrue(DateUtil.checkTimeZone("GMT-13"));
        // GMT-13:59
        Assert.assertTrue(DateUtil.checkTimeZone("GMT+13:59"));
        // NOTE: valid time zone IDs (see TimeZone.getAvailableIDs())
        // GMT-08:00
        Assert.assertTrue(DateUtil.checkTimeZone("America/Los_Angeles"));
        // GMT+09:00
        Assert.assertTrue(DateUtil.checkTimeZone("Japan"));
        // GMT+01:00
        Assert.assertTrue(DateUtil.checkTimeZone("Europe/Berlin"));
        // GMT+04:00
        Assert.assertTrue(DateUtil.checkTimeZone("Europe/Moscow"));
        // GMT+08:00
        Assert.assertTrue(DateUtil.checkTimeZone("Asia/Singapore"));

        Assert.assertFalse(DateUtil.checkTimeZone("JPY"));
        Assert.assertFalse(DateUtil.checkTimeZone("USD"));
        Assert.assertFalse(DateUtil.checkTimeZone("UTC+8"));
        Assert.assertFalse(DateUtil.checkTimeZone("UTC+09:00"));
        Assert.assertFalse(DateUtil.checkTimeZone("+09:00"));
        Assert.assertFalse(DateUtil.checkTimeZone("-08:00"));
        Assert.assertFalse(DateUtil.checkTimeZone("-1"));
        Assert.assertFalse(DateUtil.checkTimeZone("GMT+10:-30"));
        // hours 0-23 only
        Assert.assertFalse(DateUtil.checkTimeZone("GMT+24:00"));
        // minutes 00-59 only
        Assert.assertFalse(DateUtil.checkTimeZone("GMT+13:60"));
    }

    @Test
    public void testConcurrentParseDateWithDifferentTimeZones() throws InterruptedException {
        int threads = 10;
        int iterations = 100;
        ExecutorService executor = Executors.newFixedThreadPool(threads);
        CountDownLatch latch = new CountDownLatch(threads);
        AtomicInteger errors = new AtomicInteger(0);

        String dateStr = "2024-01-15 12:00:00";
        String pattern = "yyyy-MM-dd HH:mm:ss";
        long expectedEpochGMT8 = DateUtil.parse(dateStr, pattern, "GMT+8").getTime();
        long expectedEpochGMT0 = DateUtil.parse(dateStr, pattern, "GMT+0").getTime();
        long expectedDiff = 8 * 60 * 60 * 1000;

        for (int i = 0; i < threads; i++) {
            final int threadId = i;
            executor.submit(() -> {
                try {
                    String timeZone = threadId % 2 == 0 ? "GMT+8" : "GMT+0";
                    long expectedEpoch = threadId % 2 == 0 ? expectedEpochGMT8 : expectedEpochGMT0;
                    for (int j = 0; j < iterations; j++) {
                        Date result = DateUtil.parse(dateStr, pattern, timeZone);
                        if (result == null || result.getTime() != expectedEpoch) {
                            errors.incrementAndGet();
                        }
                    }
                } catch (Exception e) {
                    errors.incrementAndGet();
                } finally {
                    latch.countDown();
                }
            });
        }

        latch.await();
        executor.shutdown();

        Assert.assertEquals(0, errors.get());
        Assert.assertEquals(expectedDiff, expectedEpochGMT0 - expectedEpochGMT8);
    }
}
