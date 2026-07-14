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

package org.apache.hugegraph.driver.factory;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.apache.commons.collections.CollectionUtils;
import org.apache.commons.lang.StringUtils;
import org.apache.hugegraph.util.E;
import org.apache.hugegraph.util.Log;
import org.slf4j.Logger;

import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.pd.client.DiscoveryClient;
import org.apache.hugegraph.pd.client.DiscoveryClientImpl;
import org.apache.hugegraph.pd.client.PDConfig;
import org.apache.hugegraph.pd.grpc.discovery.NodeInfos;
import org.apache.hugegraph.pd.grpc.discovery.Query;
import com.google.common.collect.ImmutableMap;

import lombok.SneakyThrows;

public class PDHugeClientFactory {

    private static final Logger LOG = Log.logger(PDHugeClientFactory.class);

    public static final String DEFAULT_GRAPHSPACE = "DEFAULT";
    public static final String DEFAULT_SERVICE = "DEFAULT";
    public static final String NAME = "hg";
    public static final String TOKEN =
            "$2a$04$i10KooNg6wLvIPVDh909n.RBYlZ/4pJo978nFK86nrqQiGIKV4UGS";

    protected static final String SERVICE_VERSION = "1.0.0";
    protected final String pdAddrs;
    protected final RouteType type;
    protected final DiscoveryClient client;

    public PDHugeClientFactory(String pdAddrs) {
        this(pdAddrs, null);
    }

    @SneakyThrows
    public PDHugeClientFactory(String pdAddrs, String type) {
        this.pdAddrs = pdAddrs;
        this.type = type != null ? RouteType.valueOf(type) : RouteType.BOTH;

        PDConfig pdConfig = PDConfig.of(pdAddrs);
        // TODO: Not suport now: pdConfig.setAuthority(NAME, TOKEN);
        this.client = DiscoveryClientImpl.newBuilder()
                                                    // TODO: Not suport now: .setPdConfig(pdConfig)
                                                    .setCenterAddress(pdAddrs)
                                                    .build();
    }

    public HugeClient createUnauthClient(String cluster, String graphSpace,
                                         String graph) {
        E.checkArgument(cluster != null,
                        "create unauth client: cluster must not null");

        return createUnauthClient(cluster, graphSpace, graph, 60);
    }

    public HugeClient createUnauthClient(String cluster, String graphSpace,
                                         String graph, int timeout) {
        E.checkArgument(cluster != null,
                        "create unauth client: cluster must not null");

        return createClient(cluster, graphSpace, graph, null, null, null,
                            timeout);
    }

    public HugeClient createAuthClient(String cluster, String graphSpace,
                                       String graph, String token,
                                       String username, String password) {

        return createAuthClient(cluster, graphSpace, graph, token, username,
                                password, 60);
    }

    public HugeClient createAuthClient(String cluster, String graphSpace,
                                       String graph, String token,
                                       String username, String password,
                                       int timeout) {
        E.checkArgument(cluster != null,
                        "create auth client: cluster must not null");

        E.checkArgument(token != null || (username != null && password != null),
                        "create auth client: token must not null or " +
                                "username/password must not null");

        return createClient(cluster, graphSpace, graph, token, username,
                            password, timeout);
    }

    protected HugeClient createClient(String cluster, String graphSpace,
                                      String graph, String token,
                                      String username, String password,
                                      int timeout) {

        List<String> urls = getAutoURLs(cluster, graphSpace, graph);

        DefaultHugeClientFactory defaultFactory =
                new DefaultHugeClientFactory(urls.toArray(new String[0]));

        int r = (int) Math.floor(Math.random() * urls.size());
        String address = urls.get(r);
        if (!address.startsWith("http")) {
            address = "http://" + address;
        }

        HugeClient client = HugeClient.builder(address, graphSpace, graph)
                                      .configToken(token)
                                      .configUser(username, password)
                                      .configTimeout(timeout)
                                      .build();
        return client;
    }

    public List<String> getAutoURLs(String cluster, String graphSpace,
                                    String service) {
        // if no urls under graphspace/service
        // use DEFAULT/DEFAULT

        List<String> urls = null;
        if (StringUtils.isNotEmpty(graphSpace)) {
            if (StringUtils.isNotEmpty(service)) {
                // Get urls From service
                urls = getURLs(cluster, graphSpace, service);
            }

            if (CollectionUtils.isNotEmpty(urls)) {
                return urls;
            }

            // Get Url from graphspace
            urls = getURLs(cluster, graphSpace, null);
            if (CollectionUtils.isNotEmpty(urls)) {
                return urls;
            }
        }

        urls = getURLs(cluster, DEFAULT_GRAPHSPACE, DEFAULT_SERVICE);

        return urls;
    }

    public List<String> getURLs(String cluster, String graphSpace,
                                String service) {

        E.checkArgument(StringUtils.isNotEmpty(graphSpace), "list urls" +
                " error, cluster must not null");

        Map<String, String>  configs = new HashMap<>();
        if (StringUtils.isNotEmpty(graphSpace)) {
            configs.put("GRAPHSPACE", graphSpace);
        }
        if (StringUtils.isNotEmpty(service)) {
            configs.put("SERVICE_NAME", service);
        }

        if (!RouteType.BOTH.equals(this.type)) {
            configs.put("REGISTER_TYPE", this.type.name());
        }

        Query query = Query.newBuilder().setAppName(cluster)
                           .putAllLabels(configs)
                           .build();

        NodeInfos nodeInfos = client.getNodeInfos(query);
        if (nodeInfos == null) {
            return Collections.emptyList();
        }

        List<String> urls = nodeInfos.getInfoList().stream()
                                     .map(nodeInfo -> nodeInfo.getAddress())
                                     .collect(Collectors.toList());

        return urls;
    }

    protected List<String> getURLsWithConfig(String cluster,
                                             Map<String, String> configs) {

        if (null == configs) {
            configs = ImmutableMap.of();
        }
        Query query = Query.newBuilder().setAppName(cluster)
                           .setVersion(SERVICE_VERSION)
                           .putAllLabels(configs)
                           .build();

        NodeInfos nodeInfos = client.getNodeInfos(query);
        if (nodeInfos == null) {
            return Collections.emptyList();
        }

        List<String> urls = nodeInfos.getInfoList().stream()
                                     .map(nodeInfo -> nodeInfo.getAddress())
                                     .collect(Collectors.toList());

        return urls;
    }

    public void close() {
        this.client.close();
    }

    public enum RouteType {
        BOTH,
        NODE_PORT,
        DDS
    }
}
