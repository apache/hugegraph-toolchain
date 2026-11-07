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

import org.apache.hugegraph.spark.connector.builder.EdgeBuilder
import org.apache.hugegraph.spark.connector.client.HGLoadContext
import org.apache.hugegraph.spark.connector.mapping.EdgeMapping
import org.apache.hugegraph.spark.connector.options.HGOptions
import org.apache.hugegraph.spark.connector.utils.HGUtils
import org.apache.hugegraph.spark.connector.utils.HGBuildUtils
import org.apache.hugegraph.structure.graph.Edge
import org.apache.spark.sql.catalyst.InternalRow
import org.apache.spark.sql.connector.write.{DataWriter, WriterCommitMessage}
import org.apache.spark.sql.types.StructType
import org.slf4j.LoggerFactory

import scala.collection.mutable.ListBuffer

class HGEdgeWriter(schema: StructType, hgOptions: HGOptions) extends DataWriter[InternalRow] {

  private val LOG = LoggerFactory.getLogger(this.getClass)

  val context = new HGLoadContext(hgOptions)
  context.updateSchemaCache()
  context.setLoadingMode()

  val mapping: EdgeMapping = HGUtils.edgeMappingFromConf(hgOptions)
  val builder = new EdgeBuilder(context, mapping)

  private var edgesBuffer: ListBuffer[Edge] = new ListBuffer()

  var cnt = 0

  override def write(record: InternalRow): Unit = {
    val edges = HGBuildUtils.buildEdges(record, schema, builder)

    for (edge <- edges) {
      edgesBuffer.+=(edge)
    }

    if (edgesBuffer.size >= hgOptions.batchSize()) {
      sinkOnce()
    }
  }

  private def sinkOnce(): Unit = {
    LOG.info(s"Writer once: ${edgesBuffer.toList}")
    val successfulEdges = HGBuildUtils.saveEdges(context, edgesBuffer.toList)
    cnt += successfulEdges.length
    edgesBuffer.clear()
  }

  override def commit(): WriterCommitMessage = {
    if (edgesBuffer.nonEmpty) {
      sinkOnce()
    }
    context.unsetLoadingMode()
    HGCommitMessage(List("Success cnt: " + cnt))
  }

  override def abort(): Unit = {
    context.unsetLoadingMode()
    LOG.error("Load Task abort.")
  }

  override def close(): Unit = {
    context.close()
  }
}
