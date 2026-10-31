#!/usr/bin/env node
/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

// Deterministic browser evidence only: no request reaches a real cluster.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {loadPlaywright, chromiumExecutablePath} = require('./run_ui_browser_smoke');
const base = (process.env.HUBBLE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const output = process.env.HUBBLE_UI_EVIDENCE_DIR
    || fs.mkdtempSync(path.join(os.tmpdir(), 'hubble-operations-diagnostics-'));
const now = 1792757451000;
const scenario = process.env.HUBBLE_UI_SCENARIO;
assert(!scenario || ['overview', 'server', 'store', 'PD', 'ownership'].includes(scenario),
    'HUBBLE_UI_SCENARIO must be overview, server, store, PD, or ownership');
const checks = [];
const pageErrors = [];
const unexpectedApi = new Set();
const available = {availability: 'AVAILABLE', observed_at: now, last_success_at: now,
    fresh: true, stale: false};
const failed = (reason, diagnostics = {}) => ({availability: 'UNAVAILABLE', reason,
    observed_at: now, last_success_at: null, fresh: false, stale: false, diagnostics});
const server = {id: 'server-1', name: 'Server 1', type: 'SERVER', status: 'UP',
    version: '1.8.0', observed_at: now,
    metrics: {system: {basic: {processors: 8, uptime: 128889, systemload_average: 1.5},
        heap: {used: 512, max: 1024, committed: 768}, process_cpu_usage: 0.125}},
    metric_statuses: {system: available,
        backend: failed('backend_metrics_failed', {failed_graphs: 2})}};
const store = {id: 'store-1', name: 'Store 1', type: 'STORE', status: 'UP',
    version: '1.8.0', observed_at: now,
    metrics: {backend: {graphs: 2}, drive: {}, raft: {}},
    metric_statuses: {system: failed('upstream_rejected', {
        request_path: '/metrics/system', http_status: 503,
    }), backend: available, drive: available, raft: available}};
const pds = [1, 2, 3].map(n => ({id: `pd-${n}`, name: `PD ${n}`, type: 'PD',
    status: 'UP', role: n === 1 ? 'LEADER' : 'FOLLOWER', observed_at: now, metrics: {},
    metric_statuses: {system: {availability: 'UNSUPPORTED', reason: 'metrics_not_collected',
        observed_at: now, fresh: false, stale: false}}}));
const pdSource = {status: 'UP', availability: 'PARTIAL', reason: 'pd_metrics_unmapped',
    observed_at: now, last_success_at: now, fresh: false, stale: false,
    cluster_state: 'Cluster_Not_Ready', data_state: 'PState_Normal',
    diagnostics: {affected_node_count: 1, failed_metric_groups: ['system'],
        pd_metric_mapping: {configured_origin: 'http://pd-service:8620', status: 'no_match',
            matched_nodes: 0, discovered_nodes: 3, omitted_members: 0,
            members: pds.map(node => ({node_id: node.id,
                origin: `http://${node.id}:8620`, endpoint_valid: true,
                origin_matches: false, base_path_matches: true}))}}};
const sources = {pd: pdSource,
    server: {status: 'UP', availability: 'PARTIAL', reason: 'backend_metrics_failed',
        observed_at: now, last_success_at: now, fresh: false, stale: false,
        diagnostics: {affected_node_count: 1, failed_metric_groups: ['backend']}},
    stores: {status: 'UP', availability: 'PARTIAL', reason: 'upstream_rejected',
        observed_at: now, last_success_at: now, fresh: false, stale: false,
        diagnostics: {affected_node_count: 1, failed_metric_groups: ['system']}}};
const nodes = [server, ...pds, store];

async function capture(page, name) {
    await page.mouse.move(20, 20);
    await page.evaluate(() => {
        document.activeElement?.blur();
        window.scrollTo(0, 0);
        document.querySelectorAll('main, [role=main], .ant-layout-content')
            .forEach(element => element.scrollTo(0, 0));
    });
    const contentBottom = await page.locator('.operations-page').evaluate(
        element => element.getBoundingClientRect().bottom
    );
    await page.setViewportSize({width: 1440, height: Math.max(1000, Math.ceil(contentBottom + 80))});
    assert.deepEqual(await page.locator('.ant-message-error').allTextContents(), []);
    await page.screenshot({path: path.join(output, name + '.png'), fullPage: true, animations: 'disabled'});
}

async function check(name, action) {
    if (scenario && !name.startsWith(scenario)) return;
    try {
        await action();
        checks.push({name, status: 'passed'});
        console.log('PASS ' + name);
    }
    catch (error) {
        checks.push({name, status: 'failed', error: error.message});
        throw error;
    }
}

(async () => {
    fs.mkdirSync(output, {recursive: true});
    const {chromium} = await loadPlaywright();
    const browser = await chromium.launch({headless: true,
        executablePath: chromiumExecutablePath(),
        args: ['--no-sandbox']});
    const context = await browser.newContext({viewport: {width: 1440, height: 1800},
        timezoneId: 'Asia/Taipei'});
    await context.addInitScript(() => localStorage.setItem('languageType', 'zh-CN'));
    await context.route('**/api/v*/**', async route => {
        const url = new URL(route.request().url());
        const p = url.pathname.replace(/^\/api\/v[\d.]+/, '');
        let data;
        if (p === '/config') {
            data = {pd_enabled: true, auth_enabled: false, server_capabilities_verified: true};
        }
        else if (p === '/auth/context') {
            data = {mode: 'NON_AUTH', role: 'ANONYMOUS',
                capabilities: ['graphspaces_read', 'operations_health_read', 'operations_topology_read'],
                actions: {graphspaces: ['read']}, scopes: {all_graphspaces: true}};
        }
        else if (p === '/graphspaces') {
            data = {records: [{name: 'DEFAULT', nickname: '默认图空间'}], total: 1};
        }
        else if (p.endsWith('/graphs')) {
            data = {records: [{name: 'hugegraph', nickname: '记忆图'}], total: 1};
        }
        else if (p === '/auth/status') data = {};
        else if (p === '/vermeer') data = {enable: false};
        else if (p === '/dashboard') data = {configured: false, available: false};
        else if (p === '/operations/overview') {
            data = {status: 'DEGRADED', reason: 'cluster_not_ready', observed_at: now,
                stale: false, sources, nodes, facts: {graphs: 2, stores: 1, stores_up: 1}};
        }
        else if (p === '/operations/nodes') {
            const filtered = nodes.filter(node => !url.searchParams.get('type')
                || node.type === url.searchParams.get('type'));
            data = {items: filtered, total: filtered.length, page: 1, page_size: 20,
                observed_at: now, stale: false, sources};
        }
        else if (p.startsWith('/operations/nodes/')) {
            data = {node: nodes.find(node => node.id === p.split('/').at(-1)),
                observed_at: now, stale: false, sources};
        }
        else {
            unexpectedApi.add(route.request().method() + ' ' + p);
            data = {};
        }
        await route.fulfill({status: 200, contentType: 'application/json',
            body: JSON.stringify({status: 200, data})});
    });
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    page.setDefaultTimeout(12000);
    let failure = null;
    try {
        await check('overview distinguishes live nodes from partial metric collection', async () => {
            await page.goto(base + '/operations/overview');
            await page.getByRole('heading', {name: '集群概览', exact: true}).waitFor();
            await page.getByText('Server 1', {exact: true}).first().waitFor();
            await capture(page, '01-overview-mixed-metric-failures');
        });
        await check('server detail keeps node UP while backend metrics fail', async () => {
            await page.goto(base + '/operations/nodes/server-1');
            await page.getByRole('heading', {name: 'Server 1', exact: true}).waitFor();
            await page.getByText(/部分图的后端指标获取失败/).first().waitFor();
            assert.equal(await page.locator('.operations-source-strip').getByText('PD', {exact: true}).count(), 0);
            assert.equal(await page.locator('.operations-source-strip').getByText('Store', {exact: true}).count(), 0);
            const diagnostics = page.locator('#operations-source-diagnostics');
            await diagnostics.getByText('后端指标获取失败的图数', {exact: true}).waitFor();
            await diagnostics.getByText('Server 1 · 后端', {exact: true}).waitFor();
            assert.equal(await diagnostics.getByText('2', {exact: true}).isVisible(), true);
            await capture(page, '02-server-backend-unavailable');
        });
        await check('store detail exposes failed request and HTTP status', async () => {
            await page.goto(base + '/operations/nodes/store-1');
            await page.getByRole('heading', {name: 'Store 1', exact: true}).waitFor();
            await page.getByText('/metrics/system', {exact: true}).first().waitFor();
            await page.getByText('503', {exact: true}).first().waitFor();
            await page.getByText('Store 1 · 系统', {exact: true}).waitFor();
            assert.equal(await page.getByText('upstream rejected', {exact: true}).count(), 0);
            await capture(page, '03-store-system-request-failed');
            await page.locator('summary').filter({hasText: '采集详情与修复方法'}).click();
            await capture(page, '03b-store-system-expanded');
        });
        await check('PD source diagnostics are compact and address details expand', async () => {
            await page.goto(base + '/operations/nodes?type=PD&source=pd#operations-source-diagnostics');
            const disclosure = page.locator('summary').filter({hasText: '检查地址与修复方法'});
            await disclosure.waitFor();
            assert.equal(await page.getByText('http://pd-service:8620', {exact: true}).isVisible(), false);
            await capture(page, '04-pd-diagnostics-collapsed');
            await disclosure.click();
            await page.getByText('http://pd-service:8620', {exact: true}).waitFor();
            await page.getByText('尚未采集节点系统指标', {exact: false}).first().waitFor();
            await page.getByText(/未归属节点的 PD 采集端点: 1/).waitFor();
            await page.getByText(/Hubble 只采集一个匹配的 PD 成员/).waitFor();
            for (const member of pds) {
                assert.equal(await page.getByText(`${member.name} · system`, {exact: true}).count(), 0);
            }
            await capture(page, '05-pd-diagnostics-expanded');
        });
        await check('ownership keeps multiple node failures attached to their nodes and groups', async () => {
            nodes.push({...server, id: 'server-2', name: 'Server 2', metric_statuses: {
                backend: failed('backend_metrics_failed', {failed_graphs: 7}),
            }});
            sources.server.diagnostics.affected_node_count = 2;
            await page.goto(base + '/operations/nodes?type=SERVER&source=server#operations-source-diagnostics');
            const diagnostics = page.locator('#operations-source-diagnostics');
            const disclosure = diagnostics.locator('summary');
            await disclosure.waitFor();
            assert.equal(await diagnostics.getByText('2', {exact: true}).isVisible(), false);
            assert.equal(await diagnostics.getByText('7', {exact: true}).isVisible(), false);
            await capture(page, '06-multiple-server-failures-collapsed');
            await disclosure.click();
            for (const [name, count] of [['Server 1', '2'], ['Server 2', '7']]) {
                const row = diagnostics.locator('li').filter({hasText: `${name} · backend`});
                assert.equal(await row.getByText(count, {exact: true}).isVisible(), true);
            }
            await capture(page, '07-multiple-server-failures-expanded');

            nodes.push({...store, id: 'store-2', name: 'Store 2', metric_statuses: {
                raft: failed('upstream_rejected', {request_path: '/metrics/raft', http_status: 502}),
            }});
            sources.stores.diagnostics = {affected_node_count: 2, failed_metric_groups: ['system', 'raft']};
            await page.goto(base + '/operations/nodes?type=STORE&source=stores#operations-source-diagnostics');
            await disclosure.waitFor();
            assert.equal(await diagnostics.getByText('/metrics/system', {exact: true}).isVisible(), false);
            assert.equal(await diagnostics.getByText('/metrics/raft', {exact: true}).isVisible(), false);
            await disclosure.click();
            for (const [name, group, status] of [['Store 1', 'system', '503'], ['Store 2', 'raft', '502']]) {
                const row = diagnostics.locator('li').filter({hasText: `${name} · ${group}`});
                assert.equal(await row.getByText(`/metrics/${group}`, {exact: true}).isVisible(), true);
                assert.equal(await row.getByText(status, {exact: true}).isVisible(), true);
            }
            await capture(page, '08-multiple-store-request-owners');
        });
    }
    catch (error) {
        failure = error.message;
        console.error(error.stack);
        console.error(await page.locator('body').innerText());
    }
    finally {
        const passed = !failure && !pageErrors.length && !unexpectedApi.size;
        fs.writeFileSync(path.join(output, scenario ? scenario + '-report.json' : 'browser-report.json'), JSON.stringify({
            status: passed ? 'passed' : 'failed', observedAt: new Date().toISOString(),
            scope: 'Actual Chromium UI with mocked API data; not live-cluster acceptance',
            browserVersion: browser.version(), checks, pageErrors,
            unexpectedApi: [...unexpectedApi], failure,
        }, null, 2) + '\n');
        console.log(JSON.stringify({status: passed ? 'passed' : 'failed', output, checks: checks.length}));
        await browser.close();
        if (!passed) process.exitCode = 1;
    }
})();
