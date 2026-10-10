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

import {byteConvert, timeConvert} from './format';

// Graph storage is reported in KB, so the smallest unit is KB
test.each([
    [0, '0 KB'],
    [512, '512 KB'],
    [1023, '1023 KB'],
    [1024, '1 MB'],
    [1536, '1.5 MB'],
    [1234567, '1.18 GB'],
    [3 * 1024 * 1024 * 1024, '3 TB'],
])('converts storage %p to %p', (value, expected) => {
    expect(byteConvert(value)).toBe(expected);
});

test.each([NaN, 'abc', undefined])('returns an empty storage text for %p', value => {
    expect(byteConvert(value)).toBe('');
});

test.each([
    [0, '1s'],
    [-5, '1s'],
    [59, '59s'],
    [60, '1.0min'],
    // Pins current rounding: just under an hour is shown in minutes
    [3599, '60.0min'],
    [3600, '1.0h'],
    [5400, '1.5h'],
])('converts %p seconds to %p', (value, expected) => {
    expect(timeConvert(value)).toBe(expected);
});

test.each([NaN, 'abc', undefined])('returns an empty duration text for %p', value => {
    expect(timeConvert(value)).toBe('');
});
