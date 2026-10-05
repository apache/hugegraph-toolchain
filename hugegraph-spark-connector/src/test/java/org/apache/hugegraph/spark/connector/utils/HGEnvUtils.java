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

package org.apache.hugegraph.spark.connector.utils;

import java.net.URI;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.HugeClientBuilder;
import org.apache.hugegraph.driver.SchemaManager;
import org.apache.hugegraph.spark.connector.constant.Constants;
import org.apache.hugegraph.util.E;

public class HGEnvUtils {

    public static final String DEFAULT_HOST = "127.0.0.1";
    public static final String DEFAULT_PORT = "8080";
    public static final String DEFAULT_GRAPH = "hugegraph";
    public static final String DEFAULT_GRAPHSPACE = "DEFAULT";
    public static final String DEFAULT_URL = "http://" + DEFAULT_HOST + ":" + DEFAULT_PORT;

    private static final URI ENDPOINT = endpoint(System.getProperty("hugegraph.test.url", DEFAULT_URL));
    public static final String URL = ENDPOINT.toString();
    public static final String GRAPH = System.getProperty("hugegraph.test.graph", DEFAULT_GRAPH);
    public static final String HOST = ENDPOINT.getHost();
    public static final String PORT = port(ENDPOINT);
    public static final String PROTOCOL = ENDPOINT.getScheme();
    public static final String TRUST_STORE_FILE = System.getProperty("hugegraph.test.trust-store-file");
    public static final String TRUST_STORE_TOKEN = System.getProperty("hugegraph.test.trust-store-token",
                                                                     Constants.DEFAULT_TRUST_STORE_TOKEN);

    private static HugeClient hugeClient;

    public static void createEnv() {

        hugeClient = clientBuilder(ENDPOINT, GRAPH, TRUST_STORE_FILE, TRUST_STORE_TOKEN).build();

        hugeClient.graphs().clearGraph(GRAPH, "I'm sure to delete all data");

        SchemaManager schema = hugeClient.schema();

        // Define schema
        schema.propertyKey("name").asText().ifNotExist().create();
        schema.propertyKey("age").asInt().ifNotExist().create();
        schema.propertyKey("city").asText().ifNotExist().create();
        schema.propertyKey("weight").asDouble().ifNotExist().create();
        schema.propertyKey("lang").asText().ifNotExist().create();
        schema.propertyKey("date").asText().ifNotExist().create();
        schema.propertyKey("price").asDouble().ifNotExist().create();

        schema.vertexLabel("person")
              .properties("name", "age", "city")
              .useCustomizeStringId()
              .nullableKeys("age", "city")
              .ifNotExist()
              .create();

        schema.vertexLabel("software")
              .properties("name", "lang", "price")
              .primaryKeys("name")
              .ifNotExist()
              .create();

        schema.edgeLabel("knows")
              .sourceLabel("person")
              .targetLabel("person")
              .properties("date", "weight")
              .ifNotExist()
              .create();

        schema.edgeLabel("created")
              .sourceLabel("person")
              .targetLabel("software")
              .properties("date", "weight")
              .ifNotExist()
              .create();
    }

    static URI endpoint(String url) {
        URI uri = parseEndpoint(url);
        E.checkArgument(uri.getScheme() != null, "Test URL must have an HTTP or HTTPS scheme");
        String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
        E.checkArgument(scheme.equals("http") || scheme.equals("https"),
                        "Test URL must have an HTTP or HTTPS scheme");
        E.checkArgument(uri.getHost() != null, "Test URL must have a host");
        E.checkArgument(uri.getRawPath().isEmpty() || uri.getRawPath().equals("/"),
                        "Test URL must use the server root without a path prefix");
        E.checkArgument(uri.getRawQuery() == null, "Test URL must not have a query");
        E.checkArgument(uri.getRawFragment() == null, "Test URL must not have a fragment");
        E.checkArgument(uri.getRawUserInfo() == null, "Test URL must not have user info");
        return parseEndpoint(scheme + url.substring(uri.getScheme().length()));
    }

    private static URI parseEndpoint(String url) {
        try {
            return URI.create(url);
        } catch (IllegalArgumentException ignored) {
            throw new IllegalArgumentException("Test URL must be a valid URI");
        }
    }

    static String port(URI uri) {
        return String.valueOf(uri.getPort() == -1 ? (uri.getScheme().equals("https") ? 443 : 80) :
                              uri.getPort());
    }

    public static Map<String, String> tlsOptions() {
        return tlsOptions(PROTOCOL, TRUST_STORE_FILE, TRUST_STORE_TOKEN);
    }

    static Map<String, String> tlsOptions(String protocol, String file, String token) {
        if (!protocol.equals("https")) {
            return Collections.emptyMap();
        }
        E.checkArgument(file != null && !file.isEmpty(),
                        "HTTPS tests require -Dhugegraph.test.trust-store-file=/absolute/path/to/store");
        Map<String, String> options = new HashMap<>();
        options.put("trust-store-file", file);
        options.put("trust-store-token", token);
        return options;
    }

    static HugeClientBuilder clientBuilder(URI uri, String graph, String file, String token) {
        HugeClientBuilder builder = HugeClient.builder(uri.toString(), graph).configUser("admin", "pa");
        Map<String, String> tls = tlsOptions(uri.getScheme(), file, token);
        if (!tls.isEmpty()) {
            builder.configSSL(tls.get("trust-store-file"), tls.get("trust-store-token"));
        }
        return builder;
    }

    public static String sparkTestMaster() {
        return localMaster(System.getProperty("spark.test.master", "local[2]"));
    }

    static String localMaster(String master) {
        E.checkArgument(master.matches("local(\\[(\\*|[1-9][0-9]*)(,[1-9][0-9]*)?\\])?"),
                        "spark.test.master supports only local or local[...] in the Maven fixture");
        return master;
    }

    public static void destroyEnv() {
        hugeClient.close();
    }

    public static HugeClient getHugeClient() {
        return hugeClient;
    }
}
