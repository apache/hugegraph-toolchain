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

package api

import (
    "net/http"
    "strconv"
    "time"

    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/hgtransport"
    "github.com/apache/hugegraph-toolchain/hugegraph-client-go/internal/version"
)

// VERSION returns the package version as a string.
const VERSION = version.Client

// Transport defines the interface for an API client.
type Transport interface {
    Perform(*http.Request) (*http.Response, error)
    GetConfig() hgtransport.Config
}

// formatDuration converts duration to a string in the format
// accepted by Hugegraph.
func formatDuration(d time.Duration) string {
    if d < time.Millisecond {
        return strconv.FormatInt(int64(d), 10) + "nanos"
    }
    return strconv.FormatInt(int64(d)/int64(time.Millisecond), 10) + "ms"
}
