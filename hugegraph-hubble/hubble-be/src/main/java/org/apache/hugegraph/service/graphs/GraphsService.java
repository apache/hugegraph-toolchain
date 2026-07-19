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

package org.apache.hugegraph.service.graphs;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.google.common.collect.ImmutableMap;
import com.google.common.collect.ImmutableSet;
import lombok.extern.log4j.Log4j2;
import org.apache.commons.lang.StringUtils;
import org.apache.commons.lang3.time.StopWatch;
import org.apache.hugegraph.client.RestClient;
import org.apache.hugegraph.api.graph.GraphMetricsAPI;
// TODO fix import
//import org.apache.hugegraph.client.api.graph.GraphMetricsAPI;
import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.controller.query.GremlinController;
import org.apache.hugegraph.driver.GraphsManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.GraphConnection;
import org.apache.hugegraph.entity.enums.AsyncTaskStatus;
import org.apache.hugegraph.entity.enums.ExecuteStatus;
import org.apache.hugegraph.entity.enums.ExecuteType;
import org.apache.hugegraph.entity.graphs.GraphStatisticsEntity;
import org.apache.hugegraph.entity.query.ExecuteHistory;
import org.apache.hugegraph.entity.query.GremlinQuery;
import org.apache.hugegraph.entity.space.BuiltInEntity;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.loader.util.JsonUtil;
import org.apache.hugegraph.service.algorithm.AsyncTaskService;
import org.apache.hugegraph.service.auth.UserService;
import org.apache.hugegraph.service.load.LoadTaskService;
import org.apache.hugegraph.service.query.ExecuteHistoryService;
import org.apache.hugegraph.service.query.QueryService;
import org.apache.hugegraph.service.schema.SchemaService;
import org.apache.hugegraph.structure.GraphElement;
import org.apache.hugegraph.structure.Task;
import org.apache.hugegraph.structure.constant.GraphReadMode;
import org.apache.hugegraph.structure.gremlin.ResultSet;
import org.apache.hugegraph.util.Ex;
import org.apache.hugegraph.util.HubbleUtil;
import org.apache.hugegraph.util.PageUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import static org.apache.hugegraph.util.GremlinUtil.GREMLIN_LOAD_HLM;

@Log4j2
@Service
public class GraphsService {

    private static final Pattern GRAPH_NAME_PATTERN = Pattern.compile(
            "[A-Za-z][A-Za-z0-9_]{0,47}"
    );

    @Autowired
    private SchemaService schemaService;

    @Autowired
    UserService userService;
    @Autowired
    private QueryService queryService;
    @Autowired
    private ExecuteHistoryService historyService;
    @Autowired
    private AsyncTaskService asyncTaskService;
    @Autowired
    private LoadTaskService loadTaskService;
    @Autowired
    private org.apache.hugegraph.config.HugeConfig config;

    private static final String GRAPH_STORAGE = "v1/graph/%s/%s/g";
    private static final String RUNNING_TASKS = "running_tasks";
    private static final String STATISTICS = "statistics";
    private static final String GREMLIN_STATISTICS_VERTEX =
            "g.V().groupCount().by(label)";
    private static final String GREMLIN_STATISTICS_EDGE =
            "g.E().groupCount().by(label)";
    private static final int SMALL_STATISTICS_LIMIT = 10000;
    private static final int SMALL_STATISTICS_PAGE_SIZE = 1000;
    private static final String GRAPH_HLM = "hlm";
    private static final String GRAPH_COVID19 = "covid19";

    private final ConcurrentHashMap<String, Map<String, Object>> graphStatistics =
            new ConcurrentHashMap<>();

    public Map<String, Object> get(HugeClient client, String graphSpace,
                                   String graph,
                                   Map<String, String> vermeerInfo) {
        // long storage = getStorage(pdClient, graphSpace, graph);
        Map<String, Object> info = new HashMap<>();
        info.putAll(client.graphs().getGraph(graph));
        // info.put("storage", storage);
        // Ensure nickname/graphspace fields exist for frontend display
        info.putIfAbsent("nickname", graph);
        info.putIfAbsent("graphspace", graphSpace);
        if (vermeerInfo.size() != 0) {
            info.put("status", vermeerInfo.get("status"));
            String lastLoadTime = vermeerInfo.get("update_time");
            // todo date format
            info.put("last_load_time", lastLoadTime);
        }
        return info;
    }

