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

package org.apache.hugegraph.options;

import java.net.URI;

import static org.apache.hugegraph.config.OptionChecker.allowValues;
import static org.apache.hugegraph.config.OptionChecker.disallowEmpty;
import static org.apache.hugegraph.config.OptionChecker.positiveInt;
import static org.apache.hugegraph.config.OptionChecker.rangeInt;

import org.springframework.util.CollectionUtils;

import org.apache.hugegraph.config.ConfigListOption;
import org.apache.hugegraph.config.ConfigOption;
import org.apache.hugegraph.config.OptionHolder;
import org.apache.hugegraph.util.Bytes;
import org.apache.hugegraph.util.HubbleUtil;

public class HubbleOptions extends OptionHolder {

    private HubbleOptions() {
        super();
    }

    private static volatile HubbleOptions instance;

    public static synchronized HubbleOptions instance() {
        if (instance == null) {
            instance = new HubbleOptions();
            instance.registerOptions();
        }
        return instance;
    }

    public static final ConfigOption<String> SERVER_ID =
            new ConfigOption<>(
                    "server.id",
                    "The id of hugegraph-hubble server.",
                    disallowEmpty(),
                    "hubble-1"
            );

    public static final ConfigOption<String> SERVER_HOST =
            new ConfigOption<>(
                    "server.host",
                    "The host of hugegraph-hubble server.",
                    disallowEmpty(),
                    "localhost"
            );

    public static final ConfigOption<Integer> SERVER_PORT =
            new ConfigOption<>(
                    "server.port",
                    "The port of hugegraph-hubble server.",
                    rangeInt(1, 65535),
                    8088
            );

    public static final ConfigListOption<String> CONNECTION_IP_WHITE_LIST =
            new ConfigListOption<>(
                    "graph_connection.ip_white_list",
                    "The ip white list available for connecting to " +
                    "HugeGraphServer, * means no ip limited.",
                    input -> {
                        if (CollectionUtils.isEmpty(input)) {
                            return false;
                        }
                        if (input.contains("*") && input.size() > 1) {
                            return false;
                        }
                        for (String ip : input) {
                            if (!HubbleUtil.HOST_PATTERN.matcher(ip)
                                                        .matches()) {
                                return false;
                            }
                        }
                        return true;
                    },
                    "*"
            );

    public static final ConfigListOption<Integer> CONNECTION_PORT_WHITE_LIST =
            new ConfigListOption<>(
                    "graph_connection.port_white_list",
                    "The port white list available for connecting to " +
                    "HugeGraphServer, -1 means no port limited.",
                    input -> {
                        if (CollectionUtils.isEmpty(input)) {
                            return false;
                        }
                        if (input.contains(-1) && input.size() > 1) {
                            return false;
                        }
                        return true;
                    },
                    -1
            );

    public static final ConfigOption<Integer> CLIENT_REQUEST_TIMEOUT =
            new ConfigOption<>(
                    "client.request_timeout",
                    "The request timeout in seconds for HugeClient.",
                    positiveInt(),
                    60
            );

    public static final ConfigOption<Integer> CLIENT_URL_CACHE_MAX_ENTRIES =
            new ConfigOption<>(
                    "client.url_cache_max_entries",
                    "Maximum discovered URL scopes retained for stale fallback.",
                    positiveInt(),
                    1024
            );

    public static final ConfigOption<Integer> GREMLIN_SUFFIX_LIMIT =
            new ConfigOption<>(
                    "gremlin.suffix_limit",
                    "The limit suffix to be added to gremlin statement.",
                    rangeInt(1, 800000),
                    250
            );

    public static final ConfigOption<Integer> GREMLIN_VERTEX_DEGREE_LIMIT =
            new ConfigOption<>(
                    "gremlin.vertex_degree_limit",
                    "The max edges count for per vertex.",
                    rangeInt(1, 500),
                    100
            );

