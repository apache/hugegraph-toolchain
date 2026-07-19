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

import {BUILTIN_SCHEMA_TEMPLATES, schemaTemplateBusinessError} from './EditLayer';

jest.mock('../../components/CodeEditor', () => () => null);

const t = (key, values) => ({key, values});

test('maps the Server duplicate-name response to an actionable local message', () => {
    expect(schemaTemplateBusinessError({
        message: 'Cannot create schema template since it has been created',
    }, t, 'create', 'existing')).toEqual({
        key: 'schema_template.create_duplicate',
        values: {name: 'existing'},
    });
});

test('uses an input-oriented fallback for other business failures', () => {
    expect(schemaTemplateBusinessError({message: ''}, t, 'create', 'new')).toEqual({
        key: 'schema_template.create_failed',
        values: undefined,
    });
    expect(schemaTemplateBusinessError({}, t, 'update', 'existing')).toEqual({
        key: 'schema_template.update_failed',
        values: undefined,
    });
});

test.each(Object.entries(BUILTIN_SCHEMA_TEMPLATES))(
    '%s is a small idempotent complete graph starting point',
    (name, script) => {
        expect(script.split('\n').length).toBeLessThanOrEqual(12);
        expect(script).toContain('propertyKey(');
        expect(script).toContain('vertexLabel(');
        expect(script).toContain('edgeLabel(');
        expect(script).toContain('primaryKeys(');
        expect(script.match(/ifNotExist\(\)/g).length).toBeGreaterThanOrEqual(4);
    }
);

test('people_network avoids a redundant secondary index on its full primary key', () => {
    expect(BUILTIN_SCHEMA_TEMPLATES.people_network).not.toContain('indexLabel(');
});

test('product_catalog keeps its non-primary-key range index', () => {
    expect(BUILTIN_SCHEMA_TEMPLATES.product_catalog).toContain('indexLabel(');
});
