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

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

import org.junit.Test;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import org.apache.hugegraph.config.DatabaseSchemaMigrator;
import org.apache.hugegraph.testutil.Assert;

public class FileMappingSchemaTest {

    @Test
    public void testFileMappingStoresDeepUploadPath() throws Exception {
        String url = "jdbc:h2:mem:file_mapping_deep_path;DB_CLOSE_DELAY=-1";
        try (Connection conn = DriverManager.getConnection(url)) {
            ScriptUtils.executeSqlScript(conn, new FileSystemResource(
                                         this.mainSchemaPath()));

            String deepPath = this.deepUploadPath();
            this.insertDeepPath(conn, deepPath);

            try (Statement statement = conn.createStatement();
                 ResultSet rs = statement.executeQuery(
                         "SELECT `path` FROM `file_mapping` " +
                         "WHERE `name` = 'deep.csv'")) {
                Assert.assertTrue(rs.next());
                Assert.assertEquals(deepPath, rs.getString(1));
            }
        }
    }

    @Test
    public void testSchemaMigratorWidensExistingFileMappingPath()
           throws Exception {
        String url = "jdbc:h2:mem:file_mapping_legacy_path;DB_CLOSE_DELAY=-1";
        try (Connection conn = DriverManager.getConnection(url)) {
            this.createLegacyFileMappingTable(conn);

            new DatabaseSchemaMigrator().migrate(conn);

            this.insertDeepPath(conn, this.deepUploadPath());
        }
    }

    @Test
    public void testSchemaMigratorAddsExecuteHistoryFailureReasonIdempotently()
           throws Exception {
        String url = "jdbc:h2:mem:execute_history_failure_reason;DB_CLOSE_DELAY=-1";
        try (Connection conn = DriverManager.getConnection(url)) {
            try (Statement statement = conn.createStatement()) {
                statement.execute("CREATE TABLE `execute_history` (" +
                                  "`id` INT NOT NULL AUTO_INCREMENT, " +
                                  "PRIMARY KEY (`id`))");
            }

            DatabaseSchemaMigrator migrator = new DatabaseSchemaMigrator();
            migrator.migrate(conn);
            migrator.migrate(conn);

            try (ResultSet columns = conn.getMetaData().getColumns(
                    null, null, "EXECUTE_HISTORY", "FAILURE_REASON")) {
                Assert.assertTrue(columns.next());
                Assert.assertEquals(64, columns.getInt("COLUMN_SIZE"));
            }
        }
    }

    @Test
    public void testSchemaMigratorRemovesLegacyLoadTaskCredentials()
           throws Exception {
        String url = "jdbc:h2:mem:load_task_credentials;DB_CLOSE_DELAY=-1";
        try (Connection conn = DriverManager.getConnection(url);
             Statement statement = conn.createStatement()) {
            statement.execute("CREATE TABLE `load_task` (" +
                              "`id` INT NOT NULL AUTO_INCREMENT, " +
                              "`options` VARCHAR(65535) NOT NULL, " +
                              "PRIMARY KEY (`id`))");
            statement.execute("INSERT INTO `load_task` (`options`) VALUES (" +
                              "'{\"graph\":\"hugegraph\"," +
                              "\"password\":\"canary-password\"," +
                              "\"token\":\"canary-token\"," +
                              "\"pdToken\":\"canary-pd-token\"," +
                              "\"trustStoreToken\":" +
                              "\"canary-truststore-token\"," +
                              "\"futureOption\":\"preserved\"}')");

            DatabaseSchemaMigrator migrator = new DatabaseSchemaMigrator();
            migrator.migrate(conn);
            migrator.migrate(conn);

            try (ResultSet rows = statement.executeQuery(
                    "SELECT `options` FROM `load_task`")) {
                Assert.assertTrue(rows.next());
                String options = rows.getString(1);
                Assert.assertFalse(options.contains("canary-"));
                Assert.assertContains("futureOption", options);
                Assert.assertContains("preserved", options);
            }
        }
    }

    private void insertDeepPath(Connection conn, String deepPath)
            throws Exception {
        try (PreparedStatement insert = conn.prepareStatement(
                "INSERT INTO `file_mapping` " +
                "(`graphspace`, `graph`, `job_id`, `name`, `path`, " +
                "`total_lines`, `total_size`, `file_status`, " +
                "`file_setting`, `vertex_mappings`, `edge_mappings`, " +
                "`load_parameter`, `create_time`, `update_time`) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, " +
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")) {
            insert.setString(1, "DEFAULT");
            insert.setString(2, "hugegraph");
            insert.setInt(3, 1);
            insert.setString(4, "deep.csv");
            insert.setString(5, deepPath);
            insert.setLong(6, 1L);
            insert.setLong(7, 1L);
            insert.setInt(8, 0);
            insert.setString(9, "{}");
            insert.setString(10, "[]");
            insert.setString(11, "[]");
            insert.setString(12, "{}");
            insert.executeUpdate();
        }
    }

    private void createLegacyFileMappingTable(Connection conn) throws Exception {
        try (Statement statement = conn.createStatement()) {
            statement.execute("CREATE TABLE `file_mapping` (" +
                              "`id` INT NOT NULL AUTO_INCREMENT, " +
                              "`graphspace` VARCHAR(48) NOT NULL, " +
                              "`graph` VARCHAR(48) NOT NULL, " +
                              "`job_id` INT NOT NULL DEFAULT 0, " +
                              "`name` VARCHAR(128) NOT NULL, " +
                              "`path` VARCHAR(256) NOT NULL, " +
                              "`total_lines` LONG NOT NULL, " +
                              "`total_size` LONG NOT NULL, " +
                              "`file_status` TINYINT NOT NULL DEFAULT 0, " +
                              "`file_setting` VARCHAR(65535) NOT NULL, " +
                              "`vertex_mappings` VARCHAR(65535) NOT NULL, " +
                              "`edge_mappings` VARCHAR(65535) NOT NULL, " +
                              "`load_parameter` VARCHAR(65535) NOT NULL, " +
                              "`create_time` DATETIME(6) NOT NULL, " +
                              "`update_time` DATETIME(6) NOT NULL, " +
                              "PRIMARY KEY (`id`))");
        }
    }

    private Path mainSchemaPath() {
        Path modulePath = Paths.get("src/main/resources/database/schema.sql");
        if (Files.exists(modulePath)) {
            return modulePath;
        }
        return Paths.get("hugegraph-hubble/hubble-be/src/main/resources/" +
                         "database/schema.sql");
    }

    private String deepUploadPath() {
        StringBuilder builder = new StringBuilder("/tmp/hubble-upload");
        while (builder.length() < 600) {
            builder.append("/nested-directory");
        }
        builder.append("/deep.csv");
        return builder.toString();
    }
}
