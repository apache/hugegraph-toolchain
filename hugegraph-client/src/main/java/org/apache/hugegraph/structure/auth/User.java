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

import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Map;

import org.apache.hugegraph.structure.constant.HugeType;
import org.apache.hugegraph.util.JsonUtil;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;

public class User extends AuthElement {

    @JsonProperty("user_name")
    private String name;
    @JsonProperty("user_nickname")
    private String nickname;
    @JsonProperty("user_password")
    private String password;
    @JsonProperty("user_phone")
    private String phone;
    @JsonProperty("user_email")
    private String email;
    @JsonProperty("user_avatar")
    private String avatar;
    @JsonProperty("user_description")
    private String description;
    @JsonProperty("department") // User's department
    private String department;
    @JsonProperty("image_url") // User's avatar URL
    private String imageUrl;


    @JsonProperty("user_create")
    @JsonFormat(pattern = DATE_FORMAT)
    protected Date create;
    @JsonProperty("user_update")
    @JsonFormat(pattern = DATE_FORMAT)
    protected Date update;
    @JsonProperty("user_creator")
    protected String creator;

    @Override
    public String type() {
        return HugeType.USER.string();
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

    public String nickname() {
        return this.nickname;
    }

    public void nickname(String nickname) {
        this.nickname = nickname;
    }

    public String imageUrl() {
        return imageUrl;
    }

    public void imageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }

    public String password() {
        return this.password;
    }

    public void password(String password) {
        this.password = password;
    }

    public String phone() {
        return this.phone;
    }

    public void phone(String phone) {
        this.phone = phone;
    }

    public String email() {
        return this.email;
    }

    public void email(String email) {
        this.email = email;
    }

    public String avatar() {
        return this.avatar;
    }

    public void avatar(String avatar) {
        this.avatar = avatar;
    }

    public String description() {
        return this.description;
    }

    public String department() {
        return this.department;
    }

    public String department(String department) {
        return this.department = department;
    }

    public void description(String description) {
        this.description = description;
    }

    public static class UserRole {

        // Mapping of: graphSpace -> graph -> permission -> resourceType -> resources
        @JsonProperty("roles")
        private Map<String, Map<String, Map<HugePermission, Map<String,
                List<HugeResource>>>>> roles;

        public Map<String, Map<String, Map<HugePermission, Map<String,
                List<HugeResource>>>>> roles() {
            return Collections.unmodifiableMap(this.roles);
        }

        @Override
        public String toString() {
            return JsonUtil.toJson(this);
        }
    }
}
