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

package org.apache.hugegraph.spark.connector.writer

import org.apache.hugegraph.spark.connector.constant.DataTypeEnum
import org.apache.hugegraph.spark.connector.options.HGOptions
import org.apache.spark.sql.catalyst.InternalRow
import org.apache.spark.sql.connector.write.{DataWriter, DataWriterFactory}
import org.apache.spark.sql.types.StructType
import org.slf4j.LoggerFactory

class HGBatchWriterFactory(schema: StructType, hgOptions: HGOptions) extends DataWriterFactory {

  private val LOG = LoggerFactory.getLogger(this.getClass)

  override def createWriter(partitionId: Int, taskId: Long): DataWriter[InternalRow] = {
    val dataType = hgOptions.dataType()
    LOG.info(s"Create a ${dataType} writer, partitionId: ${partitionId}, taskId: ${taskId}")
    if (DataTypeEnum.isVertex(dataType)) {
      new HGVertexWriter(schema, hgOptions)
    }
    else {
      new HGEdgeWriter(schema, hgOptions)
    }
  }
}
