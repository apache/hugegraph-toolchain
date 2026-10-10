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

package v1_test

import (
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	hugegraph "github.com/apache/hugegraph-toolchain/hugegraph-client-go"
)

func fakeServerClient(t *testing.T, handler http.HandlerFunc) *hugegraph.CommonClient {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	host, portString, err := net.SplitHostPort(server.Listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	port, err := strconv.Atoi(portString)
	if err != nil {
		t.Fatal(err)
	}
	client, err := hugegraph.NewCommonClient(hugegraph.Config{
		Host: host, Port: port, Graph: "hugegraph", Username: "admin", Password: "pa",
	})
	if err != nil {
		t.Fatal(err)
	}
	return client
}

func TestVersionWithFakeServer(t *testing.T) {
	client := fakeServerClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/versions" {
			t.Errorf("path = %q", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"versions":{"version":"v1","core":"1.8.0",` +
			`"gremlin":"3.8.1","api":"0.72.0.0"}}`))
	})

	resp, err := client.Version()
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK || resp.Versions.Core != "1.8.0" ||
		resp.Versions.API != "0.72.0.0" || resp.Versions.Gremlin != "3.8.1" {
		t.Errorf("response = %d %+v", resp.StatusCode, resp.Versions)
	}
}

func TestVersionWithNonJSONBody(t *testing.T) {
	client := fakeServerClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte("<html>502 Bad Gateway</html>"))
	})

	resp, err := client.Version()
	if err == nil {
		t.Fatalf("non-json body must fail, got %+v", resp)
	}
}

func TestVersionWithServerErrorJSON(t *testing.T) {
	client := fakeServerClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"exception":"java.lang.IllegalStateException",` +
			`"message":"backend unavailable"}`))
	})

	resp, err := client.Version()
	if err != nil {
		t.Fatal(err)
	}
	// The status code is kept for callers to detect the failure
	if resp.StatusCode != http.StatusInternalServerError || resp.Versions.Core != "" {
		t.Errorf("response = %d %+v", resp.StatusCode, resp.Versions)
	}
}

func TestVersionConnectionDropped(t *testing.T) {
	client := fakeServerClient(t, func(w http.ResponseWriter, r *http.Request) {
		conn, _, err := w.(http.Hijacker).Hijack()
		if err == nil {
			conn.Close()
		}
	})

	if resp, err := client.Version(); err == nil {
		t.Fatalf("dropped connection must fail, got %+v", resp)
	}
}
