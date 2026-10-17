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

import {scopedStorageKey} from './user';

const HISTORY_KEY = 'hubble.text2gql.models';
const MAX_URLS = 10;
const MAX_MODELS = 5;

const normalizeUrl = value => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 2048) {
        return '';
    }
    const input = value.trim();
    try {
        const url = new URL(input);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
            || /^https?:\/\/[^/]*@/i.test(input) || input.includes('?') || input.includes('#')) {
            return '';
        }
        const normalized = input.replace(/\/+$/, '');
        return normalized.length <= 2048 ? normalized : '';
    }
    catch {
        return '';
    }
};

const normalizeModel = value => (typeof value === 'string' && value.trim().length <= 256 ? value.trim() : '');

const readHistory = () => {
    try {
        const raw = localStorage.getItem(scopedStorageKey(HISTORY_KEY)) || '[]';
        if (raw.length > 64000) {
            return [];
        }
        const entries = JSON.parse(raw);
        if (!Array.isArray(entries)) {
            return [];
        }
        const records = [];
        entries.slice(0, MAX_URLS).forEach(entry => {
            const baseUrl = normalizeUrl(entry?.baseUrl);
            const models = Array.isArray(entry?.models)
                ? [...new Set(entry.models.slice(0, MAX_MODELS).map(normalizeModel).filter(Boolean))] : [];
            if (baseUrl && models.length && !records.some(record => record.baseUrl === baseUrl)) {
                records.push({baseUrl, models});
            }
        });
        return records;
    }
    catch {
        return [];
    }
};

export const getBaseUrlHistory = () => readHistory().map(record => record.baseUrl);

export const getModelHistory = baseUrl => {
    const normalized = normalizeUrl(baseUrl);
    return readHistory().find(record => record.baseUrl === normalized)?.models || [];
};

export const rememberModel = (baseUrl, model) => {
    const normalized = normalizeUrl(baseUrl);
    const name = normalizeModel(model);
    if (!normalized || !name) {
        return;
    }
    try {
        const records = readHistory();
        const previous = records.find(record => record.baseUrl === normalized)?.models || [];
        const models = [name, ...previous.filter(value => value !== name)].slice(0, MAX_MODELS);
        const next = [{baseUrl: normalized, models}, ...records.filter(record => record.baseUrl !== normalized)]
            .slice(0, MAX_URLS);
        localStorage.setItem(scopedStorageKey(HISTORY_KEY), JSON.stringify(next));
    }
    catch {
        // Success remains success when browser storage is disabled or full.
    }
};
