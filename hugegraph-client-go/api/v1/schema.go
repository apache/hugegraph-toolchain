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

package v1

import (
    "context"
    "encoding/json"
    "fmt"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/hgtransport"
    "io"
    "io/ioutil"
    "net/http"

    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/api"
)

// ----- API Definition -------------------------------------------------------
// View Schema information of HugeGraph
//
// See full documentation at https://hugegraph.apache.org/docs/clients/restful-api/schema/#11-schema
func newSchemaFunc(t api.Transport) Schema {
    return func(o ...func(*SchemaRequest)) (*SchemaResponse, error) {
        var r = SchemaRequest{}
        for _, f := range o {
            f(&r)
        }
        return r.Do(r.ctx, t)
    }
}

type Schema func(o ...func(*SchemaRequest)) (*SchemaResponse, error)

type SchemaRequest struct {
    Body   io.Reader
    ctx    context.Context
    config hgtransport.Config
}

type SchemaResponse struct {
    StatusCode int                `json:"-"`
    Header     http.Header        `json:"-"`
    Body io.ReadCloser      `json:"-"`
    Data SchemaResponseData `json:"-"`
}

type SchemaResponseData struct {
    Propertykeys []struct {
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
    } `json:"propertykeys"`
    Vertexlabels []struct {
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
    } `json:"vertexlabels"`
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
    Indexlabels []struct {
        ID        int      `json:"id"`
        Name      string   `json:"name"`
        BaseType  string   `json:"base_type"`
        BaseValue string   `json:"base_value"`
        IndexType string   `json:"index_type"`
        Fields    []string `json:"fields"`
        Status    string   `json:"status"`
        UserData  struct {
            CreateTime string `json:"~create_time"`
        } `json:"user_data"`
    } `json:"indexlabels"`
}

func (r SchemaRequest) Do(ctx context.Context, transport api.Transport) (*SchemaResponse, error) {

    req, err := api.NewRequest("GET", fmt.Sprintf("/graphs/%s/schema", transport.GetConfig().Graph), nil, r.Body)
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

    schemaRespData := SchemaResponseData{}
    bytes, err := ioutil.ReadAll(res.Body)
    if err != nil {
        return nil, err
    }
    err = json.Unmarshal(bytes, &schemaRespData)
    if err != nil {
        return nil, err
    }
    schemaResp := &SchemaResponse{}
    schemaResp.StatusCode = res.StatusCode
    schemaResp.Header = res.Header
    schemaResp.Body = res.Body
    schemaResp.Data = schemaRespData
    return schemaResp, nil
}
