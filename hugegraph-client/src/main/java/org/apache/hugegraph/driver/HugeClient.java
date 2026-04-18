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

package org.apache.hugegraph.driver;

import java.io.Closeable;

import lombok.Getter;

import org.apache.hugegraph.client.RestClient;
import org.apache.hugegraph.rest.ClientException;
import org.apache.hugegraph.rest.RestClientConfig;
import org.apache.hugegraph.util.VersionUtil;
import org.apache.hugegraph.version.ClientVersion;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.google.common.base.Strings;

/**
 * Main entry point for HugeGraph server operations.
 * Use {@link #builder(String, String, String)} to create an instance.
 */
public class HugeClient implements Closeable {

    private static final Logger LOG = LoggerFactory.getLogger(RestClient.class);

    static {
        ClientVersion.check();
    }

    @Getter
    protected String graphSpaceName;
    @Getter
    protected String graphName;

    private final boolean borrowedClient;
    private final RestClient client;
    private VersionManager version;
    private GraphsManager graphs;
    private SchemaManager schema;
    private GraphManager graph;
    private GremlinManager gremlin;
    private CypherManager cypher;
    private TraverserManager traverser;
    private VariablesManager variable;
    private JobManager job;
    private TaskManager task;
    private ComputerManager computer;
    private AuthManager auth;
    private MetricsManager metrics;
    private GraphSpaceManager graphSpace;
    private ServiceManager serviceManager;
    private SchemaTemplateManager schemaTemplageManager;
    private PDManager pdManager;
    private HStoreManager hStoreManager;
    private WhiteIpListManager whiteIpListManager;
    private VermeerManager vermeerManager;

    public HugeClient(HugeClientBuilder builder) {
        this.borrowedClient = false;
        this.graphSpaceName = builder.graphSpace();
        this.graphName = builder.graph();
        RestClientConfig config;
        try {
            config = RestClientConfig.builder()
                                     .token(builder.token())
                                     .user(builder.username())
                                     .password(builder.password())
                                     .timeout(builder.timeout())
                                     .connectTimeout(builder.connectTimeout())
                                     .readTimeout(builder.readTimeout())
                                     .maxConns(builder.maxConns())
                                     .maxConnsPerRoute(builder.maxConnsPerRoute())
                                     .trustStoreFile(builder.trustStoreFile())
                                     .trustStorePassword(builder.trustStorePassword())
                                     .builderCallback(builder.httpBuilderConsumer())
                                     .build();
            this.client = new RestClient(builder.url(), config);
        } catch (Exception e) {
            LOG.warn("Failed to create RestClient instance", e);
            throw new ClientException("Failed to connect url '%s'", builder.url());
        }

        try {
            this.initManagers(this.client, builder.graphSpace(), builder.graph());
        } catch (Throwable e) {
            // TODO: catch some exception(like IO/Network related) rather than throw Throwable
            this.client.close();
            throw e;
        }
    }

    public HugeClient(HugeClient client, String graphSpace, String graph) {
        this.borrowedClient = true;
        this.client = client.client;
        this.initManagers(this.client, graphSpace, graph);
    }

    public static HugeClientBuilder builder(String url, String graphSpace, String graph) {
        return new HugeClientBuilder(url, graphSpace, graph);
    }

    public static HugeClientBuilder builder(String url, String graph) {
        return new HugeClientBuilder(url, HugeClientBuilder.DEFAULT_GRAPHSPACE, graph);
    }

    public HugeClient assignGraph(String graphSpace, String graph) {
        this.graphSpaceName = graphSpace;
        this.graphName = graph;
        this.initManagers(this.client, this.graphSpaceName, this.graphName);
        return this;
    }

    @Override
    public void close() {
        if (!this.borrowedClient) {
            this.client.close();
        }
    }

    public void initManagers(RestClient client, String graphSpace,
                             String graph) {
        assert client != null;
        // Check hugegraph-server api version
        this.version = new VersionManager(client);
        this.checkServerApiVersion();

        this.graphs = new GraphsManager(client, graphSpace);
        this.auth = new AuthManager(client, graphSpace, graph);
        this.metrics = new MetricsManager(client);
        this.graphSpace = new GraphSpaceManager(client);
        this.schemaTemplageManager = new SchemaTemplateManager(client, graphSpace);
        this.serviceManager = new ServiceManager(client, graphSpace);
        this.pdManager = new PDManager(client);
        this.hStoreManager = new HStoreManager(client);
        this.whiteIpListManager = new WhiteIpListManager(client);
        this.vermeerManager = new VermeerManager(client);

        if (!Strings.isNullOrEmpty(graph)) {
            this.schema = new SchemaManager(client, graphSpace, graph);
            this.graph = new GraphManager(client, graphSpace, graph);
            this.gremlin = new GremlinManager(client, graphSpace,
                                              graph, this.graph);
            this.cypher = new CypherManager(client, graphSpace,
                                            graph, this.graph);
            this.traverser = new TraverserManager(client, this.graph);
            this.variable = new VariablesManager(client, graphSpace, graph);
            this.job = new JobManager(client, graphSpace, graph);
            this.task = new TaskManager(client, graphSpace, graph);
        }
    }

    private void checkServerApiVersion() {
        VersionUtil.Version apiVersion = VersionUtil.Version.of(this.version.getApiVersion());
        // TODO: find a way to keep the range of api version correct automatically
        //       0.81 equals to the {latest_api_version} +10
        VersionUtil.check(apiVersion, "0.38", "0.81", "hugegraph-api in server");
        this.client.apiVersion(apiVersion);
        boolean supportGs = VersionUtil.gte(this.version.getCoreVersion(), "1.7.0");
        this.client.setSupportGs(supportGs);
    }

    public GraphsManager graphs() {
        return this.graphs;
    }

    public SchemaManager schema() {
        return this.schema;
    }

    public GraphManager graph() {
        return this.graph;
    }

    public GremlinManager gremlin() {
        return this.gremlin;
    }

    public CypherManager cypher() {
        return this.cypher;
    }

    public TraverserManager traverser() {
        return this.traverser;
    }

    public VariablesManager variables() {
        return this.variable;
    }

    public JobManager job() {
        return this.job;
    }

    public ComputerManager computer() {
        return this.computer;
    }

    public TaskManager task() {
        return this.task;
    }

    public AuthManager auth() {
        return this.auth;
    }

    public MetricsManager metrics() {
        return this.metrics;
    }

    public GraphSpaceManager graphSpace() {
        return this.graphSpace;
    }

    public WhiteIpListManager whiteIpListManager() {
        return this.whiteIpListManager;
    }

    public VermeerManager vermeer() {
        return this.vermeerManager;
    }

    public SchemaTemplateManager schemaTemplateManager() {
        return this.schemaTemplageManager;
    }

    public ServiceManager serviceManager() {
        return this.serviceManager;
    }

    public PDManager pdManager() {
        return pdManager;
    }

    @SuppressWarnings("checkstyle:MethodName")
    public HStoreManager hStoreManager() {
        return hStoreManager;
    }

    public VersionManager versionManager() {
        return version;
    }

    public String getAuthContext() {
        return this.client.getAuthContext();
    }

    public void setAuthContext(String auth) {
        this.client.setAuthContext(auth);
    }

    public void resetAuthContext() {
        this.client.resetAuthContext();
    }
}
