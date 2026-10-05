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

package org.apache.hugegraph.loader.executor;

import java.io.File;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

import org.apache.hugegraph.loader.util.LoadUtil;
import org.apache.hugegraph.loader.mapping.BackendStoreInfo;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;

import org.apache.hugegraph.loader.constant.Constants;
import org.apache.hugegraph.loader.filter.util.ShortIdConfig;
import org.apache.hugegraph.util.E;
import org.apache.hugegraph.util.Log;
import com.beust.jcommander.IParameterValidator;
import com.beust.jcommander.JCommander;
import com.beust.jcommander.Parameter;
import com.beust.jcommander.ParameterException;
import com.google.common.collect.ImmutableSet;

public final class LoadOptions implements Cloneable {

    private static final Logger LOG = Log.logger(LoadOptions.class);

    public static final String HTTPS_SCHEMA = "https";
    public static final String HTTP_SCHEMA = "http";
    private static final int CPUS = Runtime.getRuntime().availableProcessors();
    private static final int DEFAULT_MAX_CONNECTIONS = CPUS * 4;
    private static final int DEFAULT_MAX_CONNECTIONS_PER_ROUTE = CPUS * 2;
    private static final int MINIMUM_REQUIRED_ARGS = 3;
    private static final Set<String> SENSITIVE_PARAMETER_FIELDS =
            ImmutableSet.of("password", "trustStoreToken", "token", "pdToken");

    @Parameter(names = {"-f", "--file"}, required = true, arity = 1,
               validateWith = {FileValidator.class},
               description = "The path of the data mapping description file")
    public String file;

    @Parameter(names = {"-s", "--schema"}, arity = 1,
               validateWith = {FileValidator.class},
               description = "The schema file path which to create manually")
    public String schema;

    @Parameter(names = {"--pd-peers"}, required = false, arity = 1,
            description = "The pd addrs, like 127.0.0.1:8686,127.0.0.1:8687")
    public String pdPeers;

    @Parameter(names = {"--pd-token"}, required = false, arity = 1,
               description = "The token for accessing to pd service")
    public String pdToken;

    @Parameter(names = {"--meta-endpoints"}, required = false, arity = 1,
               description = "The meta end point addrs (schema store addr), " +
                             "like 127.0.0.1:8686, 127.0.0.1:8687")
    public String metaEndPoints;

    @Parameter(names = {"--direct"}, required = false, arity = 1,
            description = "Whether connect to HStore directly.")
    public boolean direct = false;

    @Parameter(names = {"--route-type"}, required = false, arity = 1,
            description = "Used to select service url; [NODE_PORT(default), " +
                    "DDS, BOTH]")
    public String routeType = "NODE_PORT";

    @Parameter(names = {"--cluster"}, required = false, arity = 1,
            description = "The cluster of the graph to load into")
    public String cluster = "hg";

    @Parameter(names = {"--graphspace"}, required = false, arity = 1,
            description = "The graphspace of the graph to load into")
    public String graphSpace = "DEFAULT";

    @Parameter(names = {"-g", "--graph"}, 
               arity = 1,
               description = "The name of the graph to load into, " +
                    "if not specified, hugegraph will be used")
    public String graph = "hugegraph";

    @Parameter(names = {"--create-graph"}, required = false, arity = 1,
               description = "Whether to create graph if not exists")
    public boolean createGraph = false;

    @Parameter(names = {"-h", "-i", "--host"}, arity = 1,
               validateWith = {UrlValidator.class},
               description = "The host/IP of HugeGraphServer")
    public String host = "localhost";

    @Parameter(names = {"-p", "--port"}, arity = 1,
               validateWith = {PositiveValidator.class},
               description = "The port of HugeGraphServer")
    public int port = 8080;

    @Parameter(names = {"--username"}, arity = 1,
            description = "The username of graph for authentication")
    public String username = null;

    @Parameter(names = {"--password"}, arity = 1,
            description = "The password of graph for authentication")
    public String password = null;

