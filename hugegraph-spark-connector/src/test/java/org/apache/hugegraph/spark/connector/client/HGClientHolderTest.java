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

package org.apache.hugegraph.spark.connector.client;

import java.util.HashMap;
import java.util.Map;

import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.spark.connector.options.HGOptions;
import org.apache.hugegraph.spark.connector.utils.HGEnvUtils;
import org.junit.Assert;
import org.junit.Test;

public class HGClientHolderTest {

    @Test
    public void testHGClientHolder() {
        Map<String, String> configs = new HashMap<>();
        configs.put("host", HGEnvUtils.HOST);
        configs.put("port", HGEnvUtils.PORT);
        configs.put("graph", HGEnvUtils.GRAPH);
        configs.put("protocol", HGEnvUtils.PROTOCOL);

        configs.put("data-type", "vertex");
        configs.put("label", "person");
        configs.put("id", "name");
        configs.putAll(HGEnvUtils.tlsOptions());
        HGOptions options = new HGOptions(configs);
        HugeClient client = HGClientHolder.create(options);
        Assert.assertNotNull(client);
        client.close();
    }
}
