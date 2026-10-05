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

package org.apache.hugegraph.spark.connector.options;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.hugegraph.spark.connector.DataSource;
import org.apache.hugegraph.spark.connector.HGTable;
import org.apache.hugegraph.testutil.Assert;
import org.apache.logging.log4j.Level;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.core.LogEvent;
import org.apache.logging.log4j.core.LoggerContext;
import org.apache.logging.log4j.core.config.LoggerConfig;
import org.apache.logging.log4j.core.appender.AbstractAppender;
import org.apache.logging.log4j.core.config.Property;
import org.apache.logging.log4j.core.layout.PatternLayout;
import org.apache.spark.sql.connector.expressions.Transform;
import org.apache.spark.sql.connector.write.LogicalWriteInfo;
import org.apache.spark.sql.types.StructType;
import org.apache.spark.sql.util.CaseInsensitiveStringMap;
import org.junit.Test;

public class ConnectionOptionsLogTest {

    @Test
    public void testConfigurationLogsExcludeConnectionValues() {
        String serverSecret = "server-secret-regression-45-e8bd";
        String tlsSecret = "tls-secret-regression-45-a702";
        String extraSecret = "extra-secret-regression-45-c64f";
        Map<String, String> values = new HashMap<>();
        values.put("data-type", "vertex");
        values.put("label", "person");
        values.put("id", "name");
        values.put("token", serverSecret);
        values.put("trust-store-token", tlsSecret);
        values.put("server-token", extraSecret);
        CaseInsensitiveStringMap input = new CaseInsensitiveStringMap(values);
        CaptureAppender capture = new CaptureAppender();
        capture.start();
        Class<?>[] loggedClasses = {HGOptions.class, DataSource.class, HGTable.class};
        LoggerContext context = (LoggerContext) LogManager.getContext(false);
        Set<LoggerConfig> loggerConfigs = new HashSet<>();
        for (Class<?> type : loggedClasses) {
            loggerConfigs.add(context.getConfiguration().getLoggerConfig(type.getName()));
        }
        for (LoggerConfig loggerConfig : loggerConfigs) {
            loggerConfig.addAppender(capture, Level.ALL, null);
        }
        try {
            HGOptions options = new HGOptions(values);
            Assert.assertEquals(serverSecret, options.token());
            Assert.assertEquals(tlsSecret, options.trustStoreToken());
            Assert.assertEquals(extraSecret, options.getAllParameters().get("server-token"));
            DataSource source = new DataSource();
            StructType schema = source.inferSchema(input);
            HGTable table = (HGTable) source.getTable(schema, new Transform[0], values);
            table.newWriteBuilder(new LogicalWriteInfo() {
                @Override
                public String queryId() {
                    return "config-log-regression";
                }

                @Override
                public StructType schema() {
                    return schema;
                }

                @Override
                public CaseInsensitiveStringMap options() {
                    return input;
                }
            });
            for (Class<?> type : loggedClasses) {
                Assert.assertTrue("Each configuration logger must retain diagnostic option keys",
                                  capture.containsOptionKeys(type.getName()));
            }
            String messages = String.join("\n", capture.messages);
            Assert.assertFalse("Server credentials must not appear in log messages",
                               messages.contains(serverSecret));
            Assert.assertFalse("TLS credentials must not appear in log messages",
                               messages.contains(tlsSecret));
            Assert.assertFalse("Additional connection values must not appear in log messages",
                               messages.contains(extraSecret));
        } finally {
            for (LoggerConfig loggerConfig : loggerConfigs) {
                loggerConfig.removeAppender(capture.getName());
            }
            capture.stop();
        }
    }

    private static class CaptureAppender extends AbstractAppender {

        private final List<String> messages = new ArrayList<>();
        private final List<String> loggerNames = new ArrayList<>();

        private CaptureAppender() {
            super("connection-config-capture", null, PatternLayout.createDefaultLayout(),
                  false, Property.EMPTY_ARRAY);
        }

        private boolean containsOptionKeys(String loggerName) {
            for (int i = 0; i < this.messages.size(); i++) {
                if (this.loggerNames.get(i).equals(loggerName) &&
                    this.messages.get(i).contains("trust-store-token") &&
                    this.messages.get(i).contains("server-token")) {
                    return true;
                }
            }
            return false;
        }

        @Override
        public void append(LogEvent event) {
            this.messages.add(event.getMessage().getFormattedMessage());
            this.loggerNames.add(event.getLoggerName());
        }
    }
}
