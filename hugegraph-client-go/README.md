# go-hugegraph

#### 介绍

基于 Go 语言的 HugeGraph Client SDK 工具

#### 软件架构

软件架构说明

#### 安装教程

```shell
go get github.com/apache/hugegraph-toolchain/hugegraph-client-go
```

#### 实现 API

| API     | 说明          |
|---------|-------------|
| schema  | 获取模型 schema |
| version | 获取版本信息      |

#### 使用说明

##### 1.初始化客户端

```go
package main

import "github.com/apache/hugegraph-toolchain/hugegraph-client-go"
import "github.com/apache/hugegraph-toolchain/hugegraph-client-go/hgtransport"

func main() {

    clinet, err := hugegraph.NewCommonClient(hugegraph.Config{
        Host:     "127.0.0.1",
        Port:     8080,
        Graph:    "hugegraph",
        Username: "",
        Password: "",
        Logger: &hgtransport.ColorLogger{
            Output:             os.Stdout,
            EnableRequestBody:  true,
            EnableResponseBody: true,
        },
    })

    if err != nil {
        log.Fatalf("Error creating the client: %s\n", err)
    }
}
```

##### 2.获取 hugegraph 版本

- 1.使用 SDK 获取版本信息

```go
package main

import (
    "fmt"
    "log"
)

func getVersion() {

    client := initClient()
    res, err := client.Version()
    if err != nil {
        log.Fatalf("Error getting the response: %s\n", err)
    }
    defer res.Body.Close()

    fmt.Println(res.Versions)
    fmt.Println(res.Versions.Version)
}
```

- 2.返回值的结构

```go
package main

type VersionResponse struct {
    Versions struct {
        Version string `json:"version"` // hugegraph version
        Core    string `json:"core"`    // hugegraph core version
        Gremlin string `json:"gremlin"` // hugegraph gremlin version
        API     string `json:"api"`     // hugegraph api version
    } ` json: 'versions'`
}
```
