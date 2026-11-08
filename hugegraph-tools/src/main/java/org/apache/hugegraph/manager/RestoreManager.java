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

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiConsumer;

import org.apache.hugegraph.base.Printer;
import org.apache.hugegraph.base.ToolClient;
import org.apache.hugegraph.cmd.SubCommands;
import org.apache.hugegraph.structure.constant.GraphMode;
import org.apache.hugegraph.structure.constant.HugeType;
import org.apache.hugegraph.structure.constant.IdStrategy;
import org.apache.hugegraph.structure.graph.Edge;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.structure.schema.EdgeLabel;
import org.apache.hugegraph.structure.schema.IndexLabel;
import org.apache.hugegraph.structure.schema.PropertyKey;
import org.apache.hugegraph.structure.schema.VertexLabel;
import org.apache.hugegraph.util.E;

public class RestoreManager extends BackupRestoreBaseManager {

    private GraphMode mode = null;
    private boolean clean;

    private Map<String, Long> primaryKeyVLs = null;

    public RestoreManager(ToolClient.ConnectionInfo info) {
        super(info, "restore");
    }

    public void init(SubCommands.Restore restore) {
        super.init(restore);
        this.ensureDirectoryExist(false);
        this.clean = restore.clean();
    }

    public void mode(GraphMode mode) {
        this.mode = mode;
    }

    public void restore(List<HugeType> types) {
        try {
            this.doRestore(types);
        } finally {
            this.shutdown(this.type());
        }
    }

    public void doRestore(List<HugeType> types) {
        E.checkNotNull(this.mode, "mode");
        this.startTimer();
        for (HugeType type : types) {
            switch (type) {
                case VERTEX:
                    this.restoreVertices(type);
                    break;
                case EDGE:
                    this.restoreEdges(type);
                    break;
                case PROPERTY_KEY:
                    this.restorePropertyKeys(type);
                    break;
                case VERTEX_LABEL:
                    this.restoreVertexLabels(type);
                    break;
                case EDGE_LABEL:
                    this.restoreEdgeLabels(type);
                    break;
                case INDEX_LABEL:
                    this.restoreIndexLabels(type);
                    break;
                default:
                    throw new AssertionError(String.format(
                              "Bad restore type: %s", type));
            }
        }
        this.printSummary();
        if (this.clean) {
            this.removeDirectory();
        }
    }

    private void restoreVertices(HugeType type) {
        Printer.print("Vertices restore started");
        this.initPrimaryKeyVLs();
        List<String> files = this.filesWithPrefix(HugeType.VERTEX);
        printRestoreFiles(type, files);
        Printer.printInBackward("Vertices has been restored: ");
        BiConsumer<String, String> consumer = (t, l) -> {
            List<Vertex> vertices = this.readList(t, Vertex.class, l);
            int size = vertices.size();
            for (int start = 0; start < size; start += BATCH) {
                int end = Math.min(start + BATCH, size);
                List<Vertex> subVertices = vertices.subList(start, end);
                for (Vertex vertex : subVertices) {
                    if (this.primaryKeyVLs.containsKey(vertex.label())) {
                        vertex.id(null);
                    }
                }
                this.retry(() -> this.client.graph().addVertices(subVertices),
                           "restoring vertices");
                this.vertexCounter.getAndAdd(end - start);
                Printer.printInBackward(this.vertexCounter.get());
            }
        };
        for (String file : files) {
            this.submit(() -> {
                try {
                    this.restore(type, file, consumer);
                } catch (Throwable e) {
                    Printer.print("When restoring vertices in file '%s' " +
                                  "occurs exception '%s'", file, e);
                    throw e;
                }
            });
        }
        this.awaitTasks();
        Printer.print("%d", this.vertexCounter.get());
        Printer.print("Vertices restore finished: %d",
                      this.vertexCounter.get());
    }

    private void restoreEdges(HugeType type) {
        Printer.print("Edges restore started");
        this.initPrimaryKeyVLs();
        List<String> files = this.filesWithPrefix(HugeType.EDGE);
        printRestoreFiles(type, files);
        Printer.printInBackward("Edges has been restored: ");
        BiConsumer<String, String> consumer = (t, l) -> {
            List<Edge> edges = this.readList(t, Edge.class, l);
            int size = edges.size();
            for (int start = 0; start < size; start += BATCH) {
                int end = Math.min(start + BATCH, size);
                List<Edge> subEdges = edges.subList(start, end);
                /*
                 * Edge id is concat using source and target vertex id and
                 * vertices of primary key id strategy might have changed
                 * their id
                 */
                this.updateVertexIdInEdge(subEdges);
                this.retry(() -> this.client.graph().addEdges(subEdges, false),
                           "restoring edges");
                this.edgeCounter.getAndAdd(end - start);
                Printer.printInBackward(this.edgeCounter.get());
            }
        };
        for (String file : files) {
            this.submit(() -> {
                try {
                    this.restore(type, file, consumer);
                } catch (Throwable e) {
                    Printer.print("When restoring edges in file '%s' " +
                                  "occurs exception '%s'", file, e);
                    throw e;
                }
            });
        }
        this.awaitTasks();
        Printer.print("%d", this.edgeCounter.get());
        Printer.print("Edges restore finished: %d", this.edgeCounter.get());
    }

