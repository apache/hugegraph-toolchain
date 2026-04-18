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
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.stream.Collectors;

import org.apache.hugegraph.annotation.MergeProperty;
import org.apache.hugegraph.entity.enums.FileMappingStatus;
import org.apache.hugegraph.handler.EdgeMappingTypeHandler;
import org.apache.hugegraph.handler.VertexMappingTypeHandler;
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
import lombok.experimental.Accessors;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Accessors(chain = true)
@TableName(value = "file_mapping", autoResultMap = true)
public class FileMapping {

    @TableId(type = IdType.AUTO)
    @JsonProperty("id")
    private Integer id;

    @TableField("conn_id")
    @JsonIgnore
    private Integer connId;

    @TableField(value = "job_id")
    @MergeProperty
    @JsonProperty("job_id")
    private Integer jobId;

    @TableField("name")
    @JsonProperty("name")
    private String name;

    @TableField("path")
    @JsonIgnore
    private String path;

    @TableField("total_lines")
    @JsonProperty("total_lines")
    private long totalLines;

    @TableField("total_size")
    @JsonProperty("total_size")
    @JsonSerialize(using = SerializeUtil.SizeSerializer.class)
    private long totalSize;

    @TableField("file_status")
    @MergeProperty
    @JsonProperty("file_status")
    private FileMappingStatus fileStatus;

    @TableField(value = "file_setting", typeHandler = JacksonTypeHandler.class)
    @JsonProperty("file_setting")
    private FileSetting fileSetting;

    @TableField(value = "vertex_mappings",
                typeHandler = VertexMappingTypeHandler.class)
    @JsonProperty("vertex_mappings")
    private Set<VertexMapping> vertexMappings;

    @TableField(value = "edge_mappings",
                typeHandler = EdgeMappingTypeHandler.class)
    @JsonProperty("edge_mappings")
    private Set<EdgeMapping> edgeMappings;

    @TableField(value = "load_parameter",
                typeHandler = JacksonTypeHandler.class)
    @JsonProperty("load_parameter")
    private LoadParameter loadParameter;

    @MergeProperty(useNew = false)
    @JsonProperty("create_time")
    private Date createTime;

    @MergeProperty(useNew = false)
    @JsonProperty("update_time")
    private Date updateTime;

    @JsonProperty("total_size_bytes")
    public long getTotalSizeBytes() {
        return this.totalSize;
    }

    public FileMapping(int connId, String name, String path) {
        this(connId, name, path, HubbleUtil.nowDate());
    }

    public FileMapping(int connId, String name, String path,
                       Date lastAccessTime) {
        this.id = null;
        this.connId = connId;
        this.name = name;
        this.path = path;
        this.fileSetting = new FileSetting();
        this.vertexMappings = new LinkedHashSet<>();
        this.edgeMappings = new LinkedHashSet<>();
        this.loadParameter = new LoadParameter();
        this.createTime = lastAccessTime;
        this.updateTime = lastAccessTime;
    }

    public VertexMapping getVertexMapping(String vmId) {
        for (VertexMapping mapping : this.vertexMappings) {
            if (mapping.getId().equals(vmId)) {
                return mapping;
            }
        }
        return null;
    }

    public EdgeMapping getEdgeMapping(String emId) {
        for (EdgeMapping mapping : this.edgeMappings) {
            if (mapping.getId().equals(emId)) {
                return mapping;
            }
        }
        return null;
    }

    @JsonIgnore
    public Set<String> getVertexMappingLabels() {
        if (this.getVertexMappings() == null) {
            return new HashSet<>();
        }
        return this.getVertexMappings().stream()
                   .map(ElementMapping::getLabel)
                   .collect(Collectors.toSet());
    }

    @JsonIgnore
    public Set<String> getEdgeMappingLabels() {
        if (this.getEdgeMappings() == null) {
            return new HashSet<>();
        }
        return this.getEdgeMappings().stream()
                   .map(ElementMapping::getLabel)
                   .collect(Collectors.toSet());
    }
}
