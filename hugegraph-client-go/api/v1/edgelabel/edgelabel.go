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

package edgelabel

import (
    "context"
    "encoding/json"
    "errors"
    "fmt"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/api"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/internal/model"
    "io"
    "io/ioutil"
    "net/http"
    "strings"
)

type Edgelabel struct {
    Create
    DeleteByName
    GetAll
}

func New(t api.Transport) *Edgelabel {
    return &Edgelabel{
        // Create https://hugegraph.apache.org/docs/clients/restful-api/edgelabel/#141-create-an-edgelabel
        Create: newCreateFunc(t),
        // DeleteByName https://hugegraph.apache.org/docs/clients/restful-api/edgelabel/#145-delete-edgelabel-by-name
        DeleteByName: newDeleteByNameFunc(t),
        // GetAll https://hugegraph.apache.org/docs/clients/restful-api/edgelabel/#143-get-all-edgelabels
        GetAll: newGetAll(t),
    }
}

func newCreateFunc(t api.Transport) Create {
    return func(o ...func(*CreateRequest)) (*CreateResponse, error) {
        var r = CreateRequest{}
        for _, f := range o {
            f(&r)
        }
        return r.Do(r.ctx, t)
    }
}
func newDeleteByNameFunc(t api.Transport) DeleteByName {
    return func(o ...func(*DeleteByNameRequest)) (*DeleteByNameResponse, error) {
        var r = DeleteByNameRequest{}
        for _, f := range o {
            f(&r)
        }
        return r.Do(r.ctx, t)
    }
}
func newGetAll(t api.Transport) GetAll {
    return func(o ...func(*GetAllRequest)) (*GetAllResponse, error) {
        var r = GetAllRequest{}
        for _, f := range o {
            f(&r)
        }
        return r.Do(r.ctx, t)
    }
}

type Create func(o ...func(*CreateRequest)) (*CreateResponse, error)
type DeleteByName func(o ...func(*DeleteByNameRequest)) (*DeleteByNameResponse, error)
type GetAll func(o ...func(*GetAllRequest)) (*GetAllResponse, error)

type CreateRequest struct {
    Body    io.Reader
    ctx     context.Context
    reqData CreateRequestData
}
type CreateRequestData struct {
    Name             string          `json:"name"`
    SourceLabel      string          `json:"source_label"`
    TargetLabel      string          `json:"target_label"`
    Frequency        model.Frequency `json:"frequency"`
    Properties       []string        `json:"properties"`
    SortKeys         []string        `json:"sort_keys"`
    NullableKeys     []string        `json:"nullable_keys"`
    EnableLabelIndex bool            `json:"enable_label_index"`
}
type CreateResponse struct {
    StatusCode int                `json:"-"`
    Header     http.Header        `json:"-"`
    Body       io.ReadCloser      `json:"-"`
    Data       CreateResponseData `json:"-"`
}
type CreateResponseData struct {
    ID               int      `json:"id"`
    SortKeys         []string `json:"sort_keys"`
    SourceLabel      string   `json:"source_label"`
    Name             string   `json:"name"`
    IndexNames       []string `json:"index_names"`
    Properties       []string `json:"properties"`
    TargetLabel      string   `json:"target_label"`
    Frequency        string   `json:"frequency"`
    NullableKeys     []string `json:"nullable_keys"`
    EnableLabelIndex bool     `json:"enable_label_index"`
    UserData         struct {
    } `json:"user_data"`
}

type DeleteByNameRequest struct {
    Body io.Reader
    ctx  context.Context
    name string
}
type DeleteByNameResponse struct {
    StatusCode int                      `json:"-"`
    Header     http.Header              `json:"-"`
    Body       io.ReadCloser            `json:"-"`
    Data       DeleteByNameResponseData `json:"-"`
}
type DeleteByNameResponseData struct {
    TaskID int `json:"task_id"`
}

type GetAllRequest struct {
    Body io.Reader
    ctx  context.Context
}
type GetAllResponse struct {
    StatusCode int                `json:"-"`
    Header     http.Header        `json:"-"`
    Body       io.ReadCloser      `json:"-"`
    Data       GetAllResponseData `json:"-"`
}

