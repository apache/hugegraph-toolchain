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

import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.Driver;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BiFunction;

import org.apache.hugegraph.loader.constant.Constants;
import org.apache.hugegraph.loader.reader.jdbc.JDBCFetcher;
import org.apache.hugegraph.loader.reader.line.Line;
import org.apache.hugegraph.loader.source.jdbc.JDBCSource;
import org.apache.hugegraph.loader.source.jdbc.JDBCVendor;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;

public class JDBCFetcherTest {

    @Test
    public void testLocalDateTimeUsesDriverTimestamp() throws Exception {
        LocalDateTime dateTime = LocalDateTime.of(2024, 2, 29, 12, 34, 56, 123456000);
        Timestamp driverTimestamp = Timestamp.from(java.time.Instant.ofEpochMilli(123456789L));
        Object[] row = {dateTime, driverTimestamp, java.sql.Time.valueOf("12:34:56"), null, 42};
        AtomicInteger nextCalls = new AtomicInteger();
        AtomicInteger timestampReads = new AtomicInteger();
        ResultSetMetaData metadata = proxy(ResultSetMetaData.class, (method, args) -> {
            if (method.equals("getColumnCount")) {
                return row.length;
            }
            return "column" + args[0];
        });
        ResultSet result = proxy(ResultSet.class, (method, args) -> {
            switch (method) {
                case "next":
                    return nextCalls.incrementAndGet() == 1;
                case "getMetaData":
                    return metadata;
                case "getObject":
                    return row[(Integer) args[0] - 1];
                case "getTimestamp":
                    Assert.assertEquals(1, args[0]);
                    timestampReads.incrementAndGet();
                    return driverTimestamp;
                case "isClosed":
                    return false;
                default:
                    return null;
            }
        });
        List<String> calls = new ArrayList<>();
        AtomicBoolean autoCommit = new AtomicBoolean(true);
        Statement statement = proxy(Statement.class, (method, args) -> {
            switch (method) {
                case "isClosed":
                    return false;
                case "setFetchSize":
                    calls.add("setFetchSize(" + args[0] + ")");
                    return null;
                case "executeQuery":
                    calls.add("executeQuery(autoCommit=" + autoCommit.get() + ")");
                    return result;
                default:
                    return null;
            }
        });
        Connection connection = proxy(Connection.class, (method, args) -> {
            switch (method) {
                case "isClosed":
                    return false;
                case "getAutoCommit":
                    return autoCommit.get();
                case "setAutoCommit":
                    calls.add("setAutoCommit(" + args[0] + ")");
                    autoCommit.set((Boolean) args[0]);
                    return null;
                case "createStatement":
                    return statement;
                default:
                    return null;
            }
        });
        Driver driver = proxy(Driver.class, (method, args) -> {
            if (method.equals("connect")) {
                return ((String) args[0]).startsWith("jdbc:loader-test:") ? connection : null;
            }
            if (method.equals("toString")) {
                return "temporal fixture driver";
            }
            throw new UnsupportedOperationException(method);
        });
        DriverManager.registerDriver(driver);
        try {
            JDBCSource source = new JDBCSource() {
                @Override
                public JDBCVendor vendor() {
                    return JDBCVendor.MYSQL;
                }

                @Override
                public String driver() {
                    return Driver.class.getName();
                }

                @Override
                public String url() {
                    return "jdbc:loader-test://localhost";
                }

                @Override
                public String database() {
                    return "fixture";
                }

                @Override
                public String table() {
                    return "dates";
                }
            };
            JDBCFetcher fetcher = new JDBCFetcher(source);
            List<Line> lines = fetcher.nextBatch();
            Assert.assertEquals(1, lines.size());
            Object[] values = lines.get(0).values();
            Assert.assertSame(driverTimestamp, values[0]);
            Assert.assertSame(driverTimestamp, values[1]);
            Assert.assertSame(row[2], values[2]);
            Assert.assertEquals(Constants.NULL_STR, values[3]);
            Assert.assertEquals(42, values[4]);
            Assert.assertEquals(1, timestampReads.get());
            // Cursor-based streaming (e.g. PostgreSQL) needs auto-commit off and
            // the fetch size set on the statement before the query runs
            Assert.assertEquals(Arrays.asList("setAutoCommit(false)",
                                              "setFetchSize(" + source.batchSize() + ")",
                                              "executeQuery(autoCommit=false)"),
                                calls);
            fetcher.close();
        } finally {
            DriverManager.deregisterDriver(driver);
        }
    }

    @SuppressWarnings("unchecked")
    private static <T> T proxy(Class<T> type, BiFunction<String, Object[], Object> handler) {
        return (T) Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type},
                (proxy, method, args) -> handler.apply(method.getName(), args));
    }
}
