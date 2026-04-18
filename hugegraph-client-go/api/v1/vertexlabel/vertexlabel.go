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

package vertexlabel

import (
   "context"
   "encoding/json"
   "errors"
   "fmt"
   "io"
   "io/ioutil"
   "net/http"
   "net/url"
   "strings"

   "github.com/apache/hugegraph-toolchain/hugegraph-client-go/api"
   "github.com/apache/hugegraph-toolchain/hugegraph-client-go/internal/model"
)

type VertexLabel struct {
   Create
   DeleteByName
   GetAll
   GetByName
   UpdateUserdata
}

func New(t api.Transport) *VertexLabel {
   return &VertexLabel{
       // Create https://hugegraph.apache.org/docs/clients/restful-api/vertexlabel/#131-create-a-vertexlabel
       Create: newCreateFunc(t),
       // DeleteByName https://hugegraph.apache.org/docs/clients/restful-api/vertexlabel/#135-delete-vertexlabel-by-name
       DeleteByName: newDeleteByNameFunc(t),
       // GetAll https://hugegraph.apache.org/docs/clients/restful-api/vertexlabel/#133-get-all-vertexlabels
       GetAll: newGetAllFunc(t),
       // GetByName https://hugegraph.apache.org/docs/clients/restful-api/vertexlabel/#134-get-vertexlabel-by-name
       GetByName: newGetByNameFunc(t),
       // UpdateUserdata https://hugegraph.apache.org/docs/clients/restful-api/propertykey/#122-add-or-remove-userdata-for-an-existing-propertykey
       UpdateUserdata: newUpdateUserdataFunc(t),
   }
}

type Create func(o ...func(*CreateRequest)) (*CreateResponse, error)
type DeleteByName func(o ...func(*DeleteByNameRequest)) (*DeleteByNameResponse, error)
type GetAll func(o ...func(*GetAllRequest)) (*GetAllResponse, error)
type GetByName func(o ...func(*GetByNameRequest)) (*GetByNameResponse, error)
type UpdateUserdata func(o ...func(*UpdateUserdataRequest)) (*UpdateUserdataResponse, error)

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

type CreateRequest struct {
   Body    io.Reader
   ctx     context.Context
   reqData CreateRequestData
}
type CreateRequestData struct {
   Name             string           `json:"name"`
   IDStrategy       model.IDStrategy `json:"id_strategy"`
   Properties       []string         `json:"properties"`
   PrimaryKeys      []string         `json:"primary_keys"`
   NullableKeys     []string         `json:"nullable_keys"`
   EnableLabelIndex bool             `json:"enable_label_index"`
}
type CreateResponse struct {
   StatusCode int                `json:"-"`
   Header     http.Header        `json:"-"`
   Body       io.ReadCloser      `json:"-"`
   Data       CreateResponseData `json:"-"`
}
type CreateResponseData struct {
   ID               int              `json:"id"`
   PrimaryKeys      []string         `json:"primary_keys"`
   IDStrategy       model.IDStrategy `json:"id_strategy"`
   Name             string           `json:"name"`
   IndexNames       []string         `json:"index_names"`
   Properties       []string         `json:"properties"`
   NullableKeys     []string         `json:"nullable_keys"`
   EnableLabelIndex bool             `json:"enable_label_index"`
   UserData         struct {
   } `json:"user_data"`
}

type DeleteByNameRequest struct {
   Body io.Reader
   ctx  context.Context
   name string
}
type DeleteByNameResponse struct {
   StatusCode    int                      `json:"-"`
   Header        http.Header              `json:"-"`
   Body          io.ReadCloser            `json:"-"`
   DeleteByNames DeleteByNameResponseData `json:"versions"`
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
   Vertexlabels []struct {
       ID               int           `json:"id"`
       PrimaryKeys      []string      `json:"primary_keys"`
       IDStrategy       string        `json:"id_strategy"`
       Name             string        `json:"name"`
       IndexNames       []interface{} `json:"index_names"`
       Properties       []string      `json:"properties"`
       NullableKeys     []string      `json:"nullable_keys"`
       EnableLabelIndex bool          `json:"enable_label_index"`
       UserData         struct {
           Super string `json:"super"`
       } `json:"user_data,omitempty"`
   } `json:"vertexlabels"`
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
   ID               int           `json:"id"`
   Name             string        `json:"name"`
   IDStrategy       string        `json:"id_strategy"`
   PrimaryKeys      []string      `json:"primary_keys"`
   NullableKeys     []interface{} `json:"nullable_keys"`
   IndexLabels      []string      `json:"index_labels"`
   Properties       []string      `json:"properties"`
   Status           string        `json:"status"`
   TTL              int           `json:"ttl"`
   EnableLabelIndex bool          `json:"enable_label_index"`
   UserData         struct {
       CreateTime string `json:"~create_time"`
   } `json:"user_data"`
}