    public IPage<Map<String, Object>> queryPage(HugeClient client,
                                                String graphSpace, String uid,
                                                String query, String createTime,
                                                int pageNo, int pageSize,
                                                boolean isVermeerEnabled,
                                                Map<String, Object> vermeerInfo) {
        List<Map<String, Object>> results =
                sortedGraphsProfile(client, graphSpace, query, createTime,
                                    isVermeerEnabled, vermeerInfo);

        for (Map<String, Object> result : results) {
            String graph = result.get("name").toString();
            try {
                result.put("schemaview", schemaService.getSchemaView(
                        client.assignGraph(graphSpace, graph)));
            } catch (Exception e) {
                log.warn("Failed to load the schema summary for graph '{}'",
                         graph, e);
            }
        }

        return PageUtil.page(results, pageNo, pageSize);
    }

    public List<Map<String, Object>> sortedGraphsProfile(HugeClient client,
                                                         String graphSpace,
                                                         String query,
                                                         String createTime,
                                                         boolean isVermeerEnabled,
                                                         Map<String, Object> vermeerInfo) {
        // Get authorized graphs
        List<Map<String, Object>> graphs = listGraphProfiles(client.graphs(), query);
        log.info("Query all graphs in '{}' ", graphSpace);
        for (Map<String, Object> info : graphs) {
            String name = info.get("name").toString();
            // delete pd.peers info for security
            info.put("pd.peers", "");
            if (vermeerInfo.containsKey(name)) {
                Map<String, Object> brief =
                        HubbleUtil.uncheckedCast(vermeerInfo.get(name));
                info.put("status", brief.get("status").toString());
                info.put("last_load_time",
                         brief.get("last_load_time").toString());
            } else if (isVermeerEnabled) {
                // default info for non-loaded graph
                info.put("status", "created");
                info.put("last_load_time", "");
            } else {
                info.put("status", "");
                info.put("last_load_time", "");
            }

            info.put("storage", info.get("data_size"));
            // Ensure graphspace field is present for frontend navigation
            info.putIfAbsent("graphspace", graphSpace);
            info.putIfAbsent("graphspace_nickname", graphSpace);
            info.put("statistic", evCount(client, graphSpace, name));
        }

        List<Map<String, Object>> results =
                graphs.stream()
                      .filter((s) -> {
                          Object createTimeVal = s.get("create_time");
                          // In standalone mode, create_time may be absent
                          if (createTimeVal == null) {
                              return true;
                          }
                          return createTimeVal.toString()
                                             .compareTo(createTime) > 0;
                      })
                      .sorted((graph1, graph2) -> {
                          Object d1 = graph1.get("default");
                          Object d2 = graph2.get("default");
                          boolean default1 = d1 instanceof Boolean && (boolean) d1;
                          boolean default2 = d2 instanceof Boolean && (boolean) d2;

                          if (default1 != default2) {
                              return Boolean.compare(default2, default1);
                          } else if (default1) {
                              Object t1 = graph1.get("default_update_time");
                              Object t2 = graph2.get("default_update_time");
                              if (t1 instanceof Long && t2 instanceof Long) {
                                  return ((Long) t1).compareTo((Long) t2);
                              }
                              return 0;
                          } else {
                              String name1 = graph1.get("name").toString();
                              String name2 = graph2.get("name").toString();
                              return name1.compareTo(name2);
                          }
                      })
                      .collect(Collectors.toList());
        return results;

    }

    private List<Map<String, Object>> listGraphProfiles(GraphsManager graphs,
                                                        String query) {
        try {
            return graphs.listProfile(query);
        } catch (RuntimeException e) {
            if (e instanceof ServerException) {
                int status = ((ServerException) e).status();
                if (status == 401 || status == 403) {
                    throw e;
                }
            }
            log.warn("Graph profiles are unavailable; using standalone graph metadata");
        }

        String prefix = query == null ? "" : query;
        List<Map<String, Object>> profiles = new ArrayList<>();
        for (String name : graphs.listGraph()) {
            if (!name.startsWith(prefix)) {
                continue;
            }
            Map<String, Object> profile = new HashMap<>();
            profile.putAll(graphs.getGraph(name));
            profile.put("name", name);
            profiles.add(profile);
        }
        return profiles;
    }

