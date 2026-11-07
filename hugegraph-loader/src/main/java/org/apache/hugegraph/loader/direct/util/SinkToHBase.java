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

package org.apache.hugegraph.loader.direct.util;

import java.io.IOException;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.Path;
import org.apache.hadoop.hbase.HBaseConfiguration;
import org.apache.hadoop.hbase.TableName;
import org.apache.hadoop.hbase.client.Connection;
import org.apache.hadoop.hbase.client.ConnectionFactory;
import org.apache.hadoop.hbase.client.HRegionLocator;
import org.apache.hadoop.hbase.client.Table;
import org.apache.hadoop.hbase.client.TableDescriptor;
import org.apache.hadoop.hbase.io.ImmutableBytesWritable;
import org.apache.hadoop.hbase.tool.BulkLoadHFilesTool;
import org.apache.hadoop.hbase.util.Bytes;
import org.apache.hadoop.hbase.util.Pair;
import org.apache.hugegraph.loader.executor.LoadOptions;
import org.apache.hugegraph.util.Log;
import org.apache.spark.Partitioner;
import org.slf4j.Logger;

import scala.Tuple2;

public class SinkToHBase implements Serializable {

    private final LoadOptions loadOptions;
    public static final Logger LOG = Log.logger(SinkToHBase.class);

    public SinkToHBase(LoadOptions loadOptions) {
        this.loadOptions = loadOptions;
    }

    public Optional<Configuration> getHBaseConfiguration() {
        Configuration baseConf = HBaseConfiguration.create();
        baseConf.set("hbase.zookeeper.quorum", this.loadOptions.hbaseZKQuorum);
        baseConf.set("hbase.zookeeper.property.clientPort", this.loadOptions.hbaseZKPort);
        baseConf.set("zookeeper.znode.parent", this.loadOptions.hbaseZKParent);
        return Optional.of(baseConf);
    }

    private Optional<Connection> getConnection() {
        Optional<Configuration> baseConf = getHBaseConfiguration();
        Connection conn = null;
        try {
            conn = ConnectionFactory.createConnection(baseConf.get());
        } catch (IOException e) {
            LOG.error("get hbase connection failed", e);
        }
        return Optional.ofNullable(conn);
    }

    public Tuple2<IntPartitioner, TableDescriptor> getPartitionerByTableName(
            int numPartitions, String tableName) throws IOException {
        Optional<Connection> optionalConnection = getConnection();
        TableDescriptor descriptor = optionalConnection.get()
                                                       .getTable(TableName.valueOf(tableName))
                                                       .getDescriptor();
        LOG.debug("getPartitionerByTableName get TableDescriptor " + descriptor.getTableName());
        optionalConnection.get().close();
        return new Tuple2<>(new IntPartitioner(numPartitions, tableName), descriptor);
    }

    public void loadHfiles(String path, String tableName) throws Exception {
        Connection conn = getConnection().get();
        Table table = conn.getTable(TableName.valueOf(tableName));
        Configuration conf = conn.getConfiguration();
        BulkLoadHFilesTool bulkLoadHFilesTool = new BulkLoadHFilesTool(conf);
        bulkLoadHFilesTool.bulkLoad(table.getName(), new Path(path));
        table.close();
        conn.close();
    }

    public class IntPartitioner extends Partitioner {

        private final int numPartitions;
        public Map<List<String>, Integer> rangeMap;
        private String tableName;

        public IntPartitioner(int numPartitions, String tableName) throws IOException {
            this.numPartitions = numPartitions;
            this.rangeMap = getRangeMap(tableName);
            this.tableName = tableName;
        }

        private Map<List<String>, Integer> getRangeMap(String tableName) throws IOException {
            Connection conn = getConnection().get();
            HRegionLocator locator =
                    (HRegionLocator) conn.getRegionLocator(TableName.valueOf(tableName));
            Pair<byte[][], byte[][]> startEndKeys = locator.getStartEndKeys();
            Map<List<String>, Integer> rangeMap = new HashMap<>();
            for (int i = 0; i < startEndKeys.getFirst().length; i++) {
                String startKey = Bytes.toString(startEndKeys.getFirst()[i]);
                String endKey = Bytes.toString(startEndKeys.getSecond()[i]);
                rangeMap.put(new ArrayList<>(Arrays.asList(startKey, endKey)), i);
            }
            conn.close();
            return rangeMap;
        }

        @Override
        public int numPartitions() {
            return numPartitions;
        }

        @Override
        public int getPartition(Object key) {
            if (key instanceof ImmutableBytesWritable immutableBytesWritableKey) {
                try {
                    if (rangeMap == null || rangeMap.isEmpty()) {
                        rangeMap = getRangeMap(this.tableName);
                    }
                    String keyString = Bytes.toString(immutableBytesWritableKey.get());
                    for (List<String> range : rangeMap.keySet()) {
                        if (keyString.compareToIgnoreCase(range.get(0)) >= 0 &&
                            ((keyString.compareToIgnoreCase(range.get(1)) < 0) ||
                             "".equals(range.get(1)))) {
                            return rangeMap.get(range);
                        }
                    }
                    LOG.error("Didn't find proper key in rangeMap, so returning 0 ...");
                    return 0;
                } catch (Exception e) {
                    LOG.error("When trying to get partitionID, " +
                              "encountered exception: {} \t key = {}", e, key);
                    return 0;
                }
            } else {
                LOG.error("key is NOT ImmutableBytesWritable type ...");
                return 0;
            }
        }
    }
}
