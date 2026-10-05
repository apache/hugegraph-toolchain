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

package org.apache.hugegraph.test.functional;

public class AuthTest {

    public static final String DEFAULT_URL = "./auth-backup-restore/";
    public static final String DEFAULT_TEST_URL = "/auth/";
    public static final String USER_NAME = "admin";
    public static final String USER_PASSWORD = "pa";
    public static final String URL = System.getProperty("tools.test.url", "http://127.0.0.1:8080");
    public static final String GRAPH = "hugegraph";
    public static final Integer TIME_OUT = 30;
    public static final String TRUST_STORE_FILE = "";
    public static final String TRUST_STORE_PASSWORD = "";
}
