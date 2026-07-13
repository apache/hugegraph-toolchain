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

import enPages from '../../i18n/resources/en-US/modules/pages.json';
import zhPages from '../../i18n/resources/zh-CN/modules/pages.json';
import * as rules from '../../utils/rules';
import {resolveJdbcConnectionStatus} from './connectionStatus';
import {
    BUILTIN_DATASOURCE_TEMPLATES,
    DATASOURCE_FIELD_HELP_KEYS,
    applyDatasourceTemplate,
} from './EditLayer';

const get = (data, path) => path.split('.').reduce((value, key) => value && value[key], data);
const hasChinese = value => /[\u4e00-\u9fff]/.test(value);

const flattenKeys = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) => {
    const path = `${prefix}${key}`;

    if (child && typeof child === 'object' && !Array.isArray(child)) {
        return flattenKeys(child, `${path}.`);
    }

    return [path];
});

describe('datasource i18n coverage', () => {
    it('ships editable starting points for all four supported source types', () => {
        expect(BUILTIN_DATASOURCE_TEMPLATES.local_csv).toMatchObject({
            type: 'FILE',
            format: 'CSV',
            header: 'id,name,age',
        });
        expect(BUILTIN_DATASOURCE_TEMPLATES.kafka_json).toMatchObject({
            type: 'KAFKA',
            format: 'JSON',
            topic: 'graph-events',
        });
        expect(BUILTIN_DATASOURCE_TEMPLATES.hdfs_csv).toMatchObject({
            type: 'HDFS',
            format: 'CSV',
            path: 'hdfs://127.0.0.1:8020/data/vertices.csv',
        });
        expect(BUILTIN_DATASOURCE_TEMPLATES.jdbc_mysql).toMatchObject({
            type: 'JDBC',
            vendor: 'MySQL',
            driver: 'com.mysql.cj.jdbc.Driver',
            url: 'jdbc:mysql://127.0.0.1:3306',
            batch_size: 500,
        });
        expect(new Set(Object.values(BUILTIN_DATASOURCE_TEMPLATES)
            .map(template => template.type)))
            .toEqual(new Set(['FILE', 'HDFS', 'KAFKA', 'JDBC']));
        expect(JSON.stringify(BUILTIN_DATASOURCE_TEMPLATES)).not.toContain('password');
    });

    it.each(Object.keys(BUILTIN_DATASOURCE_TEMPLATES))(
        'applies the %s template after clearing fields from the previous type',
        key => {
            const form = {
                resetFields: jest.fn(),
                setFieldsValue: jest.fn(),
            };

            expect(applyDatasourceTemplate(form, key))
                .toBe(BUILTIN_DATASOURCE_TEMPLATES[key].type);
            expect(form.resetFields).toHaveBeenCalledWith(expect.arrayContaining([
                'datasource_name', 'path', 'bootstrap-server', 'vendor', 'password',
            ]));
            expect(form.setFieldsValue)
                .toHaveBeenCalledWith(BUILTIN_DATASOURCE_TEMPLATES[key]);
        }
    );

    it('provides specific bilingual help for every visible source field', () => {
        Object.values(DATASOURCE_FIELD_HELP_KEYS).flat().forEach(field => {
            const key = `datasource.form.${field}_help`;
            const enHelp = get(enPages, key);
            const zhHelp = get(zhPages, key);

            expect(typeof enHelp).toBe('string');
            expect(enHelp.length).toBeGreaterThan(10);
            expect(hasChinese(enHelp)).toBe(false);
            expect(typeof zhHelp).toBe('string');
            expect(hasChinese(zhHelp)).toBe(true);
        });
    });

    it('keeps datasource keys symmetric between English and Chinese resources', () => {
        const enKeys = flattenKeys(enPages.datasource);
        const zhKeys = flattenKeys(zhPages.datasource);

        expect(enKeys.filter(key => !zhKeys.includes(key))).toEqual([]);
        expect(zhKeys.filter(key => !enKeys.includes(key))).toEqual([]);
    });

    it('provides English datasource page labels without Chinese text', () => {
        const requiredKeys = [
            'datasource.title',
            'datasource.create',
            'datasource.delete',
            'datasource.search_placeholder',
            'datasource.delete_title',
            'datasource.selected_count',
            'datasource.col.name',
            'datasource.col.type',
            'datasource.col.creator',
            'datasource.col.create_time',
            'datasource.col.operation',
            'datasource.form.title_create',
            'datasource.form.basic_info',
            'datasource.form.config_info',
            'datasource.form.auth_info',
            'datasource.form.name',
            'datasource.form.type',
            'datasource.form.local_upload',
            'datasource.form.upload',
            'datasource.form.hdfs_path',
            'datasource.form.core_site',
            'datasource.form.hdfs_site',
            'datasource.form.header',
            'datasource.form.hdfs_docs',
            'datasource.form.test_connection',
            'datasource.form.connection_success',
            'datasource.form.connection_failed',
            'datasource.form.connection_unsupported',
        ];

        requiredKeys.forEach(key => {
            const value = get(enPages, key);

            expect(typeof value).toBe('string');
            expect(value.length).toBeGreaterThan(0);
            expect(hasChinese(value)).toBe(false);
        });
    });

    it('keeps JDBC check backend messages while localizing known statuses', () => {
        const t = key => `translated:${key}`;

        expect(resolveJdbcConnectionStatus({status: 200, data: {result: 'success'}}, t))
            .toEqual({
                type: 'success',
                message: 'translated:datasource.form.connection_success',
            });
        expect(resolveJdbcConnectionStatus({status: 200, data: {result: 'failed'}}, t))
            .toEqual({
                type: 'failed',
                message: 'translated:datasource.form.connection_failed',
            });
        expect(resolveJdbcConnectionStatus({status: 200, data: {result: 'driver timeout'}}, t))
            .toEqual({
                type: 'failed',
                message: 'driver timeout',
            });
        expect(resolveJdbcConnectionStatus({status: 500, message: 'backend refused'}, t))
            .toEqual({
                type: 'failed',
                message: 'backend refused',
            });
        expect(resolveJdbcConnectionStatus({
            status: 400,
            message: 'JDBC datasource check is not supported locally',
        }, t))
            .toEqual({
                type: 'failed',
                message: 'translated:datasource.form.connection_unsupported',
            });
        expect(resolveJdbcConnectionStatus({status: 500}, t))
            .toEqual({
                type: 'failed',
                message: 'translated:datasource.form.connection_unsupported',
            });
    });

    it('passes localized validation messages into shared datasource rules', async () => {
        const jdbcRule = rules.isJDBC(enPages.datasource.form.url_rule);
        const propertyNameRule = rules.isPropertyName(enPages.datasource.form.name_rule);

        await expect(jdbcRule.validator(null, 'http://127.0.0.1:3306/db_name'))
            .rejects.toBe(enPages.datasource.form.url_rule);
        await Promise.all([
            'jdbc:mysql://127.0.0.1:3306/db_name',
            'jdbc:postgresql://127.0.0.1:5432/db_name',
            'jdbc:hive2://127.0.0.1:10000/default',
            'jdbc:oracle:thin:@127.0.0.1:1521:orcl',
            'jdbc:sqlserver://127.0.0.1:1433;databaseName=db_name',
        ].map(url => expect(jdbcRule.validator(null, url)).resolves.toBeUndefined()));
        await expect(propertyNameRule.validator(null, 'bad-name!'))
            .rejects.toBe(enPages.datasource.form.name_rule);
    });
});
