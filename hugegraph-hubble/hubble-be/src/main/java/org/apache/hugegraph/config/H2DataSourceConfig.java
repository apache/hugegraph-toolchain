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

package org.apache.hugegraph.config;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Locale;

import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import com.zaxxer.hikari.HikariDataSource;

@Configuration
@EnableConfigurationProperties(DataSourceProperties.class)
public class H2DataSourceConfig {

    private static final int SCHEMA_VERSION = 1;
    // H2's native IFEXISTS error: the database has not been created yet.
    private static final int DATABASE_NOT_FOUND_WITH_IF_EXISTS = 90146;
    private static final int DATABASE_IS_READ_ONLY = 90097;

    @Bean
    public HikariDataSource dataSource(DataSourceProperties properties, Environment environment) {
        HikariDataSource dataSource = properties.initializeDataSourceBuilder()
                                               .type(HikariDataSource.class).build();
        // Binding must finish before validation and before SQL initialization can get a connection.
        Binder.get(environment).bind("spring.datasource.hikari", Bindable.ofInstance(dataSource));
        String url = dataSource.getJdbcUrl();
        if (url == null ||
            !this.isEmbeddedUrl(url) ||
            !"org.h2.Driver".equals(dataSource.getDriverClassName()) ||
            dataSource.getDataSource() != null ||
            dataSource.getDataSourceClassName() != null ||
            dataSource.getDataSourceJNDI() != null ||
            !dataSource.getDataSourceProperties().isEmpty()) {
            throw new IllegalArgumentException("Hubble metadata requires H2 with a local file or named memory URL; " +
                                               "configure the JDBC URL and credentials directly");
        }
        this.checkExistingDatabase(dataSource, this.readOnlyProbeUrl(url));
        return dataSource;
    }

    private boolean isEmbeddedUrl(String url) {
        if (!url.startsWith("jdbc:h2:")) {
            return false;
        }
        String name = url.substring("jdbc:h2:".length()).split(";", 2)[0];
        if (name.equals("mem") || name.equals("mem:")) {
            return false;
        }
        return !name.isEmpty() && (name.startsWith("file:") || name.startsWith("mem:") ||
                name.indexOf(':') < 0 || name.startsWith("/") || name.startsWith("./") ||
                name.startsWith("../") || name.startsWith("~/") ||
                (name.length() > 2 && Character.isLetter(name.charAt(0)) && name.charAt(1) == ':' &&
                 (name.charAt(2) == '/' || name.charAt(2) == '\\')));
    }

    private String readOnlyProbeUrl(String url) {
        String[] parts = url.split(";");
        StringBuilder probe = new StringBuilder(parts[0]);
        for (int i = 1; i < parts.length; i++) {
            String option = parts[i];
            int equals = option.indexOf('=');
            String name = option.substring(0, equals < 0 ? option.length() : equals).trim();
            // H2 unescapes option names; do not allow an escaped INIT alias past this check.
            if (name.indexOf('\\') >= 0 || name.toUpperCase(Locale.ROOT).equals("INIT")) {
                throw new IllegalArgumentException("Hubble metadata URLs must not contain INIT " +
                                                   "or escaped setting names");
            }
            if (name.toUpperCase(Locale.ROOT).equals("CIPHER") && equals >= 0) {
                String cipher = option.substring(equals + 1);
                if (!cipher.matches("[A-Za-z0-9]+")) {
                    throw new IllegalArgumentException("Hubble metadata CIPHER must name a native cipher");
                }
                probe.append(";CIPHER=").append(cipher);
            }
        }
        // Keep only the cipher needed to open an encrypted file. Never copy SQL/settings hooks.
        return probe.append(";IFEXISTS=TRUE;ACCESS_MODE_DATA=r;TRACE_LEVEL_FILE=0").toString();
    }

    private void checkExistingDatabase(HikariDataSource dataSource, String url) {
        try (Connection connection = DriverManager.getConnection(
                     url, dataSource.getUsername(), dataSource.getPassword());
             Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery(
                     "SELECT \"VERSION\" FROM \"PUBLIC\".\"HUBBLE_SCHEMA_VERSION\" WHERE \"ID\"=1")) {
            if (result.next() && result.getInt(1) == SCHEMA_VERSION) {
                return;
            }
        } catch (SQLException e) {
            if (e.getErrorCode() == DATABASE_NOT_FOUND_WITH_IF_EXISTS) {
                return;
            }
            // Do not expose JDBC URLs, credentials or database contents in the failure.
            if (e.getErrorCode() == DATABASE_IS_READ_ONLY) {
                throw new IllegalArgumentException("Hubble metadata read-only validation failed (H2 error 90097); " +
                                                   "preserve the database and follow the manual recovery guidance " +
                                                   "in the README. This error does not establish that the database " +
                                                   "is empty");
            }
        }
        throw new IllegalArgumentException("Hubble metadata validation failed; verify database credentials " +
                                           "and file access before choosing a new H2 database");
    }
}
