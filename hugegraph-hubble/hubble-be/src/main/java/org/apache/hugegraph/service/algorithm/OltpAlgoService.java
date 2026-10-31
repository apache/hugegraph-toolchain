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

package org.apache.hugegraph.service.algorithm;

// TODO import difference
import org.apache.hugegraph.api.traverser.NeighborRankAPI;
import org.apache.hugegraph.api.traverser.PersonalRankAPI;
//import org.apache.hugegraph.client.api.traverser.PersonalRankAPI;
//import org.apache.hugegraph.client.api.traverser.NeighborRankAPI;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.TraverserManager;
import org.apache.hugegraph.entity.algorithm.AdamicadarEntity;
import org.apache.hugegraph.entity.algorithm.AllShortestPathsEntity;
import org.apache.hugegraph.entity.algorithm.CrossPointsEntity;
import org.apache.hugegraph.entity.algorithm.JaccardSimilarityEntity;
import org.apache.hugegraph.entity.algorithm.KneighborEntity;
import org.apache.hugegraph.entity.algorithm.KoutEntity;
import org.apache.hugegraph.entity.algorithm.PathsEntity;
import org.apache.hugegraph.entity.algorithm.RaysEntity;
import org.apache.hugegraph.entity.algorithm.ResourceallocationEntity;
import org.apache.hugegraph.entity.algorithm.SingleSourceShortestPathEntity;
import org.apache.hugegraph.entity.algorithm.WeightedShortestPathEntity;
import org.apache.hugegraph.entity.query.EgonetView;
import org.apache.hugegraph.entity.query.FusiformsimilarityView;
import org.apache.hugegraph.entity.query.JaccardsimilarityView;
import org.apache.hugegraph.entity.query.RanksView;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.structure.traverser.CrosspointsRequest;
import org.apache.hugegraph.structure.traverser.CustomizedCrosspoints;
import org.apache.hugegraph.structure.traverser.CustomizedPathsRequest;
import org.apache.hugegraph.structure.traverser.Egonet;
import org.apache.hugegraph.structure.traverser.EgonetRequest;
import org.apache.hugegraph.structure.traverser.FusiformSimilarity;
import org.apache.hugegraph.structure.traverser.FusiformSimilarityRequest;
import org.apache.hugegraph.structure.traverser.JaccardSimilarity;
import org.apache.hugegraph.structure.traverser.Kneighbor;
import org.apache.hugegraph.structure.traverser.KneighborRequest;
import org.apache.hugegraph.structure.traverser.Kout;
import org.apache.hugegraph.entity.algorithm.RingsEntity;
import org.apache.hugegraph.entity.algorithm.SameNeighborsEntity;
import org.apache.hugegraph.entity.algorithm.ShortestPathEntity;
import org.apache.hugegraph.entity.enums.AsyncTaskStatus;
import org.apache.hugegraph.entity.enums.ExecuteStatus;
import org.apache.hugegraph.entity.enums.ExecuteType;
import org.apache.hugegraph.entity.query.ExecuteHistory;
import org.apache.hugegraph.entity.query.GraphView;
import org.apache.hugegraph.entity.query.GremlinResult;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.query.ExecuteHistoryService;
import org.apache.hugegraph.structure.constant.Traverser;
import org.apache.hugegraph.structure.graph.Edge;
import org.apache.hugegraph.structure.graph.Path;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.structure.gremlin.Result;
import org.apache.hugegraph.structure.gremlin.ResultSet;
import org.apache.hugegraph.structure.traverser.KoutRequest;
import org.apache.hugegraph.structure.traverser.MultiNodeShortestPathRequest;
import org.apache.hugegraph.structure.traverser.PathOfVertices;
import org.apache.hugegraph.structure.traverser.PathWithMeasure;
import org.apache.hugegraph.structure.traverser.PathsRequest;
import org.apache.hugegraph.structure.traverser.PathsWithVertices;
import org.apache.hugegraph.structure.traverser.Prediction;
import org.apache.hugegraph.structure.traverser.RanksWithMeasure;
import org.apache.hugegraph.structure.traverser.SameNeighbors;
import org.apache.hugegraph.structure.traverser.SameNeighborsBatch;
import org.apache.hugegraph.structure.traverser.SameNeighborsBatchRequest;
import org.apache.hugegraph.structure.traverser.SingleSourceJaccardSimilarityRequest;
import org.apache.hugegraph.structure.traverser.Steps;
import org.apache.hugegraph.structure.traverser.TemplatePathsRequest;
import org.apache.hugegraph.structure.traverser.WeightedPath;
import org.apache.hugegraph.structure.traverser.WeightedPaths;
import org.apache.hugegraph.util.GremlinUtil;
import org.apache.hugegraph.util.HubbleUtil;
import com.google.common.collect.Iterables;
import lombok.extern.log4j.Log4j2;
import org.apache.commons.lang3.StringUtils;
import org.apache.commons.lang3.time.StopWatch;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Log4j2
@Service
public class OltpAlgoService {
    @Autowired
    private HugeConfig config;
    @Autowired
    private ExecuteHistoryService historyService;

