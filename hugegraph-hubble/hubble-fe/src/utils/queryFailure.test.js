/*
 *
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

import {canRepairQuery, queryFailure} from './queryFailure';

test.each([
    {status: 460, message: '非法的 Gremlin 语句，详细信息: No signature of method: GraphTraversal.limit()'},
    {status: 500, message: 'SyntaxException: Invalid input near RETURN'},
    {status: 400, message: "Vertex label 'missing' does not exist"},
    {status: 400, message: 'Undefined property key age'},
])('recognizes a concrete syntax or schema diagnostic (%j)', failure => {
    expect(canRepairQuery(failure)).toBe(true);
});

test.each([
    {status: 403, message: 'Syntax error'},
    {status: 500, httpStatus: 503, message: 'SyntaxException'},
    {status: 408, message: 'Syntax error'},
    {status: 429, message: 'Syntax error'},
    {status: 502, message: 'Syntax error'},
    {status: 504, message: 'Syntax error'},
    {code: 'ERR_CANCELED', message: 'Syntax error'},
    {code: 'ERR_NETWORK', message: 'Syntax error'},
    {message: 'Syntax error: permission denied'},
    {message: 'No matching method: timeout while connecting'},
    {status: 500, message: 'Internal server error'},
    {message: 'Read-only query rejected'},
    {message: 'Unknown error'},
])('does not repair transport, authorization or unknown errors (%j)', failure => {
    expect(canRepairQuery(failure)).toBe(false);
});

test('preserves business and HTTP status while returning only sanitized diagnostics', () => {
    const failure = queryFailure({response: {status: 400, data: {
        status: 460, message: 'Syntax error Authorization: Bearer secret',
    }}}, 'fallback');
    expect(failure.status).toBe(460);
    expect(failure.httpStatus).toBe(400);
    expect(failure.message).not.toContain('secret');
    expect(failure.ok).toBe(false);
});
