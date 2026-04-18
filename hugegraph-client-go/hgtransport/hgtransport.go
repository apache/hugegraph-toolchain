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
    "io/ioutil"
    "net/http"
    "net/url"
    "regexp"
    "runtime"
    "strings"
    "time"

    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/internal/version"
)

// Version returns the package version as a string.
const Version = version.Client

var (
    userAgent   string
    reGoVersion = regexp.MustCompile(`go(\d+\.\d+\..+)`)
)

func init() {
    userAgent = initUserAgent()
}

// Interface defines the interface for HTTP client.
type Interface interface {
    Perform(*http.Request) (*http.Response, error)
    GetConfig() Config
}

// Config represents the configuration of HTTP client.
type Config struct {
    URL        *url.URL
    Username   string
    Password   string
    GraphSpace string
    Graph      string
    Transport  http.RoundTripper
    Logger     Logger
}

// Client represents the HTTP client.
type Client struct {
    url        *url.URL
    username   string
    password   string
    graphspace string
    graph      string
    transport  http.RoundTripper
    logger     Logger
}

// New creates new HTTP client.
//
// http.DefaultTransport will be used if no transport is passed in the configuration.
func New(cfg Config) *Client {
    if cfg.Transport == nil {
        cfg.Transport = http.DefaultTransport
    }

    return &Client{
        url:        cfg.URL,
        username:   cfg.Username,
        password:   cfg.Password,
        graphspace: cfg.GraphSpace,
        graph:      cfg.Graph,
        transport:  cfg.Transport,
        logger:     cfg.Logger,
    }
}

func (c *Client) GetConfig() Config {
    return Config{
        URL:        c.url,
        Username:   c.username,
        Password:   c.password,
        GraphSpace: c.graphspace,
        Graph:      c.graph,
        Transport:  c.transport,
        Logger:     nil,
    }
}

// Perform executes the request and returns a response or error.
func (c *Client) Perform(req *http.Request) (*http.Response, error) {

    u := c.url
    c.setURL(u, req)
    c.setUserAgent(req)
    c.setHost(req)
    c.setContentTypeJSON(req)

    if _, ok := req.Header["Authorization"]; !ok {
        c.setBasicAuth(u, req)
    }

    var dupReqBody *bytes.Buffer
    if c.logger != nil && c.logger.RequestBodyEnabled() {
        if req.Body != nil && req.Body != http.NoBody {
            dupReqBody = bytes.NewBuffer(make([]byte, 0, int(req.ContentLength)))
            dupReqBody.ReadFrom(req.Body)
            req.Body = ioutil.NopCloser(bytes.NewBuffer(dupReqBody.Bytes()))
        }
    }
    start := time.Now().UTC()
    res, err := c.transport.RoundTrip(req)
    dur := time.Since(start)

    if c.logger == nil {
        return res, err
    }

    var dupRes http.Response
    if res != nil {
        dupRes = *res
    }
    if c.logger.RequestBodyEnabled() {
        if req.Body != nil && req.Body != http.NoBody {
            req.Body = ioutil.NopCloser(dupReqBody)
        }
    }
    if c.logger.ResponseBodyEnabled() {
        if res != nil && res.Body != nil && res.Body != http.NoBody {
            b1, b2, _ := duplicateBody(res.Body)
            dupRes.Body = b1
            res.Body = b2
        }
    }
    c.logger.LogRoundTrip(req, &dupRes, err, start, dur) // errcheck exclude

    return res, err
}

func (c *Client) setURL(u *url.URL, req *http.Request) *http.Request {
    req.URL.Scheme = u.Scheme
    req.URL.Host = u.Host

    if u.Path != "" {
        var b strings.Builder
        b.Grow(len(u.Path) + len(req.URL.Path))
        b.WriteString(u.Path)
        b.WriteString(req.URL.Path)
        req.URL.Path = b.String()
    }

    return req
}

func (c *Client) setBasicAuth(u *url.URL, req *http.Request) *http.Request {
    if u.User != nil {
        password, _ := u.User.Password()
        req.SetBasicAuth(u.User.Username(), password)
        return req
    }

    if c.username != "" && c.password != "" {
        req.SetBasicAuth(c.username, c.password)
        return req
    }

    return req
}

func (c *Client) setUserAgent(req *http.Request) *http.Request {
    req.Header.Set("User-Agent", userAgent)
    return req
}

func (c *Client) setHost(req *http.Request) *http.Request {
    req.Header.Set("Host", req.URL.Host)
    return req
}

func (c *Client) setContentTypeJSON(req *http.Request) *http.Request {
    req.Header.Set("Content-Type", "application/json;charset=UTF-8")
    return req
}

func initUserAgent() string {
    var b strings.Builder

    b.WriteString("go-hugegraph")
    b.WriteRune('/')
    b.WriteString(Version)
    b.WriteRune(' ')
    b.WriteRune('(')
    b.WriteString(runtime.GOOS)
    b.WriteRune(' ')
    b.WriteString(runtime.GOARCH)
    b.WriteString("; ")
    b.WriteString("Go ")
    if v := reGoVersion.ReplaceAllString(runtime.Version(), "$1"); v != "" {
        b.WriteString(v)
    } else {
        b.WriteString(runtime.Version())
    }
    b.WriteRune(')')

    return b.String()
}
