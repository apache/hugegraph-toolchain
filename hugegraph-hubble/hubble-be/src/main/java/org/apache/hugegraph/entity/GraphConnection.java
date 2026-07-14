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

package org.apache.hugegraph.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;
import org.apache.hugegraph.annotation.MergeProperty;
import org.apache.hugegraph.common.Identifiable;
import org.apache.hugegraph.common.Mergeable;

import java.util.Date;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonIgnoreProperties({"protocol", "truststore_file", "truststore_password",
                       "password", "token"})
@TableName(value = "graph_connection", autoResultMap = true)
public class GraphConnection implements Identifiable, Mergeable {

    @TableId(type = IdType.AUTO)
    @MergeProperty(useNew = false)
    @JsonProperty("id")
    private Integer id;

    @MergeProperty
    @JsonProperty("name")
    private String name;

    @JsonProperty("route_type")
    private String routeType;

    @JsonProperty("pd_peers")
    private String pdPeers;

    @MergeProperty
    @JsonProperty("cluster")
    private String cluster;

    @MergeProperty
    @JsonProperty("graphspace")
    private String graphSpace;

    @MergeProperty
    @JsonProperty("graph")
    private String graph;

    @MergeProperty
    @JsonProperty("host")
    private String host;

    @MergeProperty
    @JsonProperty("port")
    private Integer port;

    @MergeProperty(useNew = false)
    @JsonProperty("timeout")
    private Integer timeout;

    @MergeProperty
    @JsonProperty("username")
    private String username;

    @MergeProperty
    @JsonProperty("password")
    @ToString.Exclude
    private String password;

    @MergeProperty
    @JsonProperty("token")
    @ToString.Exclude
    private String token;

    @MergeProperty(useNew = false)
    @JsonProperty("enabled")
    private Boolean enabled;

    @MergeProperty(useNew = false)
    @JsonProperty(value = "disable_reason")
    private String disableReason;

    @MergeProperty(useNew = false)
    @JsonProperty("create_time")
    private Date createTime;

    @TableField(exist = false)
    @MergeProperty(useNew = false)
    @JsonProperty("protocol")
    private String protocol;

    @TableField(exist = false)
    @MergeProperty(useNew = false)
    @JsonProperty("truststore_file")
    private String trustStoreFile;

    @TableField(exist = false)
    @MergeProperty(useNew = false)
    @JsonProperty("truststore_password")
    @ToString.Exclude
    private String trustStorePassword;

    public String getGraphId() {
        return String.format("%s/%s/%s", cluster, graphSpace, graph);
    }
}
