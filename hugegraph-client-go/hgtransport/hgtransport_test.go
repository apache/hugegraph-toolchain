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

package hgtransport

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

type recorded struct {
	path, auth, agent, contentType string
	hasAuth                        bool
	body                           string
}

func recordingServer(t *testing.T, status int, reply string) (*httptest.Server, *recorded) {
	t.Helper()
	rec := &recorded{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		rec.path = r.URL.Path
		_, rec.hasAuth = r.Header["Authorization"]
		rec.auth = r.Header.Get("Authorization")
		rec.agent = r.Header.Get("User-Agent")
		rec.contentType = r.Header.Get("Content-Type")
		rec.body = string(body)
		w.WriteHeader(status)
		_, _ = w.Write([]byte(reply))
	}))
	t.Cleanup(server.Close)
	return server, rec
}

func newRequest(t *testing.T, method, path, body string) *http.Request {
	t.Helper()
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, path, reader)
	if err != nil {
		t.Fatal(err)
	}
	return req
}

func serverURL(t *testing.T, server *httptest.Server, path string) *url.URL {
	t.Helper()
	u, err := url.Parse(server.URL + path)
	if err != nil {
		t.Fatal(err)
	}
	return u
}

func basicAuth(username, password string) string {
	req, _ := http.NewRequest("GET", "/", nil)
	req.SetBasicAuth(username, password)
	return req.Header.Get("Authorization")
}

func TestPerformSetsURLHeadersAndBasicAuth(t *testing.T) {
	server, rec := recordingServer(t, http.StatusOK, "{}")
	client := New(Config{URL: serverURL(t, server, "/prefix"), Username: "admin", Password: "pa"})

	res, err := client.Perform(newRequest(t, "POST", "/graphs/hugegraph/graph/vertices", `{"label":"person"}`))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", res.StatusCode)
	}
	if rec.path != "/prefix/graphs/hugegraph/graph/vertices" {
		t.Errorf("path = %q", rec.path)
	}
	if rec.auth != basicAuth("admin", "pa") {
		t.Errorf("authorization = %q", rec.auth)
	}
	if !strings.HasPrefix(rec.agent, "go-hugegraph/"+Version+" (") {
		t.Errorf("user agent = %q", rec.agent)
	}
	if rec.contentType != "application/json;charset=UTF-8" {
		t.Errorf("content type = %q", rec.contentType)
	}
	if rec.body != `{"label":"person"}` {
		t.Errorf("body = %q", rec.body)
	}
}

func TestPerformPrefersURLUserInfo(t *testing.T) {
	server, rec := recordingServer(t, http.StatusOK, "{}")
	u := serverURL(t, server, "")
	u.User = url.UserPassword("url-user", "url-pa")
	client := New(Config{URL: u, Username: "admin", Password: "pa"})

	res, err := client.Perform(newRequest(t, "GET", "/versions", ""))
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()

	if rec.auth != basicAuth("url-user", "url-pa") {
		t.Errorf("authorization = %q", rec.auth)
	}
}