    @Parameter(names = {"--protocol"}, arity = 1,
               validateWith = {ProtocolValidator.class},
               description = "The protocol of HugeGraphServer, " +
                             "allowed values are: http or https")
    public String protocol = "http";

    @Parameter(names = {"--trust-store-file"}, arity = 1,
               description = "The path of client truststore file used " +
                             "when https protocol is enabled")
    public String trustStoreFile = null;

    @Parameter(names = {"--trust-store-password"}, arity = 1,
               description = "The password of client truststore file used " +
                             "when https protocol is enabled")
    public String trustStoreToken = null;

    @Parameter(names = {"--token"}, arity = 1,
               description = "The token of graph for authentication")
    public String token = null;

    @Parameter(names = {"--clear-all-data"}, arity = 1,
               description = "Whether to clear all old data before loading")
    public boolean clearAllData = false;

    @Parameter(names = {"--clear-timeout"}, arity = 1,
               validateWith = {PositiveValidator.class},
               description = "The timeout waiting for clearing all data ")
    public int clearTimeout = 240;

    @Parameter(names = {"--incremental-mode"}, arity = 1,
               description = "Load data from the breakpoint of last time")
    public boolean incrementalMode = false;

    @Parameter(names = {"--failure-mode"}, arity = 1,
               description = "Load data from the failure records, in this " +
                             "mode, only full load is supported, any read " +
                             "or parsing errors will cause load task stop")
    public boolean failureMode = false;

    @Parameter(names = {"--batch-insert-threads"}, arity = 1,
               validateWith = {PositiveValidator.class},
               description = "The number of threads to execute batch insert (default: CPUS)")
    public int batchInsertThreads = CPUS;

    @Parameter(names = {"--single-insert-threads"}, arity = 1,
               validateWith = {PositiveValidator.class},
               description = "The number of threads to execute single insert")
    public int singleInsertThreads = 8;

    @Parameter(names = {"--max-conn"}, arity = 1,
               validateWith = {PositiveValidator.class},
               description = "Max HTTP connections (default: CPUS*4; auto-adjusted by " +
                             "--batch-insert-threads)")
    public int maxConnections = DEFAULT_MAX_CONNECTIONS;

    @Parameter(names = {"--max-conn-per-route"}, arity = 1,
               validateWith = {PositiveValidator.class},
               description = "Max HTTP connections per route (default: CPUS*2; " +
                             "auto-adjusted by --batch-insert-threads)")
    public int maxConnectionsPerRoute = DEFAULT_MAX_CONNECTIONS_PER_ROUTE;

    @Parameter(names = {"--batch-size"}, arity = 1,
               validateWith = {PositiveValidator.class},
               description = "The number of lines in each submit")
    public int batchSize = 500;

    @Parameter(names = {"--parallel-count", "--parser-threads"}, arity = 1,
               validateWith = {PositiveValidator.class},
               description = "Parallel read pipelines (default: max(2, CPUS/2); " +
                             "--parallel-count is deprecated)")
    public int parseThreads = Math.max(2, CPUS / 2);

    @Parameter(names = {"--start-file"}, arity = 1,
            description = "start file index for partial loading")
    public int startFile = 0;

    @Parameter(names = {"--end-file"}, arity = 1,
            description = "end file index for partial loading")
    public int endFile = -1;

    @Parameter(names = {"--scatter-sources"}, arity = 1,
            description = "scatter multiple sources for io optimize")
    public boolean scatterSources = false;

    @Parameter(names = {"--cdc-flush-interval"}, arity = 1,
               description = "The flush interval for flink cdc")
    public int flushIntervalMs = 30000;

    @Parameter(names = {"--cdc-sink-parallelism"}, arity = 1,
               description = "The sink parallelism for flink cdc")
    public int sinkParallelism = 1;

    @Parameter(names = {"--shutdown-timeout"}, arity = 1,
               validateWith = {PositiveValidator.class},
               description = "The timeout of awaitTermination in seconds")
    public int shutdownTimeout = 10;

    @Parameter(names = {"--check-vertex"}, arity = 1,
               description = "Check vertices exists while inserting edges")
    public boolean checkVertex = false;

