/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the
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

import {clearUser, getUser, scopedStorageKey, setUser} from './user';

describe('user storage helpers', () => {
    beforeEach(() => {
        clearUser();
    });

    test('returns an empty user object when no session user is stored', () => {
        expect(getUser()).toEqual({});
    });

    test('scopes persistent browser state to the authenticated identity', () => {
        setUser({id: 'opaque-id', user_name: 'alice@example.com'});

        expect(scopedStorageKey('hubble.query'))
            .toBe('hubble.query.alice%40example.com');
    });

    test('keeps pre-login state separate from signed-in keys', () => {
        expect(scopedStorageKey('hubble.query')).toBe('hubble.query');
    });
});
