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
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestResponseStatusAndIsError(t *testing.T) {
	tests := []struct {
		code    int
		status  string
		isError bool
	}{
		{200, "200 OK", false},
		{201, "201 Created", false},
		{299, "299 ", false},
		{300, "300 Multiple Choices", true},
		{404, "404 Not Found", true},
		{500, "500 Internal Server Error", true},
	}
	for _, tt := range tests {
		r := &Response{StatusCode: tt.code}
		if r.Status() != tt.status {
			t.Errorf("Status() = %q, want %q", r.Status(), tt.status)
		}
		if r.IsError() != tt.isError {
			t.Errorf("IsError() for %d = %v", tt.code, r.IsError())
		}
	}
	var nilResponse *Response
	if nilResponse.Status() != "" {
		t.Errorf("nil Status() = %q", nilResponse.Status())
	}
}

func TestResponseStringKeepsBody(t *testing.T) {
	r := &Response{
		StatusCode: http.StatusNotFound,
		Body:       io.NopCloser(strings.NewReader(`{"message":"missing"}`)),
	}

	if s := r.String(); s != `[404 Not Found] {"message":"missing"}` {
		t.Errorf("String() = %q", s)
	}
	body, _ := io.ReadAll(r.Body)
	if string(body) != `{"message":"missing"}` {
		t.Errorf("body after String() = %q", body)
	}
}

func TestResponseStringWithoutBody(t *testing.T) {
	if s := (&Response{StatusCode: http.StatusNoContent}).String(); s != "[204 No Content] " {
		t.Errorf("String() = %q", s)
	}
	var r *Response
	if s := r.String(); s != "[0 <nil>]" {
		t.Errorf("nil String() = %q", s)
	}
}

func TestResponseStringWithBrokenBody(t *testing.T) {
	r := &Response{StatusCode: http.StatusOK, Body: io.NopCloser(brokenReader{})}

	if s := r.String(); s != "<error reading response body: broken>" {
		t.Errorf("String() = %q", s)
	}
}

type brokenReader struct{}

func (brokenReader) Read([]byte) (int, error) {
	return 0, errors.New("broken")
}
