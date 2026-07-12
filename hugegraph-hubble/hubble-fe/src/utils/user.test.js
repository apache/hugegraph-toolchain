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

import {canAccessAccount, clearUser, getUser, isAdmin} from './user';

describe('user storage helpers', () => {
    beforeEach(() => {
        clearUser();
    });

    test('returns an empty user object when no session user is stored', () => {
        expect(getUser()).toEqual({});
    });

    test('treats missing session user as a non-admin user', () => {
        expect(isAdmin()).toBe(false);
    });
});

describe('account access', () => {
    test.each([
        [false, {is_superadmin: true}, false],
        [true, {is_superadmin: true}, true],
        [true, {is_superadmin: false, adminSpaces: [{name: 'SPACE'}]}, true],
        [true, {is_superadmin: false, adminSpaces: []}, false],
        [true, {
            is_superadmin: false,
            resSpaces: [{name: 'SPACE'}],
            adminSpaces: [],
        }, false],
        [true, {}, false],
    ])('evaluates PD mode and user authorization together', (pdEnabled, value, expected) => {
        expect(canAccessAccount(pdEnabled, value)).toBe(expected);
    });
});
