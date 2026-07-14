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

package org.apache.hugegraph.service;

import static org.apache.hugegraph.driver.factory.PDHugeClientFactory.DEFAULT_GRAPHSPACE;
import static org.apache.hugegraph.driver.factory.PDHugeClientFactory.DEFAULT_SERVICE;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;

import org.apache.commons.collections.CollectionUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.factory.PDHugeClientFactory;
import org.apache.hugegraph.entity.GraphConnection;
import org.apache.hugegraph.exception.ParameterizedException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import lombok.extern.log4j.Log4j2;
import org.apache.hugegraph.config.HugeConfig;
import com.google.common.cache.Cache;
import com.google.common.cache.CacheBuilder;

import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.util.HugeClientUtil;
import org.apache.hugegraph.util.UrlUtil;
import com.google.common.collect.ImmutableList;

@Log4j2
@Service
public final class HugeClientPoolService {

    @Autowired
    private HugeConfig config;
    @Autowired
    private SettingSSLService sslService;
    @Autowired
    private String cluster;
    @Autowired(required = false)
    private PDHugeClientFactory pdHugeClientFactory;

    private final Map<String, HugeClient> clients = new ConcurrentHashMap<>();

    private Cache<String, List<String>> urlCache = CacheBuilder.newBuilder()
            .maximumSize(HubbleOptions.CLIENT_URL_CACHE_MAX_ENTRIES.defaultValue())
            .expireAfterWrite(1, TimeUnit.HOURS)
            .build();

    @PostConstruct
    private void initializeUrlCache() {
        this.urlCache = CacheBuilder.newBuilder()
                .maximumSize(this.config.get(
                             HubbleOptions.CLIENT_URL_CACHE_MAX_ENTRIES))
                .expireAfterWrite(1, TimeUnit.HOURS)
                .build();
    }

    @PreDestroy
    public void destroy() {
        log.info("Destroy HugeClient pool");
        for (HugeClient client : this.clients.values()) {
            client.close();
        }
    }

    public HugeClient createUnauthClient() {
        // Get all graphspace under cluster
        return getOrCreate(null, null, null, null);
    }

    public HugeClient createTempTokenClient(String token) {
        return getOrCreate(null, null, null, token);
    }

    public HugeClient createTempBasicClient(String username, String password) {
        return getOrCreate(null, null, null, null, username, password);
    }

    public HugeClient createBasicClient(String graphSpace, String graph,
                                        String username, String password) {
        return getOrCreate(null, graphSpace, graph, null, username, password);
    }

    public HugeClient createAuthClient(String graphSpace,
            String graph, String token) {
        return getOrCreate(null, graphSpace, graph, token);
    }

    public HugeClient getOrCreate(String url, String graphSpace, String graph,
            String token) {
        // 去掉缓存，固定每个 request 分配一个 client
        return getOrCreate(url, graphSpace, graph, token, null, null);
    }

    private HugeClient getOrCreate(String url, String graphSpace, String graph,
            String token, String username, String password) {
        // 去掉缓存，固定每个 request 分配一个 client
        return create(url, graphSpace, graph, token, username, password);
    }

    public HugeClient create(String url, String graphSpace, String graph,
            String token) {
        return create(url, graphSpace, graph, token, null, null);
    }

    private HugeClient create(String url, String graphSpace, String graph,
            String token, String username, String password) {
        if (StringUtils.isEmpty(url)) {
            List<String> urls = this.allAvailableURLs(graphSpace, graph);

            if (CollectionUtils.isEmpty(urls)) {
                throw new ParameterizedException("service.no-available");
            }

            for (String tmpurl : urls) {
                if (StringUtils.isEmpty(tmpurl)) {
                    continue;
                }
                HugeClient tmpclient = this.create(tmpurl, graphSpace, graph, token,
                                                   username, password);

                if (checkHealth(tmpclient)) {
                    return tmpclient;
                } else {
                    tmpclient.close();
                }
            }
        }

        GraphConnection connection = new GraphConnection();
        try {
            UrlUtil.Host host = UrlUtil.parseHost(url);
            connection.setProtocol(host.getScheme());
            connection.setHost(host.getHost());
            connection.setPort(host.getPort());
        } catch (IllegalArgumentException e) {
            throw new ParameterizedException("service.url.parse.error", e,
                                             "[REDACTED]");
        }

        connection.setToken(token);
        connection.setUsername(username);
        connection.setPassword(password);
        connection.setGraphSpace(graphSpace);
        connection.setGraph(graph);
        if (connection.getTimeout() == null) {
            int timeout = this.config.get(HubbleOptions.CLIENT_REQUEST_TIMEOUT);
            connection.setTimeout(timeout);
        }
        this.sslService.configSSL(this.config, connection);
        HugeClient client = HugeClientUtil.tryConnect(connection);

        return client;
    }

