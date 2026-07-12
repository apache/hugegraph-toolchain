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

import validator from 'validator';
import cronValidator from 'cron-expression-validator';

import i18n from '../i18n';

const validationMessage = (key, options) => i18n.t(`common.validation.${key}`, options);
const customMessage = (msg, key, options) => (
    typeof msg === 'string' ? msg : validationMessage(key, options)
);

// Required field
const required = msg => ({
    required: true,
    message: customMessage(msg, 'required'),
});

const max = value => ({
    max: value,
    message: validationMessage('max', {max: value}),
});

// IP validation
const isIP = () => ({
    validator(_, value) {
        if (validator.isIP(value)) {
            return Promise.resolve();
        }

        return Promise.reject(new Error(validationMessage('invalid_ip')));
    },
});

// Port validation
const isPort = () => ({
    validator(_, value) {
        if (validator.isPort(value)) {
            return Promise.resolve();
        }

        return Promise.reject(new Error(validationMessage('invalid_port')));
    },
});

// Cron validation
const isCron = msg => ({
    validator(_, value) {
        if (cronValidator.isValidCronExpression(value)) {
            return Promise.resolve();
        }
        return Promise.reject(new Error(
            typeof msg === 'string' ? msg : validationMessage('invalid_cron')
        ));
    },
});

// Name validation
const isName = () => ({
    validator(_, value) {
        let res = /^[a-z][a-z0-9_]*$/.test(value);
        if (!res) {
            return Promise.reject(validationMessage('name_rule'));
        }

        return Promise.resolve();
    },
});

// Chinese characters, letters, underscore
const isCNName = () => ({
    validator(_, value) {
        let res = /[^\u4E00-\u9FA5\uFE30-\uFFA0\_a-zA-Z]+/.test(value);
        if (res) {
            return Promise.reject(validationMessage('cn_name_rule'));
        }

        return Promise.resolve();
    },
});

// Chinese characters, letters, numbers, underscore
const isPropertyName = msg => ({
    validator(_, value) {
        let res = /[^\u4E00-\u9FA5\uFE30-\uFFA0\_a-zA-Z0-9]+/.test(value);
        if (res) {
            return Promise.reject(
                typeof msg === 'string' ? msg : validationMessage('property_name_rule')
            );
        }

        return Promise.resolve();
    },
});

// Chinese characters, letters, numbers, underscore
const isNoramlName = msg => ({
    validator(_, value) {
        let res = /^[\u4E00-\u9FA5\uFE30-\uFFA0\_a-zA-Z0-9_]{1,48}$/.test(value);
        if (!res) {
            return Promise.reject(
                typeof msg === 'string' ? msg : validationMessage('normal_name_rule')
            );
        }

        return Promise.resolve();
    },
});

// jdbc
const isJDBC = msg => ({
    validator(_, value) {
        let normalized = typeof value === 'string' ? value.trim() : '';
        let res = normalized.startsWith('jdbc:')
            && /^jdbc:[a-zA-Z0-9]+:\S+$/.test(normalized);
        if (!res) {
            return Promise.reject(
                typeof msg === 'string'
                    ? msg
                    : validationMessage('jdbc_rule')
            );
        }

        return Promise.resolve();
    },
});

// account name
const isAccountName = msg => ({
    validator(_, value) {
        let res = /^[\u4E00-\u9FA5\uFE30-\uFFA0\_a-zA-Z0-9_]{1,16}$/.test(value);
        let res1 = /^_.*/.test(value);
        let res2 = /.*_$/.test(value);

        if (!res || res1 || res2) {
            return Promise.reject(new Error(
                typeof msg === 'string' ? msg : validationMessage('account_name_rule')
            ));
        }

        return Promise.resolve();
    },
});

const isValidFavoriteName = value => typeof value === 'string' && /^[A-Za-z0-9_\u4e00-\u9fa5]{1,48}$/.test(value);

const isFavoriteName = msg => ({
    validator(_, value) {
        if (isValidFavoriteName(value)) {
            return Promise.resolve();
        }
        return Promise.reject(new Error(
            typeof msg === 'string' ? msg : validationMessage('favorite_name_rule')
        ));
    },
});

// UUID validation
const isUUID = () => ({
    validator(_, value) {
        if (!value || validator.isUUID(value)) {
            return Promise.resolve();
        }

        return Promise.reject(validationMessage('invalid_data_format'));
    },
});

// Integer validation
const isInt = () => ({
    validator(_, value) {
        if (!value || validator.isInt(value)) {
            return Promise.resolve();
        }

        return Promise.reject(validationMessage('invalid_data_format'));
    },
});

export {
    required,
    max,
    isIP,
    isPort,
    isCron,
    isName,
    isCNName,
    isPropertyName,
    isNoramlName,
    isJDBC,
    isAccountName,
    isFavoriteName,
    isValidFavoriteName,
    isUUID,
    isInt,
};
