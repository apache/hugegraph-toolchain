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

package propertykey_test

import (
    "fmt"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/api/v1/propertykey"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/internal/model"
    "log"
    "math/rand"
    "testing"
    "time"
)

func TestPropertyKey(t *testing.T) {

    client, err := hugegraph.NewDefaultCommonClient()
    if err != nil {
        log.Println(err)
    }
    rand.Seed(time.Now().UnixNano())
    name := fmt.Sprintf("testProperty%d", rand.Intn(99999))

    // create propertyKey
    respCreate, err := client.Propertykey.Create(
        client.Propertykey.Create.WithReqData(
            propertykey.CreateRequestData{
                Name:        name,
                DataType:    model.PropertyDataTypeInt,
                Cardinality: model.PropertyCardinalitySingle,
            },
        ),
    )
    if err != nil {
        t.Errorf(err.Error())
    }
    if respCreate.Data.PropertyKey.Name != name || respCreate.Data.PropertyKey.ID <= 0 {
        t.Errorf("create propertyKey failed")
    }

    // propertyKey get all
    respGetAll, err := client.Propertykey.GetAll()
    if err != nil {
        t.Errorf(err.Error())
    }

    hasCreated := false
    for _, pk := range respGetAll.Data.Propertykeys {
        if pk.Name == name {
            hasCreated = true
        }
    }
    if !hasCreated {
        t.Errorf("get all propertyKey failed")
    }

    // propertyKey update user_data
    respUpdateUserdata, err := client.Propertykey.UpdateUserdata(
        client.Propertykey.UpdateUserdata.WithReqData(
            propertykey.UpdateUserdataRequestData{
                Action: model.ActionAppend,
                Name:   name,
                UserData: struct {
                    Min int `json:"min"`
                    Max int `json:"max"`
                }(struct {
                    Min int
                    Max int
                }{
                    Min: 1,
                    Max: 10,
                }),
            },
        ),
    )
    if err != nil {
        t.Errorf(err.Error())
    }
    if respUpdateUserdata.Data.PropertyKey.UserData.Max != 10 {
        t.Errorf("update userdata propertyKey failed")
    }

    // propertyKey get by name
    respGetByName, err := client.Propertykey.GetByName(
        client.Propertykey.GetByName.WithName(name),
    )
    if err != nil {
        t.Errorf(err.Error())
    }
    if respGetByName.Data.Name != name || respGetByName.Data.ID <= 0 || respGetByName.Data.UserData.Max != 10 {
        t.Errorf("getByName propertyKey failed")
    }

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
