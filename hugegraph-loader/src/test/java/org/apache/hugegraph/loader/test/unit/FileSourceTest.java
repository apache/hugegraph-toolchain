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

import org.apache.hugegraph.loader.source.file.Compression;
import org.apache.hugegraph.loader.source.file.FileFormat;
import org.apache.hugegraph.loader.source.file.FileSource;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;

import com.google.common.collect.ImmutableList;

public class FileSourceTest {

    @Test
    public void testAsFileSourceKeepsReadOptions() {
        FileSource source = new FileSource();
        source.path("/data/person.csv");
        source.format(FileFormat.CSV);
        source.delimiter(",");
        source.dateFormat("yyyy-MM-dd");
        source.extraDateFormats(ImmutableList.of("MM/dd/yyyy"));
        source.timeZone("UTC");
        source.compression(Compression.GZIP);
        source.header(new String[]{"id", "name"});
        source.charset("GBK");

        FileSource copy = source.asFileSource();
        Assert.assertNotSame(source, copy);
        Assert.assertEquals("/data/person.csv", copy.path());
        Assert.assertEquals(FileFormat.CSV, copy.format());
        Assert.assertEquals(",", copy.delimiter());
        Assert.assertEquals("yyyy-MM-dd", copy.dateFormat());
        Assert.assertEquals(ImmutableList.of("MM/dd/yyyy"), copy.extraDateFormats());
        Assert.assertEquals("UTC", copy.timeZone());
        Assert.assertEquals(Compression.GZIP, copy.compression());
        Assert.assertArrayEquals(new String[]{"id", "name"}, copy.header());
        Assert.assertEquals("GBK", copy.charset());
    }
}
