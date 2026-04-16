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

package hugegraph

import (
    "errors"
    "fmt"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/api/v1"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/api/v1/edgelabel"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/api/v1/gremlin"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/api/v1/propertykey"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/api/v1/vertex"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/api/v1/vertexlabel"
    "net"
    "net/http"
    "net/url"
    "os"

    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/hgtransport"
)

// Config 配置类型
type Config struct {
    Host       string             // hugegraph Server host
    Port       int                // hugegraph Server api port
    GraphSpace string             // graphSpace is a feature supported feature. if you not set graphSpace, please set empty string
    Graph      string             // this name is configured in the hugegraph
    Username   string             // server username .if you not set username ,please set empty string
    Password   string             // server password .if you not set password ,please set empty string
    Transport  http.RoundTripper  // The HTTP transport object.
    Logger     hgtransport.Logger // The logger object.
}

type CommonClient struct {
    Vertex      *vertex.Vertex
    Gremlin     *gremlin.Gremlin
    Propertykey *propertykey.PropertyKey
    VertexLabel *vertexlabel.VertexLabel
    EdgeLabel   *edgelabel.Edgelabel
    *v1.APIV1
    Transport  hgtransport.Interface
    Graph      string
    GraphSpace string
}

func NewDefaultCommonClient() (*CommonClient, error) {
    return NewCommonClient(Config{
        Host:       "127.0.0.1",
        Port:       8080,
        GraphSpace: "",
        Graph:      "hugegraph",
        Username:   "admin",
        Password:   "pa",
        Logger: &hgtransport.ColorLogger{
            Output:             os.Stdout,
            EnableRequestBody:  true,
            EnableResponseBody: true,
        },
    })
}

func NewCommonClient(cfg Config) (*CommonClient, error) {

    if len(cfg.Host) < 3 {
        return nil, errors.New("cannot create client: host length error")
    }
    address := net.ParseIP(cfg.Host)
    if address == nil {
        return nil, errors.New("cannot create client: host is format error")
    }
    if cfg.Port < 1 || cfg.Port > 65535 {
        return nil, errors.New("cannot create client: port is error")
    }

    tp := hgtransport.New(hgtransport.Config{
        URL: &url.URL{
            Host:   fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
            Scheme: "http",
        },
        Username:  cfg.Username,
        Password:  cfg.Password,
        Graph:     cfg.Graph,
        Transport: cfg.Transport,
        Logger:    cfg.Logger,
    })

    return &CommonClient{
        Vertex:      vertex.New(tp),
        Gremlin:     gremlin.New(tp),
        Propertykey: propertykey.New(tp),
        VertexLabel: vertexlabel.New(tp),
        EdgeLabel:   edgelabel.New(tp),
        APIV1:       v1.New(tp),
        Transport:   tp,
        Graph:       cfg.Graph,
        GraphSpace:  cfg.GraphSpace,
    }, nil
}
