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

import {sanitizePublicError} from './publicError';

describe('public error sanitization', () => {
    test.each([
        'Authorization: Bearer auth-canary',
        'Cookie: session=cookie-canary',
        'Cookie: a=first-canary; JSESSIONID=second-canary',
        'Set-Cookie: sid=first-canary; Expires=Wed, 21 Oct 2026 07:28:00 GMT; '
        + 'refresh=second-canary',
        'set-cookie: escaped=first-canary\\nCookie: next=second-canary',
        'password=password-canary',
        'token=token-canary',
        'service_secret=service-canary',
        'private_key=key-canary',
        '-----BEGIN PRIVATE KEY-----\nprivate-canary\n-----END PRIVATE KEY-----',
    ])('redacts secret-bearing diagnostic: %s', diagnostic => {
        expect(sanitizePublicError(diagnostic)).not.toContain('canary');
    });

    test.each([
        '/Users/alice/.ssh/id_ed25519',
        '/opt/hugegraph/conf/rest-server.properties',
        'C:\\secrets\\private.key',
    ])('redacts machine absolute path: %s', diagnostic => {
        expect(sanitizePublicError(`failed at ${diagnostic}`))
            .not.toContain(diagnostic);
    });

    test('preserves useful non-secret diagnostics', () => {
        expect(sanitizePublicError('line 2: unexpected token near g.V()'))
            .toBe('line 2: unexpected token near g.V()');
    });
});
