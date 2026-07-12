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
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See
 * the License for the specific language governing permissions and limitations
 * under the License.
 */

jest.mock('../i18n', () => ({
    __esModule: true,
    default: (() => {
        let language = 'zh-CN';
        const translations = {
            'en-US': {
                'common.validation.required': 'This field is required',
                'common.validation.max': 'Maximum length is {{max}} characters',
                'common.validation.invalid_ip': 'Invalid IP address',
                'common.validation.invalid_port': 'Invalid port',
                'common.validation.invalid_cron': 'Invalid Quartz expression',
                'common.validation.name_rule':
                    'Start with a letter, and use lowercase letters, numbers, or underscores only',
                'common.validation.cn_name_rule': 'Use Chinese characters, letters, or underscores only',
                'common.validation.property_name_rule':
                    'Use Chinese characters, letters, numbers, or underscores only',
                'common.validation.normal_name_rule':
                    'Use Chinese characters, letters, numbers, or underscores only, up to 20 characters',
                'common.validation.jdbc_rule':
                    'Enter a valid JDBC URL, for example: jdbc:mysql://127.0.0.1:3306/db_name',
                'common.validation.account_name_rule':
                    'Account name must be within 16 characters and cannot start or end with an underscore',
                'common.validation.favorite_name_rule':
                    'Use Chinese characters, letters, numbers, or underscores only, up to 48 characters',
                'common.validation.invalid_data_format': 'Invalid data format',
            },
            'zh-CN': {
                'common.validation.required': '必填项',
                'common.validation.max': '最大长度为{{max}}个字符!',
                'common.validation.invalid_ip': '不是合法的IP',
                'common.validation.invalid_port': '不是合法的端口',
                'common.validation.invalid_cron': '不是合法的quartz格式',
                'common.validation.name_rule': '以字母开头,只能包含小写字母、数字、_',
                'common.validation.cn_name_rule': '只能包含中文、字母、_',
                'common.validation.property_name_rule': '只能包含中文、字母、数字、_',
                'common.validation.normal_name_rule': '只能包含中文、字母、数字、_, 不能超过20个字符',
                'common.validation.jdbc_rule':
                    '请输入正确的jdbc url, 例如：jdbc:mysql://127.0.0.1:3306/db_name',
                'common.validation.account_name_rule': '账号名不超过16个字符，且不能以下划线开始和结尾',
                'common.validation.favorite_name_rule': '只能包含中文、字母、数字、_, 不能超过48个字符',
                'common.validation.invalid_data_format': '非法的数据格式',
            },
        };

        return {
            t(key, options = {}) {
                let value = translations[language][key] || key;
                Object.entries(options).forEach(([optionKey, optionValue]) => {
                    value = value.replace(`{{${optionKey}}}`, optionValue);
                });
                return value;
            },
            changeLanguage(nextLanguage) {
                language = nextLanguage;
                return Promise.resolve();
            },
        };
    })(),
}));

const i18n = require('../i18n').default;
const rules = require('./rules');

const validate = async rule => {
    try {
        await rule.validator(null, 'bad value');
    }
    catch (error) {
        return error instanceof Error ? error.message : error;
    }
    throw new Error('Expected rule validation to reject');
};

describe('rules i18n defaults', () => {
    afterEach(async () => {
        await i18n.changeLanguage('zh-CN');
    });

    it('uses English messages for default validation rules', async () => {
        await i18n.changeLanguage('en-US');

        expect(i18n.t('common.validation.required')).toBe('This field is required');
        expect(rules.required().message).toBe('This field is required');
        expect(rules.max(6).message).toBe('Maximum length is 6 characters');

        const expectations = [
            [rules.isIP(), 'Invalid IP address'],
            [rules.isPort(), 'Invalid port'],
            [rules.isCron(), 'Invalid Quartz expression'],
            [
                rules.isName(),
                'Start with a letter, and use lowercase letters, numbers, or underscores only',
            ],
            [rules.isCNName(), 'Use Chinese characters, letters, or underscores only'],
            [
                rules.isPropertyName(),
                'Use Chinese characters, letters, numbers, or underscores only',
            ],
            [
                rules.isNoramlName(),
                'Use Chinese characters, letters, numbers, or underscores only, up to 20 characters',
            ],
            [
                rules.isJDBC(),
                'Enter a valid JDBC URL, for example: jdbc:mysql://127.0.0.1:3306/db_name',
            ],
            [
                rules.isAccountName(),
                'Account name must be within 16 characters and cannot start or end with an underscore',
            ],
            [rules.isUUID(), 'Invalid data format'],
            [rules.isInt(), 'Invalid data format'],
        ];

        for (const [rule, message] of expectations) {
            expect(await validate(rule)).toBe(message);
        }
    });

    it('keeps caller-provided validation messages', async () => {
        await i18n.changeLanguage('en-US');

        expect(rules.required('custom required').message).toBe('custom required');
        expect(await validate(rules.isJDBC('custom jdbc'))).toBe('custom jdbc');
        expect(await validate(rules.isAccountName('custom account'))).toBe('custom account');
    });

    it('rejects invalid account names with an Error object', async () => {
        await expect(rules.isAccountName().validator(null, 'name_too_long_123'))
            .rejects.toBeInstanceOf(Error);
    });

    it('accepts only backend-compatible favorite names', async () => {
        await i18n.changeLanguage('en-US');
        await expect(rules.isFavoriteName().validator(null, 'query_2026'))
            .resolves.toBeUndefined();
        await expect(rules.isFavoriteName().validator(null, '我的查询_123'))
            .resolves.toBeUndefined();
        await expect(rules.isFavoriteName().validator(null, 'query-2026'))
            .rejects.toThrow('Use Chinese characters, letters, numbers, or underscores only, up to 48 characters');
        await expect(rules.isFavoriteName().validator(null, undefined))
            .rejects.toThrow('Use Chinese characters, letters, numbers, or underscores only, up to 48 characters');
        await expect(rules.isFavoriteName().validator(null, null))
            .rejects.toThrow('Use Chinese characters, letters, numbers, or underscores only, up to 48 characters');
    });

    it('uses Chinese messages when the active language is Chinese', async () => {
        await i18n.changeLanguage('zh-CN');

        expect(rules.required().message).toBe('必填项');
        expect(rules.max(6).message).toBe('最大长度为6个字符!');

        const expectations = [
            [rules.isIP(), '不是合法的IP'],
            [rules.isPort(), '不是合法的端口'],
            [rules.isCron(), '不是合法的quartz格式'],
            [rules.isName(), '以字母开头,只能包含小写字母、数字、_'],
            [rules.isCNName(), '只能包含中文、字母、_'],
            [rules.isPropertyName(), '只能包含中文、字母、数字、_'],
            [rules.isNoramlName(), '只能包含中文、字母、数字、_, 不能超过20个字符'],
            [rules.isJDBC(), '请输入正确的jdbc url, 例如：jdbc:mysql://127.0.0.1:3306/db_name'],
            [rules.isAccountName(), '账号名不超过16个字符，且不能以下划线开始和结尾'],
            [rules.isFavoriteName(), '只能包含中文、字母、数字、_, 不能超过48个字符'],
            [rules.isUUID(), '非法的数据格式'],
            [rules.isInt(), '非法的数据格式'],
        ];

        for (const [rule, message] of expectations) {
            expect(await validate(rule)).toBe(message);
        }
    });
});
