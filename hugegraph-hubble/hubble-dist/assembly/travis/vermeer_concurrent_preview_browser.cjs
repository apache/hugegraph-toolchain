#!/usr/bin/env node
/*
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
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {loadPlaywright, chromiumExecutablePath} = require('./run_ui_browser_smoke');
const {assertNoHorizontalOverflow} = require('./ui_usability');

const base = (process.env.HUBBLE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const output = process.env.HUBBLE_UI_EVIDENCE_DIR || '/tmp/hubble-vermeer-concurrent-preview';
const reportPath = path.join(output, 'vermeer-concurrent-preview-report.json');
const checkName = 'concurrent Vermeer submissions retain both compact connected previews';
const checks = [];
const unexpected = new Set();
const pageErrors = [];
let failure = null;

const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return {promise, resolve};
};

const task = (id, algorithm) => ({
    id,
    task_name: algorithm,
    task_type: 'vermeer-task:compute',
    task_status: 'success',
    task_create: 1792757451000,
    task_update: 1792757452000,
});

async function main() {
    fs.mkdirSync(output, {recursive: true});
    const firstStarted = deferred();
    const firstRelease = deferred();
    const state = {
        submissions: [],
        statusReads: [],
        previewReads: [],
    };
    const {chromium} = await loadPlaywright();
    const browser = await chromium.launch({
        headless: true,
        executablePath: chromiumExecutablePath(),
        args: ['--no-sandbox'],
    });
    try {
        const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
        await context.addInitScript(() => localStorage.setItem('languageType', 'zh-CN'));
        await context.route('**/api/v*/**', async route => {
            const request = route.request();
            const url = new URL(request.url());
            const pathname = url.pathname.replace(/^\/api\/v[\d.]+/, '');
            const method = request.method();
            let data;
            if (pathname === '/config') {
                data = {pd_enabled: true, auth_enabled: false, server_capabilities_verified: true,
                    graph_create_enabled: true, cypher_enabled: false};
            } else if (pathname === '/auth/context') {
                data = {mode: 'NON_AUTH', role: 'ANONYMOUS', capabilities: ['graphspaces_read'],
                    actions: {graphspaces: ['read']}, scopes: {all_graphspaces: true}};
            } else if (pathname === '/auth/status') {
                data = {};
            } else if (pathname === '/graphspaces/list') {
                data = {graphspaces: ['DEFAULT']};
            } else if (pathname === '/graphspaces') {
                data = {records: [{name: 'DEFAULT', nickname: '默认图空间'}], total: 1,
                    current: 1, size: 100, pages: 1};
            } else if (pathname === '/graphspaces/DEFAULT') {
                data = {name: 'DEFAULT', nickname: '默认图空间'};
            } else if (pathname === '/graphspaces/DEFAULT/graphs') {
                data = {records: [{name: 'hugegraph', nickname: '并发预览图', status: 'loaded'}],
                    total: 1, current: 1, size: 100, pages: 1,
                    selected: {name: 'hugegraph', nickname: '并发预览图', status: 'loaded'}};
            } else if (pathname.endsWith('/graph_read_mode')) {
                data = {status: '1'};
            } else if (pathname === '/vermeer') {
                data = {enable: true, retryable: false, statistics_available: true};
            } else if (pathname.endsWith('/text2gql/config')) {
                data = {available: false, custom_available: true, reason: 'not_configured'};
            } else if (pathname.endsWith('/schema/vertexlabels')) {
                data = {records: [{name: 'person', properties: ['name']}]};
            } else if (pathname.endsWith('/schema/edgelabels') || pathname.endsWith('/schema/propertykeys')) {
                data = {records: []};
            } else if (pathname.endsWith('/execute-histories') || pathname.endsWith('/gremlin-collections')) {
                data = {records: [], total: 0};
            } else if (pathname.endsWith('/gremlin-query') && method === 'GET') {
                data = {vertexcount: 1200, edgecount: 2400};
            } else if (pathname.endsWith('/get')) {
                data = {name: 'hugegraph', nickname: '并发预览图', status: 'loaded'};
            } else if (pathname.endsWith('/algorithms/vermeer') && method === 'POST') {
                const body = request.postDataJSON();
                const index = state.submissions.length;
                const id = index === 0 ? -901 : -902;
                state.submissions.push({id, body});
                if (index === 0) {
                    firstStarted.resolve();
                    await firstRelease.promise;
                }
                data = {task_id: id};
            } else if (pathname.endsWith('/async-tasks/ids') && method === 'GET') {
                const id = Number(url.searchParams.get('ids'));
                state.statusReads.push(id);
                data = id === -901 ? [task(-901, 'PageRank')]
                    : id === -902 ? [task(-902, 'Degree Centrality')] : [];
            } else if (/\/async-tasks\/-90[12]\/preview-edges$/.test(pathname) && method === 'GET') {
                const id = Number(pathname.match(/\/async-tasks\/(-\d+)\/preview-edges$/)[1]);
                const limit = Number(url.searchParams.get('limit'));
                state.previewReads.push({id, limit});
                const prefix = id === -901 ? 'page' : 'degree';
                const values = id === -901 ? ['0.42', '0.18'] : ['0.80', '0.55'];
                data = {
                    result_status: 'available',
                    vertices: [{ID: `${prefix}-a`, Value: values[0]},
                        {ID: `${prefix}-b`, Value: values[1]}],
                    edges: [{source: `${prefix}-a`, target: `${prefix}-b`}],
                    edges_status: 'available',
                    scanned: 2,
                    truncated: false,
                    cursor: 2,
                    has_more: false,
                };
            } else if (pathname.endsWith('/async-tasks') && method === 'GET') {
                data = {records: [], total: 0, current: 1, size: 10, pages: 0};
            } else {
                unexpected.add(`${method} ${pathname}${url.search}`);
                await route.fulfill({status: 404, contentType: 'application/json',
                    body: JSON.stringify({status: 404, message: 'Unexpected concurrent-preview fixture request'})});
                return;
            }
            await route.fulfill({status: 200, contentType: 'application/json',
                body: JSON.stringify({status: 200, data})});
        });

        const page = await context.newPage();
        page.on('pageerror', error => pageErrors.push(error.message));
        page.setDefaultTimeout(15000);
        try {
            await page.goto(`${base}/algorithms/DEFAULT/hugegraph`);
            await page.getByRole('tab', {name: 'OLAP 全图计算', exact: true}).click();
            await page.getByText('通过 Vermeer 执行；图已加载，可运行下方算法', {exact: true}).waitFor();

            const search = page.getByPlaceholder('算法查询', {exact: true});
            await search.fill('PageRank');
            const pageRank = page.locator('.ant-collapse-item').filter({
                has: page.getByRole('link', {name: /^PageRank /}),
            });
            await pageRank.waitFor();
            await pageRank.locator('.ant-collapse-header button.ant-btn-primary').click();
            let startTimer;
            await Promise.race([
                firstStarted.promise,
                new Promise((_, reject) => {
                    startTimer = setTimeout(
                        () => reject(new Error('First Vermeer submission was not observed')), 15000);
                }),
            ]).finally(() => clearTimeout(startTimer));

            await search.fill('Degree Centrality');
            const degree = page.locator('.ant-collapse-item').filter({
                has: page.getByRole('link', {name: /^Degree Centrality /}),
            });
            await degree.waitFor();
            await degree.locator('.ant-collapse-header button.ant-btn-primary').click();
            await page.getByTitle('degree-a · 0.80', {exact: true}).waitFor();
            assert.equal(state.submissions.length, 2);
            assert.equal(state.submissions[0].body.params['compute.algorithm'], 'pagerank');
            assert.equal(state.submissions[1].body.params['compute.algorithm'], 'degree');

            firstRelease.resolve();
            await page.getByTitle('page-a · 0.42', {exact: true}).waitFor();
            const taskSelect = page.locator('.ant-select').filter({hasText: 'PageRank · 901'}).last();
            await taskSelect.waitFor();
            await taskSelect.click();
            const older = page.getByRole('option', {name: 'Degree Centrality · 902', exact: true});
            await older.waitFor();
            await older.click();
            await page.getByTitle('degree-a · 0.80', {exact: true}).waitFor();
            const detail = page.getByRole('link', {name: '查看任务详情', exact: true});
            assert.match(await detail.getAttribute('href'), /[?&]taskId=-902(?:&|$)/);

            assert.deepEqual(new Set(state.statusReads), new Set([-901, -902]));
            assert.deepEqual(new Set(state.previewReads.map(read => read.id)), new Set([-901, -902]));
            assert(state.previewReads.every(read => read.limit === 12),
                `Expected compact limit 12, got ${JSON.stringify(state.previewReads)}`);
            await page.screenshot({path: path.join(output, 'vermeer-concurrent-preview-desktop.png'),
                fullPage: true, animations: 'disabled'});

            await page.setViewportSize({width: 390, height: 844});
            await assertNoHorizontalOverflow(page);
            assert(await page.getByTitle('degree-a · 0.80', {exact: true}).isVisible());
            await page.screenshot({path: path.join(output, 'vermeer-concurrent-preview-narrow.png'),
                fullPage: true, animations: 'disabled'});
            checks.push({name: checkName, status: 'passed'});
            console.log(`PASS ${checkName}`);
        } catch (error) {
            failure = error.message;
            checks.push({name: checkName, status: 'failed', error: error.message});
            console.error(error.stack);
            await page.screenshot({path: path.join(output, 'vermeer-concurrent-preview-failure.png'),
                fullPage: true});
        } finally {
            firstRelease.resolve();
        }
    } finally {
        const status = !failure && checks.length === 1 && checks[0].status === 'passed'
            && unexpected.size === 0 && pageErrors.length === 0 ? 'passed' : 'failed';
        fs.writeFileSync(reportPath, JSON.stringify({
            status,
            observedAt: new Date().toISOString(),
            browserVersion: browser.version(),
            scope: 'Production UI with fixture APIs; not live Server/PD/Store/Vermeer acceptance',
            checks,
            unexpectedApi: [...unexpected],
            pageErrors,
            failure,
        }, null, 2) + '\n');
        await browser.close();
    }
    if (failure || unexpected.size || pageErrors.length) process.exitCode = 1;
}

main().catch(error => {
    console.error(error.stack);
    process.exitCode = 1;
});
