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

package org.apache.hugegraph.manager;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.Lock;

import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.api.API;
import org.apache.hugegraph.base.Printer;
import org.apache.hugegraph.base.ToolClient;
import org.apache.hugegraph.cmd.SubCommands;
import org.apache.hugegraph.driver.TraverserManager;
import org.apache.hugegraph.exception.ToolsException;
import org.apache.hugegraph.structure.constant.HugeType;
import org.apache.hugegraph.structure.graph.Edge;
import org.apache.hugegraph.structure.graph.Edges;
import org.apache.hugegraph.structure.graph.Shard;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.structure.graph.Vertices;
import org.apache.hugegraph.structure.schema.EdgeLabel;
import org.apache.hugegraph.structure.schema.IndexLabel;
import org.apache.hugegraph.structure.schema.PropertyKey;
import org.apache.hugegraph.structure.schema.VertexLabel;
import org.apache.hugegraph.util.E;

import com.google.common.collect.ImmutableList;
import com.google.common.collect.ImmutableSet;

public class BackupManager extends BackupRestoreBaseManager {

    private static final String SHARDS_SUFFIX = "_shards";
    private static final String ALL_SHARDS = "_all" + SHARDS_SUFFIX;
    private static final String TIMEOUT_SHARDS = "_timeout" + SHARDS_SUFFIX;
    private static final String LIMIT_EXCEED_SHARDS = "_limit_exceed" + SHARDS_SUFFIX;
    private static final String FAILED_SHARDS = "_failed" + SHARDS_SUFFIX;

    public static final int BACKUP_DEFAULT_TIMEOUT = 120;

    private static final String BACKEND = "backend";
    private static final Set<String> BACKENDS_NO_PAGING =
                                     ImmutableSet.of("memory");
    private static final String PAGE_NONE = "";

    private static final AtomicInteger NEXT_ID = new AtomicInteger(0);
    private static final ThreadLocal<Integer> SUFFIX =
            ThreadLocal.withInitial(NEXT_ID::getAndIncrement);

    private long splitSize;
    private String backend;
    private boolean compress;
    private String format;
    private String label;
    private boolean allProperties;
    private List<String> properties;

    public BackupManager(ToolClient.ConnectionInfo info) {
        super(info, "backup");
        this.backend = this.client.graphs().getGraph(this.graph()).get(BACKEND);
    }

    public void init(SubCommands.Backup backup) {
        super.init(backup);
        this.removeShardsFilesIfExists();
        this.ensureDirectoryExist(true);
        this.splitSize(backup.splitSize());
        this.compress = backup.compress;
        this.format = backup.format;
        if (backup.label != null) {
            E.checkArgument(backup.types().size() == 1 &&
                            (backup.types().get(0) == HugeType.VERTEX ||
                             backup.types().get(0) == HugeType.EDGE),
                            "The label can only be set when " +
                            "backup type is vertex or edge");
        }
        this.label = backup.label;
        this.allProperties = backup.allProperties;
        this.properties = backup.properties;
    }

    public void splitSize(long splitSize) {
        E.checkArgument(splitSize >= 1024 * 1024,
                        "Split size must >= 1M, but got %s", splitSize);
        this.splitSize = splitSize;
    }

    public long splitSize() {
        return this.splitSize;
    }

    public void backup(List<HugeType> types) {
        try {
            this.doBackup(types);
        } finally {
            this.shutdown(this.type());
        }
    }

    public void doBackup(List<HugeType> types) {
        this.startTimer();
        for (HugeType type : types) {
            switch (type) {
                case VERTEX:
                    this.backupVertices();
                    break;
                case EDGE:
                    this.backupEdges();
                    break;
                case PROPERTY_KEY:
                    this.backupPropertyKeys();
                    break;
                case VERTEX_LABEL:
                    this.backupVertexLabels();
                    break;
                case EDGE_LABEL:
                    this.backupEdgeLabels();
                    break;
                case INDEX_LABEL:
                    this.backupIndexLabels();
                    break;
                default:
                    throw new AssertionError(String.format(
                              "Bad backup type: %s", type));
            }
        }
        this.printSummary();
    }

    protected void backupVertices() {
        Printer.print("Vertices backup started");
        Printer.printInBackward("Vertices has been backup: ");
        List<Shard> shards = retry(() ->
                             this.client.traverser().vertexShards(splitSize()),
                             "querying shards of vertices");
        this.writeShards(this.allShardsLog(HugeType.VERTEX), shards);
        for (Shard shard : shards) {
            this.backupVertexShardAsync(shard);
        }
        try {
            this.awaitTasks();
        } finally {
            this.postProcessFailedShard(HugeType.VERTEX);
        }
        Printer.print("%d", this.vertexCounter.get());
        Printer.print("Vertices backup finished: %d",
                      this.vertexCounter.get());
    }

