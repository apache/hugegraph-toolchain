/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

package org.apache.hugegraph.service.auth;

import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;

public class UserServiceLevelTest {

    @Test
    public void testStandaloneUserLevelDoesNotPromoteEveryUser() {
        Assert.assertEquals("ADMIN", UserService.standaloneUserLevel("admin"));
        Assert.assertEquals("USER",
                            UserService.standaloneUserLevel("ux3_viewer"));
    }
}
