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

package org.apache.hugegraph.loader;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.apache.commons.collections.CollectionUtils;
import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.loader.progress.InputProgress;
import org.apache.hugegraph.loader.task.GlobalExecutorManager;
import org.apache.hugegraph.loader.task.ParseTaskBuilder;
import org.apache.hugegraph.loader.task.ParseTaskBuilder.ParseTask;
import org.apache.hugegraph.loader.task.TaskManager;
import org.apache.hugegraph.loader.util.HugeClientHolder;
import org.apache.hugegraph.loader.util.LoadUtil;
import org.apache.hugegraph.structure.schema.SchemaLabel;
import org.apache.hugegraph.util.ExecutorUtil;
import org.apache.hugegraph.loader.util.Printer;
import org.apache.hugegraph.structure.schema.EdgeLabel;
import org.apache.hugegraph.structure.schema.IndexLabel;
import org.apache.hugegraph.structure.schema.VertexLabel;
import org.slf4j.Logger;

import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.loader.builder.Record;
import org.apache.hugegraph.loader.constant.Constants;
import org.apache.hugegraph.loader.constant.ElemType;
import org.apache.hugegraph.loader.exception.InitException;
import org.apache.hugegraph.loader.exception.LoadException;
import org.apache.hugegraph.loader.exception.ReadException;
import org.apache.hugegraph.loader.executor.GroovyExecutor;
import org.apache.hugegraph.loader.executor.LoadContext;
import org.apache.hugegraph.loader.executor.LoadOptions;
import org.apache.hugegraph.loader.filter.util.SchemaManagerProxy;
import org.apache.hugegraph.loader.filter.util.ShortIdConfig;
import org.apache.hugegraph.loader.mapping.ElementMapping;
import org.apache.hugegraph.loader.mapping.InputStruct;
import org.apache.hugegraph.loader.mapping.LoadMapping;
import org.apache.hugegraph.loader.metrics.LoadMetrics;
import org.apache.hugegraph.loader.metrics.LoadSummary;
import org.apache.hugegraph.loader.reader.InputReader;
import org.apache.hugegraph.loader.reader.line.Line;
import org.apache.hugegraph.loader.source.InputSource;
import org.apache.hugegraph.loader.source.SourceType;
import org.apache.hugegraph.loader.source.graph.GraphSource;
import org.apache.hugegraph.structure.constant.HugeType;
import org.apache.hugegraph.structure.schema.PropertyKey;
import org.apache.hugegraph.util.Log;
import org.apache.hugegraph.util.JsonUtil;

import com.google.common.collect.ImmutableList;

public final class HugeGraphLoader {

    public static final Logger LOG = Log.logger(HugeGraphLoader.class);

    private final LoadContext context;
    private final LoadMapping mapping;
    private final TaskManager manager;
    private final LoadOptions options;
    private final Thread shutdownHook;
    private volatile boolean loadStarted;
    private final boolean saveProgress;

    public static class InputTaskItem {

        public final InputReader reader;
        public final InputStruct struct;
        public final int structIndex;
        public final int seqNumber;

        public InputTaskItem(InputStruct struct, InputReader reader,
                             int structIndex, int seq) {
            this.struct = struct;
            this.reader = reader;
            this.structIndex = structIndex;
            this.seqNumber = seq;
        }
    }

    public static void main(String[] args) {
        HugeGraphLoader loader;
        try {
            loader = new HugeGraphLoader(args);
        } catch (Throwable e) {
            Printer.printError("Failed to start loading", e);
            System.exit(1);
            return;
        }

        boolean success = false;
        try {
            success = loader.load();
        } finally {
            try {
                loader.shutdown();
            } finally {
                GlobalExecutorManager.shutdown(loader.options.shutdownTimeout);
            }
        }
        if (!success) {
            System.exit(1);
        }
    }

    public HugeGraphLoader(String[] args) {
        this(LoadOptions.parseOptions(args));
    }

    public HugeGraphLoader(LoadOptions options) {
        this(options, true);
    }

