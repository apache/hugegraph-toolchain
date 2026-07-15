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

const MAX_PUBLIC_ERROR_LENGTH = 2048;
const REDACTED = '[REDACTED]';
const REDACTED_PATH = '[REDACTED PATH]';
const SECRET_KEYS = [
    'password', 'passwd', 'token', 'access[_-]?token', 'refresh[_-]?token',
    'secret', 'client[_-]?secret', 'service[_-]?secret', 'private[_-]?key',
].join('|');
const SECRET_VALUE_PATTERN = new RegExp(
    `\\b(${SECRET_KEYS})\\b(\\s*[:=]\\s*)(?:"[^"]*"|'[^']*'|[^\\s,;&]+)`,
    'gi'
);
const QUOTED_SECRET_VALUE_PATTERN = new RegExp(
    `(["'])(${SECRET_KEYS})\\1(\\s*:\\s*)`
    + '("(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')',
    'gi'
);

const sanitizePublicError = (value, fallback = '') => {
    if (typeof value !== 'string' || !value.trim()) {
        return fallback;
    }

    const normalized = value.replace(
        /(?:\\+r)?\\+n(?=\s*(?:set-cookie|cookie|authorization)\s*:)/gi,
        '\n'
    );
    const sanitized = normalized
        .replace(
            /-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/gi,
            `${REDACTED} PRIVATE KEY`
        )
        .replace(
            /\b(set-cookie|cookie|authorization)\s*:\s*.*?(?=\r?\n|\\[rn]|$)/gi,
            `$1: ${REDACTED}`
        )
        .replace(/\b(bearer|basic)\s+[a-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`)
        .replace(QUOTED_SECRET_VALUE_PATTERN,
            (match, keyQuote, key, separator, value) => {
                const valueQuote = value.charAt(0);
                return `${keyQuote}${key}${keyQuote}${separator}`
                            + `${valueQuote}${REDACTED}${valueQuote}`;
            })
        .replace(SECRET_VALUE_PATTERN, `$1$2${REDACTED}`)
        .replace(/\b[a-z]:\\(?:[^\s,;:"'<>|]+\\)*[^\s,;:"'<>|]*/gi, REDACTED_PATH)
        .replace(
            /\/(?:Users|home|root|private|var|etc|opt|tmp|srv|mnt|Volumes|usr\/local)(?:\/[^\s,;:"'<>]*)*/g,
            REDACTED_PATH
        );

    return sanitized.slice(0, MAX_PUBLIC_ERROR_LENGTH);
};

export {sanitizePublicError};