    protected void backupEdges() {
        Printer.print("Edges backup started");
        Printer.printInBackward("Edges has been backup: ");
        List<Shard> shards = retry(() ->
                             this.client.traverser().edgeShards(splitSize()),
                             "querying shards of edges");
        this.writeShards(this.allShardsLog(HugeType.EDGE), shards);
        for (Shard shard : shards) {
            this.backupEdgeShardAsync(shard);
        }
        try {
            this.awaitTasks();
        } finally {
            this.postProcessFailedShard(HugeType.EDGE);
        }
        Printer.print("%d", this.edgeCounter.get());
        Printer.print("Edges backup finished: %d", this.edgeCounter.get());
    }

    protected void backupPropertyKeys() {
        Printer.print("Property key backup started");
        List<PropertyKey> pks = this.client.schema().getPropertyKeys();
        this.propertyKeyCounter.getAndAdd(pks.size());
        this.backup(HugeType.PROPERTY_KEY, pks);
        Printer.print("Property key backup finished: %d",
                      this.propertyKeyCounter.get());
    }

    protected void backupVertexLabels() {
        Printer.print("Vertex label backup started");
        List<VertexLabel> vls = this.client.schema().getVertexLabels();
        this.vertexLabelCounter.getAndAdd(vls.size());
        this.backup(HugeType.VERTEX_LABEL, vls);
        Printer.print("Vertex label backup finished: %d",
                      this.vertexLabelCounter.get());
    }

    protected void backupEdgeLabels() {
        Printer.print("Edge label backup started");
        List<EdgeLabel> els = this.client.schema().getEdgeLabels();
        this.edgeLabelCounter.getAndAdd(els.size());
        this.backup(HugeType.EDGE_LABEL, els);
        Printer.print("Edge label backup finished: %d",
                      this.edgeLabelCounter.get());
    }

    protected void backupIndexLabels() {
        Printer.print("Index label backup started");
        List<IndexLabel> ils = this.client.schema().getIndexLabels();
        this.indexLabelCounter.getAndAdd(ils.size());
        this.backup(HugeType.INDEX_LABEL, ils);
        Printer.print("Index label backup finished: %d",
                      this.indexLabelCounter.get());
    }

    private void backupVertexShardAsync(Shard shard) {
        this.submit(() -> {
            try {
                backupVertexShard(shard);
            } catch (Throwable e) {
                this.logExceptionWithShard(e, HugeType.VERTEX, shard);
                throw e;
            }
        });
    }

    private void backupEdgeShardAsync(Shard shard) {
        this.submit(() -> {
            try {
                backupEdgeShard(shard);
            } catch (Throwable e) {
                this.logExceptionWithShard(e, HugeType.EDGE, shard);
                throw e;
            }
        });
    }

    private void backupVertexShard(Shard shard) {
        String desc = String.format("backing up vertices[shard:%s]", shard);
        Vertices vertices = null;
        String page = this.initPage();
        TraverserManager g = client.traverser();
        do {
            String p = page;
            try {
                if (page == null) {
                    vertices = retry(() -> g.vertices(shard), desc);
                } else {
                    vertices = retry(() -> g.vertices(shard, p), desc);
                }
            } catch (ToolsException e) {
                this.exceptionHandler(e, HugeType.VERTEX, shard);
            }
            if (vertices == null) {
                return;
            }
            List<Vertex> vertexList = vertices.results();
            if (vertexList == null || vertexList.isEmpty()) {
                return;
            }
            long count = this.backup(HugeType.VERTEX, SUFFIX.get(), vertexList);

            this.vertexCounter.getAndAdd(count);
            Printer.printInBackward(this.vertexCounter.get());
        } while ((page = vertices.page()) != null);
    }

    private void backupEdgeShard(Shard shard) {
        String desc = String.format("backing up edges[shard %s]", shard);
        Edges edges = null;
        String page = this.initPage();
        TraverserManager g = client.traverser();
        do {
            try {
                String p = page;
                if (page == null) {
                    edges = retry(() -> g.edges(shard), desc);
                } else {
                    edges = retry(() -> g.edges(shard, p), desc);
                }
            } catch (ToolsException e) {
                this.exceptionHandler(e, HugeType.EDGE, shard);
            }
            if (edges == null) {
                return;
            }
            List<Edge> edgeList = edges.results();
            if (edgeList == null || edgeList.isEmpty()) {
                return;
            }
            long count = this.backup(HugeType.EDGE, SUFFIX.get(), edgeList);

            this.edgeCounter.getAndAdd(count);
            Printer.printInBackward(this.edgeCounter.get());
        } while ((page = edges.page()) != null);
    }

    private void backup(HugeType type, List<?> list) {
        String file = type.string();
        this.write(file, type, list, this.compress);
    }

    private long backup(HugeType type, int number, List<?> list) {
        String file = type.string() + number;
        int size = list.size();
        long count = 0L;
        for (int start = 0; start < size; start += BATCH) {
            int end = Math.min(start + BATCH, size);
            count += this.write(file, type, list.subList(start, end),
                                this.compress, this.format, this.label,
                                this.allProperties, this.properties);
        }
        return count;
    }

    private String initPage() {
        return BACKENDS_NO_PAGING.contains(this.backend) ? null : PAGE_NONE;
    }