    /** Embedded callers may close resources without persisting parsed offsets. */
    public HugeGraphLoader(LoadOptions options, boolean saveProgress) {
        this(options, LoadMapping.of(options.file), saveProgress);
        // Set concurrency
        GlobalExecutorManager.setBatchThreadCount(options.batchInsertThreads);
        GlobalExecutorManager.setSingleThreadCount(options.singleInsertThreads);
    }

    public HugeGraphLoader(LoadOptions options, LoadMapping mapping) {
        this(options, mapping, true);
    }

    public HugeGraphLoader(LoadOptions options, LoadMapping mapping, boolean saveProgress) {
        this.saveProgress = saveProgress;
        this.context = new LoadContext(options);
        this.options = options;
        this.mapping = mapping;
        this.manager = new TaskManager(this.context);
        this.shutdownHook = new Thread(() -> {
            LOG.info("Shutdown hook was triggered");
            this.stopThenShutdown();
        });
        Runtime.getRuntime().addShutdownHook(this.shutdownHook);
    }

    public LoadContext context() {
        return this.context;
    }

    private void checkGraphExists() {
        HugeClient client = this.context.indirectClient();
        String targetGraph = this.options.graph;
        if (this.options.createGraph &&
            !client.graphs().listGraph().contains(targetGraph)) {
            Map<String, String> conf = new HashMap<>();
            conf.put("store", targetGraph);
            conf.put("backend", this.options.backend);
            conf.put("serializer", this.options.serializer);
            conf.put("task.scheduler_type", this.options.schedulerType);
            conf.put("nickname", targetGraph);

            client.graphs().createGraph(targetGraph, JsonUtil.toJson(conf));
            LOG.info("Create graph " + targetGraph + " ......");
        }
    }

    private void setGraphMode() {
        // Set graph mode
        // If there is a Graph data source, all Inputs must be Graph data sources
        Supplier<Stream<InputSource>> inputsSupplier =
                () -> this.mapping.structs().stream().filter(struct -> !struct.skip())
                                  .map(InputStruct::input);

        boolean allMatch = inputsSupplier.get().allMatch(input ->
                           SourceType.GRAPH.equals(input.type()));
        boolean anyMatch = inputsSupplier.get().anyMatch(input ->
                           SourceType.GRAPH.equals(input.type()));

        if (anyMatch && !allMatch) {
            throw new LoadException("All inputs must be of Graph Type");
        }

        if (allMatch || this.options.restore) {
            this.context().setRestoreMode();
        } else {
            this.context().setLoadingMode();
        }
    }

    public boolean load() {
        this.loadStarted = true;
        this.options.dumpParams();

        try {
            // check graph exists
            this.checkGraphExists();
            // set GraphMode
            this.setGraphMode();
            // Clear schema if needed
            this.clearAllDataIfNeeded();
            // Create schema
            this.createSchema();
            this.loadInputs();
            // Print load summary
            Printer.printSummary(this.context);
        } catch (Throwable t) {
            this.context.failLoading(t);

            if (t instanceof ServerException e) {
                String logMessage =
                        "Log ServerException: \n" + e.exception() + "\n";
                if (e.trace() != null) {
                    logMessage += StringUtils.join((List<String>) e.trace(),
                                                   "\n");
                }
                LOG.warn(logMessage);
            }

            throw LoadUtil.targetRuntimeException(t);
        }

        return this.context.noError();
    }

    public void shutdown() {
        this.stopThenShutdown();
    }

    private void clearAllDataIfNeeded() {
        if (!options.clearAllData) {
            return;
        }

        int requestTimeout = options.timeout;
        options.timeout = options.clearTimeout;
        HugeClient client = HugeClientHolder.create(options);

        try {
            LOG.info("Prepare to clear the data of graph '{}'", options.graph);
            client.graphs().clearGraph(options.graph, "I'm sure to delete all data");
            LOG.info("The graph '{}' has been cleared successfully",
                     options.graph);
        } catch (Exception e) {
            LOG.error("Failed to clear data for graph '{}': {}", options.graph, e.getMessage(), e);
            throw e;
        } finally {
            options.timeout = requestTimeout;
        }
    }

