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

package org.apache.hugegraph.entity.load;

import java.util.Date;
import java.util.Set;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

import org.apache.hugegraph.annotation.MergeProperty;
import org.apache.hugegraph.entity.GraphConnection;
import org.apache.hugegraph.entity.enums.LoadStatus;
import org.apache.hugegraph.exception.InternalException;
import org.apache.hugegraph.loader.HugeGraphLoader;
import org.apache.hugegraph.loader.exception.LoadException;
import org.apache.hugegraph.loader.executor.LoadContext;
import org.apache.hugegraph.loader.executor.LoadOptions;
import org.apache.hugegraph.util.Ex;
import org.apache.hugegraph.util.HubbleUtil;
import org.apache.hugegraph.util.SerializeUtil;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.log4j.Log4j2;

@Log4j2
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@TableName(value = "load_task", autoResultMap = true)
public class LoadTask implements Runnable {

    @TableField(exist = false)
    @JsonIgnore
    private final transient Lock lock = new ReentrantLock();

    @TableField(exist = false)
    @JsonIgnore
    private transient volatile HugeGraphLoader loader;

    @TableField(exist = false)
    @JsonIgnore
    private transient volatile boolean finished;

    @TableField(exist = false)
    @JsonIgnore
    private transient volatile Throwable cleanupFailure;

    @TableField(exist = false)
    @JsonIgnore
    private transient volatile boolean cleanupFailed;

    @TableId(type = IdType.AUTO)
    @MergeProperty(useNew = false)
    @JsonProperty("id")
    private Integer id;

    @TableField(value = "conn_id")
    @MergeProperty
    @JsonProperty("conn_id")
    private Integer connId;

    @TableField(value = "graphspace")
    @MergeProperty
    @JsonProperty("graphspace")
    private String graphSpace;

    @TableField(value = "graph")
    @MergeProperty
    @JsonProperty("graph")
    private String graph;

    @TableField(value = "job_id")
    @MergeProperty
    @JsonProperty("job_id")
    private Integer jobId;

    @TableField(value = "file_id")
    @MergeProperty
    @JsonProperty("file_id")
    private Integer fileId;

    @TableField(value = "file_name")
    @MergeProperty
    @JsonProperty("file_name")
    private String fileName;

    @TableField(value = "options", typeHandler = JacksonTypeHandler.class)
    @MergeProperty
    @JsonProperty(value = "options", access = JsonProperty.Access.WRITE_ONLY)
    private LoadOptions options;

    @TableField(value = "vertices", typeHandler = JacksonTypeHandler.class)
    @MergeProperty
    @JsonProperty(value = "vertices")
    private Set<String> vertices;

    @TableField(value = "edges", typeHandler = JacksonTypeHandler.class)
    @MergeProperty
    @JsonProperty(value = "edges")
    private Set<String> edges;

    @TableField("file_total_lines")
    @MergeProperty
    @JsonProperty("file_total_lines")
    private Long fileTotalLines;

    @TableField("load_status")
    @MergeProperty
    @JsonProperty("status")
    private volatile LoadStatus status;

    @TableField("file_read_lines")
    @MergeProperty
    @JsonProperty("file_read_lines")
    private Long fileReadLines;

    // Last persisted client-confirmed write operations in the current attempt.
    // Nullable for tasks created before these metrics were recorded.
    @TableField("confirmed_vertex_writes")
    @JsonProperty("confirmed_vertex_writes")
    private Long confirmedVertexWrites;

    @TableField("confirmed_edge_writes")
    @JsonProperty("confirmed_edge_writes")
    private Long confirmedEdgeWrites;

    @TableField("last_duration")
    @MergeProperty
    @JsonProperty("last_duration")
    @JsonSerialize(using = SerializeUtil.DurationSerializer.class)
    private Long lastDuration;

    @TableField("curr_duration")
    @MergeProperty
    @JsonProperty("curr_duration")
    @JsonSerialize(using = SerializeUtil.DurationSerializer.class)
    private Long currDuration;

