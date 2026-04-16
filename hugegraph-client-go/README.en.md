# go-hugegraph

#### Introduction

HugeGraph client SDK tool based on Go language

#### Software Architecture

Software Architecture Description

#### Installation Tutorial

```Shell

Go get github. com/go huggraph

```

#### Implement API

| API     | illustrate              |
|---------|-------------------------|
| schema  | Obtain the model schema |
| version | Get version information |

#### Instructions for use

##### 1. Initialize the client

```Go
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

##### 2. Obtain the hugegraph version

-1. Use the SDK to obtain version information

```Go
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

-2. Result Set Response Body

```Go
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
