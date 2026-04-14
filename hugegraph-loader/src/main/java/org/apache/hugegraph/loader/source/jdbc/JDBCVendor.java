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

package org.apache.hugegraph.loader.source.jdbc;

import java.net.URISyntaxException;

import org.apache.http.client.utils.URIBuilder;

import org.apache.hugegraph.loader.constant.Constants;
import org.apache.hugegraph.loader.exception.LoadException;
import org.apache.hugegraph.loader.reader.jdbc.JDBCUtil;
import org.apache.hugegraph.loader.reader.line.Line;
import org.apache.hugegraph.util.E;

public enum JDBCVendor {

    MYSQL {
        @Override
        public String defaultDriver() {
            return "com.mysql.cj.jdbc.Driver";
        }

        @Override
        public String defaultSchema(JDBCSource source) {
            return source.database();
        }

        @Override
        public String checkSchema(JDBCSource source) {
            String schema = source.schema();
            if (schema != null) {
                E.checkArgument(schema.equals(source.database()),
                                "The schema(%s) is allowed to not " +
                                "specified in %s vendor, if specified, " +
                                "it must be same as the database(%s)",
                                schema, this, source.database());
            }
            return super.checkSchema(source);
        }

        @Override
        public String buildUrl(JDBCSource source) {
            return super.buildUrl(source) + "&allowPublicKeyRetrieval=true";
        }

        @Override
        public String buildGetHeaderSql(JDBCSource source) {
            return String.format("SELECT COLUMN_NAME " +
                                 "FROM INFORMATION_SCHEMA.COLUMNS " +
                                 "WHERE TABLE_SCHEMA = %s " +
                                 "AND TABLE_NAME = %s " +
                                 "ORDER BY ORDINAL_POSITION;",
                                 this.escape(source.schema()),
                                 this.escape(source.table()));
        }

        @Override
        public String buildGetPrimaryKeySql(JDBCSource source) {
            return String.format("SELECT COLUMN_NAME " +
                                 "FROM INFORMATION_SCHEMA.COLUMNS " +
                                 "WHERE TABLE_SCHEMA = %s " +
                                 "AND TABLE_NAME = %s " +
                                 "AND COLUMN_KEY = 'PRI';",
                                 this.escape(source.schema()),
                                 this.escape(source.table()));
        }

        @Override
        public String escape(String value) {
            return JDBCUtil.escapeMysql(value);
        }
    },

    POSTGRESQL {
        @Override
        public String defaultDriver() {
            return "org.postgresql.Driver";
        }

        @Override
        public String defaultSchema(JDBCSource source) {
            return "public";
        }

        @Override
        public String buildGetHeaderSql(JDBCSource source) {
            return String.format("SELECT COLUMN_NAME " +
                                 "FROM INFORMATION_SCHEMA.COLUMNS " +
                                 "WHERE TABLE_CATALOG = %s " +
                                 "AND TABLE_SCHEMA = %s " +
                                 "AND TABLE_NAME = %s " +
                                 "ORDER BY ORDINAL_POSITION;",
                                 this.escape(source.database()),
                                 this.escape(source.schema()),
                                 this.escape(source.table()));
        }

        @Override
        public String buildGetPrimaryKeySql(JDBCSource source) {
            return String.format("SELECT a.attname AS COLUMN_NAME " +
                                 "FROM pg_index i " +
                                 "JOIN pg_attribute a " +
                                 "ON a.attrelid = i.indrelid " +
                                 "AND a.attnum = ANY(i.indkey) " +
                                 "WHERE i.indrelid = '%s.%s'::regclass " +
                                 "AND i.indisprimary;",
                                 source.schema(),
                                 source.table());
        }

        @Override
        public String escape(String value) {
            return JDBCUtil.escapePostgresql(value);
        }
    },

