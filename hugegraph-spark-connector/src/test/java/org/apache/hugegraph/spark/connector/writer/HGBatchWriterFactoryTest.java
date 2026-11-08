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

package org.apache.hugegraph.spark.connector.writer;

import java.util.HashMap;
import java.util.Map;

import org.apache.hugegraph.spark.connector.options.HGOptions;
import org.apache.hugegraph.spark.connector.utils.HGEnvUtils;
import org.apache.hugegraph.testutil.Assert;
import org.apache.spark.sql.catalyst.InternalRow;
import org.apache.spark.sql.connector.write.DataWriter;
import org.apache.spark.sql.types.DataTypes;
import org.apache.spark.sql.types.StructType;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

public class HGBatchWriterFactoryTest {

    @BeforeClass
    public static void setUp() {
        HGEnvUtils.createEnv();
    }

    @AfterClass
    public static void tearDown() {
        HGEnvUtils.destroyEnv();
    }

    @Test
    public void testDataTypeIgnoresCase() throws Exception {
        StructType schema = new StructType().add("name", DataTypes.StringType)
                                            .add("age", DataTypes.IntegerType)
                                            .add("city", DataTypes.StringType);
        // HGOptions accepts the data type in any case, so the writer must too
        for (String dataType : new String[]{"vertex", "Vertex", "VERTEX"}) {
            HGBatchWriterFactory factory = new HGBatchWriterFactory(schema,
                                                                    vertexOptions(dataType));
            DataWriter<InternalRow> writer = factory.createWriter(0, 0L);
            try {
                Assert.assertTrue(dataType + " -> " + writer.getClass().getSimpleName(),
                                  writer instanceof HGVertexWriter);
            } finally {
                try {
                    // Leave the graph out of LOADING mode
                    writer.abort();
                } finally {
                    writer.close();
                }
            }
        }
    }

    private static HGOptions vertexOptions(String dataType) {
        Map<String, String> configs = new HashMap<>();
        configs.put("host", HGEnvUtils.HOST);
        configs.put("port", HGEnvUtils.PORT);
        configs.put("graph", HGEnvUtils.GRAPH);
        configs.put("protocol", HGEnvUtils.PROTOCOL);
        configs.put("username", "admin");
        configs.put("token", "pa");
        configs.put("data-type", dataType);
        configs.put("label", "person");
        configs.put("id", "name");
        configs.putAll(HGEnvUtils.tlsOptions());
        return new HGOptions(configs);
    }
}
