/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

package org.apache.hugegraph.handler;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;
import org.springframework.http.HttpStatus;

public class ExceptionAdvisorStatusTest {

    @Test
    public void testPreserveServerAuthenticationAndPermissionStatus() {
        Assert.assertEquals(HttpStatus.UNAUTHORIZED.value(),
                            ExceptionAdvisor.serverStatus(401));
        Assert.assertEquals(HttpStatus.FORBIDDEN.value(),
                            ExceptionAdvisor.serverStatus(403));
        Assert.assertEquals(Constant.STATUS_BAD_REQUEST,
                            ExceptionAdvisor.serverStatus(500));
    }
}