    public GremlinResult shortestPath(HugeClient client, ShortestPathEntity body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            TraverserManager traverser = client.traverser();
            PathOfVertices result = traverser.shortestPath(body.getSource(), body.getTarget(),
                    body.getDirection(), body.getLabel(),
                    body.getMaxDepth(), body.getMaxDegree(),
                    body.getSkipDegree(), body.getCapacity());
            GraphView graphView = this.buildPathGraphView(client, result.getPath());
            status = ExecuteStatus.SUCCESS;
            return GremlinResult.builder()
                    .type(GremlinResult.Type.PATH)
                    .graphView(graphView)
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public GremlinResult allShortestPaths(HugeClient client, AllShortestPathsEntity body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            TraverserManager traverser = client.traverser();
            PathWithMeasure result = traverser.allShortestPaths(body.getSource(), body.getTarget(),
                    body.getDirection(), body.getLabel(),
                    body.getMaxDepth(), body.getMaxDegree(),
                    body.getSkipDegree(), body.getCapacity());
            GraphView graphView = this.buildPathGraphView(client, result.getPaths());
            status = ExecuteStatus.SUCCESS;
            return GremlinResult.builder()
                    .type(GremlinResult.Type.PATH)
                    .graphView(graphView)
                    .pathnum(result.getPaths().size())
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public GremlinResult weightedShortestPath(HugeClient client, WeightedShortestPathEntity body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            Map<String, Edge> edges = new HashMap<>();
            Map<Object, Vertex> vertices = new HashMap<>();
            TraverserManager traverser = client.traverser();
            WeightedPath result = traverser.weightedShortestPath(body.getSource(), body.getTarget(),
                    body.getDirection(), body.getLabel(),
                    body.getWeight(), body.getMaxDegree(),
                    body.getSkipDegree(), body.getCapacity(), true, true);

            for (Iterator<Vertex> iter = result.vertices().iterator(); iter.hasNext();) {
                Vertex vertex = iter.next();
                vertices.put(vertex.id(), vertex);
            }
            for (Iterator<Edge> iter = result.edges().iterator(); iter.hasNext();) {
                Edge edge = iter.next();
                edges.put(edge.id(), edge);
            }
            status = ExecuteStatus.SUCCESS;
            return GremlinResult.builder()
                    .type(GremlinResult.Type.PATH)
                    .graphView(new GraphView(vertices.values(), edges.values()))
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public GremlinResult singleSourceShortestPath(HugeClient client,
                                                   SingleSourceShortestPathEntity body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            Map<String, Edge> edges;
            Map<Object, Vertex> vertices = new HashMap<>();
            TraverserManager traverser = client.traverser();
            // TODO edges info set as false, check correctness
            WeightedPaths result = traverser.singleSourceShortestPath(body.getSource(),
                    body.getDirection(), body.getLabel(),
                    body.getWeight(), body.getMaxDegree(),
                    body.getSkipDegree(), body.getCapacity(), body.getLimit(), true,false);

            for (Iterator<Vertex> iter = result.vertices().iterator(); iter.hasNext();) {
                Vertex vertex = iter.next();
                vertices.put(vertex.id(), vertex);
            }
            edges = this.edgesOfVertex(vertices, client);
            status = ExecuteStatus.SUCCESS;
            return GremlinResult.builder()
                    .type(GremlinResult.Type.PATH)
                    .graphView(new GraphView(vertices.values(), edges.values()))
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public GremlinResult multiNodeShortestPath(HugeClient client,
                                               MultiNodeShortestPathRequest body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            Map<String, Edge> edges;
            Map<Object, Vertex> vertices = new HashMap<>();
            TraverserManager traverser = client.traverser();
            body.withVertex = true;
            PathsWithVertices result = traverser.multiNodeShortestPath(body);
            for (Iterator<Vertex> iter = result.vertices().iterator(); iter.hasNext();) {
                Vertex vertex = iter.next();
                vertices.put(vertex.id(), vertex);
            }
            edges = this.edgesOfVertex(vertices, client);
            status = ExecuteStatus.SUCCESS;
            return GremlinResult.builder()
                    .type(GremlinResult.Type.PATH)
                    .graphView(new GraphView(vertices.values(), edges.values()))
                    .pathnum(result.paths().size())
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public GremlinResult rings(HugeClient client, RingsEntity body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            TraverserManager traverser = client.traverser();
            PathWithMeasure result = traverser.rings(body.getSource(),
                    body.getDirection(), body.getLabel(),
                    body.getMaxDepth(), body.isSourceInRing(),
                    body.getMaxDegree(), body.getCapacity(),
                    body.getLimit());
            GraphView graphView = this.buildPathGraphView(client, result.getRings());
            status = ExecuteStatus.SUCCESS;
            return GremlinResult.builder()
                    .type(GremlinResult.Type.PATH)
                    .graphView(graphView)
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public GremlinResult advancedpaths(HugeClient client, PathsRequest body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            Map<String, Edge> edges;
            Map<Object, Vertex> vertices = new HashMap<>();
            TraverserManager traverser = client.traverser();
            body.withVertex = true;
            PathsWithVertices result = traverser.paths(body);
            for (Iterator<Vertex> iter = result.vertices().iterator(); iter.hasNext();) {
                Vertex vertex = iter.next();
                vertices.put(vertex.id(), vertex);
            }
            edges = this.edgesOfVertex(vertices, client);
            status = ExecuteStatus.SUCCESS;
            return GremlinResult.builder()
                    .type(GremlinResult.Type.PATH)
                    .graphView(new GraphView(vertices.values(), edges.values()))
                    .pathnum(result.paths().size())
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public GremlinResult paths(HugeClient client, PathsEntity body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            Map<String, Edge> edges;
            Map<Object, Vertex> vertices = new HashMap<>();
            TraverserManager traverser = client.traverser();
            PathWithMeasure result = traverser.paths(body.getSource(),
                    body.getTarget(), body.getDirection(), body.getLabel(),
                    body.getMaxDepth(), body.getMaxDegree(), body.getCapacity(),
                    body.getLimit());
            GraphView graphView = this.buildPathGraphView(client, result.getPaths());
            status = ExecuteStatus.SUCCESS;
            return GremlinResult.builder()
                    .type(GremlinResult.Type.PATH)
                    .graphView(graphView)
                    .pathnum(result.getPaths().size())
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public GremlinResult sameNeighbors(HugeClient client, SameNeighborsEntity body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            Map<String, Edge> edges;
            Map<Object, Vertex> vertices = new HashMap<>();
            TraverserManager traverser = client.traverser();
            SameNeighbors result = traverser.sameNeighbors(body.getVertex(),
                    body.getOther(), body.getDirection(), body.getLabel(),
                    body.getMaxDegree(), body.getLimit());
            List<Object> resultVertices = result.getSameNeighbors();
            resultVertices.add(body.getVertex());
            resultVertices.add(body.getOther());
            List<String> escapedIds = resultVertices.stream()
                    .map(GremlinUtil::escapeId).collect(Collectors.toList());
            String ids = StringUtils.join(escapedIds, ",");
            String gremlin = String.format("g.V(%s).limit(1000)", ids);
            ResultSet resultSet = client.gremlin().gremlin(gremlin).execute();
            for (Iterator<Result> iter = resultSet.iterator(); iter.hasNext(); ) {
                Vertex vertex = iter.next().getVertex();
                vertices.put(vertex.id(), vertex);
            }
            edges = this.edgesOfVertex(vertices, client);
            status = ExecuteStatus.SUCCESS;
            return GremlinResult.builder()
                    .type(GremlinResult.Type.PATH)
                    .graphView(new GraphView(vertices.values(), edges.values()))
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public GremlinResult kout(HugeClient client, KoutEntity body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            TraverserManager traverser = client.traverser();
            KoutRequest.Builder builder = KoutRequest.builder();
            Steps.StepEntity stepEntity = new Steps.StepEntity(body.getLabel());
            builder.source(body.getSource()).maxDepth(body.getMaxDepth()).
                    nearest(body.isNearest()).capacity(body.getCapacity()).limit(body.getLimit()).
                    withPath(true).withVertex(true).withEdge(true).
                    steps().direction(body.getDirection()).degree(body.getMaxDegree())
                   .skipDegree(body.getMaxDegree()).edgeSteps(stepEntity);
            KoutRequest request = builder.build();
            request.traverseMode = koutTraverseMode(body.getAlgorithm());
            Kout result = traverser.kout(request);
            Map<String, Edge> edges = new HashMap<>();
            for (Iterator<Edge> iter = result.edges().iterator(); iter.hasNext();) {
                Edge edge = iter.next();
                edges.put(edge.id(), edge);
            }
            status = ExecuteStatus.SUCCESS;
            return GremlinResult.builder()
                    .type(GremlinResult.Type.PATH)
                    .graphView(new GraphView(
                            this.verticesOfEdge(edges, client).values(),
                            result.edges()))
                    .pathnum(result.paths().size())
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public GremlinResult koutPost(HugeClient client, KoutRequest body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            TraverserManager traverser = client.traverser();
            body.traverseMode = koutTraverseMode(body.traverseMode);
            body.withVertex = true;
            body.withPath = true;
            body.withEdge = true;
            body.countOnly = false;
            Kout result = traverser.kout(body);
            Map<String, Edge> edges = new HashMap<>();
            for (Iterator<Edge> iter = result.edges().iterator(); iter.hasNext();) {
                Edge edge = iter.next();
                edges.put(edge.id(), edge);
            }
            status = ExecuteStatus.SUCCESS;
            return GremlinResult.builder()
                    .type(GremlinResult.Type.PATH)
                    .graphView(new GraphView(
                            this.verticesOfEdge(edges, client).values(),
                            result.edges()))
                    .pathnum(result.paths().size())
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    private static String koutTraverseMode(String algorithm) {
        if (algorithm == null || algorithm.isEmpty() ||
            "breadth_first".equalsIgnoreCase(algorithm) ||
            Traverser.TRAVERSE_MODE_BFS.equalsIgnoreCase(algorithm)) {
            return Traverser.TRAVERSE_MODE_BFS;
        }
        if ("deep_first".equalsIgnoreCase(algorithm) ||
            Traverser.TRAVERSE_MODE_DFS.equalsIgnoreCase(algorithm)) {
            return Traverser.TRAVERSE_MODE_DFS;
        }
        throw new ExternalException("Unsupported K-out traversal mode");
    }

    public GremlinResult kneighbor(HugeClient client, KneighborEntity body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            TraverserManager traverser = client.traverser();
            KneighborRequest.Builder builder = KneighborRequest.builder();
            Steps.StepEntity stepEntity = new Steps.StepEntity(body.getLabel());
            builder.source(body.getSource()).maxDepth(body.getMaxDepth()).
                    limit(body.getLimit()).
                    withPath(true).withVertex(true).withEdge(true).
                    steps().direction(body.getDirection()).degree(body.getMaxDegree())
                    .edgeSteps(stepEntity);
            Kneighbor result = traverser.kneighbor(builder.build());
            status = ExecuteStatus.SUCCESS;
            return GremlinResult.builder()
                    .type(GremlinResult.Type.PATH)
                    .graphView(new GraphView(result.vertices(), result.edges()))
                    .pathnum(result.paths().size())
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public GremlinResult kneighborPost(HugeClient client, KneighborRequest body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            TraverserManager traverser = client.traverser();
            body.withVertex = true;
            body.withEdge = true;
            body.withPath = true;
            body.countOnly = false;
            Kneighbor result = traverser.kneighbor(body);
            status = ExecuteStatus.SUCCESS;
            return GremlinResult.builder()
                    .type(GremlinResult.Type.PATH)
                    .graphView(new GraphView(result.vertices(), result.edges()))
                    .pathnum(result.paths().size())
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public JaccardsimilarityView jaccardSimilarity(HugeClient client,
                                                   JaccardSimilarityEntity body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            TraverserManager traverser = client.traverser();
            JaccardSimilarity result = traverser.jaccardSimilarity(
                    body.getVertex(), body.getOther(),
                    body.getDirection(), body.getLabel(), body.getMaxDegree());
            status = ExecuteStatus.SUCCESS;
            return JaccardsimilarityView.builder()
                    .jaccardsimilarity(result.getJaccardSimilarity())
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public JaccardsimilarityView jaccardSimilarityPost(HugeClient client,
                                                       SingleSourceJaccardSimilarityRequest body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            TraverserManager traverser = client.traverser();
            JaccardSimilarity result = traverser.jaccardSimilarity(body);
            status = ExecuteStatus.SUCCESS;
            return JaccardsimilarityView.builder()
                    .jaccardsimilarity(result.getJaccardSimilarity())
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public RanksView personalRank(HugeClient client, PersonalRankAPI.Request body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            TraverserManager traverser = client.traverser();
            RanksWithMeasure result = traverser.personalRank(body);
            status = ExecuteStatus.SUCCESS;
            return RanksView.builder()
                    .ranks(result.personalRanks())
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public RanksView neighborRank(HugeClient client, NeighborRankAPI.Request body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            TraverserManager traverser = client.traverser();
            RanksWithMeasure result = traverser.neighborRank(body);
            status = ExecuteStatus.SUCCESS;
            return RanksView.builder()
                    .ranksList(result.ranks())
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public GremlinResult customizedPaths(HugeClient client, CustomizedPathsRequest body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            Map<String, Edge> edges;
            Map<Object, Vertex> vertices = new HashMap<>();
            TraverserManager traverser = client.traverser();
            body.withVertex = true;
            PathsWithVertices result = traverser.customizedPaths(body);
            for (Iterator<Vertex> iter = result.vertices().iterator(); iter.hasNext();) {
                Vertex vertex = iter.next();
                vertices.put(vertex.id(), vertex);
            }
            edges = this.edgesOfVertex(vertices, client);
            status = ExecuteStatus.SUCCESS;
            return GremlinResult.builder()
                    .type(GremlinResult.Type.PATH)
                    .graphView(new GraphView(vertices.values(), edges.values()))
                    .pathnum(result.paths().size())
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public GremlinResult templatePaths(HugeClient client, TemplatePathsRequest body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            Map<String, Edge> edges;
            Map<Object, Vertex> vertices = new HashMap<>();
            TraverserManager traverser = client.traverser();
            body.withVertex = true;
            PathsWithVertices result = traverser.count(body);
            for (Iterator<Vertex> iter = result.vertices().iterator(); iter.hasNext();) {
                Vertex vertex = iter.next();
                vertices.put(vertex.id(), vertex);
            }
            edges = this.edgesOfVertex(vertices, client);
            status = ExecuteStatus.SUCCESS;
            return GremlinResult.builder()
                    .type(GremlinResult.Type.PATH)
                    .graphView(new GraphView(vertices.values(), edges.values()))
                    .pathnum(result.paths().size())
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public GremlinResult crosspoints(HugeClient client, CrossPointsEntity body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            TraverserManager traverser = client.traverser();
            PathWithMeasure result = traverser.crosspoint(body.getSource(),
                    body.getTarget(), body.getDirection(), body.getLabel(),
                    body.getMaxDepth(), body.getMaxDegree(), body.getCapacity(),
                    body.getLimit());
            Map<Object, Vertex> vertices = new HashMap<>();
            Map<Object, Edge> edges = new HashMap<>();
            List<Object> elements = new ArrayList<Object>();
            for (Path crosspoints : result.getCrosspoints()) {
                elements.add(crosspoints.crosspoint());
            }
            List<String> escapedIds = elements.stream()
                    .map(GremlinUtil::escapeId)
                    .collect(Collectors.toList());
            String ids = StringUtils.join(escapedIds, ",");
            GraphView graphView = new GraphView(vertices.values(), edges.values());
            if (!ids.isEmpty()) {
                String gremlin = String.format("g.V(%s).limit(1000)", ids);
                ResultSet resultSet = client.gremlin().gremlin(gremlin).execute();
                for (Iterator<Result> iter = resultSet.iterator(); iter.hasNext();) {
                    Vertex vertex = iter.next().getVertex();
                    vertices.put(vertex.id(), vertex);
                }
                graphView = new GraphView(vertices.values(), edges.values());
            }
            status = ExecuteStatus.SUCCESS;
            return GremlinResult.builder()
                    .type(GremlinResult.Type.PATH)
                    .graphView(graphView)
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public GremlinResult customizedcrosspoints(HugeClient client, CrosspointsRequest body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            Map<String, Edge> edges;
            Map<Object, Vertex> vertices = new HashMap<>();
            TraverserManager traverser = client.traverser();
            body.withVertex = true;
            body.withPath = true;
            CustomizedCrosspoints result = traverser.customizedCrosspointss(body);
            for (Iterator<Vertex> iter = result.vertices().iterator(); iter.hasNext();) {
                Vertex vertex = iter.next();
                vertices.put(vertex.id(), vertex);
            }
            edges = this.edgesOfVertex(vertices, client);
            status = ExecuteStatus.SUCCESS;
            return GremlinResult.builder()
                    .type(GremlinResult.Type.PATH)
                    .graphView(new GraphView(vertices.values(), edges.values()))
                    .pathnum(result.paths().size())
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public GremlinResult rays(HugeClient client, RaysEntity body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            TraverserManager traverser = client.traverser();
            PathWithMeasure result = traverser.rays(body.getSource(),
                    body.getDirection(), body.getLabel(),
                    body.getMaxDepth(), body.getMaxDegree(), body.getCapacity(),
                    body.getLimit());
            GraphView graphView = this.buildPathGraphView(client, result.getRays());
            status = ExecuteStatus.SUCCESS;
            return GremlinResult.builder()
                    .type(GremlinResult.Type.PATH)
                    .graphView(graphView)
                    .pathnum(result.getRays().size())
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public FusiformsimilarityView fusiformsimilarity(
            HugeClient client, FusiformSimilarityRequest body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            Map<String, Edge> edges;
            Map<Object, Vertex> vertices = new HashMap<>();
            TraverserManager traverser = client.traverser();
            body.withVertex = true;
            FusiformSimilarity result = traverser.fusiformSimilarity(body);
            for (Iterator<Vertex> iter = result.vertices().iterator(); iter.hasNext();) {
                Vertex vertex = iter.next();
                vertices.put(vertex.id(), vertex);
            }
            edges = this.edgesOfVertex(vertices, client);
            status = ExecuteStatus.SUCCESS;
            return FusiformsimilarityView.builder()
                    .graphView(new GraphView(vertices.values(), edges.values()))
                    .similarsMap(result.similarsMap())
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public Map<String, Double> adamicadar(HugeClient client, AdamicadarEntity body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            TraverserManager traverser = client.traverser();
            Prediction result = traverser.adamicadar(body.getVertex(), body.getOther(),
                    body.getDirection(), body.getLabel(),
                    body.getMaxDegree());
            status = ExecuteStatus.SUCCESS;
            Map<String, Double> resultMap = new HashMap<>();
            resultMap.put("adamic_adar", result.getAdamicAdar());
            return resultMap;
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public Map<String, Double> resourceallocation(HugeClient client,
                                                   ResourceallocationEntity body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            TraverserManager traverser = client.traverser();
            Prediction result = traverser.resourceAllocation(body.getVertex(), body.getOther(),
                    body.getDirection(), body.getLabel(),
                    body.getMaxDegree());
            status = ExecuteStatus.SUCCESS;
            Map<String, Double> resultMap = new HashMap<>();
            resultMap.put("resource_allocation", result.getResourceAllocation());
            return resultMap;
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    public GremlinResult sameneighborsbatch(HugeClient client, SameNeighborsBatchRequest body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            TraverserManager traverser = client.traverser();
            SameNeighborsBatch result = traverser.sameNeighbors(body);
            Map<String, Edge> edges = new HashMap<>();
            Map<Object, Vertex> vertices = new HashMap<>();
            List<List<Object>> elementlist = result.sameNeighbors;
            for (List<Object> elements : elementlist) {
                List<String> escapedIds = elements.stream()
                        .map(GremlinUtil::escapeId)
                        .collect(Collectors.toList());
                String ids = StringUtils.join(escapedIds, ",");
                if (!ids.isEmpty()) {
                    String gremlin = String.format("g.V(%s).limit(1000)", ids);
                    ResultSet resultSet = client.gremlin().gremlin(gremlin).execute();
                    for (Iterator<Result> iter = resultSet.iterator(); iter.hasNext(); ) {
                        Vertex vertex = iter.next().getVertex();
                        vertices.put(vertex.id(), vertex);
                    }
                    edges.putAll(this.edgesOfVertex(vertices, client));
                }
            }
            status = ExecuteStatus.SUCCESS;
            return GremlinResult.builder()
                    .type(GremlinResult.Type.PATH)
                    .graphView(new GraphView(vertices.values(), edges.values()))
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    private GraphView buildPathGraphView(HugeClient client, List<Path> results) {
        Map<String, Edge> edges = new HashMap<>();
        Map<Object, Vertex> vertices = new HashMap<>();
        for (Path result : results) {
            this.fillPathGraph(client, result, vertices, edges);
        }

        return new GraphView(vertices.values(), edges.values());
    }

    public EgonetView egonet(HugeClient client, EgonetRequest body) {
        String graphSpace = client.getGraphSpaceName();
        String graph = client.getGraphName();
        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.ALGORITHM,
                body.toString(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);
        StopWatch timer = StopWatch.createStarted();
        try {
            Map<String, Edge> edges;
            Map<Object, Vertex> vertices = new HashMap<>();
            TraverserManager traverser = client.traverser();
            body.withVertex = true;
            body.countOnly = false;
            Egonet result = traverser.egonet(body);
            for (Iterator<Vertex> iter = result.vertices().iterator(); iter.hasNext();) {
                Vertex vertex = iter.next();
                vertices.put(vertex.id(), vertex);
            }
            edges = this.edgesOfVertex(vertices, client);
            status = ExecuteStatus.SUCCESS;
            return EgonetView.builder()
                    .graphView(new GraphView(vertices.values(), edges.values()))
                    .ids(result.ids())
                    .build();
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    private GraphView buildPathGraphView(HugeClient client, Path result) {
        Map<String, Edge> edges = new HashMap<>();
        Map<Object, Vertex> vertices = new HashMap<>(result.size());
        this.fillPathGraph(client, result, vertices, edges);
        return new GraphView(vertices.values(), edges.values());
    }

    private void fillPathGraph(HugeClient client, Path result,
                               Map<Object, Vertex> vertices,
                               Map<String, Edge> edges) {
        Set<Object> vertexIds = new LinkedHashSet<>();
        List<Edge> pathEdges = new ArrayList<>();
        for (Object element : result.objects()) {
            if (element instanceof Vertex) {
                Vertex vertex = (Vertex) element;
                vertices.put(vertex.id(), vertex);
            } else if (element instanceof Edge) {
                Edge edge = (Edge) element;
                edges.put(edge.id(), edge);
                pathEdges.add(edge);
            } else {
                this.addAbsentVertexId(element, vertices, vertexIds);
            }
        }
        for (Edge edge : pathEdges) {
            this.addAbsentVertexId(edge.sourceId(), vertices, vertexIds);
            this.addAbsentVertexId(edge.targetId(), vertices, vertexIds);
        }
        if (vertexIds.isEmpty()) {
            return;
        }
        List<String> escapedIds = vertexIds.stream()
                                           .map(GremlinUtil::escapeId)
                                           .collect(Collectors.toList());
        String ids = StringUtils.join(escapedIds, ",");
        if (ids.isEmpty()) {
            return;
        }
        String gremlin = String.format("g.V(%s).limit(1000)", ids);
        ResultSet resultSet = client.gremlin().gremlin(gremlin).execute();
        for (Iterator<Result> iter = resultSet.iterator(); iter.hasNext();) {
            Vertex vertex = iter.next().getVertex();
            vertices.put(vertex.id(), vertex);
        }
        if (pathEdges.isEmpty()) {
            edges.putAll(this.edgesOfVertex(vertices, client));
        }
    }

    private void addAbsentVertexId(Object vertexId, Map<Object, Vertex> vertices,
                                   Set<Object> vertexIds) {
        if (vertexId == null) {
            return;
        }
        if (!vertices.containsKey(vertexId)) {
            vertexIds.add(vertexId);
        }
    }

    private Map<String, Edge> edgesOfVertex(Map<Object, Vertex> vertices,
                                            HugeClient client) {
        int batchSize = this.config.get(HubbleOptions.GREMLIN_BATCH_QUERY_IDS);
        int edgeLimit = this.config.get(HubbleOptions.GREMLIN_EDGES_TOTAL_LIMIT);
        int degreeLimit = this.config.get(HubbleOptions.GREMLIN_VERTEX_DEGREE_LIMIT);

        Set<Object> vertexIds = vertices.keySet();
        Map<String, Edge> edges = new HashMap<>(vertexIds.size());
        Iterables.partition(vertexIds, batchSize).forEach(batch -> {
            List<String> escapedIds = batch.stream()
                    .map(GremlinUtil::escapeId)
                    .collect(Collectors.toList());
            String ids = StringUtils.join(escapedIds, ",");
            // Any better way to find two vertices has linked?
            String gremlin;
            gremlin = String.format("g.V(%s).bothE().local(limit(%s)).dedup()",
                    ids, degreeLimit);
            ResultSet resultSet = client.gremlin().gremlin(gremlin).execute();
            // The edges count for per vertex
            Map<Object, Integer> degrees = new HashMap<>(resultSet.size());
            for (Iterator<Result> iter = resultSet.iterator(); iter.hasNext();) {
                Edge edge = iter.next().getEdge();
                Object source = edge.sourceId();
                Object target = edge.targetId();
                // only add the interconnected edges of the found vertices
                if (!vertexIds.contains(source) || !vertexIds.contains(target)) {
                    continue;
                }
                edges.put(edge.id(), edge);
                if (edges.size() >= edgeLimit) {
                    break;
                }

                int deg = degrees.compute(source, (k, v) -> v == null ? 1 : v + 1);
                if (deg >= degreeLimit) {
                    break;
                }
                deg = degrees.compute(target, (k, v) -> v == null ? 1 : v + 1);
                if (deg >= degreeLimit) {
                    break;
                }
            }
        });
        return edges;
    }

    private Map<Object, Vertex> verticesOfEdge(Map<String, Edge> edges,
                                               HugeClient client) {
        int batchSize = this.config.get(HubbleOptions.GREMLIN_BATCH_QUERY_IDS);

        Set<Object> vertexIds = new HashSet<>(edges.size() * 2);
        edges.values().forEach(edge -> {
            vertexIds.add(edge.sourceId());
            vertexIds.add(edge.targetId());
        });

        Map<Object, Vertex> vertices = new HashMap<>(vertexIds.size());
        Iterables.partition(vertexIds, batchSize).forEach(batch -> {
            List<String> escapedIds = batch.stream()
                    .map(GremlinUtil::escapeId)
                    .collect(Collectors.toList());
            String ids = StringUtils.join(escapedIds, ",");
            String gremlin = String.format("g.V(%s)", ids);
            ResultSet resultSet = client.gremlin().gremlin(gremlin).execute();
            for (Iterator<Result> iter = resultSet.iterator(); iter.hasNext();) {
                Vertex vertex = iter.next().getVertex();
                vertices.put(vertex.id(), vertex);
            }
        });
        return vertices;
    }
}
