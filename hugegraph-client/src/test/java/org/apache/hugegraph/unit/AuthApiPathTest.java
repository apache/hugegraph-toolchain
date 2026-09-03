/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

package org.apache.hugegraph.unit;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import org.junit.Test;

import org.apache.hugegraph.api.auth.UserAPI;
import org.apache.hugegraph.client.RestClient;
import org.apache.hugegraph.rest.ClientException;
import org.apache.hugegraph.structure.auth.User;
import org.apache.hugegraph.testutil.Assert;

import com.sun.net.httpserver.HttpServer;

public class AuthApiPathTest {

    @Test
    public void testLegacyServerUsesGraphScopedAuthPath() {
        RestClient client = new RestClient("http://localhost", "", "", 1);
        client.setSupportGs(false);

        UserAPI api = new UserAPI(client, "DEFAULT", "hugegraph");

        Assert.assertEquals("graphs/hugegraph/auth/users", api.path());
        client.close();
    }

    @Test
    public void testModernServerUsesGraphSpaceScopedAuthPath() {
        RestClient client = new RestClient("http://localhost", "", "", 1);
        client.setSupportGs(true);

        UserAPI api = new UserAPI(client, "DEFAULT", "hugegraph");

        Assert.assertEquals("graphspaces/DEFAULT/auth/users", api.path());
        client.close();
    }

    @Test
    public void testLegacyServerWithoutGraphUsesGraphSpaceScopedAuthPath() {
        RestClient client = new RestClient("http://localhost", "", "", 1);
        client.setSupportGs(false);

        UserAPI api = new UserAPI(client, "DEFAULT", null);

        Assert.assertEquals("graphspaces/DEFAULT/auth/users", api.path());
        client.close();
    }

    @Test
    public void testLegacyGetByNameReadsAllUsersFromWrapper() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1",
                                                                    0), 0);
        server.createContext("/graphs/hugegraph/auth/users", exchange -> {
            boolean unlimited = "limit=-1".equals(
                                exchange.getRequestURI().getQuery());
            StringBuilder content = new StringBuilder("{\"users\":[");
            for (int i = 0; i < 100; i++) {
                if (i > 0) {
                    content.append(',');
                }
                content.append("{\"id\":\"").append(i)
                       .append("\",\"user_name\":\"user_")
                       .append(i).append("\"}");
            }
            if (unlimited) {
                content.append(",{\"id\":\"-30:admin\",")
                       .append("\"user_name\":\"admin\"}");
            }
            byte[] body = content.append("]}").toString()
                                 .getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(body);
            }
        });
        server.start();

        RestClient client = new RestClient(
                "http://127.0.0.1:" + server.getAddress().getPort(),
                "admin", "password", 1);
        client.setSupportGs(false);
        try {
            UserAPI api = new UserAPI(client, "DEFAULT", "hugegraph");
            User user = api.getByName("admin");
            Assert.assertEquals("admin", user.name());
            Assert.assertThrows(ClientException.class,
                                () -> api.getByName("missing"),
                                e -> Assert.assertContains(
                                        "User 'missing' does not exist",
                                        e.getMessage()));
        } finally {
            client.close();
            server.stop(0);
        }
    }
}
