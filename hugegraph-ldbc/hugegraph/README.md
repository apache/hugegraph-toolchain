# **A. 测试环境**

推荐的环境是基准脚本（Bash）和LDBC驱动程序（Java 11）在主机上运行，而HugetGraph数据库在Docker容器中运行。因此，要求如下：

- Bash
- Java 11
- Docker 19+
- Maven
- Hadoop 3.2.1
- python 2（生成数据集时[基于 Hadoop 的 Datagen](https://github.com/ldbc/ldbc_snb_datagen_hadoop)会用到）

# **B. 配置**

默认环境变量（例如HugeGraph版本、容器名称等）存储在`scripts/vars.sh`. 根据需要调整这些。

# **C. 生成数据**（ **利用datagen生成数据**）

数据的生成是进行benchmark测试的第一步，LDBC为其制定的测试需求设计了一个数据生成器：[ldbc_snb_datagen ](https://github.com/ldbc/ldbc_snb_datagen_hadoop)，本实验使用该数据生成器进行数据生成。

- 下载ldbc_snb_datagen ：

  ```
  git clone https://github.com/ldbc/ldbc_snb_datagen_hadoop.git
  cd ldbc_snb_datagen_hadoop
  ```

  - 

- 初始化params.ini文件：

  ```
  cp params-csv-basic.ini params.ini
  ```

  - 

- params.ini文件配置（其中ldbc.snb.datagen.generator.scaleFactor:snb.interactive.0.1代表生成数据量大小为sf0.1，可以根据自己需要更改为0.1-1000）

  ```
  ldbc.snb.datagen.generator.scaleFactor:snb.interactive.0.1
  ldbc.snb.datagen.serializer.dateFormatter:ldbc.snb.datagen.util.formatter.LongDateFormatter
  ldbc.snb.datagen.serializer.dynamicActivitySerializer:ldbc.snb.datagen.serializer.snb.csv.dynamicserializer.activity.CsvCompositeDynamicActivitySerializer
  ldbc.snb.datagen.serializer.dynamicPersonSerializer:ldbc.snb.datagen.serializer.snb.csv.dynamicserializer.person.CsvCompositeDynamicPersonSerializer
  ldbc.snb.datagen.serializer.staticSerializer:ldbc.snb.datagen.serializer.snb.csv.staticserializer.CsvCompositeStaticSerializer
  ```

- 设置Hadoop

  ```
  wget https://archive.apache.org/dist/hadoop/core/hadoop-3.2.1/hadoop-3.2.1.tar.gz
  tar xf hadoop-3.2.1.tar.gz
  export HADOOP_CLIENT_OPTS="-Xmx2G"
  # set this to the Hadoop 3.2.1 directory
  export HADOOP_HOME=pwd/hadoop-3.2.1
  ```

  - 

- 执行脚本生成数据

  ```
  ./run.sh
  ```

  - 

- 将生成的数据集拷贝出来

  ```
  cd ..
  mkdir ldbc-master/update-streams
  cp -r ldbc_snb_datagen_hadoop-main/social_network/. ldbc-master/update-streams/
  cp -r ldbc_snb_datagen_hadoop-main/social_network/ ldbc-master/hugegraph/
  cp -r ldbc_snb_datagen_hadoop-main/substitution_parameters/ ldbc-master/
  ```

  - 

- 对生成csv文件进行数据处理

  ```
  cd ldbc-master/hugegraph
  ./scripts/reply_csv_column.sh
  ```

  - 

# **D. 导入数据**

## 1. **设置**`${HugeGraph_CSV_DIR}`**环境变量**。

首先进入到ldbc-master/hugegraph/目录，再执行：

```Bash
. scripts/use-datagen-data-set.sh
```

## 2. **加载数据：**

**注意：需要先将****[hugegraph-loader](https://hugegraph.apache.org/cn/docs/quickstart/hugegraph-loader/)****编译好并且拷贝到ldbc-master/hugegraph目录下**

分步执行：

```Bash
./scripts/stop.sh
./scripts/import.sh
./scripts/start.sh
```

或者直接执行一键部署脚本：

```Bash
./scripts/load-in-one-step.sh 
```


# E. **运行**基准测试

下面说明解释了如何在三种模式之一（创建验证参数、验证、基准测试）下运行基准测试驱动程序。有关驱动程序模式的更多详细信息，请查看[主自述文件的“驱动程序模式”部分](https://github.com/ldbc/ldbc_snb_interactive_v1_impls/blob/main/README.md#driver-modes)。

编辑`driver/{create-validation-parameters,validate,benchmark}.properties`文件，设置正确链接HugeGraph的参数，然后运行下面：

1. 创建验证参数：

```Bash
driver/create-validation-parameters.sh
```

1. 进行验证：

```Bash
driver/validate.sh
```

1. 运行基准测试：

```Bash
driver/benchmark.sh
```

注意：由于运行基准测试add操作可能会改变原本数据，所以如果重复执行基准操作时，必须重新导入数据：

```Bash
./scripts/load-in-one-step.sh 
```
