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

import java.util.List;

import org.apache.hugegraph.cmd.HugeGraphCommand;
import org.apache.hugegraph.test.util.FileUtil;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Before;
import org.junit.Test;

public class AuthBackupTest extends AuthTest {

    @Before
    public void init() {
        FileUtil.clearDirectories(DEFAULT_URL);
    }

    @Test
    public void testAuthBackup() {
        String[] args = new String[]{"--throw-mode", "true", "--url", URL, "--user", USER_NAME,
                                     "--password", USER_PASSWORD, "auth-backup"
        };

        HugeGraphCommand.main(args);

        Assert.assertTrue(FileUtil.checkFileExists(DEFAULT_URL));
        List<String> fileNames = FileUtil.subdirectories(DEFAULT_URL);
        Assert.assertEquals(5, fileNames.size());
    }

    @Test
    public void testAuthBackupByTypes() {
        String[] args = new String[]{"--throw-mode", "true", "--url", URL, "--user", USER_NAME,
                                     "--password", USER_PASSWORD, "auth-backup",
                                     "--types", "user,group"
        };

        HugeGraphCommand.main(args);

        Assert.assertTrue(FileUtil.checkFileExists(DEFAULT_URL));
        List<String> fileNames = FileUtil.subdirectories(DEFAULT_URL);
        Assert.assertEquals(2, fileNames.size());
    }

    @Test
    public void testAuthBackupWithWrongType() {
        String[] args = new String[]{"--throw-mode", "true", "--url", URL, "--user", USER_NAME,
                                     "--password", USER_PASSWORD, "auth-backup",
                                     "--types", "user,group,test"
        };

        Assert.assertThrows(IllegalArgumentException.class, () -> {
            HugeGraphCommand.main(args);
        }, e -> {
            Assert.assertContains("valid value is 'all' or combination of " +
                                  "[user,group,target,belong,access]", e.getMessage());
        });
    }

    @Test
    public void testAuthBackupByDirectory() {
        String directory = "./backup";
        String[] args = new String[]{
                "--throw-mode", "true",
                "--url", URL,
                "--user", USER_NAME,
                "--password", USER_PASSWORD,
                "auth-backup",
                "--directory", directory
        };

        HugeGraphCommand.main(args);

        Assert.assertTrue(FileUtil.checkFileExists(directory));
        List<String> fileNames = FileUtil.subdirectories(directory);
        Assert.assertEquals(5, fileNames.size());
    }
}
