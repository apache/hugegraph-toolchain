/*
 *
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

package org.apache.hugegraph.service.query;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Map;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.controller.query.Text2GqlSettingsController;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.query.Text2GqlRequest;
import org.apache.hugegraph.entity.query.Text2GqlSettingsRequest;
import org.apache.hugegraph.mapper.query.Text2GqlConfigMapper;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.auth.AuthContextService;
import org.apache.hugegraph.service.auth.AuthModeService;
import org.apache.hugegraph.service.auth.UserService;
import org.apache.hugegraph.service.space.GraphSpaceService;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.mockito.Mockito;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class Text2GqlPersistenceTest {

    @Rule
    public TemporaryFolder temporary = new TemporaryFolder();

    @Test
    public void testAnonymousManagedH2SnapshotAndEncryptedKeySurviveRestartAndRemainSingleton() throws Exception {
        String url = "jdbc:h2:file:" + this.temporary.newFolder("database").toPath().resolve("metadata") +
                     ";DB_CLOSE_ON_EXIT=FALSE";
        Path keyFile = this.temporary.getRoot().toPath().resolve("master.key");
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.TEXT2GQL_SHARED_ENABLED)).thenReturn(false);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        JdbcDataSource first = dataSource(url);
        new ResourceDatabasePopulator(new FileSystemResource("src/main/resources/database/schema.sql")).execute(first);
        Text2GqlSettingsRequest request = new Text2GqlSettingsRequest();
        request.setEnabled(true);
        request.setConnectionType("openai");
        request.setBaseUrl("http://127.0.0.1:11434/v1");
        request.setModel("first-model");
        request.setApiKey("secret-that-must-not-be-plaintext-in-h2");
        request.setPrompts(Map.of("gremlin", "Persisted Gremlin policy", "cypher", "Persisted Cypher policy"));
        try (SqlSession session = sessions(first).openSession(true)) {
            org.junit.Assert.assertNull(session.getMapper(Text2GqlConfigMapper.class).current());
            Text2GqlSettingsService service = new Text2GqlSettingsService(config,
                    session.getMapper(Text2GqlConfigMapper.class),
                    new Text2GqlSecretStore(keyFile, ignored -> null), ignored -> null);
            AnonymousModelController controller = new AnonymousModelController(config, service);
            assertEquals(false, controller.get().get("enabled"));
            assertEquals("deployment", controller.get().get("source"));
            controller.update(request);
            request.setApiKey(null);
            request.setPrompts(null);
            request.setModel("second-model");
            new AnonymousModelController(config, service).update(request);
        }
        try (Connection connection = first.getConnection(); Statement statement = connection.createStatement()) {
            try (ResultSet result = statement.executeQuery("SELECT * FROM text2gql_config")) {
                assertTrue(result.next());
                assertEquals(1, result.getInt("id"));
                assertEquals("second-model", result.getString("model"));
                assertEquals("Persisted Gremlin policy", result.getString("gremlin_prompt"));
                assertEquals("Persisted Cypher policy", result.getString("cypher_prompt"));
                assertTrue(result.getString("encrypted_api_key").startsWith("v1:"));
                assertFalse(result.getString("encrypted_api_key").contains("secret-that-must-not-be-plaintext"));
                assertFalse(result.next());
            }
            statement.execute("SHUTDOWN");
        }
        JdbcDataSource restarted = dataSource(url);
        try (SqlSession session = sessions(restarted).openSession(true)) {
            Text2GqlSettingsService service = new Text2GqlSettingsService(config,
                    session.getMapper(Text2GqlConfigMapper.class),
                    new Text2GqlSecretStore(keyFile, ignored -> null), ignored -> null);
            Text2GqlRequest question = new Text2GqlRequest();
            question.setSource("shared");
            question.setQuestion("Find people");
            Text2GqlRequest resolved = service.sharedRequest(question);
            assertEquals("second-model", resolved.getModel());
            assertEquals("Persisted Gremlin policy", resolved.getPrompt());
            assertEquals("secret-that-must-not-be-plaintext-in-h2", resolved.getApiKey());
            assertEquals("managed", new AnonymousModelController(config, service).get().get("source"));
            assertEquals(Map.of("available", true, "model", "second-model"), service.availability());
            request.setEnabled(false);
            new AnonymousModelController(config, service).update(request);
            assertEquals(Map.of("available", false, "reason", "not_configured"), service.availability());
        }
        try (Connection connection = restarted.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("SHUTDOWN");
        }
    }

    @Test
    public void testOldH2SnapshotAddsPromptColumnsWithoutChangingModelSecretOrVersion() throws Exception {
        String url = "jdbc:h2:mem:legacy-text2gql;DB_CLOSE_DELAY=-1";
        JdbcDataSource source = dataSource(url);
        ResourceDatabasePopulator initializer = new ResourceDatabasePopulator(
                new FileSystemResource("src/main/resources/database/schema.sql"));
        initializer.execute(source);
        Path keyFile = this.temporary.getRoot().toPath().resolve("legacy-master.key");
        Text2GqlSecretStore secrets = new Text2GqlSecretStore(keyFile, ignored -> null);
        String encrypted = secrets.encrypt("legacy-model-key");
        try (Connection connection = source.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("ALTER TABLE text2gql_config DROP COLUMN gremlin_prompt");
            statement.execute("ALTER TABLE text2gql_config DROP COLUMN cypher_prompt");
            try (java.sql.PreparedStatement insert = connection.prepareStatement(
                    "INSERT INTO text2gql_config VALUES (1, TRUE, 'openai', " +
                    "'http://127.0.0.1:11434/v1', 'legacy-model', ?)")) {
                insert.setString(1, encrypted);
                insert.executeUpdate();
            }
        }
        initializer.execute(source);
        initializer.execute(source);
        HugeConfig config = Mockito.mock(HugeConfig.class);
        try (SqlSession session = sessions(source).openSession(true)) {
            Text2GqlSettingsService service = new Text2GqlSettingsService(config,
                    session.getMapper(Text2GqlConfigMapper.class), secrets, ignored -> null);
            Text2GqlRequest request = new Text2GqlRequest();
            request.setSource("shared");
            request.setQuestion("Find people");
            assertEquals("legacy-model", service.sharedRequest(request).getModel());
            assertEquals("legacy-model-key", service.sharedRequest(request).getApiKey());
            assertEquals(Text2GqlPrompts.defaults(), service.settings().get("prompts"));
            assertEquals(encrypted, session.getMapper(Text2GqlConfigMapper.class).current().getEncryptedApiKey());
        }
        try (Connection connection = source.getConnection(); Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery("SELECT VERSION FROM HUBBLE_SCHEMA_VERSION WHERE ID = 1")) {
            assertTrue(result.next());
            assertEquals(1, result.getInt(1));
        }
    }

    private static final class AnonymousModelController extends Text2GqlSettingsController {

        private final HugeClient client = Mockito.mock(HugeClient.class);

        private AnonymousModelController(HugeConfig config, Text2GqlSettingsService settings) {
            this.authMode = Mockito.mock(AuthModeService.class);
            Mockito.when(this.authMode.anonymous()).thenReturn(true);
            this.authContextService = new AuthContextService(config, Mockito.mock(UserService.class),
                    this.authMode, Mockito.mock(GraphSpaceService.class));
            ReflectionTestUtils.setField(this, "settings", settings);
        }

        @Override
        protected HugeClient authClient(String graphSpace, String graph) {
            return this.client;
        }

        @Override
        protected String getUser() {
            return null;
        }

        @Override
        protected String getToken() {
            return null;
        }
    }

    private static JdbcDataSource dataSource(String url) {
        JdbcDataSource source = new JdbcDataSource();
        source.setURL(url);
        source.setUser("sa");
        source.setPassword("");
        return source;
    }

    private static SqlSessionFactory sessions(JdbcDataSource dataSource) {
        Configuration configuration = new Configuration(new Environment(
                "text2gql-test", new JdbcTransactionFactory(), dataSource));
        configuration.addMapper(Text2GqlConfigMapper.class);
        return new SqlSessionFactoryBuilder().build(configuration);
    }
}
