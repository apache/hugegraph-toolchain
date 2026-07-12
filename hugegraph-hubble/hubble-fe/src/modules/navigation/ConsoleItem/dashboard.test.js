/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {normalizeDashboardUrl} from './dashboard';

test.each([
    ['127.0.0.1:8092', 'http', 'http://127.0.0.1:8092'],
    ['dashboard.example:8443', 'https', 'https://dashboard.example:8443'],
])('normalizes configured dashboard address %s', (address, protocol, expected) => {
    expect(normalizeDashboardUrl(address, protocol)).toBe(expected);
});

test.each(['', 'ftp://dashboard.example', 'dashboard.example/path',
    'user@dashboard.example', 'dashboard.example?probe=true'])(
    'rejects unsafe dashboard address %s',
    address => expect(() => normalizeDashboardUrl(address)).toThrow()
);

test.each(['ftp', 'file', 'javascript'])(
    'rejects unsafe dashboard protocol %s',
    protocol => expect(() => normalizeDashboardUrl('dashboard.example', protocol)).toThrow()
);
