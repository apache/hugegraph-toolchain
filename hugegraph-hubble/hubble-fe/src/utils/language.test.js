/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

import {DEFAULT_LANGUAGE, getCurrentLanguage} from './language';

beforeEach(() => localStorage.clear());

test.each([
    [null, 'en-US'],
    ['unsupported', 'en-US'],
    ['en-US', 'en-US'],
    ['zh-CN', 'zh-CN'],
])('normalizes stored language %s to %s', (stored, expected) => {
    if (stored !== null) {
        localStorage.setItem('languageType', stored);
    }
    expect(getCurrentLanguage()).toBe(expected);
});

test('keeps English as the explicit product default', () => {
    expect(DEFAULT_LANGUAGE).toBe('en-US');
});
