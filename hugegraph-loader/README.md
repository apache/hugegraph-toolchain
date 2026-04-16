# hugegraph-loader

[![License](https://img.shields.io/badge/license-Apache%202-0E78BA.svg)](https://www.apache.org/licenses/LICENSE-2.0.html)
[![Build Status](https://github.com/apache/hugegraph-toolchain/actions/workflows/loader-ci.yml/badge.svg)](https://github.com/apache/hugegraph-toolchain/actions/workflows/loader-ci.yml)
[![codecov](https://codecov.io/gh/hugegraph/hugegraph-loader/branch/master/graph/badge.svg)](https://codecov.io/gh/hugegraph/hugegraph-loader)
[![Maven Central](https://maven-badges.herokuapp.com/maven-central/org.apache.hugegraph/hugegraph-loader/badge.svg)](https://mvnrepository.com/artifact/org.apache.hugegraph/hugegraph-loader)

hugegraph-loader is a customizable command line utility for loading small to medium size graph datasets into the HugeGraph database from multiple data sources with various input formats.

## 1. Features

- Multiple data sources, such as local file(path), HDFS file(path), MySQL
- Various input formats, such as json, csv, and text with any delimiters.
- Diverse options, with which users can manage the data loading intuitively.
- Detecting schema from data automatically, reduce the complex work of schema management.
- Advanced customized operations with groovy script, users can configure how to construct vertices and edges by themselves.

## 2. Quick start 

There are three ways to get HugeGraph-Loader:

- Download the compiled tarball
- Clone source code then compile and install
- Use docker image (Convenient for Test/Dev)

And you can find more details in the [doc](https://hugegraph.apache.org/docs/quickstart/hugegraph-loader/#2-get-hugegraph-loader)

### 2.1 Download the compiled tarball

Download the latest version of the HugeGraph-Toolchain release package:

``` bash
wget https://downloads.apache.org/hugegraph/{version}/apache-hugegraph-toolchain-{version}.tar.gz
tar zxf *hugegraph*.tar.gz
```

### 2.2 Clone source code then compile and install

Clone the latest version of HugeGraph-Loader source package:

```bash
# 1. get from github
git clone https://github.com/apache/hugegraph-toolchain.git

# 2. get from direct  (e.g. here is 1.0.0, please choose the latest version)
wget https://downloads.apache.org/hugegraph/{version}/apache-hugegraph-toolchain-{version}-src.tar.gz
```

Due to the license limitation of the `Oracle OJDBC`, you need to manually install ojdbc to the local maven repository. Visit the [Oracle jdbc downloads page](https://www.oracle.com/database/technologies/appdev/jdbc-drivers-archive.html). Select Oracle Database 12c Release 2 (12.2.0.1) drivers, as shown in the following figure.

After opening the link, select "ojdbc8.jar".

Install ojdbc8 to the local maven repository, enter the directory where ojdbc8.jar is located, and execute the following command.

```bash
mvn install:install-file -Dfile=./ojdbc8.jar -DgroupId=com.oracle -DartifactId=ojdbc8 -Dversion=12.2.0.1 -Dpackaging=jar
```

Compile and generate tar package:

```
cd hugegraph-loader
mvn clean package -DskipTests
```

### 2.3 Use docker image (Convenient for Test/Dev)

#### 2.3.1 Docker run

Use the command `docker run -itd --name loader hugegraph/loader` to start loader.

If you want to load your data, you can mount the data folder like `-v /path/to/data/file:/loader/file`


#### 2.3.2 Docker-compose

The example `docker-compose.yml` is [here](./docker/example/docker-compose.yml). Use the command `docker-compose up -d` to deploy `loader` with `server` and `hubble`.

> Note: 
> 1. The docker image of hugegraph-loader is a convenience release, not **official distribution** artifacts. You can find more details from [ASF Release Distribution Policy](https://infra.apache.org/release-distribution.html#dockerhub).
>
> 2. Recommend to use `release tag`(like `1.0.0`) for the stable version. Use `latest` tag to experience the newest functions in development.

## 3 Load data

### 3.1 Use loader directly

> notice: currently, version is `1.3.0`

Download and unzip the compiled archive

```bash
wget https://downloads.apache.org/hugegraph/{version}/apache-hugegraph-toolchain-{version}.tar.gz
tar zxf *hugegraph*.tar.gz
```

Then, load data with example file:

```bash
cd apache-hugegraph-toolchain-{version}
cd apache-hugegraph-loader-{version}
sh bin/hugegraph-loader.sh -g hugegraph -f example/file/struct.json -s example/file/schema.groovy
```

More details is in the [doc](https://hugegraph.apache.org/docs/quickstart/hugegraph-loader/)

### 3.2 Load data with docker

> If the `loader` and `server` is in the same docker network (for example, you deploy `loader` and `server` with `docker-compose`), we can set `-h {server_container_name}`. In our example, the container name of `server` is `graph`
>
> If `loader` is deployed alone, the `-h` should be set to the ip of the host of `server`. Other parameter description is [here](https://hugegraph.apache.org/docs/quickstart/hugegraph-loader/#341-parameter-description)

Visit [doc](https://hugegraph.apache.org/docs/quickstart/hugegraph-loader/#45-use-docker-to-load-data) for more details.
 
```bash
docker exec -it loader bin/hugegraph-loader.sh -g hugegraph -f example/file/struct.json -s example/file/schema.groovy -h graph -p 8080
```


## 4. Doc

The [loader homepage](https://hugegraph.apache.org/docs/quickstart/hugegraph-loader/) contains more information about it. 

## 5. License

hugegraph-loader is licensed under Apache 2.0 License.