    private void exceptionHandler(ToolsException e, HugeType type,
                                  Shard shard) {
        String message = e.getMessage();
        switch (type) {
            case VERTEX:
                E.checkState(message.contains("backing up vertices"),
                             "Unexpected exception %s", e);
                break;
            case EDGE:
                E.checkState(message.contains("backing up edges"),
                             "Unexpected exception %s", e);
                break;
            default:
                throw new AssertionError(String.format(
                          "Only VERTEX or EDGE exception is expected, " +
                          "but got '%s' exception", type));
        }
        if (isLimitExceedException(e)) {
            this.logLimitExceedShard(type, shard);
        } else if (isTimeoutException(e)) {
            this.logTimeoutShard(type, shard);
        }
        throw e;
    }

    private void logTimeoutShard(HugeType type, Shard shard) {
        String file = type.string() + TIMEOUT_SHARDS;
        this.writeShard(Paths.get(this.logDir(), file).toString(), shard);
    }

    private void logLimitExceedShard(HugeType type, Shard shard) {
        String file = type.string() + LIMIT_EXCEED_SHARDS;
        this.writeShard(Paths.get(this.logDir(), file).toString(), shard);
    }

    private void logExceptionWithShard(Object e, HugeType type, Shard shard) {
        String fileName = type.string() + FAILED_SHARDS;
        String filePath = Paths.get(this.logDir(), fileName).toString();
        try (FileWriter writer = new FileWriter(filePath, true)) {
            writer.write(shard.toString() + "\n");
            writer.write(exceptionStackTrace(e) + "\n");
        } catch (IOException e1) {
            Printer.print("Failed to write shard '%s' with exception '%s'",
                          shard, e);
        }
    }

    private void postProcessFailedShard(HugeType type) {
        this.processTimeoutShards(type);
        this.processLimitExceedShards(type);
    }

    private void processTimeoutShards(HugeType type) {
        Path path = Paths.get(this.logDir(), type.string() + TIMEOUT_SHARDS);
        File shardFile = path.toFile();
        if (!shardFile.exists() || shardFile.isDirectory()) {
            return;
        }
        Printer.print("Timeout occurs when backup %s shards in file '%s', " +
                      "try to use global option --timeout to increase " +
                      "connection timeout(default is 120s for backup) or use " +
                      "option --split-size to decrease split size",
                      type, shardFile);
    }

    private void processLimitExceedShards(HugeType type) {
        Path path = Paths.get(this.logDir(),
                              type.string() + LIMIT_EXCEED_SHARDS);
        File shardFile = path.toFile();
        if (!shardFile.exists() || shardFile.isDirectory()) {
            return;
        }
        Printer.print("Limit exceed occurs when backup %s shards in file '%s'",
                      type, shardFile);
    }

    private void writeShard(String file, Shard shard) {
        this.writeShards(file, ImmutableList.of(shard));
    }

    private void writeShards(String file, List<Shard> shards) {
        this.writeLog(file, "shards", shards);
    }

    private void writeLog(String file, String type, List<?> list) {
        Lock lock = locks.lock(file);
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream(LBUF_SIZE);
             FileOutputStream fos = new FileOutputStream(file, false)) {
            String key = String.format("{\"%s\": ", type);
            baos.write(key.getBytes(API.CHARSET));
            this.client.mapper().writeValue(baos, list);
            baos.write("}\n".getBytes(API.CHARSET));
            fos.write(baos.toByteArray());
        } catch (Exception e) {
            Printer.print("Failed to serialize %s: %s", type, e);
        } finally {
            lock.unlock();
        }
    }

    private String allShardsLog(HugeType type) {
        String shardsFile = type.string() + ALL_SHARDS;
        return Paths.get(this.logDir(), shardsFile).toString();
    }

    protected void removeShardsFilesIfExists() {
        File logDir = new File(this.logDir());
        E.checkArgument(logDir.exists() && logDir.isDirectory(),
                        "The log directory '%s' not exists or is file",
                        logDir);
        for (File file : logDir.listFiles()) {
            if (file.getName().endsWith(SHARDS_SUFFIX)) {
                try {
                    FileUtils.forceDelete(file);
                } catch (IOException e) {
                    throw new ToolsException("Failed to delete shard file " +
                                             "'%s'", file);
                }
            }
        }
    }

    private static boolean isTimeoutException(ToolsException e) {
        return e.getCause() != null && e.getCause().getCause() != null &&
               StringUtils.contains(e.getCause().getCause().getMessage(),
                                    "Read timed out");
    }

    private static boolean isLimitExceedException(ToolsException e) {
        return e.getCause() != null &&
               StringUtils.contains(e.getCause().getMessage(), "Too many records");
    }

    private static String exceptionStackTrace(Object e) {
        if (!(e instanceof Throwable t)) {
            return e.toString();
        }
        StringBuilder sb = new StringBuilder();
        sb.append(t.getMessage()).append("\n");
        if (t.getCause() != null) {
            sb.append(t.getCause().toString()).append("\n");
        }
        for (StackTraceElement element : t.getStackTrace()) {
            sb.append(element).append("\n");
        }
        return sb.toString();
    }
}