    private void createSchema() {
        if (!StringUtils.isEmpty(options.schema)) {
            File file = FileUtils.getFile(options.schema);
            HugeClient client = this.context.client();
            GroovyExecutor groovyExecutor = new GroovyExecutor();
            if (!options.shorterIDConfigs.isEmpty()) {
                SchemaManagerProxy.proxy(client, options);
            }
            groovyExecutor.bind(Constants.GROOVY_SCHEMA, client.schema());
            String script;
            try {
                script = FileUtils.readFileToString(file, Constants.CHARSET);
            } catch (IOException e) {
                throw new LoadException("Failed to read schema file '%s'", e,
                                        options.schema);
            }

            if (!options.shorterIDConfigs.isEmpty()) {
                for (ShortIdConfig config : options.shorterIDConfigs) {
                    PropertyKey propertyKey = client.schema().propertyKey(config.getIdFieldName())
                                                    .ifNotExist()
                                                    .dataType(config.getIdFieldType())
                                                    .build();
                    client.schema().addPropertyKey(propertyKey);
                }
                groovyExecutor.execute(script, client);
                List<VertexLabel> vertexLabels = client.schema().getVertexLabels();
                for (VertexLabel vertexLabel : vertexLabels) {
                    ShortIdConfig config;
                    if ((config = options.getShortIdConfig(vertexLabel.name())) != null) {
                        config.setLabelID(vertexLabel.id());
                        IndexLabel indexLabel = client.schema()
                                                      .indexLabel(config.getVertexLabel() + "By" +
                                                                  config.getIdFieldName())
                                                      .onV(config.getVertexLabel())
                                                      .by(config.getIdFieldName())
                                                      .secondary()
                                                      .ifNotExist()
                                                      .build();
                        client.schema().addIndexLabel(indexLabel);
                    }
                }
            } else {
                groovyExecutor.execute(script, client);
            }
        }

        // create schema for Graph Source
        List<InputStruct> structs = this.mapping.structs();
        for (InputStruct struct : structs) {
            if (SourceType.GRAPH.equals(struct.input().type())) {
                GraphSource graphSouce = (GraphSource) struct.input();
                if (StringUtils.isEmpty(graphSouce.getPdPeers())) {
                    graphSouce.setPdPeers(this.options.pdPeers);
                }
                if (StringUtils.isEmpty(graphSouce.getMetaEndPoints())) {
                    graphSouce.setMetaEndPoints(this.options.metaEndPoints);
                }
                if (StringUtils.isEmpty(graphSouce.getCluster())) {
                    graphSouce.setCluster(this.options.cluster);
                }
                if (StringUtils.isEmpty(graphSouce.getUsername())) {
                    graphSouce.setUsername(this.options.username);
                }
                if (StringUtils.isEmpty(graphSouce.getPassword())) {
                    graphSouce.setPassword(this.options.password);
                }

                GraphSource graphSource = (GraphSource) struct.input();
                createGraphSourceSchema(graphSource);
            }
        }

        this.context.updateSchemaCache();
    }

    /**
     * create schema like graphdb when source is graphdb;
     *
     * @param graphSource
     */
    private void createGraphSourceSchema(GraphSource graphSource) {
        try (HugeClient sourceClient = graphSource.createHugeClient();
             HugeClient client = HugeClientHolder.create(this.options, false)) {
            createGraphSourceVertexLabel(sourceClient, client, graphSource);
            createGraphSourceEdgeLabel(sourceClient, client, graphSource);
            createGraphSourceIndexLabel(sourceClient, client, graphSource);
        } catch (Exception e) {
            LOG.error("Failed to create graph source schema for {}: {}",
                      graphSource.getGraph(), e.getMessage(), e);
            throw new LoadException("Schema creation failed", e);
        }
    }