    ORACLE {
        @Override
        public String defaultDriver() {
            return "oracle.jdbc.driver.OracleDriver";
        }

        @Override
        public String defaultSchema(JDBCSource source) {
            return source.username().toUpperCase();
        }

        @Override
        public String buildUrl(JDBCSource source) {
            String url = source.url();
            if (url.endsWith(":")) {
                url = String.format("%s%s", url, source.database());
            } else {
                url = String.format("%s:%s", url, source.database());
            }
            return url;
        }

        /**
         * NOTE: don't add a semicolon(;) at the end of oracle sql
         */
        @Override
        public String buildGetHeaderSql(JDBCSource source) {
            return String.format("SELECT COLUMN_NAME " +
                                 "FROM USER_TAB_COLUMNS " +
                                 "WHERE TABLE_NAME = %s " +
                                 "ORDER BY COLUMN_ID",
                                 this.escape(source.table()));
        }

        @Override
        public String buildGetPrimaryKeySql(JDBCSource source) {
            return String.format("SELECT cols.column_name AS COLUMN_NAME " +
                                 "FROM all_constraints cons, " +
                                 "all_cons_columns cols " +
                                 "WHERE cols.table_name = %s " +
                                 "AND cons.constraint_type = 'P' " +
                                 "AND cons.constraint_name = " +
                                 "cols.constraint_name " +
                                 "AND cons.owner = cols.owner " +
                                 "ORDER BY cols.table_name, cols.position",
                                 this.escape(source.table()));
        }

        @Override
        public String buildSelectSql(JDBCSource source, Line nextStartRow) {
            StringBuilder builder = new StringBuilder();
            builder.append("SELECT * FROM ")
                   .append("\"").append(source.schema()).append("\"")
                   .append(".")
                   .append("\"").append(source.table()).append("\"")
                   .append(" WHERE ");
            if (nextStartRow != null) {
                builder.append(this.buildGteClauseInFlattened(nextStartRow))
                       .append(" AND ");
            }
            builder.append("ROWNUM <= ").append(source.batchSize() + 1);
            return builder.toString();
        }

        @Override
        public String escape(String value) {
            return JDBCUtil.escapeOracle(value);
        }
    },

    SQLSERVER {
        @Override
        public String defaultDriver() {
            return "com.microsoft.sqlserver.jdbc.SQLServerDriver";
        }

        @Override
        public String defaultSchema(JDBCSource source) {
            throw new UnsupportedOperationException("SQLSERVER.defaultSchema");
        }

        @Override
        public String checkSchema(JDBCSource source) {
            E.checkArgument(source.schema() != null,
                            "The schema must be specified in %s vendor", this);
            return source.schema();
        }

        @Override
        public String buildUrl(JDBCSource source) {
            String url = source.url();
            String database = source.database();
            if (url.endsWith(";")) {
                url = String.format("%sDatabaseName=%s", url, database);
            } else {
                url = String.format("%s;DatabaseName=%s", url, database);
            }
            return url;
        }

        @Override
        public String buildGetHeaderSql(JDBCSource source) {
            return String.format("SELECT COLUMN_NAME " +
                                 "FROM INFORMATION_SCHEMA.COLUMNS " +
                                 "WHERE TABLE_CATALOG = N%s " +
                                 "AND TABLE_SCHEMA = N%s " +
                                 "AND TABLE_NAME = N%s " +
                                 "ORDER BY ORDINAL_POSITION;",
                                 this.escape(source.database()),
                                 this.escape(source.schema()),
                                 this.escape(source.table()));
        }

        @Override
        public String buildGetPrimaryKeySql(JDBCSource source) {
            return String.format("SELECT COLUMN_NAME " +
                                 "FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE " +
                                 "WHERE OBJECTPROPERTY(OBJECT_ID(" +
                                 "CONSTRAINT_SCHEMA + '.' + QUOTENAME(" +
                                 "CONSTRAINT_NAME)), 'IsPrimaryKey') = 1" +
                                 "AND TABLE_SCHEMA = N%s " +
                                 "AND TABLE_NAME = N%s;",
                                 this.escape(source.schema()),
                                 this.escape(source.table()));
        }

        @Override
        public String buildSelectSql(JDBCSource source, Line nextStartRow) {
            StringBuilder builder = new StringBuilder();
            builder.append("SELECT ")
                   .append("TOP ").append(source.batchSize() + 1)
                   .append(" * FROM ")
                   .append(source.schema()).append(".").append(source.table());
            if (nextStartRow != null) {
                builder.append(" WHERE ")
                       .append(this.buildGteClauseInFlattened(nextStartRow));
            }
            builder.append(";");
            return builder.toString();
        }

        @Override
        public String escape(String value) {
            return JDBCUtil.escapeSqlserver(value);
        }
    };

