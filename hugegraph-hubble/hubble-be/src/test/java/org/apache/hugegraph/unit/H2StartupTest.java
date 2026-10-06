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
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.Comparator;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;

import javax.sql.DataSource;

import org.apache.hugegraph.config.H2DataSourceConfig;
import org.apache.ibatis.session.ExecutorType;
import org.apache.ibatis.session.SqlSessionFactory;
import com.baomidou.mybatisplus.autoconfigure.MybatisPlusAutoConfiguration;
import org.h2.mvstore.MVStore;
import org.junit.Assert;
import org.junit.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.sql.init.SqlInitializationAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.support.ResourcePropertySource;

public class H2StartupTest {

    private ApplicationContextRunner runner(String url) {
        return new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(
                        DataSourceAutoConfiguration.class,
                        SqlInitializationAutoConfiguration.class,
                        MybatisPlusAutoConfiguration.class))
                .withUserConfiguration(H2DataSourceConfig.class)
                .withInitializer(context -> {
                    try {
                        context.getEnvironment().getPropertySources().addLast(
                                new ResourcePropertySource(new FileSystemResource(
                                        "src/main/resources/application.properties")));
                    } catch (java.io.IOException e) {
                        throw new IllegalStateException(e);
                    }
                })
                .withPropertyValues("spring.datasource.url=" + url,
                                    "spring.datasource.username=sa",
                                    "spring.datasource.password=",
                                    "spring.sql.init.mode=always",
                                    "spring.sql.init.schema-locations=" +
                                    "file:src/main/resources/database/schema.sql");
    }

    @Test
    public void testStartupAndRestartPreserveMetadata() throws Exception {
        this.assertFreshDatabaseRestarts(false, false);
    }

    @Test
    public void testShorthandFileDatabaseInitializesAndRestarts() throws Exception {
        this.assertFreshDatabaseRestarts(true, false);
    }

    @Test
    public void testEncryptedDatabaseInitializesAndRestarts() throws Exception {
        this.assertFreshDatabaseRestarts(false, true);
    }

    @Test
    public void testUnnamedMemoryUrlsAreRejectedBeforeConnecting() {
        for (String url : new String[]{"jdbc:h2:mem", "jdbc:h2:mem:", "jdbc:h2:mem:;DB_CLOSE_DELAY=-1"}) {
            this.runner(url).run(context -> {
                Throwable failure = context.getStartupFailure();
                Assert.assertNotNull(failure);
                while (failure.getCause() != null) {
                    failure = failure.getCause();
                }
                Assert.assertTrue(failure instanceof IllegalArgumentException);
                Assert.assertEquals("Hubble metadata requires H2 with a local file or named memory URL; " +
                                    "configure the JDBC URL and credentials directly", failure.getMessage());
            });
        }
    }

    @Test
    public void testNamedMemorySharesMetadataUntilLastConnectionCloses() throws Exception {
        String url = "jdbc:h2:mem:named-metadata-pool;DB_CLOSE_DELAY=0";
        this.runner(url).withPropertyValues("spring.datasource.hikari.minimum-idle=0",
                                           "spring.datasource.hikari.maximum-pool-size=2").run(context -> {
            Assert.assertNull(context.getStartupFailure());
            DataSource dataSource = context.getBean(DataSource.class);
            try (Connection first = dataSource.getConnection();
                 Connection second = dataSource.getConnection();
                 Statement write = first.createStatement();
                 Statement read = second.createStatement()) {
                write.execute("INSERT INTO user_info(username, locale) VALUES ('memory-user', 'zh')");
                try (java.sql.ResultSet result = read.executeQuery(
                        "SELECT locale FROM user_info WHERE username='memory-user'")) {
                    Assert.assertTrue(result.next());
                    Assert.assertEquals("zh", result.getString(1));
                }
            }
        });
        try (Connection ignored = DriverManager.getConnection(url + ";IFEXISTS=TRUE", "sa", "")) {
            Assert.fail("Named memory metadata must disappear after its last connection closes");
        } catch (java.sql.SQLException failure) {
            Assert.assertEquals(90146, failure.getErrorCode());
        }
    }

    @Test
    public void testWrongEncryptedPasswordHasSafeValidationGuidance() throws Exception {
        Path directory = Files.createTempDirectory("hubble-password-rejection-");
        String url = "jdbc:h2:file:" + directory.resolve("metadata") + ";CIPHER=AES";
        try {
            try (Connection connection = DriverManager.getConnection(url, "sa", "file-secret login-secret");
                 Statement statement = connection.createStatement()) {
                statement.execute("CREATE TABLE HUBBLE_SCHEMA_VERSION (ID INT PRIMARY KEY, VERSION INT)");
                statement.execute("INSERT INTO HUBBLE_SCHEMA_VERSION VALUES (1, 1)");
            }
            byte[] before = Files.readAllBytes(directory.resolve("metadata.mv.db"));
            this.runner(url).withPropertyValues(
                    "spring.datasource.password=wrong-file-secret login-secret").run(context -> {
                        Throwable failure = context.getStartupFailure();
                        Assert.assertNotNull(failure);
                        while (failure.getCause() != null) {
                            failure = failure.getCause();
                        }
                        Assert.assertTrue(failure instanceof IllegalArgumentException);
                        Assert.assertEquals("Hubble metadata validation failed; verify database credentials " +
                                            "and file access before choosing a new H2 database",
                                            failure.getMessage());
                    });
            Assert.assertArrayEquals(before, Files.readAllBytes(directory.resolve("metadata.mv.db")));
            Assert.assertFalse(Files.exists(directory.resolve("metadata.trace.db")));
        } finally {
            try (Stream<Path> files = Files.walk(directory)) {
                for (Path path : files.sorted(Comparator.reverseOrder()).toList()) {
                    Files.deleteIfExists(path);
                }
            }
        }
    }

    @Test
    public void testReadOnlyInitializationFailurePreservesDatabase() throws Exception {
        Path directory = Files.createTempDirectory(Path.of("target"), "hubble-readonly-rejection-");
        Path database = directory.resolve("metadata.mv.db");
        String url = "jdbc:h2:file:" + directory.toAbsolutePath().resolve("metadata");
        try {
            // A native empty MVStore deterministically requires H2 initialization on open.
            try (MVStore store = new MVStore.Builder().fileName(database.toString()).open()) {
                store.commit();
            }
            byte[] before = Files.readAllBytes(database);
            // Keep the direct probe independent of the framework's first open.
            Path probe = directory.resolve("probe.mv.db");
            Files.copy(database, probe);
            try (Connection ignored = DriverManager.getConnection(
                    "jdbc:h2:file:" + directory.toAbsolutePath().resolve("probe") +
                    ";IFEXISTS=TRUE;ACCESS_MODE_DATA=r;TRACE_LEVEL_FILE=0", "sa", "")) {
                Assert.fail("Read-only initialization must fail");
            } catch (java.sql.SQLException failure) {
                Assert.assertEquals(90097, failure.getErrorCode());
            }
            this.runner(url).run(context -> {
                Throwable failure = context.getStartupFailure();
                Assert.assertNotNull(failure);
                while (failure.getCause() != null) {
                    failure = failure.getCause();
                }
                Assert.assertTrue(failure instanceof IllegalArgumentException);
                Assert.assertEquals("Hubble metadata read-only validation failed (H2 error 90097); " +
                                    "preserve the database and follow the manual recovery guidance " +
                                    "in the README. This error does not establish that the database " +
                                    "is empty", failure.getMessage());
                Assert.assertNull(failure.getCause());
            });
            Assert.assertArrayEquals(before, Files.readAllBytes(database));
            Assert.assertArrayEquals(before, Files.readAllBytes(probe));
            Assert.assertFalse(Files.exists(directory.resolve("metadata.trace.db")));
            Assert.assertFalse(Files.exists(directory.resolve("probe.trace.db")));
        } finally {
            try (Stream<Path> files = Files.walk(directory)) {
                for (Path path : files.sorted(Comparator.reverseOrder()).toList()) {
                    Files.deleteIfExists(path);
                }
            }
        }
    }

    private void assertFreshDatabaseRestarts(boolean shorthand, boolean encrypted) throws Exception {
        Path directory = Files.createTempDirectory(Path.of("target"), "hubble-startup-");
        String url = (shorthand ? "jdbc:h2:./" : "jdbc:h2:file:./") + directory.resolve("metadata") +
                     (encrypted ? ";CIPHER=AES" : "");
        ApplicationContextRunner runner = this.runner(url).withPropertyValues(
                "spring.datasource.password=" + (encrypted ? "file-secret login-secret" : ""));
        try {
            runner.run(context -> {
                Assert.assertNull(context.getStartupFailure());
                JdbcTemplate jdbc = new JdbcTemplate(context.getBean(DataSource.class));
                jdbc.update("INSERT INTO user_info(username, locale) VALUES (?, ?)",
                            "test-user", "en");
            });
            runner.run(context -> {
                Assert.assertNull(context.getStartupFailure());
                JdbcTemplate jdbc = new JdbcTemplate(context.getBean(DataSource.class));
                Assert.assertEquals("en", jdbc.queryForObject(
                        "SELECT locale FROM user_info WHERE username = ?",
                        String.class, "test-user"));
                jdbc.update("UPDATE user_info SET locale = ? WHERE username = ?",
                            "zh", "test-user");
                Assert.assertEquals("zh", jdbc.queryForObject(
                        "SELECT locale FROM user_info WHERE username = ?",
                        String.class, "test-user"));
            });
        } finally {
            Files.deleteIfExists(directory.resolve("metadata.mv.db"));
            Files.deleteIfExists(directory.resolve("metadata.trace.db"));
            Files.delete(directory);
        }
    }

    @Test
    public void testExistingUnmarkedDatabaseIsRejectedWithoutChanges() throws Exception {
        this.assertLegacyDatabaseIsUnchanged(false);
    }

    @Test
    public void testHikariUrlOverrideCannotInitializeLegacyDatabase() throws Exception {
        this.assertLegacyDatabaseIsUnchanged(true);
    }

    @Test
    public void testUrlInitCannotTouchLegacyDatabase() throws Exception {
        this.assertLegacyDatabaseIsUnchanged(false, ";INIT=CREATE TABLE injected(id INT)");
    }

    @Test
    public void testInitIsRejectedBeforeOpeningNewDatabase() throws Exception {
        for (String setting : new String[]{"INIT", "I\\NIT"}) {
            Path directory = Files.createTempDirectory("hubble-init-rejection-");
            try {
                this.runner("jdbc:h2:file:" + directory.resolve("metadata") +
                            ";" + setting + "=CREATE TABLE injected(id INT)").run(context -> {
                                Assert.assertNotNull(context.getStartupFailure());
                            });
                try (Stream<Path> files = Files.list(directory)) {
                    Assert.assertEquals("INIT rejection must not create database or trace files", 0L, files.count());
                }
            } finally {
                Files.delete(directory);
            }
        }
    }

    private void assertLegacyDatabaseIsUnchanged(boolean hikariOverride) throws Exception {
        this.assertLegacyDatabaseIsUnchanged(hikariOverride, "");
    }

    @Test
    public void testEncryptedLegacyDatabaseIsRejectedWithoutChanges() throws Exception {
        this.assertLegacyDatabaseIsUnchanged(false, ";CIPHER=AES");
    }

    private void assertLegacyDatabaseIsUnchanged(boolean hikariOverride, String options) throws Exception {
        String cipher = options.contains("CIPHER=AES") ? ";CIPHER=AES" : "";
        String password = cipher.isEmpty() ? "" : "file-secret login-secret";
        Path directory = Files.createTempDirectory("hubble-legacy-rejection-");
        String url = "jdbc:h2:file:" + directory.resolve("legacy");
        try {
            // A real existing H2 database with the old user_info shape and user data.
            try (Connection connection = DriverManager.getConnection(url + cipher, "sa", password);
                 Statement statement = connection.createStatement()) {
                statement.execute("CREATE TABLE user_info (id INT PRIMARY KEY, " +
                                  "username VARCHAR(48), locale VARCHAR(20))");
                statement.execute("INSERT INTO user_info VALUES (1, 'legacy-user', 'zh')");
            }
            byte[] before = Files.readAllBytes(directory.resolve("legacy.mv.db"));
            ApplicationContextRunner runner = this.runner(
                    hikariOverride ? "jdbc:h2:mem:unused-legacy-override" : url + options)
                    .withPropertyValues("spring.datasource.password=" + password);
            if (hikariOverride) {
                runner = runner.withPropertyValues("spring.datasource.hikari.jdbc-url=" + url);
            }
            AtomicReference<Throwable> failure = new AtomicReference<>();
            runner.run(context -> failure.set(context.getStartupFailure()));
            byte[] after = Files.readAllBytes(directory.resolve("legacy.mv.db"));
            Assert.assertArrayEquals("Rejected legacy database must not be rewritten", before, after);
            Assert.assertNotNull("Existing unmarked metadata must fail before initialization", failure.get());
            try (Connection connection = DriverManager.getConnection(
                         url + cipher + ";IFEXISTS=TRUE;ACCESS_MODE_DATA=r;TRACE_LEVEL_FILE=0", "sa", password);
                 Statement statement = connection.createStatement()) {
                try (java.sql.ResultSet result = statement.executeQuery(
                        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='PUBLIC'")) {
                    Assert.assertTrue(result.next());
                    Assert.assertEquals(1, result.getInt(1));
                }
                try (java.sql.ResultSet result = statement.executeQuery(
                        "SELECT username, locale FROM user_info WHERE id=1")) {
                    Assert.assertTrue(result.next());
                    Assert.assertEquals("legacy-user", result.getString(1));
                    Assert.assertEquals("zh", result.getString(2));
                }
            }
            Assert.assertArrayEquals(before, Files.readAllBytes(directory.resolve("legacy.mv.db")));
            Assert.assertFalse(Files.exists(directory.resolve("legacy.trace.db")));
        } finally {
            try (Stream<Path> files = Files.walk(directory)) {
                for (Path path : files.sorted(Comparator.reverseOrder()).toList()) {
                    Files.deleteIfExists(path);
                }
            }
        }
    }

    @Test
    public void testFinalHikariConnectionAndPoolSettingsAreApplied() throws Exception {
        Path directory = Files.createTempDirectory("hubble-hikari-final-");
        String url = "jdbc:h2:file:" + directory.resolve("metadata");
        try {
            this.runner("jdbc:h2:mem:unused-hikari-final").withPropertyValues(
                    "spring.datasource.hikari.jdbc-url=" + url,
                    "spring.datasource.hikari.pool-name=validated-pool",
                    "spring.datasource.hikari.minimum-idle=1",
                    "spring.datasource.hikari.maximum-pool-size=2").run(context -> {
                        Assert.assertNull(context.getStartupFailure());
                        com.zaxxer.hikari.HikariDataSource pool = context.getBean(
                                com.zaxxer.hikari.HikariDataSource.class);
                        Assert.assertEquals(url, pool.getJdbcUrl());
                        Assert.assertEquals("validated-pool", pool.getPoolName());
                        Assert.assertEquals(1, pool.getMinimumIdle());
                        Assert.assertEquals(2, pool.getMaximumPoolSize());
                        Assert.assertEquals(Integer.valueOf(1), new JdbcTemplate(pool).queryForObject(
                                "SELECT \"VERSION\" FROM \"PUBLIC\".\"HUBBLE_SCHEMA_VERSION\"", Integer.class));
                    });
        } finally {
            try (Stream<Path> files = Files.walk(directory)) {
                for (Path path : files.sorted(Comparator.reverseOrder()).toList()) {
                    Files.deleteIfExists(path);
                }
            }
        }
    }

    @Test
    public void testAlternativeHikariConnectionFactoriesAreRejected() {
        for (String override : new String[]{
                "jdbc-url=jdbc:mysql://127.0.0.1:1/unused",
                "driver-class-name=org.postgresql.Driver",
                "data-source-class-name=org.h2.jdbcx.JdbcDataSource",
                "data-source-j-n-d-i=java:comp/env/unused",
                "data-source-properties.INIT=CREATE TABLE injected(id INT)"}) {
            this.runner("jdbc:h2:mem:connection-factory-check").withPropertyValues(
                    "spring.datasource.hikari." + override).run(context -> {
                        Throwable failure = context.getStartupFailure();
                        Assert.assertNotNull(override, failure);
                        while (failure.getCause() != null) {
                            failure = failure.getCause();
                        }
                        Assert.assertTrue(failure.getMessage(),
                                          failure.getMessage().contains("Hubble metadata requires H2"));
                    });
        }
    }

    @Test
    public void testProductionMybatisSettingsAreApplied() {
        this.runner("jdbc:h2:mem:mybatis-settings").run(context -> {
            Assert.assertNull(context.getStartupFailure());
            org.apache.ibatis.session.Configuration configuration =
                    context.getBean(SqlSessionFactory.class).getConfiguration();
            Assert.assertFalse(configuration.isCacheEnabled());
            Assert.assertTrue(configuration.isMapUnderscoreToCamelCase());
            Assert.assertTrue(configuration.isUseGeneratedKeys());
            Assert.assertEquals(ExecutorType.REUSE, configuration.getDefaultExecutorType());
            Assert.assertEquals(Integer.valueOf(600), configuration.getDefaultStatementTimeout());
        });
    }

    @Test
    public void testNonH2MetadataIsRejected() {
        this.runner("jdbc:mysql://localhost/hubble").run(context -> {
            Throwable failure = context.getStartupFailure();
            Assert.assertNotNull(failure);
            while (failure.getCause() != null) {
                failure = failure.getCause();
            }
            Assert.assertTrue(failure.getMessage().contains("Hubble metadata requires H2"));
        });
    }
}
