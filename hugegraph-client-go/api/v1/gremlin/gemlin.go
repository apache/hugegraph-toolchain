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


package gremlin

import (
    "context"
    "encoding/json"
    "errors"
    "fmt"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/api"
    "io"
    "io/ioutil"
    "net/http"
    url2 "net/url"
    "strings"
)

type Gremlin struct {
    Get
    Post
}

func New(t api.Transport) *Gremlin {
    return &Gremlin{
        Get:  newGetFunc(t),
        Post: newPostFunc(t),
    }
}

type Get func(o ...func(*GetRequest)) (*GetResponse, error)
type Post func(o ...func(*PostRequest)) (*PostResponse, error)

func newGetFunc(t api.Transport) Get {
    return func(o ...func(*GetRequest)) (*GetResponse, error) {
        var r = GetRequest{}
        for _, f := range o {
            f(&r)
        }
        return r.Do(r.ctx, t)
    }
}
func newPostFunc(t api.Transport) Post {
    return func(o ...func(*PostRequest)) (*PostResponse, error) {
        var r = PostRequest{}
        for _, f := range o {
            f(&r)
        }
        return r.Do(r.ctx, t)
    }
}

type GetRequest struct {
    ctx      context.Context
    gremlin  string
    bindings map[string]string
    language string
    aliases  map[string]string
}
type GetResponse struct {
    StatusCode int           `json:"-"`
    Header     http.Header   `json:"-"`
    Body       io.ReadCloser `json:"-"`
}
type PostRequest struct {
    ctx      context.Context
    body     io.ReadCloser
    gremlin  string
    bindings map[string]string
    language string
    aliases  struct {
        //Graph string `json:"graph"`
        //G     string `json:"g"`
    }
}
type PostRequestData struct {
    Gremlin  string            `json:"gremlin"`
    Bindings map[string]string `json:"bindings,omitempty"`
    Language string            `json:"language,omitempty"`
    Aliases  struct {
        //Graph string `json:"graph"`
        //G     string `json:"g"`
    } `json:"aliases,omitempty"`
}
type PostResponse struct {
    StatusCode int               `json:"-"`
    Header     http.Header       `json:"-"`
    Body       io.ReadCloser     `json:"-"`
    Data       *PostResponseData `json:"data"`
}
type PostResponseData struct {
    RequestID string `json:"requestId,omitempty"`
    Status    struct {
        Message    string `json:"message"`
        Code       int    `json:"code"`
        Attributes struct {
        } `json:"attributes"`
    } `json:"status"`
    Result struct {
        Data interface{} `json:"data"`
        Meta interface{} `json:"meta"`
    } `json:"result,omitempty"`
    Exception string   `json:"exception,omitempty"`
    Message   string   `json:"message,omitempty"`
    Cause     string   `json:"cause,omitempty"`
    Trace     []string `json:"trace,omitempty"`
}

func (g Get) WithGremlin(gremlin string) func(request *GetRequest) {
    return func(r *GetRequest) {
        r.gremlin = gremlin
    }
}
func (g Post) WithGremlin(gremlin string) func(request *PostRequest) {
    return func(r *PostRequest) {
        r.gremlin = gremlin
    }
}

func (g GetRequest) Do(ctx context.Context, transport api.Transport) (*GetResponse, error) {

    url := "/gremlin"
    params := &url2.Values{}
    if len(g.gremlin) <= 0 {
        return nil, errors.New("please set gremlin")
    } else {
        params.Add("gremlin", g.gremlin)
    }
    if len(g.language) > 0 {
        params.Add("language", g.language)
    }

    if g.aliases != nil && len(g.aliases) >= 0 {
        aliasesJsonStr, err := json.Marshal(g.aliases)
        if err != nil {
            return nil, err
        }
        params.Add("aliases", string(aliasesJsonStr))
    }

    if g.bindings != nil && len(g.bindings) >= 0 {
        bindingsJsonStr, err := json.Marshal(g.bindings)
        if err != nil {
            return nil, err
        }
        params.Add("bindings", string(bindingsJsonStr))
    }

    req, err := api.NewRequest("GET", url, params, nil)
    if err != nil {
        return nil, err
    }
    if ctx != nil {
        req = req.WithContext(ctx)
    }

    res, err := transport.Perform(req)
    if err != nil {
        return nil, err
    }

    bytes, err := ioutil.ReadAll(res.Body)
    if err != nil {
        return nil, err
    }

    fmt.Println(string(bytes))

    gremlinGetResponse := &GetResponse{}
    gremlinGetResponse.StatusCode = res.StatusCode
    return gremlinGetResponse, nil
}
func (g PostRequest) Do(ctx context.Context, transport api.Transport) (*PostResponse, error) {

    if len(g.gremlin) < 1 {
        return nil, errors.New("PostRequest param error , gremlin is empty")
    }

    if len(g.language) < 1 {
        g.language = "gremlin-groovy"
    }

    gd := &PostRequestData{
        Gremlin:  g.gremlin,
        Bindings: g.bindings,
        Language: g.language,
        Aliases:  g.aliases,
    }

    byteBody, err := json.Marshal(&gd) // 序列化

    if err != nil {
        return nil, err
    }

    reader := strings.NewReader(string(byteBody))
    req, _ := api.NewRequest("POST", "/gremlin", nil, reader)

    if ctx != nil {
        req = req.WithContext(ctx)
    }

    res, err := transport.Perform(req)
    if err != nil {
        return nil, err
    }

    gremlinPostResp := &PostResponse{}
    bytes, err := ioutil.ReadAll(res.Body)
    if err != nil {
        return nil, err
    }

    respData := &PostResponseData{}
    err = json.Unmarshal(bytes, respData)
    if err != nil {
        return nil, err
    }
    gremlinPostResp.StatusCode = res.StatusCode
    gremlinPostResp.Header = res.Header
    gremlinPostResp.Body = res.Body
    gremlinPostResp.Data = respData
    return gremlinPostResp, nil
}
