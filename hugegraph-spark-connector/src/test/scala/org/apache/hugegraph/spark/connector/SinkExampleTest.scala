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

import org.apache.hugegraph.driver.HugeClient
import org.apache.hugegraph.spark.connector.utils.HGEnvUtils
import org.apache.hugegraph.structure.graph.Vertex
import org.apache.spark.sql.{SaveMode, SparkSession}
import org.junit.Assert.{assertEquals, assertTrue}
import org.junit.runners.MethodSorters
import org.junit.{AfterClass, BeforeClass, FixMethodOrder, Test}

import java.util
import scala.collection.JavaConverters.iterableAsScalaIterableConverter

object SinkExampleTest {

  var client: HugeClient = _

  val sparkSession: SparkSession = SparkSession.builder()
    .master(HGEnvUtils.sparkTestMaster())
    .config("spark.ui.enabled", "false")
    .config("spark.sql.shuffle.partitions", "2")
    .appName(this.getClass.getSimpleName)
    .getOrCreate()

  @BeforeClass
  def beforeClass(): Unit = {
    HGEnvUtils.createEnv()
    client = HGEnvUtils.getHugeClient
  }

  @AfterClass
  def afterClass(): Unit = {
    HGEnvUtils.destroyEnv()
    sparkSession.stop()
  }
}

@FixMethodOrder(MethodSorters.NAME_ASCENDING)
class SinkExampleTest {

  val client: HugeClient = SinkExampleTest.client
  val sparkSession: SparkSession = SinkExampleTest.sparkSession

  val DEFAULT_ENTRANCE: String = "org.apache.hugegraph.spark.connector.DataSource"
  val DEFAULT_HOST: String = HGEnvUtils.HOST
  val DEFAULT_PORT: String = HGEnvUtils.PORT
  val DEFAULT_GRAPH: String = HGEnvUtils.GRAPH

  @Test
  def testFirstInsertVertexPerson(): Unit = {
    val df = sparkSession.createDataFrame(Seq(
      Tuple3("marko", 29, "Beijing"),
      Tuple3("vadas", 27, "HongKong"),
      Tuple3("Josh", 32, "Beijing"),
      Tuple3("peter", 35, "ShangHai"),
      Tuple3("li,nary", 26, "Wu,han"),
      Tuple3("张三🙂", 18, "杭州"),
    )).toDF("name", "age", "city")

    df.show()

    df.write
      .format(DEFAULT_ENTRANCE)
      .option("host", DEFAULT_HOST)
      .option("port", DEFAULT_PORT)
      .option("graph", DEFAULT_GRAPH)
      .option("protocol", HGEnvUtils.PROTOCOL)
      .options(HGEnvUtils.tlsOptions())
      .option("username", "admin")
      .option("token", "pa")
      .option("data-type", "vertex")
      .option("label", "person")
      .option("id", "name")
      .option("batch-size", 2)
      .mode(SaveMode.Overwrite)
      .save()

    val vertices: util.List[Vertex] = client.graph().listVertices("person")
    assertEquals(6, vertices.size())
    val unicodeVertex = client.graph().getVertex("张三🙂")
    assertEquals("张三🙂", unicodeVertex.properties().get("name"))
    assertEquals("杭州", unicodeVertex.properties().get("city"))
  }

  @Test
  def testFirstInsertVertexSoftware(): Unit = {
    val df = sparkSession.createDataFrame(Seq(
      Tuple4("lop", "java", 328L, "ISBN978-7-107-18618-5"),
      Tuple4("ripple", "python", 199L, "ISBN978-7-100-13678-5"),
    )).toDF("name", "lang", "price", "ISBN")

    df.show()

    df.write
      .format(DEFAULT_ENTRANCE)
      .option("host", DEFAULT_HOST)
      .option("port", DEFAULT_PORT)
      .option("graph", DEFAULT_GRAPH)
      .option("protocol", HGEnvUtils.PROTOCOL)
      .options(HGEnvUtils.tlsOptions())
      .option("username", "admin")
      .option("token", "pa")
      .option("data-type", "vertex")
      .option("label", "software")
      .option("ignored-fields", "ISBN")
      .option("batch-size", 2)
      .mode(SaveMode.Overwrite)
      .save()

    val vertices = client.graph().listVertices("software").asScala.toList
    assertEquals(2, vertices.size)

    for (vertex <- vertices) {
      val properties = vertex.properties()
      assertTrue(!properties.containsKey("ISBN"))
    }
  }

  @Test
  def testSecondInsertEdgeKnows(): Unit = {
    val df = sparkSession.createDataFrame(Seq(
      Tuple4("marko", "vadas", "20160110", 0.5),
      Tuple4("peter", "Josh", "20230801", 1.0),
      Tuple4("peter", "li,nary", "20130220", 2.0)
    )).toDF("source", "target", "date", "weight")

    df.show()

    df.write
      .format(DEFAULT_ENTRANCE)
      .option("host", DEFAULT_HOST)
      .option("port", DEFAULT_PORT)
      .option("graph", DEFAULT_GRAPH)
      .option("protocol", HGEnvUtils.PROTOCOL)
      .options(HGEnvUtils.tlsOptions())
      .option("username", "admin")
      .option("token", "pa")
      .option("data-type", "edge")
      .option("label", "knows")
      .option("source-name", "source")
      .option("target-name", "target")
      .option("batch-size", 2)
      .mode(SaveMode.Overwrite)
      .save()

    val edges = client.graph().listEdges("knows")
    assertEquals(3, edges.size())
  }

  @Test
  def testSecondInsertEdgeCreated(): Unit = {
    val df = sparkSession.createDataFrame(Seq(
      Tuple4("marko", "lop", "20171210", 0.5),
      Tuple4("Josh", "lop", "20091111", 0.4),
      Tuple4("peter", "ripple", "20171210", 1.0),
      Tuple4("vadas", "lop", "20171210", 0.2)
    )).toDF("source", "name", "date", "weight")

    df.show()

    df.write
      .format(DEFAULT_ENTRANCE)
      .option("host", DEFAULT_HOST)
      .option("port", DEFAULT_PORT)
      .option("graph", DEFAULT_GRAPH)
      .option("protocol", HGEnvUtils.PROTOCOL)
      .options(HGEnvUtils.tlsOptions())
      .option("username", "admin")
      .option("token", "pa")
      .option("data-type", "edge")
      .option("label", "created")
      .option("source-name", "source") // customize
      .option("target-name", "name") // pk
      .option("batch-size", 2)
      .mode(SaveMode.Overwrite)
      .save()

    val edges = client.graph().listEdges("created")
    assertEquals(4, edges.size())
  }
}
