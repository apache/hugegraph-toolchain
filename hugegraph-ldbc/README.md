# hugegraph-ldbc

此存储库包含 LDBC 社交网络基准的交互式工作负载在HugeGraph数据库的参考实现。有关LDBC基准测试的详细信息，请参阅[SIGMOD 2015 论文](https://ldbcouncil.org/docs/papers/ldbc-snb-interactive-sigmod-2015.pdf)、[GitHub Pages 上的规范](https://ldbcouncil.org/ldbc_snb_docs/)和[arXiv 上的规范](https://arxiv.org/pdf/2001.02299.pdf)。

社交网络基准套件（SNB）定义了针对数据库管理系统的图形工作负载，并由LDBC SNB工作组维护，这些工作负载旨在通过不同的查询和操作模式模拟实际应用场景，对数据库管理系统进行性能测试和评估。有关LDBC SNB的详细信息，请参阅[LDBC 社交网络基准](https://docs.google.com/presentation/d/1NilxSrKQnFq4WzWMY2-OodZQ2TEksKzKBmgB20C_0Nw/)( [PDF](https://ldbcouncil.org/docs/presentations/ldbc-snb-2022-11.pdf) )。

## 快速开始

要构建整个项目，请运行：

```
scripts/build.sh
```

## 测试

下面说明解释了如何在三种模式之一（创建验证参数、验证、基准测试）下运行基准测试驱动程序。有关驱动程序模式的更多详细信息，请查看[主自述文件的“驱动程序模式”部分](https://github.com/ldbc/ldbc_snb_interactive_v1_impls/blob/main/README.md#driver-modes)。

编辑`driver/{create-validation-parameters,validate,benchmark}.properties`文件，设置正确链接HugeGraph的参数，然后运行下面：

1. 创建验证参数：

```Bash
driver/create-validation-parameters.sh
```

2. 进行验证：

```Bash
driver/validate.sh
```

3. 运行基准测试：

```Bash
driver/benchmark.sh
```

注意：由于运行基准测试add操作可能会改变原本数据，所以如果重复执行基准操作时，必须重新导入数据：

```Bash
./scripts/load-in-one-step.sh 
```

详细测试测试流程请参照[HugeGraph Ldbc测试流程](https://github.com/hugegraph/ldbc/blob/lzy-patch/hugegraph/README.md)

## 如何贡献

直接提交pr即可

