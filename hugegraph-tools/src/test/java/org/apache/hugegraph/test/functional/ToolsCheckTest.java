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

package org.apache.hugegraph.test.functional;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;

import org.apache.hugegraph.base.HdfsDirectory;
import org.apache.hugegraph.cmd.SubCommands;
import org.apache.hugegraph.rest.ClientException;
import org.apache.hugegraph.structure.constant.HugeType;
import org.apache.hugegraph.testutil.Assert;
import org.apache.hugegraph.util.ToolUtil;
import org.junit.Test;

import com.beust.jcommander.ParameterException;
import com.google.common.collect.ImmutableList;

public class ToolsCheckTest {

    @Test
    public void testUrlValidatorAcceptsHighPorts() {
        SubCommands.UrlValidator validator = new SubCommands.UrlValidator();
        validator.validate("--url", "http://127.0.0.1:8080");
        validator.validate("--url", "http://127.0.0.1:60080");
        validator.validate("--url", "https://localhost:61080");
        validator.validate("--url", "http://127.0.0.1:65535");

        Assert.assertThrows(ParameterException.class, () -> {
            validator.validate("--url", "http://127.0.0.1:65536");
        });
        Assert.assertThrows(ParameterException.class, () -> {
            validator.validate("--url", "http://127.0.0.1:70000");
        });
    }

    @Test
    public void testAuthTypeDependenciesIgnoreCase() {
        SubCommands.AuthHugeTypeConverter converter =
                new SubCommands.AuthHugeTypeConverter();
        List<HugeType> types = converter.convert("USER,GROUP,BELONG");
        Assert.assertEquals(ImmutableList.of(HugeType.USER, HugeType.GROUP,
                                             HugeType.BELONG), types);

        Assert.assertThrows(IllegalArgumentException.class, () -> {
            converter.convert("belong");
        }, e -> {
            Assert.assertContains("then 'user' and 'group' are required",
                                  e.getMessage());
        });
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            converter.convert("BELONG");
        }, e -> {
            Assert.assertContains("then 'user' and 'group' are required",
                                  e.getMessage());
        });
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            converter.convert("Access,group");
        }, e -> {
            Assert.assertContains("then 'group' and 'target' are required",
                                  e.getMessage());
        });
    }

    @Test
    public void testPositiveValidatorAcceptsLongValues() {
        SubCommands.PositiveValidator validator = new SubCommands.PositiveValidator();
        validator.validate("--retry", "3");
        // --limit and --task-id are long options
        validator.validate("--limit", "3000000000");

        Assert.assertThrows(ParameterException.class, () -> {
            validator.validate("--retry", "0");
        });
        Assert.assertThrows(ParameterException.class, () -> {
            validator.validate("--limit", "-3000000000");
        });
    }

    @Test
    public void testPrintExceptionStackWithEmptyStdin() {
        InputStream previousIn = System.in;
        PrintStream previousErr = System.err;
        ByteArrayOutputStream err = new ByteArrayOutputStream();
        try {
            System.setIn(new ByteArrayInputStream(new byte[0]));
            System.setErr(new PrintStream(err, true, StandardCharsets.UTF_8));
            // No answer to read: keep the default 'n' and throw nothing
            ToolUtil.printOrThrow(new RuntimeException("test failure"), false);
        } finally {
            System.setIn(previousIn);
            System.setErr(previousErr);
        }
        Assert.assertFalse(err.toString(StandardCharsets.UTF_8)
                              .contains("java.lang.RuntimeException: test failure"));
    }

    @Test
    public void testHdfsDirectoryKeepsCause() {
        HdfsDirectory directory = new HdfsDirectory(
                "nosuch:///backup",
                Collections.singletonMap("fs.default.name", "nosuch:///"));
        Assert.assertThrows(ClientException.class, directory::files, e -> {
            Assert.assertContains("Failed to access HDFS with configuration",
                                  e.getMessage());
            Assert.assertTrue(e.getCause() instanceof IOException);
        });
    }
}