    public Set<String> listGraphNames(HugeClient client, String graphSpace,
                                      String uid) {

        return ImmutableSet.copyOf(client.graphs().listGraph());
    }

    @Deprecated
    public Map<String, String> create(HugeClient client, String graph,
                                      boolean isAuth, String schemaTemplate) {
        Map<String, String> conf = new HashMap<>();
        if (isAuth) {
            conf.put("gremlin.graph",
                     "org.apache.hugegraph.auth.HugeFactoryAuthProxy");

        } else {
            conf.put("gremlin.graph", "org.apache.hugegraph.HugeFactory");
        }
        if (!StringUtils.isEmpty(schemaTemplate)) {
            conf.put("schema.init_template", schemaTemplate);
        }

        conf.put("store", graph);
        boolean pdEnabled = config.get(org.apache.hugegraph.options.HubbleOptions.PD_ENABLED);
        if (pdEnabled) {
            conf.put("backend", "hstore");
        } else {
            conf.put("backend", "rocksdb");
        }
        conf.put("serializer", "binary");

        return client.graphs().createGraph(graph, JsonUtil.toJson(conf));
    }

    public Map<String, String> create(HugeClient client, String nickname,
                                      String graph, String schemaTemplate) {
        Ex.check(graph != null && GRAPH_NAME_PATTERN.matcher(graph).matches(),
                 "graph-connection.graph.unmatch-regex");
        Map<String, String> conf = new HashMap<>();

        conf.put("gremlin.graph",
                 "org.apache.hugegraph.auth.HugeFactoryAuthProxy");
        conf.put("store", graph);
        boolean pdEnabled = config.get(org.apache.hugegraph.options.HubbleOptions.PD_ENABLED);
        if (pdEnabled) {
            conf.put("backend", "hstore");
            conf.put("task.scheduler_type", "distributed");
        } else {
            conf.put("backend", "rocksdb");
            conf.put("task.scheduler_type", "local");
            conf.put("rocksdb.data_path", "rocksdb-data/data_" + graph);
            conf.put("rocksdb.wal_path", "rocksdb-data/wal_" + graph);
        }
        conf.put("serializer", "binary");
        conf.put("nickname", nickname);
        
        if (StringUtils.isNotEmpty(schemaTemplate)) {
            conf.put("schema.init_template", schemaTemplate);
        }

        return client.graphs().createGraph(graph, JsonUtil.toJson(conf));
    }

    public void update(HugeClient client, String nickname,
                       String graph) {
        client.graphs().update(graph, nickname);
    }

    public void clearGraph(HugeClient client, String graph) {
        GraphsManager graphs = client.graphs();
        Map<String, Object> response = graphs.getDefault();
        Set<String> defaults = defaultGraphs(response.get("default_graph"));
        Ex.check(!defaults.contains(graph),
                 "The default graph can't be cleared");
        graphs.clearGraph(graph, "I'm sure to delete all data");
    }

    public void setDefault(HugeClient client, String graph) {
        Map<String, Object> response = client.graphs().getDefault();
        Set<String> defaults = defaultGraphs(response.get("default_graph"));

        boolean targetIsDefault = defaults.contains(graph);
        if (!targetIsDefault) {
            client.graphs().setDefault(graph);
        }
        for (String current : defaults) {
            if (!graph.equals(current)) {
                client.graphs().unSetDefault(current);
            }
        }
    }

    private static Set<String> defaultGraphs(Object value) {
        if (value == null) {
            return Collections.emptySet();
        }

        Collection<?> values;
        if (value instanceof Collection) {
            values = (Collection<?>) value;
        } else if (value instanceof String) {
            values = Collections.singleton(value);
        } else {
            throw new IllegalStateException("Invalid default_graph response type");
        }

        Set<String> defaults = new LinkedHashSet<>();
        for (Object item : values) {
            if (!(item instanceof String) || StringUtils.isBlank((String) item)) {
                throw new IllegalStateException("Invalid default_graph entry");
            }
            defaults.add((String) item);
        }
        return defaults;
    }