type GetAllResponseData struct {
    Edgelabels []struct {
        ID               int           `json:"id"`
        Name             string        `json:"name"`
        SourceLabel      string        `json:"source_label"`
        TargetLabel      string        `json:"target_label"`
        Frequency        string        `json:"frequency"`
        SortKeys         []interface{} `json:"sort_keys"`
        NullableKeys     []interface{} `json:"nullable_keys"`
        IndexLabels      []string      `json:"index_labels"`
        Properties       []string      `json:"properties"`
        Status           string        `json:"status"`
        TTL              int           `json:"ttl"`
        EnableLabelIndex bool          `json:"enable_label_index"`
        UserData         struct {
            CreateTime string `json:"~create_time"`
        } `json:"user_data"`
    } `json:"edgelabels"`
}

func (r Create) WithReqData(reqData CreateRequestData) func(request *CreateRequest) {
    return func(r *CreateRequest) {
        r.reqData = reqData
    }
}
func (p DeleteByName) WithName(name string) func(request *DeleteByNameRequest) {
    return func(r *DeleteByNameRequest) {
        r.name = name
    }
}

func (r CreateRequest) Do(ctx context.Context, transport api.Transport) (*CreateResponse, error) {

    if len(r.reqData.Name) <= 0 {
        return nil, errors.New("create edgeLabel must set name")
    }
    if len(r.reqData.SourceLabel) <= 0 {
        return nil, errors.New("create edgeLabel must set source_label")
    }
    if len(r.reqData.TargetLabel) <= 0 {
        return nil, errors.New("create edgeLabel must set target_label")
    }
    if len(r.reqData.Properties) <= 0 {
        return nil, errors.New("create edgeLabel must set properties")
    }

    byteBody, err := json.Marshal(&r.reqData)
    if err != nil {
        return nil, err
    }
    reader := strings.NewReader(string(byteBody))

    req, err := api.NewRequest("POST", fmt.Sprintf("/graphs/%s/schema/edgelabels", transport.GetConfig().Graph), nil, reader)
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

    resp := &CreateResponse{}
    respData := CreateResponseData{}
    bytes, err := ioutil.ReadAll(res.Body)
    if err != nil {
        return nil, err
    }
    err = json.Unmarshal(bytes, &respData)
    if err != nil {
        return nil, err
    }
    resp.StatusCode = res.StatusCode
    resp.Header = res.Header
    resp.Body = res.Body
    resp.Data = respData
    return resp, nil
}
func (r DeleteByNameRequest) Do(ctx context.Context, transport api.Transport) (*DeleteByNameResponse, error) {

    if len(r.name) <= 0 {
        return nil, errors.New("delete by name ,please set name")
    }
    req, err := api.NewRequest("DELETE", fmt.Sprintf("/graphs/%s/schema/edgelabels/%s", transport.GetConfig().Graph, r.name), nil, r.Body)
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

    resp := &DeleteByNameResponse{}
    respData := DeleteByNameResponseData{}
    bytes, err := ioutil.ReadAll(res.Body)
    if err != nil {
        return nil, err
    }
    err = json.Unmarshal(bytes, &respData)
    if err != nil {
        return nil, err
    }
    resp.StatusCode = res.StatusCode
    resp.Header = res.Header
    resp.Body = res.Body
    resp.Data = respData
    return resp, nil
}
func (g GetAllRequest) Do(ctx context.Context, transport api.Transport) (*GetAllResponse, error) {

    req, err := api.NewRequest("GET", fmt.Sprintf("/graphs/%s/schema/edgelabels", transport.GetConfig().Graph), nil, nil)
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

    resp := &GetAllResponse{}
    bytes, err := ioutil.ReadAll(res.Body)
    if err != nil {
        return nil, err
    }

    fmt.Println(string(bytes))
    respData := GetAllResponseData{}
    err = json.Unmarshal(bytes, &respData)
    if err != nil {
       return nil, err
    }
    resp.StatusCode = res.StatusCode
    resp.Header = res.Header
    resp.Body = res.Body
    resp.Data = respData
    return resp, nil
}
