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

package org.apache.hugegraph.spark.connector.options;

import java.io.Serializable;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.spark.connector.constant.Constants;
import org.apache.hugegraph.spark.connector.constant.DataTypeEnum;
import org.apache.hugegraph.util.E;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class HGOptions implements Serializable {

    private static final Logger LOG = LoggerFactory.getLogger(HGOptions.class);

    private static final int CPUS = Runtime.getRuntime().availableProcessors();

    /* Client Configs */
    public static final String HOST = "host";
    public static final String PORT = "port";
    public static final String GRAPH = "graph";
    public static final String PROTOCOL = "protocol";
    public static final String USERNAME = "username";
    public static final String TOKEN = "token";
    public static final String TIMEOUT = "timeout";
    public static final String MAX_CONNECTIONS = "max-conn";
    public static final String MAX_CONNECTIONS_PER_ROUTE = "max-conn-per-route";
    public static final String TRUST_STORE_FILE = "trust-store-file";
    public static final String TRUST_STORE_TOKEN = "trust-store-token";

    /* Graph Data Configs */
    public static final String DATA_TYPE = "data-type";
    public static final String LABEL = "label";
    public static final String ID_FIELD = "id";
    public static final String SOURCE_NAME = "source-name";
    public static final String TARGET_NAME = "target-name";
    public static final String SELECTED_FIELDS = "selected-fields";
    public static final String IGNORED_FIELDS = "ignored-fields";
    public static final String BATCH_SIZE = "batch-size";

    /* Common Configs */
    public static final String DELIMITER = "delimiter";

    public Map<String, String> parameters;

    public HGOptions(Map<String, String> options) {
        parameters = options.entrySet()
                            .stream()
                            .collect(Collectors.toMap(e -> e.getKey().toLowerCase().trim(),
                                                      Map.Entry::getValue));
        checkRequiredConf();
        setDefaultConf();
        checkFieldsConflict();
        LOG.info("HugeGraph Spark Connector config keys: {}", parameters.keySet());
    }

    private void checkRequiredConf() {
        String dataType = parameters.getOrDefault(DATA_TYPE, null);
        E.checkArgument(DataTypeEnum.validDataType(dataType),
                        "DataType must be set, either vertex " +
                        "or edge, but got %s.", dataType);

        String label = parameters.getOrDefault(LABEL, null);
        E.checkArgument(!StringUtils.isEmpty(label),
                        "Label must be set, but got %s.", label);

        if (DataTypeEnum.isEdge(dataType)) {
            String sourceNames = parameters.getOrDefault(SOURCE_NAME, null);
            E.checkArgument(!StringUtils.isEmpty(sourceNames), "source-names must be set " +
                                                               "when datatype is edge, but got " +
                                                               "%s.", sourceNames);
            String targetNames = parameters.getOrDefault(TARGET_NAME, null);
            E.checkArgument(!StringUtils.isEmpty(targetNames), "target-names must be set " +
                                                               "when datatype is edge, but got " +
                                                               "%s.", targetNames);
            LOG.info("Edge, Label is {}, source is {}, target is {}.",
                     label, sourceNames, targetNames);
        } else {
            String idField = parameters.getOrDefault(ID_FIELD, null);
            if (Objects.nonNull(idField)) {
                LOG.info("Vertex, Label is {}, id is {}, id strategy is {}", label, idField,
                         "customize");
            } else {
                LOG.info("Vertex, Label is {}, id is {}, id strategy is {}", label, null,
                         "PrimaryKey");
            }
        }
    }

    private void checkFieldsConflict() {
        Set<String> selectSet = selectedFields();
        Set<String> ignoreSet = ignoredFields();
        E.checkArgument(selectSet.isEmpty() || ignoreSet.isEmpty(),
                        "Not allowed to specify selected(%s) and ignored(%s) " +
                        "fields at the same time, at least one of them " +
                        "must be empty", selectSet, ignoreSet);
    }

    private void setDefaultConf() {
        setDefaultValueWithMsg(HOST, Constants.DEFAULT_HOST,
                               String.format("Host not set, use default host: %s instead.",
                                             Constants.DEFAULT_HOST));
        setDefaultValueWithMsg(PORT, String.valueOf(Constants.DEFAULT_PORT),
                               String.format("Port not set, use default port: %s instead.",
                                             Constants.DEFAULT_PORT));
        setDefaultValueWithMsg(GRAPH, Constants.DEFAULT_GRAPH,
                               String.format("Graph not set, use default graph: %s instead.",
                                             Constants.DEFAULT_GRAPH));

        setDefaultValue(PROTOCOL, Constants.DEFAULT_PROTOCOL);
        setDefaultValue(USERNAME, null);
        setDefaultValue(TOKEN, null);
        setDefaultValue(TIMEOUT, String.valueOf(Constants.DEFAULT_TIMEOUT));
        setDefaultValue(MAX_CONNECTIONS, String.valueOf(CPUS * 4));
        setDefaultValue(MAX_CONNECTIONS_PER_ROUTE, String.valueOf(CPUS * 2));
        setDefaultValue(TRUST_STORE_FILE, null);
        setDefaultValue(TRUST_STORE_TOKEN, null);

        setDefaultValue(BATCH_SIZE, String.valueOf(Constants.DEFAULT_BATCH_SIZE));
        setDefaultValue(DELIMITER, Constants.COMMA_STR);
        setDefaultValue(SELECTED_FIELDS, "");
        setDefaultValue(IGNORED_FIELDS, "");
    }

    private void setDefaultValue(String key, String value) {
        if (!parameters.containsKey(key)) {
            parameters.put(key, value);
        }
    }

    private void setDefaultValueWithMsg(String key, String value, String msg) {
        if (!parameters.containsKey(key)) {
            LOG.info(msg);
            parameters.put(key, value);
        }
    }

    public Map<String, String> getAllParameters() {
        return parameters;
    }

    public String getConfValue(String confKey) {
        String lowerConfKey = confKey.toLowerCase();
        return parameters.getOrDefault(lowerConfKey, null);
    }

    public String host() {
        return getConfValue(HOST);
    }

    public int port() {
        return Integer.parseInt(getConfValue(PORT));
    }

    public String graph() {
        return getConfValue(GRAPH);
    }

    public String protocol() {
        return getConfValue(PROTOCOL);
    }

    public String username() {
        return getConfValue(USERNAME);
    }

    public String token() {
        return getConfValue(TOKEN);
    }

    public int timeout() {
        return Integer.parseInt(getConfValue(TIMEOUT));
    }

    public int maxConnection() {
        return Integer.parseInt(getConfValue(MAX_CONNECTIONS));
    }

    public int maxConnectionPerRoute() {
        return Integer.parseInt(getConfValue(MAX_CONNECTIONS_PER_ROUTE));
    }

    public String trustStoreFile() {
        return getConfValue(TRUST_STORE_FILE);
    }

    public String trustStoreToken() {
        return getConfValue(TRUST_STORE_TOKEN);
    }

    public String dataType() {
        return getConfValue(DATA_TYPE);
    }

    public String label() {
        return getConfValue(LABEL);
    }

    public String idField() {
        return getConfValue(ID_FIELD);
    }

    public List<String> sourceName() {
        return splitStr(getConfValue(SOURCE_NAME));
    }

    public List<String> targetName() {
        return splitStr(getConfValue(TARGET_NAME));
    }

    public Set<String> selectedFields() {
        String selectStr = getConfValue(SELECTED_FIELDS);
        if (StringUtils.isEmpty(selectStr)) {
            return new HashSet<>();
        }
        return new HashSet<>(splitStr(selectStr, delimiter()));
    }

    public Set<String> ignoredFields() {
        String ignoreStr = getConfValue(IGNORED_FIELDS);
        if (StringUtils.isEmpty(ignoreStr)) {
            return new HashSet<>();
        }
        return new HashSet<>(splitStr(ignoreStr, delimiter()));
    }

    public int batchSize() {
        return Integer.parseInt(getConfValue(BATCH_SIZE));
    }

    public String delimiter() {
        return getConfValue(DELIMITER);
    }

    private List<String> splitStr(String str) {
        return splitStr(str, Constants.COMMA_STR);
    }

    private List<String> splitStr(String str, String delimiter) {
        return Arrays.asList(str.split(delimiter));
    }
}