    public void unSetDefault(HugeClient client, String graph) {
        client.graphs().unSetDefault(graph);
    }

    public Map<String, Object> getDefault(HugeClient client) {
        return client.graphs().getDefault();
    }

    public void delete(HugeClient client, String graph, String confirmMessage) {
        // TODO check if frontend support passing confirm message.
        client.graphs().dropGraph(graph,confirmMessage);
    }

    public GraphReadMode graphReadMode(HugeClient client, String graph) {
        return client.graphs().readMode(graph);
    }

    public void graphReadMode(HugeClient client, String graph, String mode) {
        this.checkReadMode(mode);
        // open(0) means mode equal all, close(1) means mode equal OLTP_ONLY
        if ("0".equals(mode)) {
            client.graphs().readMode(graph, GraphReadMode.ALL);
        } else if ("1".equals(mode)) {
            client.graphs().readMode(graph, GraphReadMode.OLTP_ONLY);
        }
    }

    public void checkReadMode(String mode) {
        Ex.check("0".equals(mode) || "1".equals(mode),
                "common.read_mode.invalid", mode);
    }

    public Object clone(HugeClient client, Map<String, Object> params) {
        return ImmutableMap.of("task_id",
                               client.graphs().clone(client.getGraphName(),
                                                     params));
    }

    public static long getStorage(RestClient pdClient,
                                  String graphSpace,
                                     String graph) {
        if (pdClient == null) {
            return 0L;
        }
        String path = String.format("v1/graph/%s/%s/g", graphSpace, graph);
        Map<String, Object> result;
        try {
            result = HubbleUtil.uncheckedCast(
                    pdClient.get(path).readObject(Map.class));
            Map<String, Object> data =
                    HubbleUtil.uncheckedCast(result.get("data"));
            if (data.containsKey("dataSize")) {
                long dataSize = Long.valueOf(data.get("dataSize").toString());
                return dataSize;
            } else {
                return 0L;
            }
        } catch (Exception e) {
            log.info("Fail to request pd to get data of graph {}-{} : {}",
                     graphSpace, graph, e.getMessage());
            return -1L;
        }
    }

    public static boolean isBigGraph(RestClient pdClient, String graphSpace,
                                     String graph) {
        return isBigStorage(getStorage(pdClient, graphSpace, graph));
    }

    public static boolean isBigStorage(long storageKb) {
        return (storageKb > (2 * 1024 * 1024));
    }

    public static String getStatisticsKey(String graphSpace, String graph) {
        return graphSpace + "-" + graph;
    }

    public GraphStatisticsEntity getStatistics(HugeClient client,
                                               String graphSpace,
                                               String graph) {
        GraphStatisticsEntity result;
        this.graphStatistics.clear();
        result = postSmallStatistics(client, graphSpace, graph);

        return result;
    }

    public void postStatistics(RestClient pdClient,
                               HugeClient client,
                               String graphSpace,
                               String graph) {
        if (isBigGraph(pdClient, graphSpace, graph)) {
            GremlinQuery query = new GremlinQuery(GREMLIN_STATISTICS_VERTEX);
            long vid = executeAsyncTask(client, graphSpace, graph, query);
            query.setContent(GREMLIN_STATISTICS_EDGE);
            long eid = executeAsyncTask(client, graphSpace, graph, query);
            String idPair = String.valueOf(vid) + "-" + String.valueOf(eid);
            String graphKey = getStatisticsKey(graphSpace, graph);
            if (this.graphStatistics.containsKey(graphKey)) {
                Map<String, Object> graphCache =
                        this.graphStatistics.get(graphKey);
                if (graphCache.get(RUNNING_TASKS) != null) {
                    List<String> idPairs =
                            HubbleUtil.uncheckedCast(graphCache.get(RUNNING_TASKS));
                    idPairs.add(idPair);
                    return;
                }
            }
            List<String> idPairs = new ArrayList<>();
            idPairs.add(idPair);
            Map<String, Object> graphCache = new HashMap<>(2);
            graphCache.put(RUNNING_TASKS, idPairs);
            graphCache.put(STATISTICS, GraphStatisticsEntity.emptyEntity());
            this.graphStatistics.put(graphKey, graphCache);
        }
    }

