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

package hugegraph

import (
    "strings"
    "testing"
)

func TestNewDefaultCommonClient(t *testing.T) {
    tests := []struct {
        name    string
        wantErr bool
    }{
        {
            name:    "test",
            wantErr: false,
        },
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            _, err := NewDefaultCommonClient()
            if (err != nil) != tt.wantErr {
                t.Errorf("NewDefaultCommonClient() error = %v, wantErr %v", err, tt.wantErr)
                return
            }
        })
    }
}

func TestNewCommonClientValidatesConfig(t *testing.T) {
    tests := []struct {
        name    string
        cfg     Config
        wantErr string
    }{
        {"short host", Config{Host: "a", Port: 8080}, "host length error"},
        // Pins current behavior: only IP addresses are accepted as host
        {"host name", Config{Host: "localhost", Port: 8080}, "host is format error"},
        {"invalid ip", Config{Host: "256.0.0.1", Port: 8080}, "host is format error"},
        {"zero port", Config{Host: "127.0.0.1", Port: 0}, "port is error"},
        {"large port", Config{Host: "127.0.0.1", Port: 65536}, "port is error"},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            client, err := NewCommonClient(tt.cfg)
            if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
                t.Errorf("NewCommonClient() = %v, %v, want error %q", client, err, tt.wantErr)
            }
        })
    }

    client, err := NewCommonClient(Config{Host: "127.0.0.1", Port: 65535, GraphSpace: "DEFAULT",
        Graph: "hugegraph", Username: "admin", Password: "pa"})
    if err != nil {
        t.Fatalf("NewCommonClient() error = %v", err)
    }
    cfg := client.Transport.GetConfig()
    if cfg.URL.Host != "127.0.0.1:65535" || cfg.GraphSpace != "DEFAULT" || cfg.Graph != "hugegraph" ||
        cfg.Username != "admin" || cfg.Password != "pa" {
        t.Errorf("transport config = %+v", cfg)
    }
}
