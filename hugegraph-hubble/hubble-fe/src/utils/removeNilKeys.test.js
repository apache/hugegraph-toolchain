/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

import removeNilKeys from './removeNilKeys';

test('removes empty values recursively', () => {
    expect(removeNilKeys({
        source: '1:marko',
        label: '',
        max_depth: null,
        limit: undefined,
        steps: [{label: '', properties: {}}, {label: 'knows', properties: {weight: ''}}],
        vertices: {ids: [], label: 'person'},
    })).toEqual({
        source: '1:marko',
        steps: [{label: 'knows'}],
        vertices: {label: 'person'},
    });
});

test('keeps falsy values which are provided', () => {
    expect(removeNilKeys({depth: 0, with_path: false, ratio: NaN})).toEqual({
        depth: 0,
        with_path: false,
        ratio: NaN,
    });
});

test.each([
    ['`10`', 10],
    ['`1.5`', 1.5],
    ['`abc`', NaN],
    ['10', '10'],
    ['', null],
])('sanitizes string %p to %p', (value, expected) => {
    expect(removeNilKeys(value)).toEqual(expected);
});

test('converts back-quoted numbers inside collections', () => {
    expect(removeNilKeys({capacity: '`1000`', ids: ['`1`', '', 'a']})).toEqual({
        capacity: 1000,
        ids: [1, 'a'],
    });
});

test.each([null, undefined, 5, true])('returns non-collection value %p as it is', value => {
    expect(removeNilKeys(value)).toBe(value);
});