    @MergeProperty(useNew = false)
    @JsonProperty("create_time")
    private Date createTime;

    public LoadTask(LoadOptions options, GraphConnection connection,
                    FileMapping mapping) {
        this.finished = false;
        this.id = null;
        this.connId = connection.getId();
        this.graphSpace = connection.getGraphSpace();
        this.graph = connection.getGraph();
        this.jobId = mapping.getJobId();
        this.fileId = mapping.getId();
        this.fileName = mapping.getName();
        this.options = options;
        this.vertices = mapping.getVertexMappingLabels();
        this.edges = mapping.getEdgeMappingLabels();
        this.fileTotalLines = mapping.getTotalLines();
        this.status = LoadStatus.RUNNING;
        this.fileReadLines = 0L;
        this.confirmedVertexWrites = 0L;
        this.confirmedEdgeWrites = 0L;
        this.lastDuration = 0L;
        this.currDuration = 0L;
        this.createTime = HubbleUtil.nowDate();

        this.loader = new HugeGraphLoader(this.options, false);
    }

    @Override
    public void run() {
        Ex.check(this.options != null, "The load options shouldn't be null");
        log.info("LoadTask is start running : {}", this.id);

        this.cleanupFailure = null;
        boolean noError = false;
        this.cleanupFailed = false;
        Throwable failure = null;
        try {
            // A queued task can be paused before its worker starts.
            noError = this.context().stopped() ? this.context().noError() : this.loader.load();
        } catch (Throwable e) {
            failure = e;
        } finally {
            Throwable recordedFailure = failure;
            if (failure != null) {
                // Only read the recorded error: shutdown can wrap a checked
                // failure differently from load(), or rethrow it unchanged.
                try {
                    this.context().throwIfFailed();
                } catch (Throwable recorded) {
                    recordedFailure = recorded;
                    if (recorded != failure) {
                        // Retain an asynchronously recorded error even when it
                        // differs from the error propagated by load().
                        log.error("Recorded load failure for task {}", this.id, recorded);
                    }
                }
            }
            Throwable recordedCause = recordedFailure == null ? null : recordedFailure.getCause();
            int suppressed = recordedFailure == null ? 0 : recordedFailure.getSuppressed().length;
            int causeSuppressed = recordedCause == null ? 0 : recordedCause.getSuppressed().length;
            try {
                this.loader.shutdown();
            } catch (Throwable e) {
                noError = false;
                this.cleanupFailed = !sameLoadFailure(recordedFailure, e) ||
                                     recordedFailure.getSuppressed().length != suppressed ||
                                     (recordedCause != null &&
                                      recordedCause.getSuppressed().length != causeSuppressed);
                if (this.cleanupFailed) {
                    this.cleanupFailure = e;
                    log.error("Failed to close load task {}; check graph loading mode before retrying", this.id, e);
                }
                if (failure == null) {
                    failure = e;
                } else if (this.cleanupFailed && failure != e && !referencesFailure(e, failure)) {
                    failure.addSuppressed(e);
                }
            }
        }
        if (failure != null) {
            log.error("Run task {} failed", this.id, failure);
        }
        this.lock.lock();
        try {
            // Pay attention to whether the user stops actively or
            // the program stops by itself
            if (this.cleanupFailed || this.status.inRunning()) {
                if (noError) {
                    this.status = LoadStatus.SUCCEED;
                } else {
                    this.status = LoadStatus.FAILED;
                }
            }
            // Restore file read lines progress tracking
            long readLines = this.context().newProgress().totalInputRead();
            if (readLines == 0L) {
                readLines = this.context().oldProgress().totalInputRead();
            }
            this.fileReadLines = readLines;
            this.refreshConfirmedWrites();
            this.lastDuration += this.context().summary().totalTime();
            this.currDuration = 0L;
        } finally {
            this.finished = true;
            this.lock.unlock();
        }
    }

