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

import java.io.IOException;

import org.junit.Test;

import org.apache.hugegraph.exception.InternalException;
import org.apache.hugegraph.testutil.Assert;
import org.apache.hugegraph.util.FileUtil;;

public class FileUtilTest {

    @Test
    public void testCountLines() {
        int lines = FileUtil.countLines("target/test-classes/files/file_with_empty_line");
        Assert.assertEquals(3, lines);

        lines = FileUtil.countLines("target/test-classes/files/file_without_empty_line");
        Assert.assertEquals(3, lines);
    }

    @Test
    public void testCountLinesKeepsCause() {
        // A directory exists but cannot be opened as a file
        Assert.assertThrows(InternalException.class, () -> {
            FileUtil.countLines("target/test-classes/files");
        }, e -> {
            Assert.assertTrue(e.getCause() instanceof IOException);
        });
    }
}
