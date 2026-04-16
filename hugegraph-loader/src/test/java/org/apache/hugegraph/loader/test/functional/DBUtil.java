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

package org.apache.hugegraph.loader.test.functional;

import org.apache.hugegraph.loader.exception.LoadException;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;

public class DBUtil {

    private final String driver;
    private final String url;
    private final String user;
    private final String pass;

    private Connection conn;

    public DBUtil(String driver, String url, String user, String pass) {
        this.driver = driver;
        this.url = url;
        this.user = user;
        this.pass = pass;
    }

    public void connect(boolean useSSL) {
        try {
            Class.forName(this.driver);
            String url = String.format("%s?useSSL=%s&allowPublicKeyRetrieval=true", this.url, useSSL);
            this.conn = DriverManager.getConnection(url, this.user, this.pass);
        } catch (ClassNotFoundException e) {
            throw new LoadException("Invalid driver class '%s'", e, this.driver);
        } catch (SQLException e) {
            throw new LoadException("Failed to connect database via '%s'", e, this.url);
        }
    }

    public void connect(String database, boolean useSSL) {
        this.close();
        String url = String.format("%s/%s?useSSL=%s&allowPublicKeyRetrieval=true", this.url, database, useSSL);
        try {
            Class.forName(this.driver);
            this.conn = DriverManager.getConnection(url, this.user, this.pass);
        } catch (ClassNotFoundException e) {
            throw new LoadException("Invalid driver class '%s'", e, this.driver);
        } catch (SQLException e) {
            throw new LoadException("Failed to connect database via '%s'", e, this.url);
        }
    }

    public void close() {
        try {
            if (this.conn != null && !this.conn.isClosed()) {
                this.conn.close();
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to close connection", e);
        }
    }

    /**
     * TODO: insert(String table, String... rows)
     */
    public void insert(String sql) {
        this.execute(sql);
    }

    public void execute(String sql) {
        try (Statement stmt = this.conn.createStatement()) {
            stmt.execute(sql);
        } catch (SQLException e) {
            throw new RuntimeException(String.format("Failed to execute sql '%s'", sql), e);
        }
    }
}