type UpdateUserdataRequest struct {
   Body    io.Reader
   ctx     context.Context
   reqData UpdateUserdataRequestData
}


type UpdateUserdataRequestData struct {
   Action       model.Action `json:"-"`
   Name         string       `json:"name"`
   Properties   []string     `json:"properties"`
   NullableKeys []string     `json:"nullable_keys"`
   UserData     struct {
       Super string `json:"super"`
   } `json:"user_data"`
}
type UpdateUserdataResponse struct {
   StatusCode int                        `json:"-"`
   Header     http.Header                `json:"-"`
   Body       io.ReadCloser              `json:"-"`
   Data       UpdateUserdataResponseData `json:"-"`
}
type UpdateUserdataResponseData struct {
   ID               int           `json:"id"`
   PrimaryKeys      []string      `json:"primary_keys"`
   IDStrategy       string        `json:"id_strategy"`
   Name             string        `json:"name"`
   IndexNames       []interface{} `json:"index_names"`
   Properties       []string      `json:"properties"`
   NullableKeys     []string      `json:"nullable_keys"`
   EnableLabelIndex bool          `json:"enable_label_index"`
   UserData         struct {
       Super string `json:"super"`
   } `json:"user_data"`
}

func (r CreateRequest) Do(ctx context.Context, transport api.Transport) (*CreateResponse, error) {

   if len(r.reqData.Name) <= 0 {
       return nil, errors.New("create property must set name")
   }
   if len(r.reqData.IDStrategy) <= 0 {
       return nil, errors.New("create property must set id_strategy")
   }
   if len(r.reqData.Properties) <= 0 {
       return nil, errors.New("create property must set properties")
   }

   byteBody, err := json.Marshal(&r.reqData)
   if err != nil {
       return nil, err
   }
   reader := strings.NewReader(string(byteBody))

   req, err := api.NewRequest("POST", fmt.Sprintf("/graphs/%s/schema/vertexlabels", transport.GetConfig().Graph), nil, reader)
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
   req, err := api.NewRequest("DELETE", fmt.Sprintf("/graphs/%s/schema/vertexlabels/%s", transport.GetConfig().Graph, r.name), nil, r.Body)
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

   versionResp := &DeleteByNameResponse{}
   bytes, err := ioutil.ReadAll(res.Body)
   if err != nil {
       return nil, err
   }
   err = json.Unmarshal(bytes, versionResp)
   if err != nil {
       return nil, err
   }
   versionResp.StatusCode = res.StatusCode
   versionResp.Header = res.Header
   versionResp.Body = res.Body
   return versionResp, nil
}
func (r GetAllRequest) Do(ctx context.Context, transport api.Transport) (*GetAllResponse, error) {

   req, err := api.NewRequest("GET", fmt.Sprintf("/graphs/%s/schema/vertexlabels", transport.GetConfig().Graph), nil, r.Body)
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
       return nil, errors.New("GetByNameRequest must set name")
   }

   req, err := api.NewRequest("GET", fmt.Sprintf("/graphs/%s/schema/vertexlabels/%s", transport.GetConfig().Graph, r.name), nil, r.Body)
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

   req, err := api.NewRequest("PUT", fmt.Sprintf("/graphs/%s/schema/vertexlabels/%s", transport.GetConfig().Graph, r.reqData.Name), params, reader)
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
func (v GetByName) WithName(name string) func(r *GetByNameRequest) {
   return func(r *GetByNameRequest) {
       r.name = name
   }
}
func (r UpdateUserdata) WithReqData(reqData UpdateUserdataRequestData) func(request *UpdateUserdataRequest) {
   return func(r *UpdateUserdataRequest) {
       r.reqData = reqData
   }
}