    // handles labels (can be used for both VertexLabel and EdgeLabel)
    private void createGraphSourceLabels(
            HugeClient sourceClient,
            HugeClient targetClient,
            List<? extends SchemaLabel> labels, // VertexLabel or EdgeLabel
            Map<String, GraphSource.SelectedLabelDes> selectedMap,
            Map<String, GraphSource.IgnoredLabelDes> ignoredMap,
            boolean isVertex) {

        for (SchemaLabel label : labels) {
            if (ignoredMap.containsKey(label.name())) {
                GraphSource.IgnoredLabelDes des
                        = ignoredMap.get(label.name());

                if (des.getProperties() != null) {
                    des.getProperties()
                        .forEach((p) -> label.properties().remove(p));
                }
            }

            Set<String> existedPKs =
                    targetClient.schema().getPropertyKeys().stream()
                                .map(pk -> pk.name()).collect(Collectors.toSet());

            for (String pkName : label.properties()) {
                PropertyKey pk = sourceClient.schema()
                                             .getPropertyKey(pkName);
                if (!existedPKs.contains(pk.name())) {
                    targetClient.schema().addPropertyKey(pk);
                }
            }

            if (isVertex) {
                if (!(label instanceof VertexLabel)) {
                    throw new IllegalArgumentException("Expected VertexLabel but got " +
                                                       label.getClass());
                }
                targetClient.schema().addVertexLabel((VertexLabel) label);
            } else {
                if (!(label instanceof EdgeLabel)) {
                    throw new IllegalArgumentException("Expected EdgeLabel but got " +
                                                       label.getClass());
                }
                targetClient.schema().addEdgeLabel((EdgeLabel) label);
            }
        }
    }

    private void createGraphSourceVertexLabel(HugeClient sourceClient,
                                              HugeClient targetClient,
                                              GraphSource graphSource) {

        sourceClient.assignGraph(graphSource.getGraphSpace(),
                                 graphSource.getGraph());

        // Create Vertex Schema
        List<VertexLabel> vertexLabels = new ArrayList<>();
        if (graphSource.getSelectedVertices() != null) {
            List<String> selectedVertexLabels =
                    graphSource.getSelectedVertices()
                               .stream().map((des) -> des.getLabel())
                               .collect(Collectors.toList());

            if (!CollectionUtils.isEmpty(selectedVertexLabels)) {
                vertexLabels =
                        sourceClient.schema()
                                    .getVertexLabels(selectedVertexLabels);
            }
        } else {
            vertexLabels = sourceClient.schema().getVertexLabels();
        }

        Map<String, GraphSource.SelectedLabelDes> mapSelectedVertices
                = new HashMap<>();
        if (graphSource.getSelectedVertices() != null) {
            for (GraphSource.SelectedLabelDes des :
                    graphSource.getSelectedVertices()) {
                mapSelectedVertices.put(des.getLabel(), des);
            }
        }

        for (VertexLabel label : vertexLabels) {
            if (mapSelectedVertices.getOrDefault(label.name(),
                                                 null) != null) {
                List<String> selectedProperties = mapSelectedVertices.get(
                        label.name()).getProperties();

                if (selectedProperties != null) {
                    label.properties().clear();
                    label.properties().addAll(selectedProperties);
                }
            }
        }

        Map<String, GraphSource.IgnoredLabelDes> mapIgnoredVertices
                = new HashMap<>();
        if (graphSource.getIgnoredVertices() != null) {
            for (GraphSource.IgnoredLabelDes des :
                    graphSource.getIgnoredVertices()) {
                mapIgnoredVertices.put(des.getLabel(), des);
            }
        }

        createGraphSourceLabels(sourceClient, targetClient, vertexLabels, mapSelectedVertices,
                                mapIgnoredVertices, true);
    }

