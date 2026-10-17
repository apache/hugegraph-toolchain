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

// Keep transport failures separate from query diagnostics, including when a
// server wraps a Gremlin compilation error in HTTP 500.
export const queryFailure = (failure, fallback, sanitize = sanitizePublicError) => ({
    ok: false,
    message: sanitize(failure?.response?.data?.message || failure?.message, fallback),
    status: failure?.response?.data?.status || failure?.status || failure?.response?.status,
    httpStatus: failure?.response?.status,
    code: failure?.code,
});

const TRANSPORT_ERROR = new RegExp([
    'unauthori[sz]ed|forbidden|permission denied|access denied|authentication',
    'timed? ?out|timeout|network error|connection (?:refused|reset)|service unavailable|cancel(?:led|ed)',
].join('|'), 'i');
const SYNTAX_ERROR = new RegExp([
    'syntax(?:error|exception| error)|parserexception|unexpected (?:token|input)',
    'no signature of method|no matching method|missingmethodexception|missingpropertyexception',
    'unable to resolve class',
].join('|'), 'i');
const SCHEMA_ERROR = new RegExp([
    '(?:vertex ?label|edge ?label|property ?key|index ?label|label|property) [^\\n]{0,160}'
        + "(?:does not exist|doesn't exist|not found|undefined|unknown)",
    '(?:undefined|unknown|unrecognized) (?:vertex ?label|edge ?label|property ?key|label|property)',
].join('|'), 'i');

export const canRepairQuery = failure => {
    if ([failure?.status, failure?.httpStatus].some(status => (
        [401, 403, 408, 429, 502, 503, 504].includes(Number(status))
    )) || /^(?:ERR_CANCELED|ECONNABORTED|ETIMEDOUT|ERR_NETWORK|ECONNREFUSED)$/i.test(failure?.code || '')) {
        return false;
    }
    const message = failure?.message || '';
    return !TRANSPORT_ERROR.test(message) && (SYNTAX_ERROR.test(message) || SCHEMA_ERROR.test(message));
};
