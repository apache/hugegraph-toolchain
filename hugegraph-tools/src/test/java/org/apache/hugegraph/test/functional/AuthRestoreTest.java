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
import java.util.Map;

import org.apache.commons.collections.CollectionUtils;
import org.apache.hugegraph.cmd.HugeGraphCommand;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.structure.auth.Access;
import org.apache.hugegraph.structure.auth.Belong;
import org.apache.hugegraph.structure.auth.Group;
import org.apache.hugegraph.structure.auth.Target;
import org.apache.hugegraph.structure.auth.User;
import org.apache.hugegraph.structure.constant.HugeType;
import org.apache.hugegraph.test.util.FileUtil;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Before;
import org.junit.Test;

import com.google.common.collect.Lists;
import com.google.common.collect.Maps;

public class AuthRestoreTest extends AuthTest {

    private HugeClient client;

    @Before
    public void init() {
        client = HugeClient.builder(URL, GRAPH)
                           .configUser(USER_NAME, USER_PASSWORD)
                           .configTimeout(TIME_OUT)
                           .configSSL(TRUST_STORE_FILE, TRUST_STORE_PASSWORD)
                           .build();
    }

    @Test
    public void testAuthRestoreForAllType() {
        this.loadData(HugeType.USER, "auth_users.txt");
        this.loadData(HugeType.TARGET, "auth_targets.txt");
        this.loadData(HugeType.GROUP, "auth_groups.txt");
        this.loadData(HugeType.BELONG, "auth_belongs.txt");
        this.loadData(HugeType.ACCESS, "auth_accesses.txt");

        String[] args = new String[]{"--throw-mode", "true", "--url", URL, "--user", USER_NAME,
                                     "--password", USER_PASSWORD, "auth-restore",
                                     "--directory", DEFAULT_URL, "--init-password", "123456",
                                     "--strategy", "ignore"
        };

        HugeGraphCommand.main(args);

        List<String> idList = Lists.newArrayList();
        List<User> userList = this.client.auth().listUsers();
        Map<String, User> userMap = Maps.newHashMap();
        for (User user1 : userList) {
            userMap.put(user1.name(), user1);
        }
        Assert.assertTrue(userMap.containsKey("test_user1"));
        idList.add(userMap.get("test_user1").id().toString());

        List<Group> groups = this.client.auth().listGroups();
        Map<String, Group> groupMap = Maps.newHashMap();
        for (Group group : groups) {
            groupMap.put(group.name(), group);
        }
        Assert.assertTrue(groupMap.containsKey("test_group6"));
        idList.add(groupMap.get("test_group6").id().toString());

        List<Target> targets = this.client.auth().listTargets();
        Map<String, Target> targetMap = Maps.newHashMap();
        for (Target target : targets) {
            targetMap.put(target.name(), target);
        }
        Assert.assertTrue(targetMap.containsKey("test_target1"));
        idList.add(targetMap.get("test_target1").id().toString());

        List<Belong> belongs = this.client.auth().listBelongs();
        Assert.assertTrue(CollectionUtils.isNotEmpty(belongs));
        boolean checkUserAndGroup = false;
        for (Belong belong : belongs) {
            if (idList.contains(belong.user().toString()) &&
                idList.contains(belong.group().toString())) {
                checkUserAndGroup = true;
                break;
            }
        }
        Assert.assertTrue(checkUserAndGroup);

        List<Access> accesses = this.client.auth().listAccesses();
        Assert.assertTrue(CollectionUtils.isNotEmpty(accesses));
        boolean checkGroupAndTarget = false;
        for (Access access : accesses) {
            if (idList.contains(access.group().toString()) &&
                idList.contains(access.target().toString())) {
                checkGroupAndTarget = true;
                break;
            }
        }
        Assert.assertTrue(checkGroupAndTarget);
    }

    @Test
    public void testAuthRestoreForUser() {
        this.loadData(HugeType.USER, "auth_users.txt");

        String[] args = new String[]{
                "--throw-mode", "true",
                "--url", URL,
                "--user", USER_NAME,
                "--password", USER_PASSWORD,
                "auth-restore",
                "--types", "user",
                "--directory", DEFAULT_URL,
                "--init-password", "123456"
        };

        HugeGraphCommand.main(args);

        List<User> userList = this.client.auth().listUsers();
        Map<String, User> userMap = Maps.newHashMap();
        for (User user1 : userList) {
            userMap.put(user1.name(), user1);
        }

        Assert.assertTrue(userMap.containsKey("test_user1"));
    }

    @Test
    public void testRestoreWithoutInitPassword() {
        String[] args = new String[]{
                "--throw-mode", "true",
                "--url", URL,
                "--user", USER_NAME,
                "--password", USER_PASSWORD,
                "auth-restore",
                "--types", "user",
                "--directory", DEFAULT_URL
        };

        Assert.assertThrows(IllegalStateException.class, () -> {
            HugeGraphCommand.main(args);
        }, e -> {
            String msg = e.getMessage();
            Assert.assertTrue(msg.endsWith("The following option is required: [--init-password]"));
        });
    }