    @Parameter(names = {"--max-read-errors"}, arity = 1,
               validateWith = {PositiveValidator.class},
               description = "The maximum number of lines that read error " +
                             "before exiting")
    public int maxReadErrors = 1;

    @Parameter(names = {"--max-parse-errors"}, arity = 1,
               validateWith = {PositiveValidator.class},
               description = "The maximum number of lines that parse error " +
                             "before exiting")
    public int maxParseErrors = 1;

    @Parameter(names = {"--max-insert-errors"}, arity = 1,
               validateWith = {PositiveValidator.class},
               description = "The maximum number of lines that insert error " +
                             "before exiting")
    public int maxInsertErrors = 500;

    @Parameter(names = {"--timeout"}, arity = 1,
               validateWith = {PositiveValidator.class},
               description = "The timeout of HugeClient request")
    public int timeout = 60;

    @Parameter(names = {"--retry-times"}, arity = 1,
               validateWith = {PositiveValidator.class},
               description = "Setting the max retry times when loading timeout")
    public int retryTimes = 3;

    @Parameter(names = {"--retry-interval"}, arity = 1,
               validateWith = {PositiveValidator.class},
               description = "Setting the interval time before retrying")
    public int retryInterval = 10;

    @Parameter(names = {"--max-read-lines"}, arity = 1,
               validateWith = {PositiveValidator.class},
               description = "The maximum number of read lines, when reached " +
                             "this number, the load task will stop")
    public long maxReadLines = -1L;

    @Parameter(names = {"--dry-run"}, arity = 1,
               description = "Dry run means that only parse but doesn't load")
    public boolean dryRun = false;

    @Parameter(names = {"--print-progress"}, arity = 1,
               description = "Whether to print real-time load progress")
    public boolean printProgress = true;

    @Parameter(names = {"--test-mode"}, arity = 1,
               description = "Whether the hugegraph-loader work in test mode")
    public boolean testMode = false;

    @Parameter(names = {"-help", "--help"}, help = true, description =
            "Print usage of HugeGraphLoader")
    public boolean help;

    @Parameter(names = {"--use-prefilter"}, required = false, arity = 1,
               description = "Whether filter vertex in advance.")
    public boolean usePrefilter = false;

    @Parameter(names = "--short-id",
               description = "Mapping customized ID to shorter ID.",
               converter = ShortIdConfig.ShortIdConfigConverter.class)
    public List<ShortIdConfig> shorterIDConfigs = new ArrayList<>();

    @Parameter(names = {"--vertex-edge-limit"}, arity = 1,
            validateWith = {PositiveValidator.class},
            description = "The maximum number of vertex's edges.")
    public long vertexEdgeLimit = -1L;

    @Parameter(names = {"--sink-type"}, arity = 1,
               description = "Sink to different storage")
    public boolean sinkType = true;

    @Parameter(names = {"--vertex-partitions"}, arity = 1,
               validateWith = {PositiveValidator.class},
               description = "The number of partitions of the HBase vertex table")
    public int vertexPartitions = 64;

    @Parameter(names = {"--edge-partitions"}, arity = 1,
               validateWith = {PositiveValidator.class},
               description = "The number of partitions of the HBase edge table")
    public int edgePartitions = 64;

    @Parameter(names = {"--vertex-table-name"}, arity = 1,
               description = "HBase vertex table name")
    public String vertexTableName;

    @Parameter(names = {"--edge-table-name"}, arity = 1,
               description = "HBase edge table name")
    public String edgeTableName;

    @Parameter(names = {"--hbase-zk-quorum"}, arity = 1,
               description = "HBase zookeeper quorum")
    public String hbaseZKQuorum;

    @Parameter(names = {"--hbase-zk-port"}, arity = 1,
               description = "HBase zookeeper port")
    public String hbaseZKPort;

    @Parameter(names = {"--hbase-zk-parent"}, arity = 1,
               description = "HBase zookeeper parent")
    public String hbaseZKParent;

