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

const sanitizeSchemaSource = schema => {
    let result = '';
    let quote = '';
    let escaped = false;
    let lineComment = false;
    let blockComment = false;
    for (let index = 0; index < schema.length; index += 1) {
        const value = schema[index];
        const next = schema[index + 1];
        if (lineComment) {
            if (value === '\n' || value === '\r') {
                lineComment = false;
                result += value;
            }
            continue;
        }
        if (blockComment) {
            if (value === '*' && next === '/') {
                blockComment = false;
                index += 1;
            }
            else if (value === '\n' || value === '\r') {
                result += value;
            }
            continue;
        }
        if (quote) {
            result += value;
            if (escaped) {
                escaped = false;
            }
            else if (value === '\\') {
                escaped = true;
            }
            else if (value === quote) {
                quote = '';
            }
            continue;
        }
        if (value === '/' && next === '/') {
            lineComment = true;
            index += 1;
            continue;
        }
        if (value === '/' && next === '*') {
            blockComment = true;
            index += 1;
            continue;
        }
        if (value === '\'' || value === '"') {
            quote = value;
        }
        result += value;
        if (value === ';') {
            result += '\n';
        }
    }
    return result;
};

const toGraphSchemaGroovy = schema => {
    const statements = [];
    const rawSchema = String(schema || '').trim();
    let decodedSchema = rawSchema;
    if (rawSchema.startsWith('"') && rawSchema.endsWith('"')) {
        try {
            const parsed = JSON.parse(rawSchema);
            if (typeof parsed === 'string') {
                decodedSchema = parsed;
            }
        }
        catch (error) {
            // The Server will return a precise validation error for malformed content.
        }
    }
    sanitizeSchemaSource(decodedSchema).split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) {
            return;
        }
        if (/^(schema\.|graph\.schema\(\)\.)/.test(trimmed) || !statements.length) {
            statements.push(trimmed);
            return;
        }
        statements[statements.length - 1] += trimmed;
    });
    return statements.map(statement => statement.replace(
        /^schema\./,
        'graph.schema().'
    )).join('\n');
};

export {toGraphSchemaGroovy};