    public abstract String defaultDriver();

    public abstract String defaultSchema(JDBCSource source);

    public String checkSchema(JDBCSource source) {
        String schema = source.schema();
        return schema == null ? this.defaultSchema(source) : schema;
    }

    private static final String JDBC_PREFIX = "jdbc:";

    public String buildUrl(JDBCSource source) {
        String url = source.url();
        if (url.endsWith("/")) {
            url = String.format("%s%s", url, source.database());
        } else {
            url = String.format("%s/%s", url, source.database());
        }

        E.checkArgument(url.startsWith(JDBC_PREFIX),
                        "The url must start with '%s': '%s'",
                        JDBC_PREFIX, url);
        String urlWithoutJdbc = url.substring(JDBC_PREFIX.length());

        URIBuilder uriBuilder;
        try {
            uriBuilder = new URIBuilder(urlWithoutJdbc);
        } catch (URISyntaxException e) {
            throw new LoadException("Invalid url '%s'", e, url);
        }
        uriBuilder.setParameter("useSSL", "false")
                  .setParameter("characterEncoding", Constants.CHARSET.name())
                  .setParameter("rewriteBatchedStatements", "true")
                  .setParameter("useServerPrepStmts", "false")
                  .setParameter("autoReconnect", "true");
        return JDBC_PREFIX + uriBuilder;
    }

    public abstract String buildGetHeaderSql(JDBCSource source);

    public abstract String buildGetPrimaryKeySql(JDBCSource source);

    public String buildSelectSql(JDBCSource source, Line nextStartRow) {
        StringBuilder builder = new StringBuilder();
        builder.append("SELECT * FROM ")
               .append(source.schema()).append(".").append(source.table());
        if (nextStartRow != null) {
            builder.append(" WHERE ")
                   .append(this.buildGteClauseInCombined(nextStartRow));
        }
        builder.append(" LIMIT ").append(source.batchSize() + 1)
               .append(";");
        return builder.toString();
    }

    /**
     * For database which support to select by where (a, b, c) >= (va, vb, vc)
     */
    public String buildGteClauseInCombined(Line nextStartRow) {
        E.checkNotNull(nextStartRow, "nextStartRow");
        StringBuilder builder = new StringBuilder();
        String[] names = nextStartRow.names();
        Object[] values = nextStartRow.values();
        builder.append("(");
        for (int i = 0, n = names.length; i < n; i++) {
            builder.append(names[i]);
            if (i != n - 1) {
                builder.append(", ");
            }
        }
        builder.append(") >= (");
        for (int i = 0, n = values.length; i < n; i++) {
            Object value = values[i];
            builder.append(this.escapeIfNeeded(value));
            if (i != n - 1) {
                builder.append(", ");
            }
        }
        builder.append(")");
        return builder.toString();
    }

    /**
     * For database which unsupported to select by where (a, b, c) >= (va, vb, vc)
     * (a, b, c) >= (va, vb, vc) will be convert as follows:
     * ("a" = va AND "b" = vb AND "c" >= vc)
     * OR
     * ("a" = va AND "b" > vb)
     * OR
     * ("a" > va)
     */
    public String buildGteClauseInFlattened(Line nextStartRow) {
        E.checkNotNull(nextStartRow, "nextStartRow");
        StringBuilder builder = new StringBuilder();
        String[] names = nextStartRow.names();
        Object[] values = nextStartRow.values();
        for (int i = 0, n = names.length; i < n; i++) {
            builder.append("(");
            for (int j = 0; j < n - i; j++) {
                String name = names[j];
                Object value = values[j];
                String operator = " = ";
                boolean appendAnd = true;
                if (j == n - i - 1) {
                    appendAnd = false;
                    if (i == 0) {
                        operator = " >= ";
                    } else {
                        operator = " > ";
                    }
                }
                builder.append("\"").append(name).append("\"")
                       .append(operator)
                       .append(this.escapeIfNeeded(value));
                if (appendAnd) {
                    builder.append(" AND ");
                }
            }
            builder.append(")");
            if (i != n - 1) {
                builder.append(" OR ");
            }
        }
        return builder.toString();
    }

    public Object escapeIfNeeded(Object value) {
        return value instanceof String ? this.escape((String) value) : value;
    }

    public abstract String escape(String value);
}