    @Parameter(names = {"--restore"}, arity = 1,
               description = "graph mode set RESTORING")
    public boolean restore = false;

    @Parameter(names = {"--backend"}, arity = 1,
               description = "The backend store type when creating graph if not exists")
    public String backend = "hstore";

    @Parameter(names = {"--serializer"}, arity = 1,
               description = "The serializer type when creating graph if not exists")
    public String serializer = "binary";

    @Parameter(names = {"--scheduler-type"}, arity = 1,
               description = "The task scheduler type (when creating graph if not exists")
    public String schedulerType = "distributed";

    @Parameter(names = {"--batch-failure-fallback"}, arity = 1,
               description = "Whether to fallback to single insert when batch insert fails. " +
                             "Default: true")
    public boolean batchFailureFallback = true;

    public String workModeString() {
        if (this.incrementalMode) {
            return "INCREMENTAL MODE";
        } else if (this.failureMode) {
            return "FAILURE MODE";
        } else {
            return "NORMAL MODE";
        }
    }

    public void dumpParams() {
        LOG.info("loader parameters:");
        Field[] fields = LoadOptions.class.getDeclaredFields();
        for (Field field : fields) {
            if (field.isAnnotationPresent(Parameter.class)) {
                try {
                    Object value = SENSITIVE_PARAMETER_FIELDS.contains(
                                   field.getName()) ? "[REDACTED]" :
                                   field.get(this);
                    LOG.info("    {}={}", field.getName(), value);
                } catch (IllegalAccessException e) {
                    LOG.warn("Failed to read loader parameter '{}'",
                             field.getName(), e);
                }
            }
        }
    }

    public static LoadOptions parseOptions(String[] args) {
        LoadOptions options = new LoadOptions();
        JCommander commander = JCommander.newBuilder()
                                         .addObject(options)
                                         .build();
        try {
            commander.parse(args);
        } catch (ParameterException e) {
            // Check input error
            LoadUtil.exitWithUsage(commander, Constants.EXIT_CODE_ERROR);
        }
        // Print usage and exit
        if (options.help) {
            LoadUtil.exitWithUsage(commander, Constants.EXIT_CODE_NORM);
        }
        if (args.length < MINIMUM_REQUIRED_ARGS) {
            LoadUtil.exitWithUsage(commander, Constants.EXIT_CODE_ERROR);
        }
        // Check options
        // Check option "-f"
        E.checkArgument(!StringUtils.isEmpty(options.file),
                        "The mapping file must be specified");
        E.checkArgument(options.file.endsWith(Constants.JSON_SUFFIX),
                        "The mapping file name must be end with %s",
                        Constants.JSON_SUFFIX);
        File mappingFile = new File(options.file);
        if (!mappingFile.canRead()) {
            LOG.error("The mapping file must be readable: '{}'", mappingFile);
            LoadUtil.exitWithUsage(commander, Constants.EXIT_CODE_ERROR);
        }

        // Check option "-g"
        E.checkArgument(!StringUtils.isEmpty(options.graph),
                        "The graph must be specified");
        // Check option "-h"
        if (!options.host.startsWith(Constants.HTTP_PREFIX)) {
            if (options.protocol.equals(HTTP_SCHEMA)) {
                options.host = Constants.HTTP_PREFIX + options.host;
            } else {
                options.host = Constants.HTTPS_PREFIX + options.host;
            }
        }
        // Check option --incremental-mode and --failure-mode
        E.checkArgument(!(options.incrementalMode && options.failureMode),
                        "The option --incremental-mode and --failure-mode " +
                        "can't be true at same time");
        if (options.failureMode) {
            LOG.info("The failure-mode will scan the entire error file");
            options.maxReadErrors = Constants.NO_LIMIT;
            options.maxParseErrors = Constants.NO_LIMIT;
            options.maxInsertErrors = Constants.NO_LIMIT;
        }
        if (Arrays.asList(args).contains("--parallel-count")) {
            LOG.warn("Parameter --parallel-count is deprecated, " +
                     "please use --parser-threads instead");
        }
        adjustConnectionPoolIfDefault(options);
        return options;
    }

