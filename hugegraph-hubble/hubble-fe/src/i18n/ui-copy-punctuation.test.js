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

import zhERView from './resources/zh-CN/components/ERView.json';
import zhBoard from './resources/zh-CN/components/board.json';
import zhCommon from './resources/zh-CN/components/common.json';
import zhAnalysis from './resources/zh-CN/modules/analysis.json';
import zhHome from './resources/zh-CN/modules/home.json';
import zhManage from './resources/zh-CN/modules/manage.json';
import zhModules from './resources/zh-CN/modules/modules.json';
import zhPages from './resources/zh-CN/modules/pages.json';
import enERView from './resources/en-US/components/ERView.json';
import enBoard from './resources/en-US/components/board.json';
import enCommon from './resources/en-US/components/common.json';
import enAnalysis from './resources/en-US/modules/analysis.json';
import enHome from './resources/en-US/modules/home.json';
import enManage from './resources/en-US/modules/manage.json';
import enModules from './resources/en-US/modules/modules.json';
import enPages from './resources/en-US/modules/pages.json';

const UI_COPY_KEY = /(?:title|description|desc|help|hint|tooltip|subtitle|intro|guide|privacy|content)$/;
const TERMINAL_PERIOD = /[。.]$/;

const RESOURCES = {
    'zh-CN/components/ERView': zhERView,
    'zh-CN/components/board': zhBoard,
    'zh-CN/components/common': zhCommon,
    'zh-CN/modules/analysis': zhAnalysis,
    'zh-CN/modules/home': zhHome,
    'zh-CN/modules/manage': zhManage,
    'zh-CN/modules/modules': zhModules,
    'zh-CN/modules/pages': zhPages,
    'en-US/components/ERView': enERView,
    'en-US/components/board': enBoard,
    'en-US/components/common': enCommon,
    'en-US/modules/analysis': enAnalysis,
    'en-US/modules/home': enHome,
    'en-US/modules/manage': enManage,
    'en-US/modules/modules': enModules,
    'en-US/modules/pages': enPages,
};

// These are multi-sentence import safety boundaries. Their final punctuation
// deliberately closes prose that warns about data retention and schema conflicts.
const TERMINAL_PERIOD_ALLOWLIST = new Set([
    'zh-CN/modules/pages.graph.sample.hlm_description',
    'zh-CN/modules/pages.graph.sample.loader_description',
    'zh-CN/modules/pages.graph.sample.rank_description',
    'en-US/modules/pages.graph.sample.hlm_description',
    'en-US/modules/pages.graph.sample.loader_description',
    'en-US/modules/pages.graph.sample.rank_description',
]);

// Exact actionable error and empty-result status paths keep sentence punctuation.
// Loading ellipses are classified separately by content, not by a broad key match.
const ANALYSIS_STATUS_ALLOWLIST = new Set([
    'zh-CN/modules/analysis.analysis.query_result.run_failed_action',
    'zh-CN/modules/analysis.analysis.query_result.retry_action',
    'zh-CN/modules/analysis.analysis.logs.execution_load_failed',
    'zh-CN/modules/analysis.analysis.logs.favorite_load_failed',
    'zh-CN/modules/analysis.analysis.logs.failure_reason.GREMLIN_EXECUTION_FAILED',
    'zh-CN/modules/analysis.analysis.async_task.result_load_failed',
    'zh-CN/modules/analysis.analysis.async_task.no_result',
    'en-US/modules/analysis.analysis.query_result.run_failed_action',
    'en-US/modules/analysis.analysis.query_result.retry_action',
    'en-US/modules/analysis.analysis.query_result.copy_error_failed',
    'en-US/modules/analysis.analysis.query_result.no_graph_result',
    'en-US/modules/analysis.analysis.query_result.no_table_result',
    'en-US/modules/analysis.analysis.query_result.no_json_result',
    'en-US/modules/analysis.analysis.logs.execution_load_failed',
    'en-US/modules/analysis.analysis.logs.favorite_load_failed',
    'en-US/modules/analysis.analysis.logs.copy_failed',
    'en-US/modules/analysis.analysis.logs.failure_reason.GREMLIN_EXECUTION_FAILED',
    'en-US/modules/analysis.analysis.async_task.result_load_failed',
    'en-US/modules/analysis.analysis.async_task.no_result',
]);

