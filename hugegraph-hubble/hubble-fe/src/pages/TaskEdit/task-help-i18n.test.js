/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import enPages from '../../i18n/resources/en-US/modules/pages.json';
import zhPages from '../../i18n/resources/zh-CN/modules/pages.json';

const HELP_KEYS = [
    'sync_type_help',
    'vertex_type_help',
    'edge_type_help',
    'id_column_help',
    'edge_id_help',
    'property_mapping_help',
    'value_mapping_help',
];

const EXAMPLE_KEYS = [
    'mapping_example_title',
    'mapping_example_vertex_source',
    'mapping_example_vertex_target',
    'mapping_example_edge_source',
    'mapping_example_edge_target',
];

const CONTROL_KEYS = [
    'select_vertex_label',
    'select_edge_label',
    'select_id_field',
    'select_source_field',
    'select_schema_property',
    'original_value_placeholder',
    'replacement_value_placeholder',
    'delete_field',
    'incomplete_property_mapping',
    'incomplete_value_mapping',
];

const hasChinese = value => /[\u4e00-\u9fff]/.test(value);

it('provides specific bilingual help for every task mapping and schedule field', () => {
    HELP_KEYS.forEach(key => {
        const en = enPages.task.edit[key];
        const zh = zhPages.task.edit[key];

        expect(typeof en).toBe('string');
        expect(en.length).toBeGreaterThan(12);
        expect(hasChinese(en)).toBe(false);
        expect(typeof zh).toBe('string');
        expect(hasChinese(zh)).toBe(true);
    });
});

it('documents both endpoint and property/value mappings with concrete bilingual data', () => {
    EXAMPLE_KEYS.forEach(key => {
        const en = enPages.task.edit[key];
        const zh = zhPages.task.edit[key];

        expect(typeof en).toBe('string');
        expect(typeof zh).toBe('string');
        expect(en.length).toBeGreaterThan(12);
        expect(hasChinese(en)).toBe(false);
        expect(hasChinese(zh)).toBe(true);
    });

    expect(enPages.task.edit.mapping_example_vertex_target)
        .toMatch(/label.*ID.*property.*value/i);
    expect(enPages.task.edit.mapping_example_edge_target)
        .toMatch(/label.*source ID.*target ID.*property/i);
    expect(zhPages.task.edit.mapping_example_vertex_target)
        .toMatch(/label.*ID.*属性.*值/);
    expect(zhPages.task.edit.mapping_example_edge_target)
        .toMatch(/label.*起点 ID.*终点 ID.*属性/);
});

it('labels each side of ID, property, and value mappings without ambiguous wording', () => {
    CONTROL_KEYS.forEach(key => {
        const en = enPages.task.edit[key];
        const zh = zhPages.task.edit[key];

        expect(typeof en).toBe('string');
        expect(typeof zh).toBe('string');
        expect(en.length).toBeGreaterThan(5);
        expect(hasChinese(en)).toBe(false);
        expect(hasChinese(zh)).toBe(true);
    });

    expect(enPages.task.edit.select_source_field).toMatch(/source/i);
    expect(enPages.task.edit.select_schema_property).toMatch(/Schema property/i);
    expect(zhPages.task.edit.select_source_field).toMatch(/源字段/);
    expect(zhPages.task.edit.select_schema_property).toMatch(/Schema 属性/);
});