    public static final ConfigOption<Integer> GREMLIN_EDGES_TOTAL_LIMIT =
            new ConfigOption<>(
                    "gremlin.edges_total_limit",
                    "The edges total limit.",
                    rangeInt(1, 1000),
                    500
            );

    public static final ConfigOption<Integer> GREMLIN_BATCH_QUERY_IDS =
            new ConfigOption<>(
                    "gremlin.batch_query_ids",
                    "The ids count for every batch.",
                    rangeInt(1, 250),
                    100
            );

    public static final ConfigOption<Integer> EXECUTE_HISTORY_SHOW_LIMIT =
            new ConfigOption<>(
                    "execute-history.show_limit",
                    "The show limit of execute histories.",
                    rangeInt(0, 10000),
                    500
            );

    public static final ConfigOption<String> UPLOAD_FILE_LOCATION =
            new ConfigOption<>(
                    "upload_file.location",
                    "The location of uploaded files.",
                    disallowEmpty(),
                    "upload-files"
            );

    public static final ConfigListOption<String> UPLOAD_FILE_FORMAT_LIST =
            new ConfigListOption<>(
                    "upload_file.format_list",
                    "The format white list available for uploading file.",
                    null,
                    "csv", "txt"
            );

    public static final ConfigOption<Long> UPLOAD_SINGLE_FILE_SIZE_LIMIT =
            new ConfigOption<>(
                    "upload_file.single_file_size_limit",
                    "The single file size(MB) limit.",
                    positiveInt(),
                    1 * Bytes.GB
            );

    public static final ConfigOption<Long> UPLOAD_TOTAL_FILE_SIZE_LIMIT =
            new ConfigOption<>(
                    "upload_file.total_file_size_limit",
                    "The total file size(MB) limit.",
                    positiveInt(),
                    10 * Bytes.GB
            );

    public static final ConfigOption<Long> UPLOAD_FILE_MAX_TIME_CONSUMING =
            new ConfigOption<>(
                    "upload_file.max_uploading_time",
                    "The maximum allowable uploading time(second) for file " +
                    "uploads, the uploaded file parts will be cleared if " +
                    "exceed this time",
                    positiveInt(),
                    12L * 60 * 60
            );

    public static final ConfigOption<String> LANGCHAIN_PYTHON_PATH =
            new ConfigOption<>(
                    "langchain.python_path",
                    "The fixed python executable path for LangChain scripts.",
                    disallowEmpty(),
                    "python3"
            );

    public static final ConfigOption<String> LANGCHAIN_SCRIPT_DIR =
            new ConfigOption<>(
                    "langchain.script_dir",
                    "The fixed directory for LangChain scripts.",
                    disallowEmpty(),
                    "langchaincode"
            );

    public static final ConfigListOption<String> LANGCHAIN_SCRIPT_ALLOWLIST =
            new ConfigListOption<>(
                    "langchain.script_allowlist",
                    "The allowed LangChain script file names.",
                    input -> !CollectionUtils.isEmpty(input),
                    "excute_langchain.py"
            );

    public static final ConfigOption<Integer> LANGCHAIN_EXECUTE_TIMEOUT =
            new ConfigOption<>(
                    "langchain.execute_timeout",
                    "The timeout in seconds for LangChain script execution.",
                    positiveInt(),
                    30
            );

    public static final ConfigOption<String> SERVER_PROTOCOL =
            new ConfigOption<>(
                    "server.protocol",
                    "The protocol of HugeGraphServer, allowed values are: " +
                    "http or https",
                    allowValues("http", "https"),
                    "http"
            );

    public static final ConfigOption<String> CLIENT_TRUSTSTORE_FILE =
            new ConfigOption<>(
                    "ssl.client_truststore_file",
                    "The path of the client truststore file " +
                    "when https protocol is enabled",
                    null,
                    "conf/hugegraph.truststore"
            );

    public static final ConfigOption<String> CLIENT_TRUSTSTORE_PASSWORD =
            new ConfigOption<>(
                    "ssl.client_truststore_password",
                    "The password of the client truststore " +
                    "when https protocol is enabled",
                    null,
                    "hugegraph"
            );