func TestPerformKeepsExplicitAuthorization(t *testing.T) {
	server, rec := recordingServer(t, http.StatusOK, "{}")
	client := New(Config{URL: serverURL(t, server, ""), Username: "admin", Password: "pa"})

	req := newRequest(t, "GET", "/versions", "")
	req.Header.Set("Authorization", "Bearer token")
	res, err := client.Perform(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()

	if rec.auth != "Bearer token" {
		t.Errorf("authorization = %q", rec.auth)
	}
}

func TestPerformWithoutCompleteCredentials(t *testing.T) {
	for _, cfg := range []Config{{}, {Username: "admin"}, {Password: "pa"}} {
		server, rec := recordingServer(t, http.StatusOK, "{}")
		cfg.URL = serverURL(t, server, "")
		res, err := New(cfg).Perform(newRequest(t, "GET", "/versions", ""))
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()

		if rec.hasAuth {
			t.Errorf("config %+v sent authorization %q", cfg, rec.auth)
		}
	}
}

func TestPerformReturnsServerErrorResponse(t *testing.T) {
	html := "<html>503 Service Unavailable</html>"
	server, _ := recordingServer(t, http.StatusServiceUnavailable, html)
	client := New(Config{URL: serverURL(t, server, "")})

	res, err := client.Perform(newRequest(t, "GET", "/versions", ""))
	if err != nil {
		t.Fatalf("server errors must be returned as responses, got %v", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusServiceUnavailable || string(body) != html {
		t.Errorf("response = %d %q", res.StatusCode, body)
	}
}

func TestPerformConnectionDropped(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, _, err := w.(http.Hijacker).Hijack()
		if err == nil {
			conn.Close()
		}
	}))
	defer server.Close()
	client := New(Config{URL: serverURL(t, server, "")})

	res, err := client.Perform(newRequest(t, "GET", "/versions", ""))
	if err == nil {
		res.Body.Close()
		t.Fatal("dropped connection must return an error")
	}
	if res != nil {
		t.Errorf("response = %+v, want nil", res)
	}
}

func TestPerformTimeout(t *testing.T) {
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-release:
		case <-time.After(5 * time.Second):
		}
	}))
	defer server.Close()
	defer close(release)
	transport := &http.Transport{ResponseHeaderTimeout: 100 * time.Millisecond}
	defer transport.CloseIdleConnections()
	client := New(Config{URL: serverURL(t, server, ""), Transport: transport})

	start := time.Now()
	res, err := client.Perform(newRequest(t, "GET", "/versions", ""))
	if err == nil {
		res.Body.Close()
		t.Fatal("slow response must time out")
	}
	if time.Since(start) > 3*time.Second {
		t.Errorf("timeout took %v", time.Since(start))
	}
}

func TestPerformWithLoggerKeepsBodies(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_, _ = w.Write([]byte("echo:" + string(body)))
	}))
	defer server.Close()
	var log bytes.Buffer
	logger := &TextLogger{Output: &log, EnableRequestBody: true, EnableResponseBody: true}
	client := New(Config{URL: serverURL(t, server, ""), Logger: logger})

	res, err := client.Perform(newRequest(t, "POST", "/gremlin", `{"gremlin":"g.V()"}`))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)

	if string(body) != `echo:{"gremlin":"g.V()"}` {
		t.Errorf("response body = %q", body)
	}
	for _, want := range []string{"POST", "/gremlin", `> {"gremlin":"g.V()"}`, `< echo:{"gremlin":"g.V()"}`} {
		if !strings.Contains(log.String(), want) {
			t.Errorf("log %q doesn't contain %q", log.String(), want)
		}
	}
}

func TestPerformLogsTransportError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	u := serverURL(t, server, "")
	server.Close()
	var log bytes.Buffer
	client := New(Config{URL: u, Logger: &TextLogger{Output: &log}})

	res, err := client.Perform(newRequest(t, "GET", "/versions", ""))
	if err == nil {
		res.Body.Close()
		t.Fatal("closed server must return an error")
	}
	if !strings.Contains(log.String(), "! ERROR:") {
		t.Errorf("log %q doesn't contain the error", log.String())
	}
}

func TestGetConfig(t *testing.T) {
	u, _ := url.Parse("http://127.0.0.1:8080")
	logger := &TextLogger{}
	cfg := New(Config{URL: u, Username: "admin", Password: "pa", GraphSpace: "DEFAULT",
		Graph: "hugegraph", Logger: logger}).GetConfig()

	if cfg.URL != u || cfg.Username != "admin" || cfg.Password != "pa" ||
		cfg.GraphSpace != "DEFAULT" || cfg.Graph != "hugegraph" {
		t.Errorf("config = %+v", cfg)
	}
	if cfg.Transport != http.DefaultTransport {
		t.Errorf("transport = %v, want http.DefaultTransport", cfg.Transport)
	}
	// Pins current behavior: GetConfig doesn't return the logger
	if cfg.Logger != nil {
		t.Errorf("logger = %v, want nil", cfg.Logger)
	}
}
