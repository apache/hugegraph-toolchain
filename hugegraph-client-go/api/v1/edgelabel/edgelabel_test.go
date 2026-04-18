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

package edgelabel_test

import (
    "fmt"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/api/v1/edgelabel"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/api/v1/propertykey"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/api/v1/vertexlabel"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/internal/model"
    "math/rand"
    "testing"
    "time"
)

func TestEdgelabel(t *testing.T) {

    // 1. 创建 Edgelabel
    client, err := hugegraph.NewDefaultCommonClient()
    if err != nil {
        t.Errorf("NewDefaultCommonClient() error = %v", err)
    }

    rand.Seed(time.Now().UnixNano())
    randNum := rand.Intn(999999)
    pkName1 := fmt.Sprintf("tpk1-%d", randNum)
    pkName2 := fmt.Sprintf("tpk2-%d", randNum)

    vertexLabelName1 := fmt.Sprintf("tvl-1%d", randNum)
    vertexLabelName2 := fmt.Sprintf("tvl-2%d", randNum)
    edgeLabelName := fmt.Sprintf("tel-%d", randNum)

    // 创建顶点使用的pk
    createPk(client, pkName1, t)
    createPk(client, pkName2, t)

    // 创建source顶点label
    createVertexLabel(client, vertexLabelName1, t, pkName1, pkName1)
    // 创建target顶点label
    createVertexLabel(client, vertexLabelName2, t, pkName1, pkName1)
    // 创建边的label
    createEdgeLabel(client, edgeLabelName, t, vertexLabelName1, vertexLabelName2, []string{}, []string{}, []string{pkName2}, true)

    // 获取边的label
    allEdgeLabels, err := client.EdgeLabel.GetAll()
    if err != nil {
        t.Errorf("client.EdgeLabel.GetAll() error = %v", err)
    }
    hasLabel := false
    for _, edgeLabel := range allEdgeLabels.Data.Edgelabels {
        if edgeLabel.Name == edgeLabelName {
            hasLabel = true
            break
        }
    }
    if !hasLabel {
        t.Errorf("client.EdgeLabel.GetAll() error = %v", err)
    }

    // 删除边的label
    client.EdgeLabel.DeleteByName(
        client.EdgeLabel.DeleteByName.WithName(edgeLabelName),
    )

    client.VertexLabel.DeleteByName(
        client.VertexLabel.DeleteByName.WithName(vertexLabelName1),
    )
    client.VertexLabel.DeleteByName(
        client.VertexLabel.DeleteByName.WithName(vertexLabelName2),
    )

    //deletePk(client, pkName1, t)
    //deletePk(client, pkName2, t)
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

func TestGet(t *testing.T) {
    client, err := hugegraph.NewDefaultCommonClient()
    if err != nil {
        t.Errorf("NewDefaultCommonClient() error = %v", err)
    }
    client.EdgeLabel.GetAll()
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

func createEdgeLabel(
    client *hugegraph.CommonClient,
    edgeLabelName string,
    t *testing.T,
    sourceLabel string,
    targetLabel string,
    sortKeys []string,
    nullableKeys []string,
    pkNames []string,
    enableLabelIndex bool,
) {
    // 1. 创建 Edgelabel
    client.EdgeLabel.Create(
        client.EdgeLabel.Create.WithReqData(
            edgelabel.CreateRequestData{
                Name:             edgeLabelName,
                SourceLabel:      sourceLabel,
                TargetLabel:      targetLabel,
                Frequency:        model.FrequencySingle,
                Properties:       pkNames,
                SortKeys:         sortKeys,
                NullableKeys:     nullableKeys,
                EnableLabelIndex: enableLabelIndex,
            },
        ),
    )
}

func deletePk(client *hugegraph.CommonClient, name string, t *testing.T) {
    // propertyKey delete
    respDelete, err := client.Propertykey.DeleteByName(
        client.Propertykey.DeleteByName.WithName(name),
    )
    if err != nil {
        t.Errorf(err.Error())
    }
    if respDelete.StatusCode > 299 {
        t.Errorf("delete propertyKey failed")
    }
}