    public static final ConfigOption<Boolean> PD_ENABLED =
            new ConfigOption<>(
                    "pd.enabled",
                    "Whether to enable PD mode. Set to false for standalone " +
                    "RocksDB mode where PD is not available.",
                    null,
                    true
            );

    public static final ConfigOption<String> SERVER_URL =
            new ConfigOption<>(
                    "server.direct_url",
                    "The direct URL of HugeGraph Server, used only when " +
                    "pd.enabled=false. Example: http://127.0.0.1:8080",
                    null,
                    "http://127.0.0.1:8080"
            );

    public static final ConfigOption<String> PD_CLUSTER =
            new ConfigOption<>(
                    "cluster",
                    "The cluster which hubble connect to",
                    null,
                    "hg"
            );

    public static final ConfigOption<String> PD_PEERS =
            new ConfigOption<>(
                    "pd.peers",
                    "The pd addresses",
                    null,
                    "127.0.0.1:8686"
            );

    public static final ConfigOption<String> PD_SERVER =
            new ConfigOption<>(
                    "pd.server",
                    "The pd-server addresses",
                    null,
                    "127.0.0.1:8620"
            );

    public static final ConfigOption<Integer> OPERATIONS_CONNECT_TIMEOUT =
            new ConfigOption<>(
                    "operations.connect_timeout_ms",
                    "Connection timeout for each operations upstream.",
                    positiveInt(),
                    1500
            );

    public static final ConfigOption<Integer> OPERATIONS_READ_TIMEOUT =
            new ConfigOption<>(
                    "operations.read_timeout_ms",
                    "Read timeout for each operations upstream.",
                    positiveInt(),
                    2500
            );

    public static final ConfigOption<Integer> OPERATIONS_MAX_RESPONSE_BYTES =
            new ConfigOption<>(
                    "operations.max_response_bytes",
                    "Maximum accepted body size for an operations upstream.",
                    positiveInt(),
                    1024 * 1024
            );

    public static final ConfigOption<Integer> OPERATIONS_CACHE_TTL =
            new ConfigOption<>(
                    "operations.cache_ttl_seconds",
                    "Fresh operations snapshot cache lifetime in seconds.",
                    positiveInt(),
                    5
            );

    public static final ConfigOption<Integer> OPERATIONS_CACHE_MAX_ENTRIES =
            new ConfigOption<>(
                    "operations.cache_max_entries",
                    "Maximum operations snapshots retained across credentials.",
                    positiveInt(),
                    1024
            );

    public static final ConfigOption<Integer> OPERATIONS_STORE_THREADS =
            new ConfigOption<>(
                    "operations.store_threads",
                    "Maximum concurrent Store metric collection tasks.",
                    positiveInt(),
                    16
            );

    public static final ConfigOption<Integer> OPERATIONS_STORE_DEADLINE =
            new ConfigOption<>(
                    "operations.store_deadline_ms",
                    "Total deadline for one Store metric collection pass.",
                    positiveInt(),
                    5000
            );

    public static final ConfigListOption<String> OPERATIONS_STORE_ALLOWED_TARGETS =
            new ConfigListOption<>(
                    "operations.store.allowed_targets",
                    "Operator-managed Store metric origin allowlist.",
                    input -> !CollectionUtils.isEmpty(input) &&
                             input.stream().allMatch(
                                   HubbleOptions::validOperationsStoreTarget),
                    "http://127.0.0.1:8520", "http://[::1]:8520"
            );