    private void createGraphSourceEdgeLabel(HugeClient sourceClient,
                                            HugeClient targetClient,
                                            GraphSource graphSource) {
        // Create Edge Schema
        List<EdgeLabel> edgeLabels = new ArrayList<>();
        if (graphSource.getSelectedEdges() != null) {
            List<String> selectedEdgeLabels =
                    graphSource.getSelectedEdges()
                               .stream().map((des) -> des.getLabel())
                               .collect(Collectors.toList());

            if (!CollectionUtils.isEmpty(selectedEdgeLabels)) {
                edgeLabels =
                        sourceClient.schema()
                                    .getEdgeLabels(selectedEdgeLabels);
            }
        } else {
            edgeLabels = sourceClient.schema().getEdgeLabels();
        }

        Map<String, GraphSource.SelectedLabelDes> mapSelectedEdges
                = new HashMap<>();
        if (graphSource.getSelectedEdges() != null) {
            for (GraphSource.SelectedLabelDes des :
                    graphSource.getSelectedEdges()) {
                mapSelectedEdges.put(des.getLabel(), des);
            }
        }

        for (EdgeLabel label : edgeLabels) {
            if (mapSelectedEdges.getOrDefault(label.name(), null) != null) {
                List<String> selectedProperties = mapSelectedEdges.get(
                        label.name()).getProperties();

                if (selectedProperties != null) {
                    label.properties().clear();
                    label.properties().addAll(selectedProperties);
                }
            }
        }

        Map<String, GraphSource.IgnoredLabelDes> mapIgnoredEdges
                = new HashMap<>();
        if (graphSource.getIgnoredEdges() != null) {
            for (GraphSource.IgnoredLabelDes des :
                    graphSource.getIgnoredEdges()) {
                mapIgnoredEdges.put(des.getLabel(), des);
            }
        }

        createGraphSourceLabels(sourceClient, targetClient, edgeLabels, mapSelectedEdges,
                                mapIgnoredEdges, false);
    }

    private void createGraphSourceIndexLabel(HugeClient sourceClient,
                                             HugeClient targetClient,
                                             GraphSource graphSource) {
        Set<String> existedVertexLabels
                = targetClient.schema().getVertexLabels().stream()
                              .map(v -> v.name()).collect(Collectors.toSet());

        Set<String> existedEdgeLabels
                = targetClient.schema().getEdgeLabels().stream()
                              .map(v -> v.name()).collect(Collectors.toSet());

        List<IndexLabel> indexLabels = sourceClient.schema()
                                                   .getIndexLabels();
        for (IndexLabel indexLabel : indexLabels) {

            HugeType baseType = indexLabel.baseType();
            String baseValue = indexLabel.baseValue();
            Set<String> sourceIndexFields =
                    new HashSet(indexLabel.indexFields());

            if (baseType.equals(HugeType.VERTEX_LABEL) &&
                existedVertexLabels.contains(baseValue)) {
                // Create Vertex Index

                Set<String> curFields = targetClient.schema()
                                                    .getVertexLabel(baseValue)
                                                    .properties();
                if (curFields.containsAll(sourceIndexFields)) {
                    targetClient.schema().addIndexLabel(indexLabel);
                }
            }

            if (baseType.equals(HugeType.EDGE_LABEL) &&
                existedEdgeLabels.contains(baseValue)) {
                // Create Edge Index
                Set<String> curFields = targetClient.schema()
                                                    .getEdgeLabel(baseValue)
                                                    .properties();
                if (curFields.containsAll(sourceIndexFields)) {
                    targetClient.schema().addIndexLabel(indexLabel);
                }
            }
        }
    }

    private void loadInputs() {
        Printer.printRealtimeProgress(this.context);
        LoadOptions options = this.context.options();
        LoadSummary summary = this.context.summary();
        summary.initMetrics(this.mapping);

        summary.startTotalTimer();
        try {
            if (!options.failureMode) {
                // Load normal data from user supplied input structs
                this.loadInputs(this.mapping.structs());
            } else {
                // Load failure data from generated input structs
                this.loadInputs(this.mapping.structsForFailure(options));
            }
            // Waiting for async worker threads finish
            this.manager.waitFinished();
        } finally {
            summary.calculateTotalTime(ElemType.VERTEX);
            summary.calculateTotalTime(ElemType.EDGE);
            summary.stopTotalTimer();
        }
        Printer.printFinalProgress(this.context);
    }

    private void loadInputs(List<InputStruct> structs) {
        if (this.context.options().checkVertex) {
            LOG.info("Forced to load vertices before edges since set " +
                     "option check-vertex=true");
            SplitInputStructs split = this.splitStructs(structs);
            // Load all vertex structs
            this.loadStructs(split.vertexInputStructs);
            // Wait all vertex load tasks finished
            this.manager.waitFinished("vertex insert tasks");
            // Load all edge structs
            this.loadStructs(split.edgeInputStructs);
        } else {
            // Load vertex and edge structs concurrent in the same input
            this.loadStructs(structs);
        }
    }

