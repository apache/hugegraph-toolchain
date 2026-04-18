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


package vertex

import (
    "context"
    "encoding/json"
    "fmt"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/api"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/internal/model"
    "io"
    "io/ioutil"
    "net/http"
    url2 "net/url"
    "strings"
)

type Vertex struct {
    Create
    BatchCreate
    UpdateProperties
    BatchUpdateProperties
    DeleteProperties
    GetByCond
    GetByID
    DeleteByID
}

func New(t api.Transport) *Vertex {
    return &Vertex{
        // Create https://hugegraph.apache.org/docs/clients/restful-api/vertex/#211-create-a-vertex
        Create: newCreateFunc(t),
        // BatchCreate https://hugegraph.apache.org/docs/clients/restful-api/vertex/#212-create-multiple-vertices
        BatchCreate: newBatchCreateFunc(t),
        // UpdateProperties https://hugegraph.apache.org/docs/clients/restful-api/vertex/#213-update-vertex-properties
        UpdateProperties: newUpdatePropertiesFunc(t),
    }
}

type CreateReq struct {
    ctx  context.Context
    data model.Vertex[any]
}
type CreateResp struct {
    StatusCode int           `json:"-"`
    Header     http.Header   `json:"-"`
    Body       io.ReadCloser `json:"-"`
    Data       model.Vertex[any]
}
type BatchCreateReq struct {
    ctx      context.Context
    vertices []model.Vertex[any]
}
type BatchCreateResp struct {
    StatusCode int           `json:"-"`
    Header     http.Header   `json:"-"`
    Body       io.ReadCloser `json:"-"`
    IDs        []string
}
type UpdatePropertiesReq struct {
    ctx    context.Context
    id     string
    action model.Action
    vertex model.Vertex[any]
}
type UpdatePropertiesResp struct {
    StatusCode int           `json:"-"`
    Header     http.Header   `json:"-"`
    Body       io.ReadCloser `json:"-"`
    Data       model.Vertex[any]
}

type Create func(o ...func(*CreateReq)) (*CreateResp, error)
type BatchCreate func(o ...func(*BatchCreateReq)) (*BatchCreateResp, error)
type UpdateProperties func(o ...func(*UpdatePropertiesReq)) (*UpdatePropertiesResp, error)
type BatchUpdateProperties func(o ...func(*CreateReq)) (*CreateResp, error)
type DeleteProperties func(o ...func(*CreateReq)) (*CreateResp, error)
type GetByCond func(o ...func(*CreateReq)) (*CreateResp, error)
type GetByID func(o ...func(*CreateReq)) (*CreateResp, error)
type DeleteByID func(o ...func(*CreateReq)) (*CreateResp, error)

func newCreateFunc(t api.Transport) Create {
    return func(o ...func(*CreateReq)) (*CreateResp, error) {
        var r = CreateReq{}
        for _, f := range o {
            f(&r)
        }
        return r.Do(r.ctx, t)
    }
}
func newBatchCreateFunc(t api.Transport) BatchCreate {
    return func(o ...func(*BatchCreateReq)) (*BatchCreateResp, error) {
        var r = BatchCreateReq{}
        for _, f := range o {
            f(&r)
        }
        return r.Do(r.ctx, t)
    }
}
func newUpdatePropertiesFunc(t api.Transport) UpdateProperties {
    return func(o ...func(*UpdatePropertiesReq)) (*UpdatePropertiesResp, error) {
        var r = UpdatePropertiesReq{}
        for _, f := range o {
            f(&r)
        }
        return r.Do(r.ctx, t)
    }
}

func (c Create) WithContext(ctx context.Context) func(*CreateReq) {
    return func(req *CreateReq) {
        req.ctx = ctx
    }
}
func (c BatchCreate) WithContext(ctx context.Context) func(req *BatchCreateReq) {
    return func(req *BatchCreateReq) {
        req.ctx = ctx
    }
}
func (c UpdateProperties) WithContext(ctx context.Context) func(req *UpdatePropertiesReq) {
    return func(req *UpdatePropertiesReq) {
        req.ctx = ctx
    }
}

