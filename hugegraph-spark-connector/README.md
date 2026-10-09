<!--
Licensed to the Apache Software Foundation (ASF) under one or more
contributor license agreements. See the NOTICE file distributed with this
work for additional information regarding copyright ownership. The ASF
licenses this file to You under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance with the License.
You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
License for the specific language governing permissions and limitations
under the License.
-->

# HugeGraph Spark Connector

[![License](https://img.shields.io/badge/license-Apache%202-0E78BA.svg)](https://www.apache.org/licenses/LICENSE-2.0.html)

HugeGraph Spark Connector writes Spark DataFrames to HugeGraph through the Spark DataSource API.

## Building

Required:

- Java 17 (driver and every executor)
- Spark 3.5.8 with Scala 2.12 (built with Scala 2.12.18)
- Maven 3.6.3+

The default Maven commands below compile against Common 1.8.0, which uses the declared request-body charset and defaults to UTF-8. Retain the UTF-8 submission options below to keep Spark drivers and executors consistent. The compile-time SDK version is independent of the Server version used by the runtime compatibility tests.

To build without executing tests:

```bash
mvn clean package -DskipTests
```

To build with default tests:

```bash
mvn clean package
```

The integration tests clear the configured graph before writing vertices and edges through Spark. Use a disposable server and graph. The defaults are `http://127.0.0.1:8080` and `hugegraph`; set `-Dhugegraph.test.url=... -Dhugegraph.test.graph=...` to select another target. The Surefire JVM starts with `-Dfile.encoding=UTF-8` so these fixtures do not depend on the caller's locale. The default Spark master is `local[2]`. `-Dspark.test.master=...` accepts only `local` or `local[...]`, for example `local[4]` or `local[*]`; remote masters and `local-cluster` are rejected because the Maven fixture does not distribute connector classes or dependencies to separate executors. CI runs this embedded fixture against both the locked Server 1.8 source build on Java 17 and the official Server 1.7 binary on its Java 11 JVM; the connector compiles against SDK 1.8.0 and runs on Java 17 in both lanes. Packaged `spark-submit` runs with separate executor JVMs and the assembly's SLF4J provider check are manual validation, not automated CI gates.

HTTPS tests require an explicit trust store shared by the readback client and local Spark writers:

```bash
mvn test -Dhugegraph.test.url=https://127.0.0.1:8443 \
  -Dhugegraph.test.graph=disposable_graph \
  -Dhugegraph.test.trust-store-file=/absolute/path/to/hugegraph.truststore \
  -Dhugegraph.test.trust-store-token=hugegraph
```

The trust-store token defaults to `hugegraph`. The URL alone does not select a trust store; these test properties provide it directly, without depending on `connector.home.path`.

Run applications with `spark-submit` from the matching Spark distribution. Spark supplies its SLF4J 2 provider and Java module options; the connector assembly does not bundle an SLF4J provider. The Maven test configuration supplies the module options for embedded Spark on Java 17. The connector and its Java Client dependencies require Java 17. Scala classes retain their Java 8 compiler target, which does not lower the runtime requirement of the complete connector.

Keep Spark's default class loading order for its logging classes. The Java Client needs `com.google.guava:guava:30.0-jre`; an older Guava from Spark can fail with a missing `Preconditions.checkNotNull` overload. Fetch the exact application dependency on the driver:

```bash
GUAVA_DIR="$PWD/spark-runtime"
mvn org.apache.maven.plugins:maven-dependency-plugin:3.7.0:copy \
  -Dartifact=com.google.guava:guava:30.0-jre -DoutputDirectory="$GUAVA_DIR"
DRIVER_GUAVA_JAR="$GUAVA_DIR/guava-30.0-jre.jar"
```

Before submission, copy that JAR to each executor host, or run the same Maven copy command there. Use one consistent absolute executor path across workers, and set `EXECUTOR_GUAVA_JAR` to it. For example, after placing the JAR at `/opt/hugegraph-spark/lib/guava-30.0-jre.jar` on every worker:

```bash
EXECUTOR_GUAVA_JAR=/opt/hugegraph-spark/lib/guava-30.0-jre.jar
spark-submit --deploy-mode client --driver-class-path "$DRIVER_GUAVA_JAR" \
  --driver-java-options "-Dfile.encoding=UTF-8" \
  --conf "spark.executor.extraClassPath=$EXECUTOR_GUAVA_JAR" \
  --conf "spark.executor.extraJavaOptions=-Dfile.encoding=UTF-8" \
  --jars /path/to/hugegraph-spark-connector-1.8.0-jar-with-dependencies.jar \
  /path/to/your-application.jar
```

The explicit UTF-8 driver and executor options above remain the recommended submission configuration.

For cluster deploy mode, provision Guava on the remote driver and use its readable absolute path in `--driver-class-path`; copying it to executors does not provision the driver.

Supply the class and application arguments required by your application. This setting gives the application's Guava priority on both sides; it changes the effective Guava classpath while keeping Spark's logging provider. It is not a guarantee of compatibility with every other Spark application or library in the same host.

## How to use

If we have a graph, the schema is defined as follows:

### Schema

```groovy
schema.propertyKey("name").asText().ifNotExist().create()
schema.propertyKey("age").asInt().ifNotExist().create()
schema.propertyKey("city").asText().ifNotExist().create()
schema.propertyKey("weight").asDouble().ifNotExist().create()
schema.propertyKey("lang").asText().ifNotExist().create()
schema.propertyKey("date").asText().ifNotExist().create()
schema.propertyKey("price").asDouble().ifNotExist().create()

schema.vertexLabel("person")
        .properties("name", "age", "city")
        .useCustomizeStringId()
        .nullableKeys("age", "city")
        .ifNotExist()
        .create()

schema.vertexLabel("software")
        .properties("name", "lang", "price")
        .primaryKeys("name")
        .ifNotExist()
        .create()

schema.edgeLabel("knows")
        .sourceLabel("person")
        .targetLabel("person")
        .properties("date", "weight")
        .ifNotExist()
        .create()

schema.edgeLabel("created")
        .sourceLabel("person")
        .targetLabel("software")
        .properties("date", "weight")
        .ifNotExist()
        .create()
```

Then we can insert graph data through Spark, first add dependency in your pom.

```xml
<dependency>
    <groupId>org.apache.hugegraph</groupId>
    <artifactId>hugegraph-spark-connector</artifactId>
    <version>${revision}</version>
</dependency>
```

### Vertex Sink

```scala
val df = sparkSession.createDataFrame(Seq(
  Tuple3("marko", 29, "Beijing"),
  Tuple3("vadas", 27, "HongKong"),
  Tuple3("Josh", 32, "Beijing"),
  Tuple3("peter", 35, "ShangHai"),
  Tuple3("li,nary", 26, "Wu,han"),
  Tuple3("Bob", 18, "HangZhou"),
)) toDF("name", "age", "city")

df.show()

df.write
  .format("org.apache.hugegraph.spark.connector.DataSource")
  .option("host", "127.0.0.1")
  .option("port", "8080")
  .option("graph", "hugegraph")
  .option("data-type", "vertex")
  .option("label", "person")
  .option("id", "name")
  .option("batch-size", 2)
  .mode(SaveMode.Overwrite)
  .save()
```

### Edge Sink

```scala
val df = sparkSession.createDataFrame(Seq(
  Tuple4("marko", "vadas", "20160110", 0.5),
  Tuple4("peter", "Josh", "20230801", 1.0),
  Tuple4("peter", "li,nary", "20130220", 2.0)
)).toDF("source", "target", "date", "weight")

df.show()

df.write
  .format("org.apache.hugegraph.spark.connector.DataSource")
  .option("host", "127.0.0.1")
  .option("port", "8080")
  .option("graph", "hugegraph")
  .option("data-type", "edge")
  .option("label", "knows")
  .option("source-name", "source")
  .option("target-name", "target")
  .option("batch-size", 2)
  .mode(SaveMode.Overwrite)
  .save()
```

### Configs

Client Configs are used to configure hugegraph-client.

#### Client Configs

| Params               | Default Value | Description                                                                                  |
|----------------------|---------------|----------------------------------------------------------------------------------------------|
| `host`               | `localhost`   | Address of HugeGraphServer                                                                   |
| `port`               | `8080`        | Port of HugeGraphServer                                                                      |
| `graph`              | `hugegraph`   | Graph space name                                                                             |
| `protocol`           | `http`        | Protocol for sending requests to the server, optional `http` or `https`                      |
| `username`           | `null`        | Username of the current graph when HugeGraphServer enables permission authentication         |
| `token`              | `null`        | Token of the current graph when HugeGraphServer has enabled authorization authentication     |
| `timeout`            | `60`          | Timeout (seconds) for inserting results to return                                            |
| `max-conn`           | `CPUS * 4`    | The maximum number of HTTP connections between HugeClient and HugeGraphServer                |
| `max-conn-per-route` | `CPUS * 2`    | The maximum number of HTTP connections for each route between HugeClient and HugeGraphServer |
| `trust-store-file`   | `null`        | The client’s certificate file path when the request protocol is https                        |
| `trust-store-token`  | `null`        | The client's certificate password when the request protocol is https                         |

##### Graph Data Configs

Graph Data Configs are used to set graph space configuration.

| Params            | Default Value | Description                                                                                                                                                                                                                                                                                                                                                                                                                |
|-------------------|---------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `date-type`       |               | Graph data type, must be `vertex` or `edge`                                                                                                                                                                                                                                                                                                                                                                                |
| `label`           |               | Label to which the vertex/edge data to be imported belongs                                                                                                                                                                                                                                                                                                                                                                 |
| `id`              |               | Specify a column as the id column of the vertex. When the vertex id policy is CUSTOMIZE, it is required; when the id policy is PRIMARY_KEY, it must be empty                                                                                                                                                                                                                                                               |
| `source-name`     |               | Select certain columns of the input source as the id column of source vertex. When the id policy of the source vertex is CUSTOMIZE, a certain column must be specified as the id column of the vertex; when the id policy of the source vertex is When PRIMARY_KEY, one or more columns must be specified for splicing the id of the generated vertex, that is, no matter which id strategy is used, this item is required |
| `target-name`     |               | Specify certain columns as the id columns of target vertex, similar to source                                                                                                                                                                                                                                                                                                                                              |
| `selected-fields` |               | Select some columns to insert, other unselected ones are not inserted, cannot exist at the same time as ignored                                                                                                                                                                                                                                                                                                            |
| `ignored-fields`  |               | Ignore some columns so that they do not participate in insertion, cannot exist at the same time as selected                                                                                                                                                                                                                                                                                                                |
| `batch-size`      | `500`         | The number of data items in each batch when importing data                                                                                                                                                                                                                                                                                                                                                                 |

#### Common Configs

Common Configs contains some common configurations.

| Params      | Default Value | Description                                                                     |
|-------------|---------------|---------------------------------------------------------------------------------|
| `delimiter` | `,`           | Separator of `source-name`, `target-name`, `selected-fields` or `ignore-fields` |

## Licence

The same as HugeGraph, hugegraph-spark-connector is also licensed under Apache 2.0 License.