    private static boolean sameLoadFailure(Throwable recorded, Throwable cleanup) {
        if (recorded == null) {
            return false;
        }
        if (recorded == cleanup) {
            return true;
        }
        // LoadContext.throwIfFailed() wraps only non-runtime failures this way.
        return recorded.getClass() == LoadException.class && cleanup.getClass() == LoadException.class &&
               recorded.getCause() != null && !(recorded.getCause() instanceof RuntimeException) &&
               recorded.getCause() == cleanup.getCause() && cleanup.getSuppressed().length == 0;
    }

    private static boolean referencesFailure(Throwable cleanup, Throwable failure) {
        if (cleanup.getCause() == failure) {
            return true;
        }
        for (Throwable suppressed : cleanup.getSuppressed()) {
            if (suppressed == failure) {
                return true;
            }
        }
        return false;
    }

    public void lock() {
        this.lock.lock();
    }

    public void unlock() {
        this.lock.unlock();
    }

    public void stop() {
        this.context().stopLoading();
        while (!this.finished) {
            try {
                Thread.sleep(1000);
            } catch (InterruptedException ignored) {
                // pass
            }
        }
        if (this.context().closed() && !this.cleanupFailed) {
            this.loader = null;
        }
        log.info("LoadTask {} stopped", this.id);
    }

    public void reconnect(String token) {
        Ex.check(token != null && !token.isEmpty(),
                 "A current authentication token is required to resume loading");
        Ex.check(this.options != null, "Load options shouldn't be null");
        try {
            LoadOptions runtimeOptions = (LoadOptions) this.options.clone();
            runtimeOptions.password = null;
            runtimeOptions.token = token;
            runtimeOptions.pdToken = null;
            runtimeOptions.trustStoreToken = null;
            this.loader = new HugeGraphLoader(runtimeOptions, false);
            // Resume and retry each start a new Loader summary. Keeping the
            // previous snapshot would incorrectly present it as this attempt.
            this.confirmedVertexWrites = 0L;
            this.confirmedEdgeWrites = 0L;
            this.finished = false;
        } catch (CloneNotSupportedException e) {
            throw new InternalException("Failed to prepare load task options",
                                        e);
        }
    }

    public LoadContext context() {
        Ex.check(this.loader != null, "loader shouldn't be null");
        return this.loader.context();
    }

    public void refreshConfirmedWrites() {
        this.confirmedVertexWrites = this.context().summary().vertexLoaded();
        this.confirmedEdgeWrites = this.context().summary().edgeLoaded();
    }

    @JsonProperty("load_progress")
    public float getLoadProgress() {
        if (this.fileTotalLines == null || this.fileTotalLines == 0) {
            return 0;
        }
        // Clamp instead of throwing: this getter runs during JSON
        // serialization, an exception here would fail the whole response
        if (this.fileReadLines == null) {
            return 0;
        }
        if (this.fileReadLines >= this.fileTotalLines) {
            return 100;
        }
        float actualProgress = (float) this.fileReadLines / this.fileTotalLines;
        return ((int) (actualProgress * 10000)) / 100.0F;
    }

    @JsonProperty("duration")
    @JsonSerialize(using = SerializeUtil.DurationSerializer.class)
    public Long getDuration() {
        this.lock.lock();
        try {
            return this.lastDuration + this.currDuration;
        } finally {
            this.lock.unlock();
        }
    }

    @JsonProperty("load_rate")
    public String getLoadRate() {
        long readLines = this.fileReadLines == null ? 0L : this.fileReadLines;
        long duration = this.getDuration();
        float rate;
        if (readLines == 0L || duration == 0L) {
            rate = 0.0F;
        } else {
            rate = readLines * 1000.0F / duration;
            rate = Math.round(rate * 1000) / 1000.0F;
        }
        return String.format("%s/s", rate);
    }
}
