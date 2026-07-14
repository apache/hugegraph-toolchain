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

package org.apache.hugegraph.entity.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

import org.apache.hugegraph.common.Identifiable;

import java.util.Date;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserEntity implements Identifiable {

    @JsonProperty("id")
    private String id;

    @JsonProperty("user_name")
    private String name;

    @JsonProperty("user_nickname")
    private String nickname;

    @JsonProperty("user_email")
    private String email;

    @JsonProperty(value = "user_password", access = JsonProperty.Access.WRITE_ONLY)
    @ToString.Exclude
    private String password;

    @JsonProperty("user_phone")
    private String phone;

    @JsonProperty("user_avatar")
    private String avatar;

    @JsonProperty("user_description")
    private String description;

    @JsonProperty("user_create")
    protected Date create;
    @JsonProperty("user_update")
    protected Date update;
    @JsonProperty("user_creator")
    protected String creator;

    @JsonProperty("adminSpaces")
    protected List<String> adminSpaces;

    @JsonProperty("resSpaces")
    protected List<String> resSpaces;

    @JsonProperty("spacenum")
    protected Integer spacenum;

    private boolean isSuperadmin;

    @JsonIgnore
    private boolean superadminSpecified;

    @JsonProperty("is_superadmin")
    public boolean isSuperadmin() {
        return this.isSuperadmin;
    }

    @JsonProperty("is_superadmin")
    public void setSuperadmin(boolean superadmin) {
        this.isSuperadmin = superadmin;
        this.superadminSpecified = true;
    }

    public boolean hasSuperadmin() {
        return this.superadminSpecified;
    }
}
