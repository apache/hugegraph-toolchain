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

import {
    isLargeTableResult,
    LARGE_TABLE_RESULT_THRESHOLD,
    renderTableCell,
    tableRowKey,
} from './index';
import JSONbig from 'json-bigint';

it('keeps explicit graph ids and gives scalar result rows stable fallback keys', () => {
    expect(tableRowKey({id: 7}, 2)).toBe(7);
    expect(tableRowKey({_id: 'vertex-1'}, 3)).toBe('vertex-1');
    expect(tableRowKey({name: 'alice'}, 4)).toBe('result-row-4');
});

it('marks only large materialized result sets for a pagination notice', () => {
    expect(isLargeTableResult(new Array(LARGE_TABLE_RESULT_THRESHOLD - 1))).toBe(false);
    expect(isLargeTableResult(new Array(LARGE_TABLE_RESULT_THRESHOLD))).toBe(true);
    expect(isLargeTableResult(null)).toBe(false);
});

it('renders scalar cells readably and structured cells as JSON', () => {
    expect(renderTableCell('vertex-1')).toBe('vertex-1');
    expect(renderTableCell(42)).toBe('42');
    expect(renderTableCell(false)).toBe('false');
    expect(renderTableCell(9007199254740993n)).toBe('9007199254740993');
    expect(renderTableCell(null)).toBe('null');
    expect(renderTableCell({name: 'alice'})).toBe('{"name":"alice"}');
    expect(renderTableCell({id: 9007199254740993n}))
        .toBe('{"id":"9007199254740993"}');
    expect(renderTableCell(JSONbig.parse('9007199254740993')))
        .toBe('9007199254740993');
    const circular = {name: 'loop'};
    circular.self = circular;
    expect(renderTableCell(circular))
        .toBe('{"name":"loop","self":"[Circular]"}');
});