    private void restorePropertyKeys(HugeType type) {
        Printer.print("Property key restore started");
        BiConsumer<String, String> consumer = (t, l) -> {
            for (PropertyKey pk : this.readList(t, PropertyKey.class, l)) {
                if (this.mode == GraphMode.MERGING) {
                    pk.resetId();
                    pk.checkExist(false);
                }
                this.client.schema().addPropertyKey(pk);
                this.propertyKeyCounter.getAndIncrement();
            }
        };
        String path = this.fileWithPrefix(HugeType.PROPERTY_KEY);
        this.restore(type, path, consumer);
        Printer.print("Property key restore finished: %d",
                      this.propertyKeyCounter.get());
    }

    private void restoreVertexLabels(HugeType type) {
        Printer.print("Vertex label restore started");
        BiConsumer<String, String> consumer = (t, l) -> {
            for (VertexLabel vl : this.readList(t, VertexLabel.class, l)) {
                if (this.mode == GraphMode.MERGING) {
                    vl.resetId();
                    vl.checkExist(false);
                }
                this.client.schema().addVertexLabel(vl);
                this.vertexLabelCounter.getAndIncrement();
            }
        };
        String path = this.fileWithPrefix(HugeType.VERTEX_LABEL);
        this.restore(type, path, consumer);
        Printer.print("Vertex label restore finished: %d",
                      this.vertexLabelCounter.get());
    }

    private void restoreEdgeLabels(HugeType type) {
        Printer.print("Edge label restore started");
        BiConsumer<String, String> consumer = (t, l) -> {
            for (EdgeLabel el : this.readList(t, EdgeLabel.class, l)) {
                if (this.mode == GraphMode.MERGING) {
                    el.resetId();
                    el.checkExist(false);
                }
                this.client.schema().addEdgeLabel(el);
                this.edgeLabelCounter.getAndIncrement();
            }
        };
        String path = this.fileWithPrefix(HugeType.EDGE_LABEL);
        this.restore(type, path, consumer);
        Printer.print("Edge label restore finished: %d",
                      this.edgeLabelCounter.get());
    }

    private void restoreIndexLabels(HugeType type) {
        Printer.print("Index label restore started");
        BiConsumer<String, String> consumer = (t, l) -> {
            for (IndexLabel il : this.readList(t, IndexLabel.class, l)) {
                if (this.mode == GraphMode.MERGING) {
                    il.resetId();
                    il.checkExist(false);
                }
                this.client.schema().addIndexLabel(il);
                this.indexLabelCounter.getAndIncrement();
            }
        };
        String path = this.fileWithPrefix(HugeType.INDEX_LABEL);
        this.restore(type, path, consumer);
        Printer.print("Index label restore finished: %d",
                      this.indexLabelCounter.get());
    }

    private void restore(HugeType type, String file,
                         BiConsumer<String, String> consumer) {
        this.read(file, type, consumer);
    }

    private void initPrimaryKeyVLs() {
        if (this.primaryKeyVLs != null) {
            return;
        }
        this.primaryKeyVLs = new HashMap<>();
        List<VertexLabel> vertexLabels = this.client.schema().getVertexLabels();
        for (VertexLabel vl : vertexLabels) {
            if (vl.idStrategy() == IdStrategy.PRIMARY_KEY) {
                this.primaryKeyVLs.put(vl.name(), vl.id());
            }
        }
    }

    private void updateVertexIdInEdge(List<Edge> edges) {
        for (Edge edge : edges) {
            edge.sourceId(this.updateVid(edge.sourceLabel(), edge.sourceId()));
            edge.targetId(this.updateVid(edge.targetLabel(), edge.targetId()));
        }
    }

    private Object updateVid(String label, Object id) {
        if (this.primaryKeyVLs.containsKey(label)) {
            String sid = (String) id;
            return this.primaryKeyVLs.get(label) +
                   sid.substring(sid.indexOf(':'));
        }
        return id;
    }

    private void printRestoreFiles(HugeType type, List<String> files) {
        Printer.print("Restoring %s ...", type);
        Printer.printList("files", files);
    }
}
