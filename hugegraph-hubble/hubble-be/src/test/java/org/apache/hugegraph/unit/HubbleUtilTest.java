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
package org.apache.hugegraph.unit;

import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.TimeZone;

import org.apache.hugegraph.testutil.Assert;
import org.apache.hugegraph.util.HubbleUtil;
import org.apache.hugegraph.util.SerializeUtil;
import org.junit.Test;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;

public class HubbleUtilTest {

    @Test
    public void testEqualCollection() {
        Assert.assertTrue(HubbleUtil.equalCollection(null, null));
        Assert.assertTrue(HubbleUtil.equalCollection(Arrays.asList("a", "b"),
                                                     Arrays.asList("b", "a")));
        Assert.assertTrue(HubbleUtil.equalCollection(Collections.emptyList(),
                                                     Collections.emptySet()));
        Assert.assertFalse(HubbleUtil.equalCollection(Arrays.asList("a"), null));
        Assert.assertFalse(HubbleUtil.equalCollection(null, Arrays.asList("a")));
        Assert.assertFalse(HubbleUtil.equalCollection(Arrays.asList("a", "a"),
                                                      Arrays.asList("a")));
        Assert.assertFalse(HubbleUtil.equalCollection(Arrays.asList("a"),
                                                      Arrays.asList("b")));
    }

    @Test
    public void testTimestampsBefore24Hours() {
        long[] timestamps = HubbleUtil.getTimestampsBefore24Hours("20240115 12:00:00");

        // 2024-01-15 12:00:00 is parsed in the default time zone
        long offset = TimeZone.getDefault().getOffset(1705320000000L) / 1000L;
        long expected = 1705320000L - offset;
        Assert.assertArrayEquals(new long[]{expected - 86400L, expected}, timestamps);

        long[] now = HubbleUtil.getTimestampsBefore24Hours();
        Assert.assertEquals(86400L, now[1] - now[0]);

        Assert.assertThrows(RuntimeException.class, () -> {
            HubbleUtil.getTimestampsBefore24Hours("2024-01-15 12:00:00");
        }, e -> {
            Assert.assertTrue(e.getCause() instanceof java.text.ParseException);
        });
    }

    @Test
    public void testDateFormatDay() {
        Assert.assertEquals("2024-01-15", HubbleUtil.dateFormatDay("20240115"));
        Assert.assertEquals("20240115", HubbleUtil.dateFormatDay(new Date(1705291200000L)));
        Assert.assertEquals("202401", HubbleUtil.dateFormatMonth(new Date(1705291200000L)));
        Assert.assertThrows(RuntimeException.class, () -> {
            HubbleUtil.dateFormatDay("2024/01/15");
        });
    }

    @Test
    public void testMd5() {
        Assert.assertEquals("d41d8cd98f00b204e9800998ecf8427e", HubbleUtil.md5(""));
        Assert.assertEquals("5d41402abc4b2a76b9719d911017c592", HubbleUtil.md5("hello"));

        String secret = HubbleUtil.md5Secret("hello");
        Assert.assertEquals(16, secret.length());
        Assert.assertEquals(secret, HubbleUtil.md5Secret("hello"));
        Assert.assertNotEquals(secret, HubbleUtil.md5Secret("hello!"));
    }

    @Test
    public void testHostPattern() {
        Assert.assertTrue(HubbleUtil.HOST_PATTERN.matcher("127.0.0.1").matches());
        Assert.assertTrue(HubbleUtil.HOST_PATTERN.matcher("localhost").matches());
        Assert.assertTrue(HubbleUtil.HOST_PATTERN.matcher("hugegraph.apache.org").matches());
        Assert.assertFalse(HubbleUtil.HOST_PATTERN.matcher("http://localhost").matches());
        Assert.assertFalse(HubbleUtil.HOST_PATTERN.matcher("local host").matches());
        Assert.assertFalse(HubbleUtil.HOST_PATTERN.matcher("").matches());
    }

    @Test
    public void testSerializers() throws Exception {
        ObjectMapper mapper = new ObjectMapper();

        Assert.assertEquals("{\"size\":\"2 KB\",\"duration\":\"1m 1s\"}",
                            mapper.writeValueAsString(new Sized(2048L, 61500L)));
        Assert.assertEquals("{\"size\":\"0 bytes\",\"duration\":\"0.5s\"}",
                            mapper.writeValueAsString(new Sized(0L, 500L)));
    }

    private static class Sized {

        @JsonProperty("size")
        @JsonSerialize(using = SerializeUtil.SizeSerializer.class)
        private final Long size;
        @JsonProperty("duration")
        @JsonSerialize(using = SerializeUtil.DurationSerializer.class)
        private final Long duration;

        Sized(Long size, Long duration) {
            this.size = size;
            this.duration = duration;
        }
    }
}
