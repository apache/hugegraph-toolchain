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
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

package org.apache.hugegraph.unit;

import java.net.URL;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Types;
import java.util.Properties;

import org.apache.calcite.avatica.ConnectionConfigImpl;
import org.apache.calcite.avatica.remote.AvaticaHttpClientFactoryImpl;
import org.junit.Assert;
import org.junit.Test;

public class AvaticaRuntimeTest {

    @Test
    public void testRejectInvalidHttpClientBeforeConstruction() throws Exception {
        InvalidHttpClient.constructed = false;
        Properties properties = new Properties();
        properties.setProperty("httpclient_impl", InvalidHttpClient.class.getName());
        URL endpoint = new URL("http://localhost:1");
        AvaticaHttpClientFactoryImpl factory = new AvaticaHttpClientFactoryImpl();
        try {
            factory.getClient(endpoint, new ConnectionConfigImpl(properties), null);
            Assert.fail("Invalid HTTP client implementation was accepted");
        } catch (RuntimeException e) {
            Assert.assertTrue(e.getCause() instanceof ClassCastException);
        }
        Assert.assertFalse(InvalidHttpClient.constructed);
    }

    @Test
    public void testExistingCalciteCallerCanReadQueryAndMetadata() throws Exception {
        Class.forName("org.apache.calcite.jdbc.Driver");
        try (Connection connection = DriverManager.getConnection("jdbc:calcite:");
             Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery(
                     "select cast(42 as integer) as ID, 'Avatica' as NAME")) {
            Assert.assertTrue(result.next());
            Assert.assertEquals(42, result.getInt(1));
            Assert.assertEquals("Avatica", result.getString(2));
            Assert.assertEquals(Types.INTEGER, result.getMetaData().getColumnType(1));
            Assert.assertFalse(result.next());
        }
    }

    public static class InvalidHttpClient {

        private static boolean constructed;

        public InvalidHttpClient(URL endpoint) {
            constructed = true;
        }
    }
}