    private static boolean validOperationsStoreTarget(String value) {
        if (value == null || value.trim().isEmpty()) {
            return false;
        }
        String origin = value.trim();
        if (origin.contains("*") || origin.matches(".*\\s+.*")) {
            return false;
        }
        try {
            URI target = URI.create(origin);
            String scheme = target.getScheme();
            if (!("http".equalsIgnoreCase(scheme) ||
                  "https".equalsIgnoreCase(scheme)) ||
                target.getHost() == null || target.getPort() <= 0 ||
                target.getPort() > 65535 || target.getUserInfo() != null ||
                target.getQuery() != null || target.getFragment() != null) {
                return false;
            }
            String path = target.getPath();
            return path == null || path.isEmpty();
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    public static final ConfigOption<String> OPERATIONS_PD_USERNAME =
            new ConfigOption<>(
                    "operations.pd.username",
                    "PD service identity used only by Hubble Backend.",
                    disallowEmpty(),
                    "hubble"
            );

    public static final ConfigOption<String> OPERATIONS_PD_PASSWORD =
            new ConfigOption<>(
                    "operations.pd.password",
                    "PD service identity secret; never returned by an API.",
                    null,
                    ""
            );

    public static final ConfigOption<String> OPERATIONS_STORE_USERNAME =
            new ConfigOption<>(
                    "operations.store.username",
                    "Store service identity used only by Hubble Backend.",
                    disallowEmpty(),
                    "hubble"
            );

    public static final ConfigOption<String> OPERATIONS_STORE_PASSWORD =
            new ConfigOption<>(
                    "operations.store.password",
                    "Store service identity secret; never returned by an API.",
                    null,
                    ""
            );

    public static final ConfigOption<String> DASHBOARD_ADDRESS =
            new ConfigOption<>(
                    "dashboard.address",
                    "The dashboard addresses",
                    null,
                    "127.0.0.1:8092"
            );

    public static final ConfigOption<String> ROUTE_TYPE =
            new ConfigOption<>(
                    "route.type",
                    "use service url",
                    allowValues("BOTH", "NODE_PORT", "DDS"),
                    "NODE_PORT"
            );

    public static final ConfigOption<String> PROMETHEUS_URL =
            new ConfigOption<>(
                    "prometheus.url",
                    "prometheus url, for saas metrics",
                    null,
                    "http://127.0.0.1:8090"
            );

    public static final ConfigOption<String> IDC =
            new ConfigOption<>(
                    "idc",
                    "hubble deployment location (eg:bddwd or gzbh)",
                    disallowEmpty(),
                    "bddwd"
            );

    public static final ConfigOption<String> MONITOR_URL =
            new ConfigOption<>(
                    "monitor.url",
                    "monitor URL",
                    null,
                    ""
            );

    public static final ConfigOption<String> ES_URL =
            new ConfigOption<>(
                    "es.urls",
                    "The addresses of Elasticsearch Cluster",
                    null,
                    ""
            );

    public static final ConfigOption<String> ES_USER =
            new ConfigOption<>(
                    "es.user",
                    "The user of Elasticsearch Cluster",
                    null,
                    ""
            );

    public static final ConfigOption<String> ES_PASSWORD =
            new ConfigOption<>(
                    "es.password",
                    "The password of Elasticsearch Cluster",
                    null,
                    ""
            );

    // ES查询: max_result_window
    public static final ConfigOption<Integer> MAX_RESULT_WINDOW =
            new ConfigOption<>(
                    "es.max_result_window",
                    "es config info: max_result_window",
                    positiveInt(),
                    10000
            );

    public static final ConfigOption<String> LOG_AUDIT_PATTERN =
            new ConfigOption<>(
                    "log.audit.pattern",
                    "the index name of audit log",
                    null,
                    "hugegraphaudit"
            );

    public static final ConfigOption<Integer> LOG_EXPORT_COUNT =
            new ConfigOption<>(
                    "log.export.count",
                    "max export item count of audit/log",
                    positiveInt(),
                    10000
            );

    public static final ConfigOption<String> PROXY_SERVLET_URL =
            new ConfigOption<>(
                    "proxy.servlet_url",
                    "the servlet url to access",
                    null,
                    ""
            );

    public static final ConfigOption<String> PROXY_TARGET_URL =
            new ConfigOption<>(
                    "proxy.target_url",
                    "the target url to access",
                    null,
                    ""
            );
}