func (c Create) WithVertex(vertex model.Vertex[any]) func(*CreateReq) {
    return func(req *CreateReq) {
        req.data = vertex
    }
}
func (c BatchCreate) WithVertices(vertices []model.Vertex[any]) func(*BatchCreateReq) {
    return func(req *BatchCreateReq) {
        req.vertices = vertices
    }
}
func (c UpdateProperties) WithVertex(vertex model.Vertex[any]) func(*UpdatePropertiesReq) {
    return func(req *UpdatePropertiesReq) {
        req.vertex = vertex
    }
}
func (c UpdateProperties) WithID(ID string) func(*UpdatePropertiesReq) {
    return func(req *UpdatePropertiesReq) {
        req.id = ID
    }
}
func (c UpdateProperties) WithAction(action model.Action) func(*UpdatePropertiesReq) {
    return func(req *UpdatePropertiesReq) {
        req.action = action
    }
}

func (c CreateReq) Do(ctx context.Context, transport api.Transport) (*CreateResp, error) {
    config := transport.GetConfig()
    url := ""
    if len(config.GraphSpace) > 0 {
        url = fmt.Sprintf("/graphspaces/%s/graphs/%s/graph/vertices", config.GraphSpace, config.Graph)
    } else {
        url = fmt.Sprintf("/graphs/%s/graph/vertices", config.Graph)
    }

    jsonData, err := json.Marshal(c.data)
    if err != nil {
        return nil, err
    }
    reader := strings.NewReader(string(jsonData))

    req, err := api.NewRequest("POST", url, nil, reader)
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

    vertexCreateRespData := model.Vertex[any]{}
    bytes, err := ioutil.ReadAll(res.Body)
    if err != nil {
        return nil, err
    }
    err = json.Unmarshal(bytes, &vertexCreateRespData)
    if err != nil {
        return nil, err
    }
    resp := &CreateResp{}
    resp.StatusCode = res.StatusCode
    resp.Header = res.Header
    resp.Body = res.Body
    resp.Data = vertexCreateRespData

    return resp, nil
}
func (c BatchCreateReq) Do(ctx context.Context, transport api.Transport) (*BatchCreateResp, error) {
    config := transport.GetConfig()
    url := ""
    if len(config.GraphSpace) > 0 {
        url = fmt.Sprintf("/graphspaces/%s/graphs/%s/graph/vertices/batch", config.GraphSpace, config.Graph)
    } else {
        url = fmt.Sprintf("/graphs/%s/graph/vertices/batch", config.Graph)
    }

    jsonData, err := json.Marshal(c.vertices)
    if err != nil {
        return nil, err
    }
    reader := strings.NewReader(string(jsonData))

    req, err := api.NewRequest("POST", url, nil, reader)
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

    vertexCreateRespData := make([]string, 0)
    bytes, err := ioutil.ReadAll(res.Body)
    if err != nil {
        return nil, err
    }
    err = json.Unmarshal(bytes, &vertexCreateRespData)
    if err != nil {
        return nil, err
    }
    resp := &BatchCreateResp{}
    resp.StatusCode = res.StatusCode
    resp.Header = res.Header
    resp.Body = res.Body
    resp.IDs = vertexCreateRespData
    return resp, nil
}
func (c UpdatePropertiesReq) Do(ctx context.Context, transport api.Transport) (*UpdatePropertiesResp, error) {
    config := transport.GetConfig()
    url := ""
    if len(config.GraphSpace) > 0 {
        url = fmt.Sprintf("/graphspaces/%s/graphs/%s/graph/vertices/\"%s\"", config.GraphSpace, config.Graph, c.id)
    } else {
        url = fmt.Sprintf("/graphs/%s/graph/vertices/\"%s\"", config.Graph, c.id)
    }

    params := &url2.Values{}
    params.Add("action", string(c.action))

    jsonData, err := json.Marshal(c.vertex)
    if err != nil {
        return nil, err
    }
    reader := strings.NewReader(string(jsonData))

    req, err := api.NewRequest("PUT", url, params, reader)
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

    respData := model.Vertex[any]{}
    bytes, err := ioutil.ReadAll(res.Body)
    if err != nil {
        return nil, err
    }
    err = json.Unmarshal(bytes, &respData)
    if err != nil {
        return nil, err
    }
    resp := &UpdatePropertiesResp{}
    resp.StatusCode = res.StatusCode
    resp.Header = res.Header
    resp.Body = res.Body
    resp.Data = respData

    return resp, nil
}
