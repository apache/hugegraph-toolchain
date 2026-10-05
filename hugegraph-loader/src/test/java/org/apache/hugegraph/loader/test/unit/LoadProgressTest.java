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

package org.apache.hugegraph.loader.test.unit;

import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;

import org.apache.hugegraph.loader.progress.LoadProgress;
import org.apache.hugegraph.loader.util.JsonUtil;

public class LoadProgressTest {

    @Test
    public void testTotalLoaded() {
        String json = "{" +
                      "\"vertex_progress\": 16," +
                      "\"edge_progress\": 12," +
                      "\"input_progress\": {" +
                      "    \"1\":{" +
                      "        \"type\":\"FILE\"," +
                      "        \"loaded_items\":{" +
                      "            \"vertex_person.csv\":{" +
                      "                \"name\":\"vertex_person.csv\"," +
                      "                \"last_modified\":1574346235000," +
                      "                \"checksum\":\"4250397517\"," +
                      "                \"offset\":6" +
                      "            }" +
                      "        }," +
                      "        \"loading_items\":{}" +
                      "    }," +
                      "    \"2\":{" +
                      "        \"type\":\"FILE\"," +
                      "        \"loaded_items\":{" +
                      "            \"vertex_software.txt\":{" +
                      "                \"name\":\"vertex_software.txt\"," +
                      "                \"last_modified\":1575427304000," +
                      "                \"checksum\":\"2992253526\"," +
                      "                \"offset\":2" +
                      "            }" +
                      "        }," +
                      "        \"loading_items\":{}" +
                      "    }," +
                      "    \"3\":{" +
                      "        \"type\":\"FILE\"," +
                      "        \"loaded_items\":{" +
                      "            \"edge_knows.json\":{" +
                      "                \"name\":\"edge_knows.json\"," +
                      "                \"last_modified\":1576658150000," +
                      "                \"checksum\":\"3108779382\"," +
                      "                \"offset\":2" +
                      "            }" +
                      "        }," +
                      "        \"loading_items\":{}" +
                      "    }," +
                      "    \"4\":{" +
                      "        \"type\":\"FILE\"," +
                      "        \"loaded_items\":{" +
                      "            \"edge_created.json\":{" +
                      "                \"name\":\"edge_created.json\"," +
                      "                \"last_modified\":1576659393000," +
                      "                \"checksum\":\"1026646359\"," +
                      "                \"offset\":4" +
                      "            }" +
                      "        }," +
                      "        \"loading_items\":{}" +
                      "    }" +
                      "}}";
        LoadProgress progress = JsonUtil.fromJson(json, LoadProgress.class);
        Assert.assertEquals(16, progress.vertexLoaded());
        Assert.assertEquals(12, progress.edgeLoaded());
    }
}
