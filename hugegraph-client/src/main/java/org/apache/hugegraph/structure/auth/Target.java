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

package org.apache.hugegraph.structure.auth;

import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.hugegraph.structure.constant.HugeType;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonSetter;

public class Target extends AuthElement {

    @JsonProperty("target_name")
    protected String name;
    @JsonProperty(value = "graphspace",
                  access = JsonProperty.Access.WRITE_ONLY)
    protected String graphSpace;
    @JsonProperty("target_graph")
    protected String graph;
    @JsonProperty("target_url")
    protected String url;
    @JsonProperty("target_description")
    protected String description;
    // Always stored as List<Map> for compatibility with server
    @JsonProperty("target_resources")
    protected Object resources;

    @JsonProperty("target_create")
    @JsonFormat(pattern = DATE_FORMAT)
    protected Date create;
    @JsonProperty("target_update")
    @JsonFormat(pattern = DATE_FORMAT)
    protected Date update;
    @JsonProperty("target_creator")
    protected String creator;

    @Override
    public String type() {
        return HugeType.TARGET.string();
    }

    @Override
    public Date createTime() {
        return this.create;
    }

    @Override
    public Date updateTime() {
        return this.update;
    }

    @Override
    public String creator() {
        return this.creator;
    }

    public String name() {
        return this.name;
    }

    public void name(String name) {
        this.name = name;
    }

    public String graphSpace() {
        return this.graphSpace;
    }

    public void graphSpace(String graphSpace) {
        this.graphSpace = graphSpace;
    }

    public String graph() {
        return this.graph;
    }

    public void graph(String graph) {
        this.graph = graph;
    }

    public String url() {
        return this.url;
    }

    public void url(String url) {
        this.url = url;
    }

    public String description() {
        return this.description;
    }

    public void description(String description) {
        this.description = description;
    }

    /**
     * Get resources
     * Returns null if resources is not set or invalid format
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> resourcesList() {
        if (this.resources == null) {
            return null;
        }
        if (this.resources instanceof List) {
            return (List<Map<String, Object>>) this.resources;
        }
        return null;
    }

    /**
     * Get resources as Map (for convenient reading)
     * Server response: {"GREMLIN": [{"type":"GREMLIN", "label":"*", "properties":null}]}
     */
    @SuppressWarnings("unchecked")
    public Map<String, List<HugeResource>> resources() {
        if (this.resources == null) {
            return null;
        }
        // This should not happen in normal cases as JsonSetter converts Map to List
        if (this.resources instanceof Map) {
            return (Map<String, List<HugeResource>>) this.resources;
        }
        return null;
    }

    /**
     * Handle Map format from server response and convert to List format
     * Server returns: {"GREMLIN": [{"type":"GREMLIN", "label":"*", "properties":null}]}
     */
    @JsonSetter("target_resources")
    @SuppressWarnings("unchecked")
    protected void setResourcesFromJson(Object value) {
        if (value == null) {
            this.resources = null;
            return;
        }
        // If server returns Map format, convert to List format
        if (value instanceof Map) {
            Map<String, List<Map<String, Object>>> map =
                    (Map<String, List<Map<String, Object>>>) value;
            List<Map<String, Object>> list = new ArrayList<>();
            for (List<Map<String, Object>> resList : map.values()) {
                list.addAll(resList);
            }
            this.resources = list;
        } else {
            this.resources = value;
        }
    }

    /**
     * Set resources as List (client request format)
     * Client sends: [{"type":"GREMLIN", "label":"*", "properties":null}]
     */
    public void resources(List<Map<String, Object>> resources) {
        this.resources = resources;
    }

    /**
     * Set resources as Map (for convenient usage)
     * Will be converted to List format when sending to server
     */
    public void resources(Map<String, List<HugeResource>> resources) {
        // Convert Map to List for server API
        if (resources == null) {
            this.resources = null;
            return;
        }
        List<Map<String, Object>> list = new ArrayList<>();
        for (List<HugeResource> resList : resources.values()) {
            for (HugeResource res : resList) {
                Map<String, Object> resMap = new HashMap<>();
                resMap.put("type", res.resourceType().toString());
                resMap.put("label", res.label());
                resMap.put("properties", res.properties());
                list.add(resMap);
            }
        }
        this.resources = list;
    }
}
