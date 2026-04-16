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

package vertexlabel_test

import (
    "fmt"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/api/v1/propertykey"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/api/v1/vertexlabel"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/internal/model"
    "math/rand"
    "testing"
    "time"
)

func TestVertexLabel(t *testing.T) {
    client, err := hugegraph.NewDefaultCommonClient()
    if err != nil {
        t.Errorf("NewDefaultCommonClient() error = %v", err)
    }

    rand.Seed(time.Now().UnixNano())
    randNum := rand.Intn(999999)
    pkName := fmt.Sprintf("testPropertyKey%d", randNum)
    vertexLabelName := fmt.Sprintf("testVertexLabel%d", randNum)

    // create propertykey
    createPk(client, pkName, t)
    // create vertexlabel
    createVertexLabel(client, vertexLabelName, t, pkName, pkName)
    // get all
    getAll(client, vertexLabelName, t)
    // update vertexlabel userdata
    //updateUserData(client, vertexLabelName, pkName, t)
    // get by name
    getByName(client, vertexLabelName, t)
    // delete vertexlabel
    deleteByName(client, vertexLabelName, t)
}

func createPk(client *hugegraph.CommonClient, pkName string, t *testing.T) *propertykey.CreateResponse {
    pk1 := propertykey.CreateRequestData{
        Name:        pkName,
        DataType:    model.PropertyDataTypeInt,
        Cardinality: model.PropertyCardinalitySingle,
    }

    pk1Resp, err := client.Propertykey.Create(
        client.Propertykey.Create.WithReqData(pk1),
    )
    if err != nil {
        t.Errorf("Create Propertykey error = %v", err)
    }
    if pk1Resp.Data.PropertyKey.Name != pk1.Name {
        t.Errorf("Create Propertykey error = %v", err)
    }

    return pk1Resp
}

func createVertexLabel(
    client *hugegraph.CommonClient,
    vertexLabelName string,
    t *testing.T,
    pkName string,
    pkNames ...string) *vertexlabel.CreateResponse {
    createResp, err := client.VertexLabel.Create(
        client.VertexLabel.Create.WithReqData(
            vertexlabel.CreateRequestData{
                Name:       vertexLabelName,
                IDStrategy: model.IDStrategyDefault,
                Properties: pkNames,
                PrimaryKeys: []string{
                    pkName,
                },
                NullableKeys:     []string{},
                EnableLabelIndex: true,
            },
        ),
    )
    if err != nil {
        t.Errorf("Create Vertexlabel error = %v", err)
    }
    if createResp.Data.Name != vertexLabelName {
        t.Errorf("Create Vertexlabel error = %v", err)
    }
    return createResp
}

func updateUserData(client *hugegraph.CommonClient, vertexLabelName string, pkName string, t *testing.T) *vertexlabel.UpdateUserdataResponse {
    respUpdateUserData, err := client.VertexLabel.UpdateUserdata(
        client.VertexLabel.UpdateUserdata.WithReqData(
            vertexlabel.UpdateUserdataRequestData{
                Action:       model.ActionAppend,
                Name:         vertexLabelName,
                Properties:   []string{pkName},
                NullableKeys: []string{pkName},
                UserData: struct {
                    Super string `json:"super"`
                }{
                    Super: "animal",
                },
            },
        ),
    )
    if err != nil {
        t.Errorf("updateUserData Vertexlabel error = %v", err)
    }
    //if respUpdateUserData.Data.Name != vertexLabelName {
    //    t.Errorf("updateUserData Vertexlabel error = %v", err)
    //}
    return respUpdateUserData
}

func getByName(client *hugegraph.CommonClient, vertexLabelName string, t *testing.T) {
    respGetByName, err := client.VertexLabel.GetByName(
        client.VertexLabel.GetByName.WithName(vertexLabelName),
    )
    if err != nil {
        t.Errorf("getbyname Vertexlabel error = %v", err)
    }
    if respGetByName.Data.Name != vertexLabelName {
        t.Errorf("getbyname Vertexlabel error")
    }
}

func getAll(client *hugegraph.CommonClient, vertexLabelName string, t *testing.T) {
    respGetAll, err := client.VertexLabel.GetAll()
    if err != nil {
        t.Errorf("getAll Vertexlabel error = %v", err)
    }
    name := ""
    for _, s := range respGetAll.Data.Vertexlabels {
        if s.Name == vertexLabelName {
            name = s.Name
        }
    }
    if name != vertexLabelName {
        t.Errorf("getAll Vertexlabel error")
    }
}

func deleteByName(client *hugegraph.CommonClient, vertexLabelName string, t *testing.T) {
    respDeleteByName, err := client.VertexLabel.DeleteByName(
        client.VertexLabel.DeleteByName.WithName(vertexLabelName),
    )
    if err != nil {
        t.Errorf("deletebyname Vertexlabel error = %v", err)
    }
    if respDeleteByName.StatusCode > 299 {
        t.Errorf("deletebyname Vertexlabel error")
    }
}
