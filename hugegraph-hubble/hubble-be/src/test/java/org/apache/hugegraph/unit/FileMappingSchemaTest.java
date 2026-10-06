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
    public void testNewDatabasePersistsAcrossRestart() throws Exception {
        Path directory = Files.createTempDirectory("hubble-h2-");
        String url = "jdbc:h2:file:" + directory.resolve("metadata");
        try {
            try (Connection conn = DriverManager.getConnection(url)) {
                ScriptUtils.executeSqlScript(conn, new FileSystemResource(
                                             this.mainSchemaPath()));
                this.insertDeepPath(conn, this.deepUploadPath());
            }
            try (Connection conn = DriverManager.getConnection(url)) {
                // Startup runs the same schema again; it must retain data.
                ScriptUtils.executeSqlScript(conn, new FileSystemResource(
                                             this.mainSchemaPath()));
                try (Statement statement = conn.createStatement();
                     ResultSet result = statement.executeQuery(
                             "SELECT path FROM file_mapping")) {
                    Assert.assertTrue(result.next());
                    Assert.assertEquals(this.deepUploadPath(),
                                        result.getString(1));
                    Assert.assertFalse(result.next());
                }
            }
        } finally {
            Files.deleteIfExists(directory.resolve("metadata.mv.db"));
            Files.deleteIfExists(directory.resolve("metadata.trace.db"));
            Files.delete(directory);
        }
    }

    @Test
    public void testCollectionsAreScopedByGraphAndType() throws Exception {
        try (Connection conn = DriverManager.getConnection(
                "jdbc:h2:mem:collection_scope")) {
            ScriptUtils.executeSqlScript(conn, new FileSystemResource(
                                         this.mainSchemaPath()));
            try (PreparedStatement insert = conn.prepareStatement(
                    "INSERT INTO gremlin_collection " +
                    "(graphspace, graph, name, type, content, create_time) " +
                    "VALUES ('DEFAULT', ?, 'query', ?, 'g.V()', CURRENT_TIMESTAMP)")) {
                for (String graph : new String[]{"one", "two"}) {
                    for (String type : new String[]{"GREMLIN", "CYPHER"}) {
                        insert.setString(1, graph);
                        insert.setString(2, type);
                        Assert.assertEquals(1, insert.executeUpdate());
                    }
                }
                Assert.assertThrows(java.sql.SQLException.class,
                                    insert::executeUpdate);
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