    private List<InputTaskItem> prepareTaskItems(List<InputStruct> structs,
                                                 boolean scatter) {
        ArrayList<InputTaskItem> tasks = new ArrayList<>();
        ArrayList<InputReader> readers = new ArrayList<>();
        int curFile = 0;
        int curIndex = 0;
        for (InputStruct struct : structs) {
            if (struct.skip()) {
                continue;
            }

            // Create and init InputReader
            try {
                LOG.info("Start loading: '{}'", struct);

                InputReader reader = InputReader.create(struct.input());
                List<InputReader> readerList = reader.multiReaders() ?
                                               reader.split() :
                                               ImmutableList.of(reader);
                readers.addAll(readerList);

                LOG.info("total {} found in '{}'", readerList.size(), struct);
                tasks.ensureCapacity(tasks.size() + readerList.size());
                int seq = 0;
                for (InputReader r : readerList) {
                    if (curFile >= this.context.options().startFile &&
                        (this.context.options().endFile == -1 ||
                         curFile < this.context.options().endFile)) {
                        // Load data from current input mapping
                        tasks.add(new InputTaskItem(struct, r, seq, curIndex));
                    } else {
                        r.close();
                    }
                    seq += 1;
                    curFile += 1;
                }
                if (this.context.options().endFile != -1 &&
                    curFile >= this.context.options().endFile) {
                    break;
                }
            } catch (InitException e) {
                throw new LoadException("Failed to init input reader", e);
            } finally {
                Set<InputReader> usedReaders = tasks.stream()
                                                    .map(item -> item.reader)
                                                    .collect(Collectors.toSet());
                for (InputReader r : readers) {
                    if (!usedReaders.contains(r)) {
                        try {
                            r.close();
                        } catch (Exception ex) {
                            LOG.warn("Failed to close reader", ex);
                        }
                    }
                }
            }
            curIndex += 1;
        }
        // sort by seqNumber to allow scatter loading from different sources
        if (scatter) {
            tasks.sort(Comparator.comparingInt((InputTaskItem o) -> o.structIndex)
                     .thenComparingInt(o -> o.seqNumber));
        }

        return tasks;
    }