    public GraphStatisticsEntity getLastStatistics(HugeClient client,
                                                   String graphSpace,
                                                   String graph) {
        // used for big graph
        String graphKey = getStatisticsKey(graphSpace, graph);
        if (!this.graphStatistics.containsKey(graphKey)) {
            // check graph statistics for the first time
            return GraphStatisticsEntity.emptyEntity();
        }

        Map<String, Object> graphCache = this.graphStatistics.get(graphKey);
        if (graphCache.get(RUNNING_TASKS) != null) {
            List<String> idPairs =
                    HubbleUtil.uncheckedCast(graphCache.get(RUNNING_TASKS));
            List<Long> idList = new ArrayList<>(idPairs.size() * 2);
            for (String idPair: idPairs) {
                String[] idVE = idPair.split("-");
                idList.add(Long.valueOf(idVE[0]));
                idList.add(Long.valueOf(idVE[1]));
            }
            List<Task> tasks = asyncTaskService.list(client, idList);
            idList.clear();

            Map<String, Task> taskMap = new HashMap<>(tasks.size());
            for (Task task: tasks) {
                taskMap.put(String.valueOf(task.id()), task);
            }

            List<String> removeIds = new ArrayList<>();
            Task lastV = null;
            Task lastE = null;
            boolean init = true;
            for (String idPair: idPairs) {
                String[] idVE = idPair.split("-");
                Task taskV = taskMap.get(idVE[0]);
                Task taskE = taskMap.get(idVE[1]);
                boolean success = taskV.success() && taskE.success();
                if (removable(taskV) || removable(taskE) || success) {
                    removeIds.add(idPair);
                }

                if (success) {
                    // try to find last updated task
                    if (init) {
                        lastV = taskV;
                        lastE = taskE;
                        init = false;
                    }
                    if (lastV.updateTime() <= taskV.updateTime() &&
                        lastE.updateTime() <= taskE.updateTime()) {
                        lastV = taskV;
                        lastE = taskE;
                    }
                }
            }

            idPairs.removeAll(removeIds);
            removeIds.clear();
            taskMap.clear();

            GraphStatisticsEntity result;
            if (!init) {
                result = updateCacheFromTask(client, lastV, lastE);
            } else {
                result = GraphStatisticsEntity.emptyEntity();
            }
            graphCache.put(STATISTICS, result);
            return result;
        } else if (graphCache.get(STATISTICS) != null) {
            return (GraphStatisticsEntity) graphCache.get(STATISTICS);
        } else {
            GraphStatisticsEntity result = GraphStatisticsEntity.emptyEntity();
            graphCache.put(STATISTICS, result);
            return result;
        }
    }

    public static boolean removable(Task task) {
        return task.completed() && !task.success();
    }

    public GraphStatisticsEntity updateCacheFromTask(HugeClient client,
                                                     Task taskV, Task taskE) {
        GraphStatisticsEntity result = new GraphStatisticsEntity();
        taskV = asyncTaskService.get(client,
                                     Integer.valueOf(
                                             String.valueOf(taskV.id())));
        List<Map<String, Object>> results = HubbleUtil.uncheckedCast(
                JsonUtil.fromJson(taskV.result().toString(), List.class));
        result.setVertices(results.get(0));
        result.setVertexCount(getCountFromLabels(results.get(0)));

        taskE = asyncTaskService.get(client,
                                     Integer.valueOf(
                                             String.valueOf(taskE.id())));
        results = HubbleUtil.uncheckedCast(
                JsonUtil.fromJson(taskE.result().toString(), List.class));
        result.setEdges(results.get(0));
        result.setEdgeCount(getCountFromLabels(results.get(0)));
        result.setUpdateTime(HubbleUtil.dateFormat());
        return result;
    }

