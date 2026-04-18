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

package propertykey

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
    "net/url"
    "strings"
)

type PropertyKey struct {
    Create
    DeleteByName
    GetAll
    GetByName
    UpdateUserdata
}

func New(t api.Transport) *PropertyKey {
    return &PropertyKey{
        // Create https://hugegraph.apache.org/docs/clients/restful-api/propertykey/#121-create-a-propertykey
        Create: newCreateFunc(t),
        // DeleteByName https://hugegraph.apache.org/docs/clients/restful-api/propertykey/#125-delete-propertykey-according-to-name
        DeleteByName: newDeleteByNameFunc(t),
        // GetAll https://hugegraph.apache.org/docs/clients/restful-api/propertykey/#123-get-all-propertykeys
        GetAll: newGetAllFunc(t),
        // GetByName https://hugegraph.apache.org/docs/clients/restful-api/propertykey/#124-get-propertykey-according-to-name
        GetByName: newGetByNameFunc(t),
        // UpdateUserdata https://hugegraph.apache.org/docs/clients/restful-api/propertykey/#122-add-or-remove-userdata-for-an-existing-propertykey
        UpdateUserdata: newUpdateUserdataFunc(t),
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
func newGetAllFunc(t api.Transport) GetAll {
    return func(o ...func(*GetAllRequest)) (*GetAllResponse, error) {
        var r = GetAllRequest{}
        for _, f := range o {
            f(&r)
        }
        return r.Do(r.ctx, t)
    }
}
func newGetByNameFunc(t api.Transport) GetByName {
    return func(o ...func(*GetByNameRequest)) (*GetByNameResponse, error) {
        var r = GetByNameRequest{}
        for _, f := range o {
            f(&r)
        }
        return r.Do(r.ctx, t)
    }
}
func newUpdateUserdataFunc(t api.Transport) UpdateUserdata {
    return func(o ...func(*UpdateUserdataRequest)) (*UpdateUserdataResponse, error) {
        var r = UpdateUserdataRequest{}
        for _, f := range o {
            f(&r)
        }
        return r.Do(r.ctx, t)
    }
}

type Create func(o ...func(*CreateRequest)) (*CreateResponse, error)
type DeleteByName func(o ...func(*DeleteByNameRequest)) (*DeleteByNameResponse, error)
type GetAll func(o ...func(*GetAllRequest)) (*GetAllResponse, error)
type GetByName func(o ...func(*GetByNameRequest)) (*GetByNameResponse, error)
type UpdateUserdata func(o ...func(*UpdateUserdataRequest)) (*UpdateUserdataResponse, error)

type CreateRequest struct {
    Body    io.Reader
    ctx     context.Context
    reqData CreateRequestData
}
type CreateRequestData struct {
    Name        string                    `json:"name"`
    DataType    model.PropertyDataType    `json:"data_type"`
    Cardinality model.PropertyCardinality `json:"cardinality"`
}
type CreateResponse struct {
    StatusCode int                `json:"-"`
    Header     http.Header        `json:"-"`
    Body       io.ReadCloser      `json:"-"`
    Data       CreateResponseData `json:"versions"`
}
type CreateResponseData struct {
    PropertyKey struct {
        ID            int           `json:"id"`
        Name          string        `json:"name"`
        DataType      string        `json:"data_type"`
        Cardinality   string        `json:"cardinality"`
        AggregateType string        `json:"aggregate_type"`
        WriteType     string        `json:"write_type"`
        Properties    []interface{} `json:"properties"`
        Status        string        `json:"status"`
        UserData      struct {
            CreateTime string `json:"~create_time"`
        } `json:"user_data"`
    } `json:"property_key"`
    TaskID int `json:"task_id"`
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
    Data       DeleteByNameResponseData `json:"versions"`
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
    Propertykeys []struct {
        ID          int           `json:"id"`
        Name        string        `json:"name"`
        DataType    string        `json:"data_type"`
        Cardinality string        `json:"cardinality"`
        Properties  []interface{} `json:"properties"`
        UserData    struct {
        } `json:"user_data"`
    } `json:"propertykeys"`
}

type GetByNameRequest struct {
    Body io.Reader
    ctx  context.Context
    name string
}
type GetByNameResponse struct {
    StatusCode int                   `json:"-"`
    Header     http.Header           `json:"-"`
    Body       io.ReadCloser         `json:"-"`
    Data       GetByNameResponseData `json:"-"`
}
type GetByNameResponseData struct {
    ID            int           `json:"id"`
    Name          string        `json:"name"`
    DataType      string        `json:"data_type"`
    Cardinality   string        `json:"cardinality"`
    AggregateType string        `json:"aggregate_type"`
    WriteType     string        `json:"write_type"`
    Properties    []interface{} `json:"properties"`
    Status        string        `json:"status"`
    UserData      struct {
        Min        int    `json:"min"`
        Max        int    `json:"max"`
        CreateTime string `json:"~create_time"`
    } `json:"user_data"`
}

type UpdateUserdataRequest struct {
    Body    io.Reader
    ctx     context.Context
    reqData UpdateUserdataRequestData
}
type UpdateUserdataRequestData struct {
    Action   model.Action `json:"-"`
    Name     string       `json:"name"`
    UserData struct {
        Min int `json:"min"`
        Max int `json:"max"`
    } `json:"user_data"`
}
type UpdateUserdataResponse struct {
    StatusCode     int                        `json:"-"`
    Header         http.Header                `json:"-"`
    Body           io.ReadCloser              `json:"-"`
    Data UpdateUserdataResponseData `json:"-"`
}
type UpdateUserdataResponseData struct {
    PropertyKey struct {
        ID            int           `json:"id"`
        Name          string        `json:"name"`
        DataType      string        `json:"data_type"`
        Cardinality   string        `json:"cardinality"`
        AggregateType string        `json:"aggregate_type"`
        WriteType     string        `json:"write_type"`
        Properties    []interface{} `json:"properties"`
        Status        string        `json:"status"`
        UserData      struct {
            Min        int    `json:"min"`
            Max        int    `json:"max"`
            CreateTime string `json:"~create_time"`
        } `json:"user_data"`
    } `json:"property_key"`
    TaskID int `json:"task_id"`
}

func (r CreateRequest) Do(ctx context.Context, transport api.Transport) (*CreateResponse, error) {

    if len(r.reqData.Name) <= 0 {
        return nil, errors.New("create property must set name")
    }
    if len(r.reqData.DataType) <= 0 {
        return nil, errors.New("create property must set dataType")
    }
    if len(r.reqData.Cardinality) <= 0 {
        return nil, errors.New("create property must set cardinality")
    }

    byteBody, err := json.Marshal(&r.reqData)
    if err != nil {
        return nil, err
    }
    reader := strings.NewReader(string(byteBody))

    req, err := api.NewRequest("POST", fmt.Sprintf("/graphs/%s/schema/propertykeys", transport.GetConfig().Graph), nil, reader)
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
    req, err := api.NewRequest("DELETE", fmt.Sprintf("/graphs/%s/schema/propertykeys/%s", transport.GetConfig().Graph, r.name), nil, r.Body)
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
func (r GetAllRequest) Do(ctx context.Context, transport api.Transport) (*GetAllResponse, error) {

    req, err := api.NewRequest("GET", fmt.Sprintf("/graphs/%s/schema/propertykeys", transport.GetConfig().Graph), nil, r.Body)
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
func (r GetByNameRequest) Do(ctx context.Context, transport api.Transport) (*GetByNameResponse, error) {

    if len(r.name) <= 0 {
        return nil, errors.New("get_by_name must set name")
    }

    req, err := api.NewRequest("GET", fmt.Sprintf("/graphs/%s/schema/propertykeys/%s", transport.GetConfig().Graph, r.name), nil, r.Body)
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

    resp := &GetByNameResponse{}
    bytes, err := ioutil.ReadAll(res.Body)
    if err != nil {
        return nil, err
    }
    respData := GetByNameResponseData{}
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
func (r UpdateUserdataRequest) Do(ctx context.Context, transport api.Transport) (*UpdateUserdataResponse, error) {

    params := &url.Values{}
    if len(r.reqData.Action) <= 0 {
        return nil, errors.New("property update userdata must set action")
    } else {
        params.Add("action", string(r.reqData.Action))
    }
    if len(r.reqData.Name) <= 0 {
        return nil, errors.New("property update userdata must set name")
    }

    byteBody, err := json.Marshal(&r.reqData)
    if err != nil {
        return nil, err
    }
    reader := strings.NewReader(string(byteBody))

    req, err := api.NewRequest("PUT", fmt.Sprintf("/graphs/%s/schema/propertykeys/%s", transport.GetConfig().Graph, r.reqData.Name), params, reader)
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

    resp := &UpdateUserdataResponse{}
    bytes, err := ioutil.ReadAll(res.Body)
    if err != nil {
        return nil, err
    }
    respData := UpdateUserdataResponseData{}
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
func (r GetByName) WithName(name string) func(request *GetByNameRequest) {
    return func(r *GetByNameRequest) {
        r.name = name
    }
}
func (r UpdateUserdata) WithReqData(reqData UpdateUserdataRequestData) func(request *UpdateUserdataRequest) {
    return func(r *UpdateUserdataRequest) {
        r.reqData = reqData
    }
}
