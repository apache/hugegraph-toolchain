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

import {getBaseUrlHistory, getModelHistory, rememberModel} from './modelHistory';
import {setUser} from './user';

const key = 'hubble.text2gql.models.alice';
beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setUser({user_name: 'alice'});
});
afterEach(() => jest.restoreAllMocks());

test('remembers only successful URL/model pairs, with normalized endpoints and recent models first', () => {
    rememberModel(' https://example.com:8443/path/v1/// ', ' model-one ');
    rememberModel('https://example.com:8443/path/v1', 'model-two');
    rememberModel('https://example.com:8443/path/v1/', 'model-one');
    expect(getModelHistory('https://example.com:8443/path/v1///')).toEqual(['model-one', 'model-two']);
    expect(JSON.parse(localStorage.getItem(key))).toEqual([
        {baseUrl: 'https://example.com:8443/path/v1', models: ['model-one', 'model-two']},
    ]);
    expect(getModelHistory('https://example.com:8443/other/v1')).toEqual([]);
});

test('bounds model and endpoint histories and moves a newly successful endpoint to the front', () => {
    for (let index = 0; index < 12; index++) {
        rememberModel(`http://localhost:${8000 + index}/v1`, 'test');
    }
    for (let index = 0; index < 7; index++) {
        rememberModel('http://localhost:8011/v1', `model-${index}`);
    }
    expect(getBaseUrlHistory()).toHaveLength(10);
    expect(getModelHistory('http://localhost:8011/v1')).toEqual([
        'model-6', 'model-5', 'model-4', 'model-3', 'model-2',
    ]);
    rememberModel('http://localhost:8005/v1', 'latest');
    expect(getBaseUrlHistory()[0]).toBe('http://localhost:8005/v1');
    expect(getBaseUrlHistory()).not.toContain('http://localhost:8000/v1');
});

test.each([
    'file:///tmp/model', 'ftp://example.com/v1', 'https://user:secret@example.com/v1',
    'https://@example.com/v1', 'https://example.com/v1?key=secret', 'https://example.com/v1?',
    'https://example.com/v1#secret', 'https://example.com/v1#', 'not a URL', 'x'.repeat(2049),
])('does not persist unsupported or credential-bearing endpoints (%s)', baseUrl => {
    rememberModel(baseUrl, 'test-model');
    expect(getBaseUrlHistory()).toEqual([]);
    expect(localStorage.getItem(key)).toBeNull();
});

test('isolates histories by current account and never stores unknown fields from restored data', () => {
    rememberModel('https://alice.example/v1', 'alice-model');
    setUser({user_name: 'bob'});
    expect(getBaseUrlHistory()).toEqual([]);
    rememberModel('https://bob.example/v1', 'bob-model');
    setUser({user_name: 'alice'});
    expect(getBaseUrlHistory()).toEqual(['https://alice.example/v1']);
    localStorage.setItem(key, JSON.stringify([{baseUrl: 'https://alice.example/v1', models: ['alice-model'],
        apiKey: 'never-rewrite-this-secret'}]));
    rememberModel('https://alice.example/v1', 'new-model');
    expect(localStorage.getItem(key)).not.toContain('secret');
    expect(JSON.parse(localStorage.getItem(key))[0]).toEqual({
        baseUrl: 'https://alice.example/v1', models: ['new-model', 'alice-model'],
    });
});

test.each(['broken JSON', '{}', 'null', 'x'.repeat(64001)])('tolerates malformed or oversized history (%#)', raw => {
    localStorage.setItem(key, raw);
    expect(getBaseUrlHistory()).toEqual([]);
    expect(() => rememberModel('https://example.com/v1', 'test')).not.toThrow();
    expect(getModelHistory('https://example.com/v1')).toEqual(['test']);
});

test('rejects invalid model values and tolerates unavailable storage', () => {
    ['', 'x'.repeat(257), null, {}].forEach(model => rememberModel('https://example.com/v1', model));
    expect(getBaseUrlHistory()).toEqual([]);
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('disabled');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('full');
    });
    expect(getBaseUrlHistory()).toEqual([]);
    expect(() => rememberModel('https://example.com/v1', 'test')).not.toThrow();
});


test('preserves successful endpoint spelling and explicit ports when returning history', () => {
    rememberModel(' https://EXAMPLE.com:443/path/v1/// ', 'upper-model');
    expect(getBaseUrlHistory()).toEqual(['https://EXAMPLE.com:443/path/v1']);
    expect(getModelHistory('https://EXAMPLE.com:443/path/v1/')).toEqual(['upper-model']);
    expect(getModelHistory('https://example.com/path/v1')).toEqual([]);
});
