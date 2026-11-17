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

package org.apache.hugegraph.loader.reader.jdbc;

import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.util.Log;
import org.slf4j.Logger;

import org.apache.hugegraph.loader.constant.Constants;
import org.apache.hugegraph.loader.reader.line.Line;
import org.apache.hugegraph.loader.source.jdbc.JDBCSource;

public class JDBCFetcher extends Fetcher {
    private static final Logger LOG = Log.logger(JDBCFetcher.class);
    private Statement stmt = null;
    private ResultSet result = null;

    public JDBCFetcher(JDBCSource source) throws SQLException {
        super(source);
    }

    @Override
    public String[] readHeader() {
        return null;
    }

    @Override
    public void readPrimaryKey()  {

    }

    @Override
    public void close() {
        try {
            if (result != null && !result.isClosed()) {
                result.close();
            }
        } catch (SQLException e) {
            LOG.warn("Failed to close 'ResultSet'", e);
        }
        try {
            if (stmt != null && !stmt.isClosed()) {
                stmt.close();
            }
        } catch (SQLException e) {
            LOG.warn("Failed to close 'Statement'", e);
        }
        try {
            if (this.conn != null && !conn.isClosed()) {
                this.conn.close();
            }
        } catch (SQLException e) {
            LOG.warn("Failed to close 'Connection'", e);
        }
    }

    long offSet = 0;
    boolean start = false;
    boolean done = false;
    String[] columns = null;

    @Override
    public  List<Line> nextBatch() throws SQLException {
        if (!start) {
            // Some drivers (e.g. PostgreSQL) only stream rows through a cursor when
            // auto-commit is off and the fetch size is set before the query runs;
            // otherwise the whole result set is buffered in memory.
            disableAutoCommit();
            stmt = this.conn.createStatement(java.sql.ResultSet.TYPE_FORWARD_ONLY,
                                             java.sql.ResultSet.CONCUR_READ_ONLY);
            stmt.setFetchSize(source.batchSize());
            // use fields instead of * , from json ?
            result = stmt.executeQuery(buildSql());
            ResultSetMetaData metaData = result.getMetaData();
            columns = new String[metaData.getColumnCount()];
            for (int i = 1; i <= metaData.getColumnCount(); i++) {
                String fieldName = metaData.getColumnName(i);
                columns[i - 1] = fieldName.replaceFirst(source.table() + ".",
                        "");
            }
            this.source.header(columns);
            start = true;
        }
        if (done) {
            LOG.warn("no other data");
            return null;
        }
        ArrayList<Line> lines = new ArrayList<>(source.batchSize());
        for (int j = 0; j < source.batchSize(); j++) {

            if (result.next()) {
                int n = this.columns.length;
                Object[] values = new Object[n];
                for (int i = 1; i <= n; i++) {
                    Object value = result.getObject(i);
                    if (value instanceof LocalDateTime) {
                        // Let the JDBC driver retain its configured time-zone conversion.
                        value = result.getTimestamp(i);
                    }
                    if (value == null) {
                        value = Constants.NULL_STR;
                    }
                    values[i - 1] = value;
                }
                String rawLine = StringUtils.join(values, Constants.COMMA_STR);
                Line line = new Line(rawLine, this.columns, values);
                lines.add(line);
            } else {
                done = true;
                break;
            }
        }
        return lines;
    }

    private void disableAutoCommit() {
        try {
            if (this.conn.getAutoCommit()) {
                this.conn.setAutoCommit(false);
            }
        } catch (SQLException e) {
            // Not supported by every driver; fall back to the driver default
            LOG.warn("Failed to disable auto-commit, rows may be buffered " +
                     "in memory by the JDBC driver", e);
        }
    }

    public String buildSql() {
        StringBuilder sb = new StringBuilder();
        sb.append("select * from ");
        sb.append(source.table());

        if (!StringUtils.isAllBlank(source.getWhere())) {
            sb.append(" where " + source.getWhere().trim());
        }

        return sb.toString();
    }
}
