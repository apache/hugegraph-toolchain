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

import java.util.Date;

import org.apache.hugegraph.structure.constant.HugeType;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;

public class Belong extends AuthElement {

    @JsonProperty(value = "graphspace", access = JsonProperty.Access.WRITE_ONLY)
    protected String graphSpace;
    @JsonProperty("user")
    protected Object user;
    @JsonProperty("group")
    protected Object group;
    @JsonProperty("role")
    protected Object role;
    @JsonProperty("belong_description")
    protected String description;
    @JsonProperty(value = "link", access = JsonProperty.Access.READ_ONLY)
    protected String link;

    @JsonProperty("belong_create")
    @JsonFormat(pattern = DATE_FORMAT)
    protected Date create;
    @JsonProperty("belong_update")
    @JsonFormat(pattern = DATE_FORMAT)
    protected Date update;
    @JsonProperty("belong_creator")
    protected String creator;

    @Override
    public String type() {
        return HugeType.BELONG.string();
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

    public String graphSpace() {
        return this.graphSpace;
    }

    public void graphSpace(String graphSpace) {
        this.graphSpace = graphSpace;
    }

    public String link() {
        return this.link;
    }

    public Object user() {
        return this.user;
    }

    public void user(Object user) {
        if (user instanceof User) {
            user = ((User) user).id();
        }
        this.user = user;
    }

    public Object group() {
        return this.group;
    }

    public void group(Object group) {
        if (group instanceof Group) {
            group = ((Group) group).id();
        }
        this.group = group;
    }

    public Object role() {
        return this.role;
    }

    public void role(Object role) {
        if (role instanceof Role) {
            role = ((Role) role).id();
        }
        this.role = role;
    }

    public String description() {
        return this.description;
    }

    public void description(String description) {
        this.description = description;
    }
}