    @Test
    public void testAuthRestoreWithConflictAndStopStrategy() {
        this.loadData(HugeType.USER, "auth_users_conflict.txt");

        String[] args = new String[]{
                "--throw-mode", "true",
                "--url", URL,
                "--user", USER_NAME,
                "--password", USER_PASSWORD,
                "auth-restore",
                "--types", "user",
                "--strategy", "stop",
                "--init-password", "123456"
        };

        Assert.assertThrows(IllegalStateException.class, () -> {
            HugeGraphCommand.main(args);
        }, e -> {
            Assert.assertContains("Restore conflict with STOP strategy", e.getMessage());
        });
    }

    @Test
    public void testAuthRestoreWithIgnoreStrategy() {
        this.loadData(HugeType.USER, "auth_users_conflict.txt");

        String[] args = new String[]{
                "--throw-mode", "true",
                "--url", URL,
                "--user", USER_NAME,
                "--password", USER_PASSWORD,
                "auth-restore",
                "--types", "user",
                "--strategy", "ignore",
                "--init-password", "123456"
        };

        HugeGraphCommand.main(args);

        List<User> userList = this.client.auth().listUsers();
        Map<String, User> userMap = Maps.newHashMap();
        for (User user1 : userList) {
            userMap.put(user1.name(), user1);
        }

        Assert.assertTrue(userMap.containsKey("admin"));
    }

    @Test
    public void testAuthRestoreWithWrongDirectory() {
        String filePath = "./auth-test-test";

        String[] args = new String[]{
                "--throw-mode", "true",
                "--url", URL,
                "--user", USER_NAME,
                "--password", USER_PASSWORD,
                "auth-restore",
                "--types", "user",
                "--strategy", "stop",
                "--init-password", "123456",
                "--directory", filePath
        };

        Assert.assertThrows(IllegalStateException.class, () -> {
            HugeGraphCommand.main(args);
        }, e -> {
            Assert.assertContains("The directory does not exist", e.getMessage());
        });
    }

    @Test
    public void testAuthRestoreWithWrongType() {
        String filePath = "./auth-test-test";

        String[] args = new String[]{
                "--throw-mode", "true",
                "--url", URL,
                "--user", USER_NAME,
                "--password", USER_PASSWORD,
                "auth-restore",
                "--types", "user, test",
                "--strategy", "stop",
                "--init-password", "123456",
                "--directory", filePath
        };

        Assert.assertThrows(IllegalArgumentException.class, () -> {
            HugeGraphCommand.main(args);
        }, e -> {
            Assert.assertContains("valid value is 'all' or combination of " +
                                  "[user,group,target,belong,access]", e.getMessage());
        });
    }

    @Test
    public void testAuthRestoreByBelongWithoutDependency() {
        String filePath = "./auth-test-test";

        String[] args = new String[]{
                "--throw-mode", "true",
                "--url", URL,
                "--user", USER_NAME,
                "--password", USER_PASSWORD,
                "auth-restore",
                "--types", "belong",
                "--strategy", "stop",
                "--init-password", "123456",
                "--directory", filePath
        };

        Assert.assertThrows(IllegalArgumentException.class, () -> {
            HugeGraphCommand.main(args);
        }, e -> {
            Assert.assertContains("if type contains 'belong' then " +
                                  "'user' and 'group' are required.", e.getMessage());
        });
    }

    @Test
    public void testAuthRestoreByAccessWithoutDependency() {
        String filePath = "./auth-test-test";

        String[] args = new String[]{
                "--throw-mode", "true",
                "--url", URL,
                "--user", USER_NAME,
                "--password", USER_PASSWORD,
                "auth-restore",
                "--types", "access",
                "--strategy", "stop",
                "--init-password", "123456",
                "--directory", filePath
        };

        Assert.assertThrows(IllegalArgumentException.class, () -> {
            HugeGraphCommand.main(args);
        }, e -> {
            Assert.assertContains("if type contains 'access' then " +
                                  "'group' and 'target' are required.", e.getMessage());
        });
    }

    @Test
    public void testAuthRestoreWithWrongStrategy() {
        String filePath = "./auth-test-test";

        String[] args = new String[]{
                "--throw-mode", "true",
                "--url", URL,
                "--user", USER_NAME,
                "--password", USER_PASSWORD,
                "auth-restore",
                "--types", "user",
                "--strategy", "test",
                "--init-password", "123456",
                "--directory", filePath
        };

        Assert.assertThrows(IllegalArgumentException.class, () -> {
            HugeGraphCommand.main(args);
        }, e -> {
            Assert.assertContains("Invalid --strategy 'test', valid " +
                                  "value is 'stop' or 'ignore", e.getMessage());
        });
    }

    private void loadData(HugeType hugeType, String dataFilePath) {
        String restoreDataPath = DEFAULT_URL + hugeType.string();
        String testRestoreDataPath = DEFAULT_TEST_URL + dataFilePath;

        List<String> list = FileUtil.readTestRestoreData(FileUtil.configPath(testRestoreDataPath));
        FileUtil.writeTestRestoreData(restoreDataPath, list);
    }
}
