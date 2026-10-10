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

package vertex_test

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	hugegraph "github.com/apache/hugegraph-toolchain/hugegraph-client-go"
	"github.com/apache/hugegraph-toolchain/hugegraph-client-go/internal/model"
)

type request struct {
	method, path, query string
	body                map[string]interface{}
	list                []map[string]interface{}
}

func fakeServer(t *testing.T, space string, status int, reply string) (*hugegraph.CommonClient, *request) {
	t.Helper()
	rec := &request{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		rec.method = r.Method
		rec.path = r.URL.Path
		rec.query = r.URL.RawQuery
		if json.Unmarshal(body, &rec.body) != nil {
			_ = json.Unmarshal(body, &rec.list)
		}
		w.WriteHeader(status)
		_, _ = w.Write([]byte(reply))
	}))
	t.Cleanup(server.Close)
	host, portString, _ := net.SplitHostPort(server.Listener.Addr().String())
	port, _ := strconv.Atoi(portString)
	client, err := hugegraph.NewCommonClient(hugegraph.Config{
		Host: host, Port: port, GraphSpace: space, Graph: "hugegraph",
	})
	if err != nil {
		t.Fatal(err)
	}
	return client, rec
}

func TestCreateVertex(t *testing.T) {
	for _, space := range []string{"", "DEFAULT"} {
		client, rec := fakeServer(t, space, http.StatusCreated,
			`{"id":"1:tom","label":"person","type":"vertex","properties":{"name":"tom","age":18}}`)

		resp, err := client.Vertex.Create(
			client.Vertex.Create.WithContext(context.Background()),
			client.Vertex.Create.WithVertex(model.Vertex[any]{
				Label:      "person",
				Properties: Person{Name: "tom", Age: 18},
			}),
		)
		if err != nil {
			t.Fatal(err)
		}

		path := "/graphs/hugegraph/graph/vertices"
		if space != "" {
			path = "/graphspaces/DEFAULT" + path
		}
		if rec.method != "POST" || rec.path != path {
			t.Errorf("request = %s %s, want POST %s", rec.method, rec.path, path)
		}
		if rec.body["label"] != "person" ||
			rec.body["properties"].(map[string]interface{})["name"] != "tom" {
			t.Errorf("request body = %v", rec.body)
		}
		if _, ok := rec.body["id"]; ok {
			t.Errorf("empty id must be omitted, body = %v", rec.body)
		}
		if resp.StatusCode != http.StatusCreated || resp.Data.ID != "1:tom" ||
			resp.Data.Typ != "vertex" {
			t.Errorf("response = %d %+v", resp.StatusCode, resp.Data)
		}
	}
}

func TestBatchCreateVertices(t *testing.T) {
	client, rec := fakeServer(t, "", http.StatusCreated, `["1:bob","1:angle"]`)

	resp, err := client.Vertex.BatchCreate(
		client.Vertex.BatchCreate.WithVertices([]model.Vertex[any]{
			{Label: "person", Properties: Person{Name: "bob"}},
			{Label: "person", Properties: Person{Name: "angle"}},
		}),
	)
	if err != nil {
		t.Fatal(err)
	}

	if rec.method != "POST" || rec.path != "/graphs/hugegraph/graph/vertices/batch" {
		t.Errorf("request = %s %s", rec.method, rec.path)
	}
	if len(rec.list) != 2 || rec.list[1]["properties"].(map[string]interface{})["name"] != "angle" {
		t.Errorf("request body = %v", rec.list)
	}
	if len(resp.IDs) != 2 || resp.IDs[0] != "1:bob" || resp.IDs[1] != "1:angle" {
		t.Errorf("ids = %v", resp.IDs)
	}
}

func TestUpdateVertexProperties(t *testing.T) {
	client, rec := fakeServer(t, "DEFAULT", http.StatusOK,
		`{"id":"1:tom","label":"person","type":"vertex","properties":{"name":"tom","age":10}}`)

	resp, err := client.Vertex.UpdateProperties(
		client.Vertex.UpdateProperties.WithID("1:tom"),
		client.Vertex.UpdateProperties.WithAction(model.ActionAppend),
		client.Vertex.UpdateProperties.WithVertex(model.Vertex[any]{
			Label:      "person",
			Properties: Person{Age: 10},
		}),
	)
	if err != nil {
		t.Fatal(err)
	}

	if rec.method != "PUT" ||
		rec.path != `/graphspaces/DEFAULT/graphs/hugegraph/graph/vertices/"1:tom"` ||
		rec.query != "action=append" {
		t.Errorf("request = %s %s?%s", rec.method, rec.path, rec.query)
	}
	if rec.body["properties"].(map[string]interface{})["age"] != float64(10) {
		t.Errorf("request body = %v", rec.body)
	}
	properties := resp.Data.Properties.(map[string]interface{})
	if resp.Data.ID != "1:tom" || properties["age"] != float64(10) {
		t.Errorf("response = %+v", resp.Data)
	}
}

func TestVertexServerErrors(t *testing.T) {
	// A json error body is returned with its status code
	client, _ := fakeServer(t, "", http.StatusBadRequest,
		`{"exception":"java.lang.IllegalArgumentException","message":"Invalid label"}`)
	resp, err := client.Vertex.Create(client.Vertex.Create.WithVertex(
		model.Vertex[any]{Label: "missing", Properties: Person{Name: "tom"}}))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusBadRequest || resp.Data.ID != "" {
		t.Errorf("response = %d %+v", resp.StatusCode, resp.Data)
	}

	// A non-json body can't be decoded
	client, _ = fakeServer(t, "", http.StatusBadGateway, "<html>502 Bad Gateway</html>")
	if _, err := client.Vertex.Create(client.Vertex.Create.WithVertex(
		model.Vertex[any]{Label: "person", Properties: Person{Name: "tom"}})); err == nil {
		t.Error("create with non-json response must fail")
	}
	if _, err := client.Vertex.BatchCreate(client.Vertex.BatchCreate.WithVertices(
		[]model.Vertex[any]{{Label: "person"}})); err == nil {
		t.Error("batch create with non-json response must fail")
	}
	if _, err := client.Vertex.UpdateProperties(client.Vertex.UpdateProperties.WithID("1:tom"),
		client.Vertex.UpdateProperties.WithAction(model.ActionEliminate)); err == nil {
		t.Error("update with non-json response must fail")
	}
}

func TestVertexWithCancelledContext(t *testing.T) {
	client, rec := fakeServer(t, "", http.StatusCreated, `{"id":"1:tom"}`)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := client.Vertex.Create(client.Vertex.Create.WithContext(ctx),
		client.Vertex.Create.WithVertex(model.Vertex[any]{Label: "person"}))
	if err == nil {
		t.Fatal("cancelled context must fail")
	}
	if rec.method != "" {
		t.Errorf("cancelled request reached the server: %s %s", rec.method, rec.path)
	}
}
