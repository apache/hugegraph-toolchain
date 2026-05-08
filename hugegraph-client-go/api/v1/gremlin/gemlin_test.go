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


package gremlin_test

import (
    "fmt"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go"
    "log"
    "testing"
)

func TestGremlin(t *testing.T) {

    client, err := hugegraph.NewDefaultCommonClient()
    if err != nil {
        log.Println(err)
    }

    respPost, err := client.Gremlin.Post(
        client.Gremlin.Post.WithGremlin("g.V().limit(3)"),
    )
    if err != nil {
        log.Fatalln(err)
    }
    if respPost.StatusCode != 200 {
        t.Errorf("client.Gremlin.Post http_status=%d, gremlin_status=%d, message=%s",
            respPost.StatusCode, respPost.Data.Status.Code, respPost.Data.Status.Message)
    }
    fmt.Println(respPost.Data.Result.Data)

}
