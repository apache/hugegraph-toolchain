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

package org.apache.hugegraph.spark.connector

import org.apache.hugegraph.spark.connector.options.HGOptions
import org.apache.hugegraph.spark.connector.writer.HGWriterBuilder
import org.apache.spark.sql.connector.catalog.{SupportsWrite, TableCapability}
import org.apache.spark.sql.connector.write.{LogicalWriteInfo, WriteBuilder}
import org.apache.spark.sql.types.StructType
import org.slf4j.LoggerFactory

import java.util
import scala.collection.JavaConverters.setAsJavaSetConverter

class HGTable(schema: StructType, hgOptions: HGOptions) extends SupportsWrite {

  private val LOG = LoggerFactory.getLogger(this.getClass)

  override def newWriteBuilder(info: LogicalWriteInfo): WriteBuilder = {
    LOG.info(s"User config keys: ${info.options().asCaseSensitiveMap().keySet()}")
    LOG.info(s"Logical Write schema: ${info.schema()}")
    new HGWriterBuilder(info.schema(), hgOptions)
  }

  override def name(): String = hgOptions.label()

  override def schema(): StructType = schema

  override def capabilities(): util.Set[TableCapability] =
    Set(
      TableCapability.BATCH_READ,
      TableCapability.BATCH_WRITE,
      TableCapability.ACCEPT_ANY_SCHEMA,
      TableCapability.OVERWRITE_BY_FILTER,
      TableCapability.OVERWRITE_DYNAMIC,
      TableCapability.STREAMING_WRITE,
      TableCapability.MICRO_BATCH_READ
    ).asJava
}