const collectTerminalPeriods = (value, namespace, path = []) => {
    if (!value || typeof value !== 'object') {
        return [];
    }

    return Object.entries(value).flatMap(([key, child]) => {
        const nextPath = [...path, key];
        if (typeof child === 'string') {
            const fullPath = `${namespace}.${nextPath.join('.')}`;
            const isUiCopy = nextPath.some(segment => UI_COPY_KEY.test(segment));
            return isUiCopy && TERMINAL_PERIOD.test(child)
                   && !TERMINAL_PERIOD_ALLOWLIST.has(fullPath)
                ? [{path: fullPath, copy: child}]
                : [];
        }
        return collectTerminalPeriods(child, namespace, nextPath);
    });
};

const collectUnexpectedAnalysisPeriods = (value, namespace, path = []) => {
    if (!value || typeof value !== 'object') {
        return [];
    }

    return Object.entries(value).flatMap(([key, child]) => {
        const nextPath = [...path, key];
        if (typeof child === 'string') {
            const fullPath = `${namespace}.${nextPath.join('.')}`;
            const isAllowed = child.endsWith('...')
                              || ANALYSIS_STATUS_ALLOWLIST.has(fullPath);
            return !isAllowed && TERMINAL_PERIOD.test(child)
                ? [{path: fullPath, copy: child}]
                : [];
        }
        return collectUnexpectedAnalysisPeriods(child, namespace, nextPath);
    });
};

const getCopyAtFullPath = fullPath => {
    const namespace = Object.keys(RESOURCES).find(candidate =>
        fullPath.startsWith(`${candidate}.`)
    );
    const resourcePath = fullPath.slice(namespace.length + 1).split('.');
    return resourcePath.reduce((value, key) => value[key], RESOURCES[namespace]);
};

describe('concise UI copy punctuation', () => {
    it.each(Object.entries(RESOURCES))(
        'scans all %s UI descriptions and hints', (namespace, copy) => {
            expect(collectTerminalPeriods(copy, namespace)).toEqual([]);
        }
    );

    it('does not let a nested leaf bypass a semantic parent path', () => {
        const nestedCopy = {
            builtin_description: {
                example_name: 'Nested visible description.',
            },
        };

        expect(collectTerminalPeriods(nestedCopy, 'test')).toEqual([{
            path: 'test.builtin_description.example_name',
            copy: 'Nested visible description.',
        }]);
    });

    it('keeps the terminal-period allowlist exact and active', () => {
        expect(TERMINAL_PERIOD_ALLOWLIST).toHaveProperty('size', 6);
        TERMINAL_PERIOD_ALLOWLIST.forEach(fullPath => {
            expect(getCopyAtFullPath(fullPath)).toMatch(TERMINAL_PERIOD);
        });
    });

    it.each([
        ['zh-CN/modules/analysis', zhAnalysis],
        ['en-US/modules/analysis', enAnalysis],
    ])('keeps %s UI copy concise outside exact statuses', (namespace, copy) => {
        expect(collectUnexpectedAnalysisPeriods(copy, namespace)).toEqual([]);
    });

    it('keeps the analysis status allowlist exact and active', () => {
        expect(ANALYSIS_STATUS_ALLOWLIST).toHaveProperty('size', 19);
        ANALYSIS_STATUS_ALLOWLIST.forEach(fullPath => {
            expect(getCopyAtFullPath(fullPath)).toMatch(TERMINAL_PERIOD);
        });
    });

    it.each([
        ['zh-CN', zhPages.login],
        ['en-US', enPages.login],
    ])('keeps %s login supporting copy free of terminal periods', (_, login) => {
        expect(login.subtitle).not.toMatch(TERMINAL_PERIOD);
        expect(login.form_hint).not.toMatch(TERMINAL_PERIOD);
    });
});