    private void loadStructs(List<InputStruct> structs) {
        int parseThreads = this.context.options().parseThreads;
        if (structs.size() == 0) {
            return;
        }

        boolean scatter = this.context.options().scatterSources;

        LOG.info("{} parser threads for loading {} structs, from {} to {} in {} mode",
                 parseThreads, structs.size(), this.context.options().startFile,
                 this.context.options().endFile,
                 scatter ? "scatter" : "sequential");

        ExecutorService loadService = null;
        try {
            loadService = ExecutorUtil.newFixedThreadPool(parseThreads, "loader");
            List<InputTaskItem> taskItems = prepareTaskItems(structs, scatter);
            List<CompletableFuture<Void>> loadTasks = new ArrayList<>();

            if (taskItems.isEmpty()) {
                LOG.info("No tasks to execute after filtering");
                return;
            }

            for (InputTaskItem item : taskItems) {
                // Init reader
                item.reader.init(this.context, item.struct);
                // Load data from current input mapping
                loadTasks.add(
                        this.asyncLoadStruct(item.struct, item.reader,
                                             loadService));
            }

            LOG.info("waiting for loading finish {}", loadTasks.size());
            CompletableFuture.allOf(loadTasks.toArray(new CompletableFuture[0]))
                             .join();
        } catch (CompletionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof RuntimeException runtimeException) {
                // Also covers ParseException and LoadException
                throw runtimeException;
            } else if (cause != null) {
                throw new RuntimeException(cause);
            } else {
                throw e;
            }
        } finally {
            // Shutdown service
            cleanupEmptyProgress();
            if (loadService != null) {
                loadService.shutdownNow();
            }
            LOG.info("Load end");
        }
    }

    private CompletableFuture<Void> asyncLoadStruct(
            InputStruct struct, InputReader reader, ExecutorService service) {
        return CompletableFuture.runAsync(() -> {
            try {
                this.loadStruct(struct, reader);
            } catch (Throwable t) {
                throw t;
            } finally {
                reader.close();
            }
        }, service);
    }

    /**
     * TODO: Separate classes: ReadHandler -> ParseHandler -> InsertHandler
     * Let load task worked in pipeline mode
     */
    private void loadStruct(InputStruct struct, InputReader reader) {
        LOG.info("Start loading '{}'", struct);
        LoadMetrics metrics = this.context.summary().metrics(struct);
        metrics.startInFlight();

        ParseTaskBuilder taskBuilder = new ParseTaskBuilder(this.context, struct);
        final int batchSize = this.context.options().batchSize;
        List<Line> lines = new ArrayList<>(batchSize);
        long batchStartTime = System.currentTimeMillis();

        for (boolean finished = false; !finished; ) {
            if (this.context.stopped()) {
                break;
            }
            try {
                // Read next line from data source
                if (reader.hasNext()) {
                    Line next = reader.next();
                    // If the data source is kafka, there may be cases where the fetched
                    // data is null
                    if (next != null) {
                        lines.add(next);
                        metrics.increaseReadSuccess();
                    }
                } else {
                    finished = true;
                }
            } catch (ReadException e) {
                metrics.increaseReadFailure();
                this.handleReadFailure(struct, e);
            }
            // If read max allowed lines, stop loading
            boolean reachedMaxReadLines = this.reachedMaxReadLines();
            if (reachedMaxReadLines) {
                finished = true;
            }
            if (lines.size() >= batchSize ||
                // Force commit within 5s, mainly affects kafka data source
                (lines.size() > 0 &&
                 System.currentTimeMillis() > batchStartTime + 5000) ||
                finished) {
                List<ParseTask> tasks = taskBuilder.build(lines);
                for (ParseTask task : tasks) {
                    this.executeParseTask(struct, task.mapping(), task);
                }
                // Confirm offset to avoid lost records
                reader.confirmOffset();
                this.context.newProgress().markLoaded(struct, reader, finished);

                this.handleParseFailure();
                if (reachedMaxReadLines) {
                    LOG.warn("Read lines exceed limit, stopped loading tasks");
                    this.context.stopLoadingAtReadLimit();
                }
                lines = new ArrayList<>(batchSize);
                batchStartTime = System.currentTimeMillis();
            }
        }

        metrics.stopInFlight();
        LOG.info("Finish loading '{}'", struct);
    }

    /**
     * Execute parse task sync
     */
    private void executeParseTask(InputStruct struct, ElementMapping mapping,
                                  ParseTaskBuilder.ParseTask task) {
        long start = System.currentTimeMillis();
        // Sync parse
        List<List<Record>> batches = task.get();
        long end = System.currentTimeMillis();
        this.context.summary().addTimeRange(mapping.type(), start, end);

        if (this.context.options().dryRun || CollectionUtils.isEmpty(batches)) {
            return;
        }
        // Async load
        for (List<Record> batch : batches) {
            this.manager.submitBatch(struct, mapping, batch);
        }
    }

    private void handleReadFailure(InputStruct struct, ReadException e) {
        LOG.error("Read {} error", struct, e);
        this.context.occurredError();
        LoadOptions options = this.context.options();
        if (options.testMode) {
            throw e;
        }
        // Write to current mapping's read failure log
        this.context.failureLogger(struct).write(e);

        long failures = this.context.summary().totalReadFailures();
        if (options.maxReadErrors != Constants.NO_LIMIT &&
            failures >= options.maxReadErrors) {
            Printer.printError("More than %s read error, stop reading and " +
                               "waiting all parse/insert tasks stopped",
                               options.maxReadErrors);
            this.context.stopLoading();
        }
    }

    private void handleParseFailure() {
        LoadOptions options = this.context.options();
        long failures = this.context.summary().totalParseFailures();
        if (options.maxParseErrors != Constants.NO_LIMIT &&
            failures >= options.maxParseErrors) {
            if (this.context.stopped()) {
                return;
            }
            synchronized (this.context) {
                if (!this.context.stopped()) {
                    Printer.printError("More than %s parse error, stop " +
                                       "parsing and waiting all insert tasks " +
                                       "stopped", options.maxParseErrors);
                    this.context.stopLoading();
                }
            }
        }
    }

    private SplitInputStructs splitStructs(List<InputStruct> structs) {
        SplitInputStructs split = new SplitInputStructs();
        for (InputStruct struct : structs) {
            InputStruct result = struct.extractVertexStruct();
            if (result != InputStruct.EMPTY) {
                split.vertexInputStructs.add(result);
            }
        }
        for (InputStruct struct : structs) {
            InputStruct result = struct.extractEdgeStruct();
            if (result != InputStruct.EMPTY) {
                split.edgeInputStructs.add(result);
            }
        }
        return split;
    }

    private boolean reachedMaxReadLines() {
        final long maxReadLines = this.context.options().maxReadLines;
        if (maxReadLines == -1L) {
            return false;
        }
        return this.context.summary().totalReadLines() >= maxReadLines;
    }

    /**
     * TODO: How to distinguish load task finished normally or abnormally
     */
    private synchronized void stopThenShutdown() {
        try {
            this.drainThenClose();
        } finally {
            if (this.context.closed() && this.shutdownHook != null) {
                try {
                    Runtime.getRuntime().removeShutdownHook(this.shutdownHook);
                } catch (IllegalStateException ignored) {
                    // JVM shutdown already started; this hook can finish closing.
                }
            }
        }
    }

    private void drainThenClose() {
        if (this.context.closed()) {
            return;
        }
        LOG.info("Stop loading then shutdown HugeGraphLoader");
        boolean tasksStopped = this.manager == null;
        boolean interrupted = Thread.currentThread().isInterrupted();
        try {
            this.context.stopLoading();
            if (this.manager != null) {
                // Wait all insert tasks stopped before exit
                try {
                    this.manager.waitFinished();
                } finally {
                    this.manager.shutdown();
                    tasksStopped = true;
                }
            }
        } finally {
            interrupted |= Thread.currentThread().isInterrupted();
            try {
                // Keep dependencies alive if cancellation could not terminate the workers.
                if (tasksStopped) {
                    try {
                        this.context.unsetLoadingMode();
                    } catch (Throwable resetFailure) {
                        try {
                            this.context.close(this.loadStarted && this.saveProgress);
                        } catch (Throwable closeFailure) {
                            if (closeFailure instanceof Error && !(resetFailure instanceof Error)) {
                                suppressCleanupFailure(closeFailure, resetFailure);
                                throw (Error) closeFailure;
                            }
                            suppressCleanupFailure(resetFailure, closeFailure);
                        }
                        throw resetFailure;
                    }
                    this.context.close(this.loadStarted && this.saveProgress);
                }
            } finally {
                if (interrupted) {
                    Thread.currentThread().interrupt();
                }
            }
        }
    }

    private static void suppressCleanupFailure(Throwable primary, Throwable secondary) {
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        if (!containsFailure(secondary, primary, seen)) {
            primary.addSuppressed(secondary);
        }
    }

    private static boolean containsFailure(Throwable failure, Throwable target, Set<Throwable> seen) {
        if (failure == null || !seen.add(failure)) {
            return false;
        }
        if (failure == target || containsFailure(failure.getCause(), target, seen)) {
            return true;
        }
        for (Throwable suppressed : failure.getSuppressed()) {
            if (containsFailure(suppressed, target, seen)) {
                return true;
            }
        }
        return false;
    }

    private void cleanupEmptyProgress() {
        Map<String, InputProgress> inputProgressMap = this.context.newProgress().inputProgress();
        inputProgressMap.entrySet().removeIf(entry -> entry.getValue().loadedItems().isEmpty());
    }

    private static class SplitInputStructs {

        private final List<InputStruct> vertexInputStructs;
        private final List<InputStruct> edgeInputStructs;

        public SplitInputStructs() {
            this.vertexInputStructs = new ArrayList<>();
            this.edgeInputStructs = new ArrayList<>();
        }
    }
}
