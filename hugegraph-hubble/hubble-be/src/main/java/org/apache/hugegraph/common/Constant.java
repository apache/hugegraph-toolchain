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

package org.apache.hugegraph.common;

import com.google.common.collect.ImmutableSet;

import java.nio.charset.Charset;
import java.util.Set;
import java.util.regex.Pattern;

import static java.nio.charset.StandardCharsets.UTF_8;

public final class Constant {

    public static final Charset CHARSET = UTF_8;

    public static final Set<String> LANGUAGES = ImmutableSet.of(
            "en_US", "zh_CN"
    );

    public static final String SERVER_NAME = "hugegraph-hubble";
    public static final String MODULE_NAME = "hubble-be";
    public static final String CONFIG_FILE = "hugegraph-hubble.properties";

    public static final String CONTROLLER_PACKAGE =
                               "org.apache.hugegraph.controller";

    public static final String COOKIE_USER = "user";
    public static final String API_V1_1 = "/api/v1.1/";
    public static final String API_V1_2 = "/api/v1.2/";
    public static final String API_V1_3 = "/api/v1.3/";
    public static final String API_VERSION = API_V1_3;

    public static final String MAPPING_FILE_NAME = "mapping.json";

    public static final int STATUS_OK = 200;
    public static final int STATUS_BAD_REQUEST = 400;
    public static final int STATUS_UNAUTHORIZED = 401;
    public static final int STATUS_NOT_FOUND = 404;
    public static final int STATUS_ILLEGAL_GREMLIN = 460;
    public static final int STATUS_INTERNAL_ERROR = 500;

    public static final String TOKEN_KEY = "auth_token";
    public static final String USERNAME_KEY = "username";

    public static final int NO_LIMIT = -1;

    public static final Pattern COMMON_NAME_PATTERN = Pattern.compile(
            "[A-Za-z0-9\u4e00-\u9fa5_]{1,48}"
    );

    public static final Pattern COMMON_REMARK_PATTERN = Pattern.compile(
            "[A-Za-z0-9\u4e00-\u9fa5_]{1,200}"
    );

    public static final Pattern SCHEMA_NAME_PATTERN = Pattern.compile(
            "[A-Za-z0-9\u4e00-\u9fa5_]{1,128}"
    );

    public static final String[] LIKE_WILDCARDS = {"%", "_", "^", "[", "]"};

    public static final String BUILT_IN = "neizhianli";
}