    public GraphStatisticsEntity postSmallStatistics(HugeClient client,
                                                     String graphSpace,
                                                     String graph) {
        try {
            return this.postSmallGremlinStatistics(client);
        } catch (RuntimeException e) {
            log.warn("Gremlin statistics failed for {}/{}, falling back " +
                     "to bounded graph reads", graphSpace, graph, e);
            return this.postSmallGraphStatistics(client);
        }
    }

    private GraphStatisticsEntity postSmallGremlinStatistics(HugeClient client) {
        ResultSet vertexResult =
                queryService.executeQueryCount(client,
                                               GREMLIN_STATISTICS_VERTEX);
        ResultSet edgeResult =
                queryService.executeQueryCount(client,
                                               GREMLIN_STATISTICS_EDGE);
        Map<String, Object> vertices = extractCountMap(vertexResult,
                                                       "vertices");
        Map<String, Object> edges = extractCountMap(edgeResult, "edges");
        GraphStatisticsEntity result = GraphStatisticsEntity.emptyEntity();
        result.setVertices(vertices);
        result.setVertexCount(getCountFromLabels(vertices));
        result.setEdges(edges);
        result.setEdgeCount(getCountFromLabels(edges));
        result.setUpdateTime(HubbleUtil.dateFormat());
        return result;
    }

    private static Map<String, Object> extractCountMap(ResultSet result,
                                                       String elementType) {
        List<Object> data = HubbleUtil.uncheckedCast(result.data());
        Ex.check(data != null && data.size() == 1 &&
                 data.get(0) instanceof Map,
                 "Malformed %s statistics response", elementType);
        return HubbleUtil.uncheckedCast(data.get(0));
    }

    private GraphStatisticsEntity postSmallGraphStatistics(HugeClient client) {
        Map<String, Object> vertexCounts = new HashMap<>();
        int vertexCount = countSmallElements(
                client.graph().iterateVertices(SMALL_STATISTICS_PAGE_SIZE),
                vertexCounts);
        Map<String, Object> edgeCounts = new HashMap<>();
        int edgeCount = countSmallElements(
                client.graph().iterateEdges(SMALL_STATISTICS_PAGE_SIZE),
                edgeCounts);

        GraphStatisticsEntity result = GraphStatisticsEntity.emptyEntity();
        result.setVertices(vertexCounts);
        result.setVertexCount(String.valueOf(vertexCount));
        result.setEdges(edgeCounts);
        result.setEdgeCount(String.valueOf(edgeCount));
        result.setUpdateTime(HubbleUtil.dateFormat());
        return result;
    }

    private static int countSmallElements(
            Iterator<? extends GraphElement> elements,
            Map<String, Object> counts) {
        int count = 0;
        while (elements.hasNext()) {
            GraphElement element = elements.next();
            count++;
            Ex.check(count <= SMALL_STATISTICS_LIMIT,
                     "Small graph statistics fallback exceeds %s elements",
                     SMALL_STATISTICS_LIMIT);
            incrementLabel(counts, element.label());
        }
        return count;
    }

    private static void incrementLabel(Map<String, Object> counts, String label) {
        Number count = (Number) counts.getOrDefault(label, 0L);
        counts.put(label, Math.addExact(count.longValue(), 1L));
    }

    public String getCountFromLabels(Map<String, Object> labels) {
        long count = 0L;
        for (Map.Entry<String, Object> entry: labels.entrySet()) {
            Object value = entry.getValue();
            Ex.check(value instanceof Number,
                     "Malformed statistics count for label '%s'",
                     entry.getKey());
            Number number = (Number) value;
            long labelCount = number.longValue();
            Ex.check(labelCount >= 0L && number.doubleValue() == labelCount,
                     "Malformed statistics count for label '%s'",
                     entry.getKey());
            count = Math.addExact(count, labelCount);
        }
        return String.valueOf(count);
    }

    public long executeAsyncTask(HugeClient client, String graphSpace,
                                 String graph, GremlinQuery query) {
        this.checkParamsValid(query);

        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.ASYNC_TASK_RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                                     ExecuteType.GREMLIN_ASYNC,
                                     query.getContent(), status,
                                     AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);

