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

import org.apache.hugegraph.spark.connector.builder.VertexBuilder
import org.apache.hugegraph.spark.connector.client.HGLoadContext
import org.apache.hugegraph.spark.connector.mapping.VertexMapping
import org.apache.hugegraph.spark.connector.options.HGOptions
import org.apache.hugegraph.spark.connector.utils.HGUtils
import org.apache.hugegraph.spark.connector.utils.HGBuildUtils
import org.apache.hugegraph.structure.graph.Vertex
import org.apache.spark.sql.catalyst.InternalRow
import org.apache.spark.sql.connector.write.{DataWriter, WriterCommitMessage}
import org.apache.spark.sql.types.StructType
import org.slf4j.LoggerFactory

import scala.collection.mutable.ListBuffer

class HGVertexWriter(schema: StructType, hgOptions: HGOptions) extends DataWriter[InternalRow] {

  private val LOG = LoggerFactory.getLogger(this.getClass)

  val context = new HGLoadContext(hgOptions)
  context.updateSchemaCache()
  context.setLoadingMode()

  val mapping: VertexMapping = HGUtils.vertexMappingFromConf(hgOptions)
  val builder = new VertexBuilder(context, mapping)

  private var verticesBuffer: ListBuffer[Vertex] = new ListBuffer()

  var cnt = 0

  override def write(record: InternalRow): Unit = {
    val vertices = HGBuildUtils.buildVertices(record, schema, builder)

    for (vertex <- vertices) {
      verticesBuffer.+=(vertex)
    }

    if (verticesBuffer.size >= hgOptions.batchSize()) {
      sinkOnce()
    }
  }

  private def sinkOnce(): Unit = {
    LOG.info(s"Writer once: ${verticesBuffer.toList}")
    val successfulVertices = HGBuildUtils.saveVertices(context, verticesBuffer.toList)
    cnt += successfulVertices.length
    verticesBuffer.clear()
  }

  override def commit(): WriterCommitMessage = {
    if (verticesBuffer.nonEmpty) {
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