    private static void adjustConnectionPoolIfDefault(LoadOptions options) {
        int batchThreads = options.batchInsertThreads;
        int maxConn = options.maxConnections;
        int maxConnPerRoute = options.maxConnectionsPerRoute;

        if (maxConn == DEFAULT_MAX_CONNECTIONS && maxConn < batchThreads * 4) {
            options.maxConnections = batchThreads * 4;
            LOG.info("Auto adjusted max-conn to {} based on batch-insert-threads({})",
                     options.maxConnections, batchThreads);
        }

        if (maxConnPerRoute == DEFAULT_MAX_CONNECTIONS_PER_ROUTE &&
            maxConnPerRoute < batchThreads * 2) {
            options.maxConnectionsPerRoute = batchThreads * 2;
            LOG.info("Auto adjusted max-conn-per-route to {} based on batch-insert-threads({})",
                     options.maxConnectionsPerRoute, batchThreads);
        }
    }

    public ShortIdConfig getShortIdConfig(String vertexLabel) {
        for (ShortIdConfig config: shorterIDConfigs) {
            if (config.getVertexLabel().equals(vertexLabel)) {
                return config;
            }
        }
        return null;
    }

    public void copyBackendStoreInfo (BackendStoreInfo backendStoreInfo) {
        E.checkArgument(null != backendStoreInfo, "The backendStoreInfo can't be null");
        this.edgeTableName = backendStoreInfo.getEdgeTablename();
        this.vertexTableName = backendStoreInfo.getVertexTablename();
        this.hbaseZKParent = backendStoreInfo.getHbaseZKParent();
        this.hbaseZKPort = backendStoreInfo.getHbaseZKPort();
        this.hbaseZKQuorum = backendStoreInfo.getHbaseZKQuorum();
    }

    public static class UrlValidator implements IParameterValidator {

        @Override
        public void validate(String name, String value) {
            String regex = "^((http)(s?)://)?" +
                           "(([0-9]{1,3}\\.){3}[0-9]{1,3}" + // IP URL
                           "|" +                             // Or domain name
                           "([0-9a-z_!~*'()-]+\\.)*[0-9a-z_!~*'()-]+)$";
            if (!value.matches(regex)) {
                throw new ParameterException(String.format(
                          "Invalid url value of args '%s': '%s'", name, value));
            }
        }
    }

    public static class ProtocolValidator implements IParameterValidator {

        private static final Set<String> SSL_PROTOCOL = ImmutableSet.of(
                HTTP_SCHEMA, HTTPS_SCHEMA
        );

        @Override
        public void validate(String name, String value) {
            if (!SSL_PROTOCOL.contains(value.toLowerCase())) {
                throw new ParameterException(String.format("Invalid --protocol '%s', valid " +
                                                           "value is %s", value, SSL_PROTOCOL));
            }
        }
    }

    public static class DirectoryValidator implements IParameterValidator {

        @Override
        public void validate(String name, String value) {
            File file = new File(value);
            if (!file.exists() || !file.isDirectory()) {
                throw new ParameterException(String.format("Ensure the directory exists and is " +
                                                           "indeed a directory instead of a " +
                                                           "file: '%s'", value));
            }
        }
    }

    public static class FileValidator implements IParameterValidator {

        @Override
        public void validate(String name, String value) {
            File file = new File(value);
            if (!file.exists() || !file.isFile()) {
                throw new ParameterException(String.format("Ensure the file exists and is " +
                                                           "indeed a file instead of a " +
                                                           "directory: '%s'", value));
            }
        }
    }

    public static class PositiveValidator implements IParameterValidator {

        @Override
        public void validate(String name, String value) {
            int retry = Integer.parseInt(value);
            if (retry <= 0) {
                throw new ParameterException(String.format("Parameter '%s' should be positive, " +
                                                           "but got '%s'", name, value));
            }
        }
    }

    public Object clone() throws CloneNotSupportedException {
        return super.clone();
    }
}