        StopWatch timer = StopWatch.createStarted();
        long asyncId = 0L;
        try {
            asyncId = this.queryService.executeGremlinAsyncTask(client, query);
            status = ExecuteStatus.ASYNC_TASK_SUCCESS;
            return asyncId;
        } catch (Throwable e) {
            status = ExecuteStatus.ASYNC_TASK_FAILED;
            // TODO: Persist an async failure reason only after the Server Task
            // DTO exposes a stable, sanitized reason code. Depending on task
            // status alone cannot distinguish submission from execution
            // failures; remove this TODO when that Server capability exists.
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            history.setAsyncId(asyncId);
            this.historyService.update(history);
        }
    }

    private void checkParamsValid(GremlinQuery query) {
        Ex.check(!org.apache.commons.lang3.StringUtils.isEmpty(query.getContent()),
                 "common.param.cannot-be-null-or-empty",
                 "gremlin-query.content");
        GremlinController.checkContentLength(query.getContent());
    }

    public void initBuiltIn(HugeClient client, GraphConnection connection,
                            BuiltInEntity entity) {
        List<String> graphs = client.graphs().listGraph();
        if (entity.initHlm) {
            initHlm(client, graphs.contains(GRAPH_HLM));
        }

        client.assignGraph(Constant.BUILT_IN, null);
        if (entity.initCovid19) {
            connection.setGraph(GRAPH_COVID19);
            initCovid19(client, graphs.contains(GRAPH_COVID19), connection);
        }
    }

    public void initHlm(HugeClient client, boolean exist) {
        if (!exist) {
            this.create(client, "红楼梦", GRAPH_HLM, null);
        } else {
            this.update(client, "红楼梦", GRAPH_HLM);
            this.clearGraph(client, GRAPH_HLM);
        }

        GremlinQuery query = new GremlinQuery(GREMLIN_LOAD_HLM);
        client.assignGraph(Constant.BUILT_IN, GRAPH_HLM);
        this.queryService.executeGremlinQuery(client, query);
    }

    public void initCovid19(HugeClient client, boolean exist,
                            GraphConnection connection) {
        if (!exist) {
            this.create(client, "新冠患者轨迹追溯", GRAPH_COVID19, null);
        } else {
            this.update(client, "新冠患者轨迹追溯", GRAPH_COVID19);
            this.clearGraph(client, GRAPH_COVID19);
        }

        // todo load data
        loadTaskService.startCovid19(connection, Constant.BUILT_IN,
                                     GRAPH_COVID19, client);
    }

    /**
     * 统计指定单个图中的顶点总数和边总数
     */
    public Map<String, Object> evCount(HugeClient client,
                                       String graphSpace,
                                       String graph) {
        Map<String, Object> res = new HashMap<>();
        Long edgeCount = null;
        Long vertexCount = null;
        String statisticDate = HubbleUtil.dateFormatDay(HubbleUtil.nowDate());
        client.assignGraph(graphSpace, graph);
        GraphMetricsAPI.ElementCount statistic =
                client.graph().getEVCount(statisticDate);
        if (statistic == null) {
            statisticDate = HubbleUtil.dateFormatLastDay();
            statistic = client.graph().getEVCount(statisticDate);
        }

        if (statistic != null) {
            vertexCount = statistic.getVertices();
            edgeCount = statistic.getEdges();
        } else {
            statisticDate = null;
            try {
                GraphStatisticsEntity live =
                        this.postSmallGraphStatistics(client);
                vertexCount = Long.valueOf(live.getVertexCount());
                edgeCount = Long.valueOf(live.getEdgeCount());
                statisticDate = HubbleUtil.dateFormatDay(HubbleUtil.nowDate());
            } catch (RuntimeException e) {
                vertexCount = null;
                edgeCount = null;
                statisticDate = null;
                log.warn("Live element counts are unavailable for {}/{}",
                         graphSpace, graph, e);
            }
        }

        res.put("date", statisticDate);
        res.put("vertex", vertexCount);
        res.put("edge", edgeCount);
        return res;
    }
}
