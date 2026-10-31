/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hugegraph.unit;

import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.util.Enumeration;
import java.util.Properties;

import org.junit.Assert;
import org.junit.Test;

public class SessionTimeoutConfigTest {

    @Test
    public void testSessionIdleTimeoutIsExplicitlyFortyEightHours()
           throws IOException {
        Enumeration<URL> resources = this.getClass().getClassLoader()
                                         .getResources(
                                                 "application.properties");
        while (resources.hasMoreElements()) {
            Properties properties = new Properties();
            try (InputStream input = resources.nextElement().openStream()) {
                properties.load(input);
            }
            if (!"hugegraph-hubble".equals(
                    properties.getProperty("info.app.name"))) {
                continue;
            }
            Assert.assertEquals("48h", properties.getProperty(
                    "server.servlet.session.timeout"));
            Assert.assertEquals("2592000", properties.getProperty(
                    "hubble.session.max-idle-seconds"));
            return;
        }
        Assert.fail("Hubble application.properties was not found");
    }
}
