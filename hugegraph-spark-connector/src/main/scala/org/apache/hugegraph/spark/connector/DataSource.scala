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
import org.apache.spark.sql.connector.catalog.{Table, TableProvider}
import org.apache.spark.sql.connector.expressions.Transform
import org.apache.spark.sql.sources.DataSourceRegister
import org.apache.spark.sql.types.StructType
import org.apache.spark.sql.util.CaseInsensitiveStringMap
import org.slf4j.LoggerFactory

import java.util

class DataSource extends TableProvider with DataSourceRegister {

  private val LOG = LoggerFactory.getLogger(this.getClass)

  private var schema: StructType = _

  private var hgOptions: HGOptions = _

  override def inferSchema(options: CaseInsensitiveStringMap): StructType = {
    hgOptions = new HGOptions(options.asCaseSensitiveMap())
    LOG.info(s"HugeGraph option keys: ${hgOptions.getAllParameters.keySet()}")
    schema = new StructType()
    LOG.info(s"Writer infer schema: ${schema}")
    schema
  }

  override def getTable(schema: StructType, partitioning: Array[Transform],
                        properties: util.Map[String, String]): Table = {
    LOG.info(s"Get table schema: ${schema}")
    new HGTable(schema, hgOptions)
  }

  //  override def supportsExternalMetadata(): Boolean = true

  override def shortName(): String = "HugeGraph"
}
