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

import java.io.BufferedOutputStream;
import java.io.OutputStream;
import java.util.Collection;
import java.util.List;

import org.apache.hugegraph.api.API;
import org.apache.hugegraph.base.LocalDirectory;
import org.apache.hugegraph.base.Printer;
import org.apache.hugegraph.base.ToolClient;
import org.apache.hugegraph.cmd.SubCommands;
import org.apache.hugegraph.formatter.Formatter;
import org.apache.hugegraph.structure.JsonGraph;
import org.apache.hugegraph.structure.constant.HugeType;
import org.apache.hugegraph.structure.graph.Edge;
import org.apache.hugegraph.structure.graph.Vertex;

public class DumpGraphManager extends BackupManager {

    private static final byte[] EOF = "\n".getBytes();

    private final JsonGraph graph;

    private Formatter dumpFormatter;

    public DumpGraphManager(ToolClient.ConnectionInfo info) {
        this(info, "JsonFormatter");
    }

    public DumpGraphManager(ToolClient.ConnectionInfo info, String formatter) {
        super(info);
        this.graph = new JsonGraph();
        this.dumpFormatter = Formatter.loadFormatter(formatter);
    }

    public void dumpFormatter(String formatter) {
        this.dumpFormatter = Formatter.loadFormatter(formatter);
    }

    public void init(SubCommands.DumpGraph dump) {
        assert dump.retry() > 0;
        this.retry(dump.retry());
        LocalDirectory.ensureDirectoryExist(dump.logDir());
        this.logDir(dump.logDir());
        this.directory(dump.directory(), dump.hdfsConf());
        this.removeShardsFilesIfExists();
        this.ensureDirectoryExist(true);
        this.splitSize(dump.splitSize());
    }

    public void dump() {
        this.startTimer();
        try {
            // Fetch data to JsonGraph
            this.backupVertices();
            this.backupEdges();

            // Dump to file
            for (String table : this.graph.tables()) {
                this.submit(() -> dump(table, this.graph.table(table).values()));
            }
        } finally {
            this.shutdown(this.type());
        }

        this.printSummary("dump graph");
    }

    private void dump(String file, Collection<JsonGraph.JsonVertex> vertices) {
        try (OutputStream os = this.outputStream(file, false);
             BufferedOutputStream bos = new BufferedOutputStream(os)) {
            for (JsonGraph.JsonVertex vertex : vertices) {
                String content = this.dumpFormatter.dump(vertex);
                bos.write(content.getBytes(API.CHARSET));
                bos.write(EOF);
            }
        } catch (Throwable e) {
            Printer.print("Failed to write vertex: %s", e);
        }
    }

    @Override
    protected long write(String file, HugeType type,
                         List<?> list, boolean compress) {
        switch (type) {
            case VERTEX:
                for (Object vertex : list) {
                    this.graph.put((Vertex) vertex);
                }
                break;
            case EDGE:
                for (Object edge : list) {
                    this.graph.put((Edge) edge);
                }
                break;
            default:
                throw new AssertionError("Invalid type " + type);
        }
        return list.size();
    }
}