    /**
     * 获取所有可用的URL列表
     *
     * @param graphSpace 图形空间名称
     * @param service    服务名称
     * @return URL列表
     */
    private List<String> allAvailableURLs(String graphSpace, String service) {
        // Non-PD mode: directly return the configured server URL
        boolean pdEnabled = config.get(HubbleOptions.PD_ENABLED);
        if (!pdEnabled) {
            String directUrl = config.get(HubbleOptions.SERVER_URL);
            log.info("PD mode disabled, using direct server URL: {}", directUrl);
            return ImmutableList.of(directUrl);
        }

        List<String> realtimeurls = new ArrayList<>();
        if (StringUtils.isNotEmpty(graphSpace)) {
            if (StringUtils.isNotEmpty(service)) {
                // Get realtineurls From service
                List<String> urls = this.discoverURLs(graphSpace, service);
                if (!CollectionUtils.isEmpty(urls)) {
                    // 打乱顺序
                    Collections.shuffle(urls);
                    realtimeurls.addAll(urls);
                }
            }

            List<String> urls = this.discoverURLs(graphSpace, null);
            if (!CollectionUtils.isEmpty(urls)) {
                // 打乱顺序
                Collections.shuffle(urls);
                realtimeurls.addAll(urls);
            }
        }

        List<String> urls = this.discoverURLs(DEFAULT_GRAPHSPACE, DEFAULT_SERVICE);
        String defaultCacheKey = cacheKey(DEFAULT_GRAPHSPACE, DEFAULT_SERVICE);
        if (!CollectionUtils.isEmpty(urls)) {
            Collections.shuffle(urls);
            // 设置默认URL缓存
            urlCache.put(defaultCacheKey, urls);
            realtimeurls.addAll(urls);
        }

        String cacheKey = cacheKey(graphSpace, service);
        if (!CollectionUtils.isEmpty(realtimeurls)) {
            urlCache.put(cacheKey, realtimeurls);
            return realtimeurls;
        } else {

            List<String> cacheKeys = new ArrayList<>();
            cacheKeys.add(cacheKey(graphSpace, service));
            cacheKeys.add(cacheKey(graphSpace, null));
            if (StringUtils.isEmpty(graphSpace)) {
                cacheKeys.add(defaultCacheKey);
            }
            for (String ck : cacheKeys) {
                List<String> r = urlCache.getIfPresent(ck);
                if (!CollectionUtils.isEmpty(r)) {
                    return r;
                }
            }

            log.warn("Get empty list of availabel url from cache: {}/{}",
                    graphSpace, service);

            return ImmutableList.of();
        }
    }

    private List<String> discoverURLs(String graphSpace, String service) {
        try {
            List<String> urls = this.pdHugeClientFactory.getURLs(
                    this.cluster, graphSpace, service);
            if (CollectionUtils.isEmpty(urls)) {
                return Collections.emptyList();
            }
            return new ArrayList<>(urls);
        } catch (RuntimeException e) {
            log.debug("PD service discovery failed for graph space/service");
            return Collections.emptyList();
        }
    }

    private static String cacheKey(String graphSpace, String service) {
        return cacheKeyPart(graphSpace) + cacheKeyPart(service);
    }

    private static String cacheKeyPart(String value) {
        return value == null ? "-1:" : value.length() + ":" + value;
    }

    private boolean checkHealth(HugeClient client) {
        try {
            client.versionManager().getApiVersion();
        } catch (Exception e) {
            log.debug("Check client health throw exception", e);
            return false;
        }

        return true;
    }
}
