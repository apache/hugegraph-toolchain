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
// Browser integration fixture: every API response is mocked. This does not verify a live cluster.
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('node:assert/strict');
const {loadPlaywright, chromiumExecutablePath} = require('./run_ui_browser_smoke');
const {assertUsableControl, assertNoHorizontalOverflow} = require('./ui_usability');
const base = (process.env.HUBBLE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
let output;
const checks = [];
const unexpected = new Set();
const errors = [];
let failure = null;
const spaces = [
    { name: 'DEFAULT', nickname: '默认图空间', create_time: '2026-10-13', auth: false, max_graph_number: 100, cpu_limit: 64, memory_limit: 128, compute_cpu_limit: 64, compute_memory_limit: 128, storage_limit: 100, storage_used_kb: 10752 },
    { name: 'soc_graph', nickname: '记忆库', create_time: '2026-10-15', auth: false, max_graph_number: 100, cpu_limit: 64, memory_limit: 128, compute_cpu_limit: 64, compute_memory_limit: 128, storage_limit: 10, storage_used_kb: 252590 },
];
const graph = (graphspace, name, nickname) => ({ graphspace, name, nickname, status: 'CREATED' });
// The destination graph must not exist in DEFAULT: stale selector data cannot pass.
const graphsBySpace = {
    DEFAULT: [graph('DEFAULT', 'hugegraph', '记忆图'), graph('DEFAULT', 'default_only', '默认空间专属图')],
    soc_graph: [graph('soc_graph', 'hugegraph', '记忆图'), graph('soc_graph', 'second', '测试图')],
};
const hasFixtureScope = scope => Object.entries(graphsBySpace).some(([space, graphs]) => (
    graphs.some(item => scope === `${space}/graphs/${item.name}`)
));
function graphViewFixture(method, pathname) {
    const prefix = '/graphspaces/', suffix = '/schema/graphview';
    const scope = pathname.startsWith(prefix) && pathname.endsWith(suffix)
        ? pathname.slice(prefix.length, -suffix.length) : '';
    if (!hasFixtureScope(scope)) return {status: 404};
    if (method !== 'GET') return {status: 405};
    return {status: 200, data: {vertices: [], edges: []}};
}
const now = 1792757451000;
const node = (n) => ({ id: `pd-${n}`, name: `PD ${n}`, type: 'PD', role: n === 1 ? 'LEADER' : 'FOLLOWER', status: 'UP', observed_at: now, metrics: {}, metric_statuses: { system: { availability: 'UNSUPPORTED', reason: 'metrics_not_collected', observed_at: now, fresh: false, stale: false } } });
const source = { status: 'UP', availability: 'PARTIAL', reason: 'pd_metrics_unmapped', observed_at: now, last_success_at: now, fresh: false, stale: false, diagnostics: { affected_node_count: 1, failed_metric_groups: ['system'], pd_endpoint_metrics: { metrics: { process_cpu_usage: 0.125, heap_used_bytes: 1048576 }, metric_status: { availability: 'AVAILABLE', observed_at: now, fresh: true, stale: false } }, pd_metric_mapping: { configured_origin: 'http://pd-service:8620', status: 'no_match', matched_nodes: 0, discovered_nodes: 3, omitted_members: 0, members: [1, 2, 3].map(n => ({ node_id: 'pd-' + n, origin: 'http://pd-' + n + ':8620', endpoint_valid: true, origin_matches: false, base_path_matches: true })) } }, cluster_state: 'Cluster_Not_Ready', data_state: 'PState_Normal' };
function mobileOverviewFixture() {
    const observed = {availability: 'AVAILABLE', observed_at: now, last_success_at: now, fresh: true, stale: false};
    const mainNode = (type, index) => ({id: `${type.toLowerCase()}-mobile-${index}`, type,
        name: `${type} 393201bf434064eae5f87314b9d3-${index}`, version: '1.8.0',
        role: type === 'PD' ? (index === 1 ? 'LEADER' : 'FOLLOWER') : null,
        status: type === 'SERVER' ? 'UP' : 'UNKNOWN', observed_at: now,
        metrics: type === 'STORE' ? {backend: {leaders: index}} : {},
        metric_statuses: {system: type === 'SERVER' ? observed
            : {...observed, availability: 'UNAVAILABLE', reason: 'metric_unavailable'}},
        ...(type === 'STORE' ? {readiness: {status: 'NOT_READY', state: 'STARTING', stale: false},
            process_lifecycle: {state: 'STARTED', observed_at: now, stale: false}} : {})});
    const computeNode = role => ({id: role.toLowerCase(), name: `${role.toLowerCase()}-mobile`, role,
        status: 'UP', ready: true, group: 'default', version: '1.8.0', observed_at: now,
        checks: {registered: true, connection_ready: true, load_stream_ready: true,
            compute_stream_ready: true, superstep_stream_ready: true},
        metrics: {cpu_cores: role === 'MASTER' ? 0.12000000000000001 : 0.42, rss_bytes: 1288490189},
        metric_status: observed});
    return {status: 'DEGRADED', main_cluster_status: 'DEGRADED', reason: 'cluster_not_ready',
        observed_at: now, stale: false,
        sources: {server: {...observed, status: 'UP'}, pd: {...observed, status: 'DEGRADED'},
            stores: {...observed, status: 'DEGRADED'}}, facts: {pd_leader: 'pd-mobile-1'},
        nodes: [mainNode('SERVER', 1), mainNode('SERVER', 2),
            ...[1, 2, 3].map(n => mainNode('PD', n)), ...[1, 2, 3].map(n => mainNode('STORE', n))],
        vermeer: {configured: true, availability: 'AVAILABLE', status: 'UP', stale: false,
            observed_at: now, last_success_at: now, registered_workers: 1, ready_workers: 1,
            master: computeNode('MASTER'), workers: [computeNode('WORKER')]}};
}
const task = { id: 80001, task_name: 'g.V().limit(100002)', task_type: 'gremlin', task_status: 'failed', task_create: now - 49000, task_update: now - 45602 };
const taskResult = { ...task, task_result: 'org.apache.hugegraph.exception.LimitExceedException: Task result size 77849617 exceeded limit 16777216 bytes' };
function pageResult(records, selected) { return { records, total: records.length, current: 1, size: 100, pages: 1, selected: records.find(x => x.name === selected) ?? null }; }
function sessionFixture(state, method) {
    if (method !== 'GET') return {status: 405, message: 'Unexpected fixture session method'};
    if (!state.auth || !state.loggedIn) return {status: 401, message: 'Fixture session requires authenticated login'};
    return {status: 200, data: {idle_timeout_seconds: 172800, min_idle_seconds: 900,
        max_idle_seconds: 604800, activity_scope: 'fixture-smoke-admin-login'}};
}
function queryFixture(method, pathname, body, truncated = false) {
    const prefix = '/graphspaces/', suffix = '/gremlin-query';
    const scope = pathname.startsWith(prefix) && pathname.endsWith(suffix)
        ? pathname.slice(prefix.length, -suffix.length) : '';
    const queries = {'DEFAULT/graphs/hugegraph': 'g.V()', 'soc_graph/graphs/second': 'g.V().limit(2)'};
    if (!hasFixtureScope(scope)) return {status: 404};
    if (method === 'GET') return {status: 200, data: {vertexcount: null, edgecount: null}};
    if (method !== 'POST') return {status: 405};
    if (!queries[scope] || body?.content !== queries[scope] || body?.preview !== true) return {status: 400};
    const second = scope === 'soc_graph/graphs/second';
    const vertices = (second ? ['second-1', 'second-2'] : ['1'])
        .map(id => ({id, label: 'Memory', properties: {name: id}}));
    return {status: 200, data: {type: 'VERTEX', graph_view: {vertices, edges: []},
        table_view: {header: ['id', 'label', 'properties'], rows: []}, json_view: {data: vertices},
        default_limit_applied: !second, default_limit: 300, ...(truncated ? {properties_truncated: true,
            property_preview_limit: 256, property_preview_vertex_ids: ['1'], graph_truncated: true} : {})}};
}
async function setup(browser, auth) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Taipei' });
    await context.addInitScript(() => localStorage.setItem('languageType', 'zh-CN'));
    const state = { auth, loggedIn: false, loginRequests: [], truncation: false, pendingDetail: null, graphGate: null, taskLookups: 0, taskSubmitted: false,
        operationsOverview: null, extraCapabilities: [] };
    const capabilities = ['graphspaces_read', 'operations_health_read', 'operations_topology_read', ...(auth ? ['accounts_manage', 'model_settings_manage'] : [])];
    await context.route('**/api/v*/**', async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        const p = url.pathname.replace(/^\/api\/v[\d.]+/, '');
        const method = req.method();
        // These responses must prove the submitted task's scope, not merely its URL suffix.
        if (/\/(?:async-tasks(?:\/|$)|gremlin-query\/async-task$)/.test(p)) {
            const prefix = '/graphspaces/soc_graph/graphs/hugegraph/';
            const endpoint = p.startsWith(prefix) ? p.slice(prefix.length) : '';
            const submission = endpoint === 'gremlin-query/async-task';
            const lookup = endpoint === 'async-tasks/ids';
            const result = endpoint === `async-tasks/${task.id}`;
            const list = endpoint === 'async-tasks';
            let body;
            if (submission && method === 'POST') {
                try { body = req.postDataJSON(); } catch (_) { /* Reject malformed fixture input. */ }
            }
            const valid = submission
                ? method === 'POST' && body?.content === task.task_name
                : state.taskSubmitted && method === 'GET' && (result || list ||
                    (lookup && url.searchParams.getAll('ids').length === 1 &&
                        url.searchParams.get('ids') === String(task.id)));
            if (!valid) {
                unexpected.add(`${method} ${p}${url.search}`);
                await route.fulfill({status: 404, contentType: 'application/json',
                    body: JSON.stringify({status: 404, message: 'Unexpected task fixture request'})});
                return;
            }
            if (submission) state.taskSubmitted = true;
        }
        let data;
        if (p === '/config')
            data = { pd_enabled: true, auth_enabled: auth, server_capabilities_verified: true, graph_create_enabled: true, cypher_enabled: false };
        else if (p === '/auth/login') {
            const credentials = method === 'POST' ? req.postDataJSON() : null;
            state.loginRequests.push({method, credentials});
            state.loggedIn = method === 'POST' && credentials?.user_name === 'smoke_admin' &&
                credentials?.user_password === 'fixture-only-password';
            if (!state.loggedIn) {
                await route.fulfill({status: 401, contentType: 'application/json',
                    body: JSON.stringify({status: 401, message: 'Invalid fixture login'})});
                return;
            }
            data = { id: 'smoke-admin', user_name: 'smoke_admin', user_nickname: '测试管理员', is_superadmin: true };
        }
        else if (p === '/auth/context') {
            const admin = auth && state.loggedIn;
            data = { mode: auth ? 'AUTH' : 'NON_AUTH', role: admin ? 'SUPERADMIN' : 'ANONYMOUS', capabilities: auth && !admin ? [] : [...capabilities, ...state.extraCapabilities], actions: { graphspaces: admin ? ['create', 'read', 'update', 'delete'] : auth ? [] : ['read'] }, scopes: { all_graphspaces: admin } };
        }
        else if (p === '/auth/status')
            data = {};
        else if (p === '/auth/session') {
            const response = sessionFixture(state, method);
            if (response.status !== 200) unexpected.add(`${method} ${p}`);
            await route.fulfill({status: response.status, contentType: 'application/json',
                body: JSON.stringify(response)});
            return;
        }
        else if (p === '/auth/users/list')
            data = { users: [] };
        else if (p === '/graphspaces/list')
            data = { graphspaces: spaces.map(x => x.name) };
        else if (p === '/graphspaces')
            data = pageResult(spaces, url.searchParams.get('selected'));
        else if (/^\/graphspaces\/[^/]+$/.test(p)) {
            const s = spaces.find(x => x.name === p.split('/')[2]);
            if (method === 'PUT') {
                Object.assign(s, req.postDataJSON());
                data = s;
            }
            else if (state.pendingDetail && s.name === 'DEFAULT') {
                const pending = state.pendingDetail;
                state.pendingDetail = null;
                await pending;
                data = s;
            }
            else
                data = s;
        }
        else if (p.endsWith('/graphs')) {
            const graphSpace = p.split('/')[2];
            assert(graphsBySpace[graphSpace], `Unexpected graph-list scope: ${graphSpace}`);
            if (state.graphGate) {
                await state.graphGate;
            }
            data = pageResult(graphsBySpace[graphSpace], url.searchParams.get('selected'));
        }
        else if (p.endsWith('/graph_read_mode'))
            data = { status: '1' };
        else if (p === '/vermeer')
            data = { enable: Boolean(state.operationsOverview?.vermeer?.configured) };
        else if (p === '/dashboard')
            data = { configured: false, available: false };
        else if (p.endsWith('/text2gql/config'))
            data = { available: false, custom_available: true, reason: 'not_configured' };
        else if (p.endsWith('/schema/graphview')) {
            const response = graphViewFixture(method, p);
            if (response.status !== 200) unexpected.add(`${method} ${p}`);
            await route.fulfill({status: response.status, contentType: 'application/json', body: JSON.stringify(response)});
            return;
        }
        else if (p.endsWith('/schema/edgelabels') || p.endsWith('/schema/propertykeys'))
            data = { records: [] };
        else if (p.endsWith('/schema/vertexlabels'))
            data = { records: [{ name: 'Memory', properties: ['name'] }] };
        else if (p.endsWith('/execute-histories') || p.endsWith('/gremlin-collections'))
            data = { records: [], total: 0 };
        else if (p.endsWith('/gremlin-query/async-task'))
            data = { task_id: 80001 };
        else if (p.endsWith('/gremlin-query')) {
            let body;
            try { body = req.postDataJSON(); } catch (_) { /* Invalid requests are rejected below. */ }
            const response = queryFixture(method, p, body, state.truncation);
            if (response.status !== 200) unexpected.add(`${method} ${p}`);
            await route.fulfill({status: response.status, contentType: 'application/json', body: JSON.stringify(response)});
            return;
        }
        else if (p.endsWith('/async-tasks/ids'))
            data = ++state.taskLookups < 3 ? [] : [task];
        else if (p.endsWith('/async-tasks/80001'))
            data = taskResult;
        else if (p.endsWith('/async-tasks'))
            data = pageResult([]); // The scheduler metadata must discover this task before the list does.
        else if (p === '/operations/nodes')
            data = state.operationsOverview
                ? {items: state.operationsOverview.nodes, total: state.operationsOverview.nodes.length,
                    observed_at: now, stale: false, sources: state.operationsOverview.sources}
                : { items: [node(1), node(2), node(3)], total: 3, page: 1, page_size: 20, observed_at: now, stale: false, sources: { pd: source } };
        else if (p.startsWith('/operations/nodes/') && state.operationsOverview)
            data = {node: state.operationsOverview.nodes.find(item => item.id === decodeURIComponent(p.slice('/operations/nodes/'.length))),
                observed_at: now, stale: false, sources: state.operationsOverview.sources};
        else if (p === '/operations/overview')
            data = state.operationsOverview ?? { sources: { pd: source }, observed_at: now, stale: false, nodes: [] };
        else if (p.endsWith('/is_auth'))
            data = { auth: false };
        else if (p.endsWith('/get'))
            data = { name: p.split('/')[4], nickname: '记忆图' };
        else {
            unexpected.add(`${method} ${p}`);
            data = {};
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data }) });
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(12000);
    return { context, page, state };
}
async function screenshot(page, name) {
    await page.mouse.move(20, 20);
    await page.evaluate(() => {
        document.activeElement?.blur();
        window.scrollTo(0, 0);
        document.querySelectorAll('main, [role=main], .ant-layout-content')
            .forEach(element => element.scrollTo(0, 0));
    });
    if (name !== 'failure' && !name.startsWith('failure-')) {
        // Preserve the preview-details popover intentionally opened by its scenario.
        await page.getByRole('tooltip').filter({
            hasNotText: '可缩小查询范围或仅返回所需属性',
        }).first().waitFor({state: 'hidden'});
        const toasts = await page.locator('.ant-message-error').allTextContents();
        assert.deepEqual(toasts, [], 'Unexpected error toast: ' + toasts.join('; '));
    }
    await page.screenshot({path: path.join(output, name + '.png'), fullPage: true, animations: 'disabled'});
}
async function waitForInputValue(page, input, expected) {
    await input.waitFor({state: 'attached'});
    await page.waitForFunction(([element, value]) => element.value === value,
        [await input.elementHandle(), expected]);
}
async function check(name, fn) { try {
    await fn();
    checks.push({ name, status: 'passed' });
    console.log('PASS ' + name);
}
catch (e) {
    checks.push({ name, status: 'failed', error: e.message });
    console.log('FAIL ' + name + ': ' + e.message);
    throw e;
} }
async function main() {
    output = process.env.HUBBLE_UI_EVIDENCE_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'hubble-deployment-ui-'));
    fs.mkdirSync(output, {recursive: true});
    const {chromium} = await loadPlaywright();
    const browser = await chromium.launch({ headless: true, executablePath: chromiumExecutablePath(), args: ['--no-sandbox'] });
    try {
        const { page, state } = await setup(browser, true);
        await check('authenticated login and GraphSpace/account visibility', async () => {
            await page.goto(base + '/graphspace');
            await page.getByRole('textbox', { name: '用户名', exact: true }).fill('smoke_admin');
            await page.locator('input[type=password]').fill('fixture-only-password');
            const loginResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/auth/login') && response.request().method() === 'POST');
            await page.getByRole('button', { name: /登\s*录/ }).click();
            const response = await loginResponse;
            await response.finished();
            assert.equal(response.status(), 200);
            assert.deepEqual(state.loginRequests, [{method: 'POST', credentials: {user_name: 'smoke_admin', user_password: 'fixture-only-password'}}]);
            assert.equal(state.loggedIn, true);
            await page.getByTestId('graphspace-page-title').waitFor();
            assert(await page.locator('a[href="/account"]').isVisible());
            await screenshot(page, 'graphspace-authenticated');
        });
        await check('GraphSpace title date and header whitespace navigate exactly to selected space', async () => {
            const card = () => page.locator('.ant-card').filter({ has: page.getByText('记忆库', { exact: true }) }).first();
            for (const target of ['date', 'title', 'whitespace', 'enter']) {
                await page.goto(base + '/graphspace');
                await card().waitFor();
                if (target === 'date')
                    await card().getByText(/2026-10-15/).click();
                else if (target === 'title')
                    await card().getByText('记忆库', { exact: true }).click();
                else if (target === 'enter')
                    await card().getByText('进入图空间', {exact: true}).click();
                else
                    // This case intentionally checks the noninteractive header hit area.
                    await card().locator('.ant-card-head').click({ position: { x: 12, y: 12 } });
                await page.waitForURL('**/graphspace/soc_graph');
            }
        });
        await check('GraphSpace menu edit does not navigate and current quota is editable', async () => {
            await page.goto(base + '/graphspace');
            const card = page.locator('.ant-card').filter({ has: page.getByText('记忆库', { exact: true }) }).first();
            await card.getByRole('button', { name: '更多' }).click();
            assert(new URL(page.url()).pathname === '/graphspace');
            await page.getByRole('menuitem', { name: '编辑', exact: true }).click();
            await page.getByRole('dialog').waitFor();
            const quota = page.getByRole('dialog').locator('input[id$="_storage_limit"]');
            await waitForInputValue(page, quota, '10');
            await page.getByRole('dialog').getByText('高级部署与资源限制', { exact: true }).click();
            assert(await quota.isEditable());
            await quota.fill('25');
            assert.equal(await quota.inputValue(), '25');
            assert(new URL(page.url()).pathname === '/graphspace');
            await screenshot(page, 'graphspace-edit');
            await page.getByRole('button', { name: /取\s*消/ }).click();
        });
        await check('late GraphSpace details cannot overwrite a newly opened editor', async () => {
            await page.goto(base + '/graphspace');
            let release;
            state.pendingDetail = new Promise(resolve => release = resolve);
            const staleResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/graphspaces/DEFAULT') && response.request().method() === 'GET');
            const staleRequest = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/graphspaces/DEFAULT') && request.method() === 'GET');
            const defaultCard = page.locator('.ant-card').filter({ has: page.getByText('默认图空间', { exact: true }) }).first();
            await defaultCard.getByRole('button', { name: '更多' }).click();
            await page.getByRole('menuitem', { name: '编辑', exact: true }).click();
            await staleRequest;
            assert(await page.getByRole('button', { name: /保\s*存/ }).isDisabled());
            await page.getByRole('button', { name: /取\s*消/ }).click();
            const nextCard = page.locator('.ant-card').filter({ has: page.getByText('记忆库', { exact: true }) }).first();
            await nextCard.getByRole('button', { name: '更多' }).click();
            await page.getByRole('menuitem', { name: '编辑', exact: true }).click();
            const name = page.getByRole('dialog').getByPlaceholder('例如：demo_space（全局唯一）', {exact: true});
            await waitForInputValue(page, name, 'soc_graph');
            release();
            await (await staleResponse).finished();
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            assert.equal(await name.inputValue(), 'soc_graph');
            assert.equal(await page.getByRole('dialog').locator('input[id$="_storage_limit"]').inputValue(), '10');
            await page.getByRole('button', { name: /取\s*消/ }).click();
        });
        await check('Graph context switches via actual header selectors', async () => {
            await page.goto(base + '/gremlin/DEFAULT/hugegraph');
            await page.getByRole('button', { name: '执行查询', exact: true }).waitFor();
            const spaceSelector = page.getByRole('combobox', { name: '当前 GraphSpace', exact: true });
            await spaceSelector.click();
            // Ant Design virtualizes options; its accessible option nodes are not click targets.
            await page.getByRole('option', {name: /记忆库/}).waitFor({state: 'attached'});
            await spaceSelector.press('ArrowDown');
            await spaceSelector.press('Enter');
            const graphSelector = page.getByRole('combobox', { name: '当前图', exact: true });
            await graphSelector.click();
            await page.getByRole('option', {name: /测试图/}).waitFor({state: 'attached'});
            await graphSelector.press('ArrowDown');
            const ready = page.waitForResponse(response => response.request().method() === 'GET'
                && new URL(response.url()).pathname === '/api/v1.3/graphspaces/soc_graph/graphs/second/schema/propertykeys');
            await graphSelector.press('Enter');
            await page.waitForURL('**/gremlin/soc_graph/second');
            await (await ready).finished();
            const execute = page.getByRole('button', {name: '执行查询', exact: true});
            // URL changes precede context/draft restoration. Wait for the public
            // action to be enabled and stable before editing the new graph's draft.
            await execute.click({trial: true});
            await page.locator('.cm-content').fill('g.V().limit(2)');
            await execute.click();
            await page.getByRole('group', {name: '节点：当前结果 2；全图总数未获取', exact: true}).waitFor();
            await screenshot(page, 'graph-context-switch');
        });
        await check('core query actions are usable at desktop and compact widths', async () => {
            for (const width of [1440, 1024]) {
                await page.setViewportSize({width, height: 1000});
                const ready = page.waitForResponse(response => response.request().method() === 'GET'
                    && new URL(response.url()).pathname === '/api/v1.3/graphspaces/DEFAULT/graphs/hugegraph/schema/propertykeys');
                await page.goto(base + '/gremlin/DEFAULT/hugegraph');
                await (await ready).finished();
                await page.getByText('尚未执行图查询，点击执行查询查看结果', {exact: true}).waitFor();
                await page.locator('.cm-content').fill('g.V()');
                const run = page.getByRole('button', {name: '执行查询', exact: true});
                const clear = page.getByRole('button', {name: /^清\s*空$/});
                await assertUsableControl(run);
                await assertUsableControl(clear);
                await assertNoHorizontalOverflow(page);
                await screenshot(page, `query-core-${width}`);
                await run.click();
                await page.getByRole('group', {name: '节点：当前结果 1；全图总数未获取', exact: true}).waitFor();
                await clear.click();
                await page.locator('.cm-content .cm-placeholder').waitFor({state: 'visible'});
                assert.equal(await run.isEnabled(), false);
            }
            await page.setViewportSize({width: 1440, height: 1000});
        });
        await check('routine query limit is quiet canvas note without unknown totals', async () => {
            await page.goto(base + '/gremlin/DEFAULT/hugegraph');
            await page.locator('.cm-content').fill('g.V()');
            await page.getByRole('button', { name: '执行查询', exact: true }).click();
            await page.getByText('已自动限制为 300 条', { exact: true }).waitFor();
            await page.getByRole('group', { name: '节点：当前结果 1；全图总数未获取', exact: true }).waitFor();
            await page.getByRole('group', { name: '边：当前结果 0；全图总数未获取', exact: true }).waitFor();
            assert.equal(await page.getByRole('alert').count(), 0);
            assert.equal(await page.getByText('/不可用', { exact: false }).count(), 0);
            await screenshot(page, 'query-routine-limit');
        });
        await check('truncation is compact with details on demand', async () => {
            state.truncation = true;
            await page.getByRole('button', { name: '执行查询', exact: true }).click();
            await page.getByText(/部分属性为只读预览/).waitFor();
            assert.equal(await page.getByRole('alert').count(), 0);
            await screenshot(page, 'query-truncated');
            await page.getByRole('button', { name: '预览说明', exact: true }).click();
            await page.getByText('可缩小查询范围或仅返回所需属性。异步任务也受 Server 结果大小限制', {exact:true}).waitFor();
            assert.equal(await page.getByRole('alert').count(), 0);
            await screenshot(page, 'query-preview-details');
            await page.getByText('表格', {exact:true}).click();
            assert.equal(await page.getByText(/关联图为部分预览/).isVisible(), false);
            assert.equal(await page.getByRole('alert').count(), 0);
        });
        await check('async task ID remains visible in the selected graph and failure is actionable', async () => {
            await page.goto(base + '/gremlin/soc_graph/hugegraph');
            await page.getByRole('button', { name: '切换异步任务', exact: true }).click();
            await page.locator('.cm-content').fill('g.V().limit(100002)');
            await page.getByRole('button', { name: '提交任务', exact: true }).click();
            await page.getByRole('button', { name: '查看任务进度', exact: true }).click();
            await page.waitForURL('**/asyncTasks/soc_graph/hugegraph?taskId=80001&submitted=1');
            await page.getByText('任务 80001 已提交，正在同步状态', { exact: true }).waitFor();
            await page.getByText(/服务端已接受任务，正在每秒查询任务状态/).waitFor();
            assert.equal(await page.getByText('80001', { exact: true }).count(), 0);
            await screenshot(page, 'async-task-submitted');
            await page.getByText('80001', { exact: true }).waitFor();
            assert(state.taskLookups >= 3, `Expected delayed exact-ID polling, got ${state.taskLookups} lookups`);
            await page.getByText('查看原因', { exact: true }).click();
            await page.getByText('任务执行失败', { exact: true }).waitFor();
            assert.equal(await page.getByText('查看完整结果', { exact: true }).count(), 0);
            await page.getByText('任务结果超过服务端限制', { exact: true }).waitFor();
            await page.getByText(/结果大小为 74\.24 MiB，服务端上限为 16\.00 MiB/).waitFor();
            await page.getByText(/减少返回条数或仅返回需要的属性后重新提交/).waitFor();
            await page.getByRole('link', { name: '调整查询', exact: true }).waitFor();
            await screenshot(page, 'async-task-result-limit');
            await page.getByRole('link', {name: '调整查询', exact: true}).click();
            await page.waitForURL('**/gremlin/soc_graph/hugegraph?language=gremlin');
        });
        await check('PD unmapped metrics have localized three-node source diagnostics', async () => {
            await page.goto(base + '/operations/nodes?type=PD&source=pd#operations-source-diagnostics');
            await page.locator('summary').filter({hasText: '检查地址与修复方法'}).click();
            await page.getByText('最近拓扑采集成功', { exact: false }).waitFor();
            await page.getByText('配置的 PD 端点样本', {exact: true}).waitFor();
            await page.getByText(/不代表某个节点或整个集群的总量/).waitFor();
            await page.getByText('12.5%', {exact: true}).waitFor();
            const repair = await page.locator('details.operations-diagnostic-details').filter({
                has: page.locator('summary').filter({hasText: '检查地址与修复方法'}),
            }).innerText();
            for (const detail of ['hugegraph-hubble.properties', 'pd.server', 'server.protocol', 'restUrl']) {
                assert(repair.includes(detail), `Missing actionable PD repair detail: ${detail}`);
            }
            assert(/重启[^。]*Hubble|Hubble[^。]*重启/.test(repair), 'Missing Hubble restart guidance');
            await page.getByText('尚未采集节点系统指标', { exact: false }).first().waitFor();
            assert.equal(await page.getByText(/来源可能在发现节点前/).count(), 0);
            await page.getByText('http://pd-service:8620', { exact: true }).waitFor();
            await page.getByText(/未归属节点的 PD 采集端点:\s*1/).waitFor();
            await page.getByText(/Hubble 只采集一个匹配的 PD 成员的系统指标/).waitFor();
            await page.getByText('没有匹配节点', { exact: true }).waitFor();
            await page.getByText('0 / 3', { exact: true }).waitFor();
            for (const member of source.diagnostics.pd_metric_mapping.members) {
                await page.getByText(member.origin, { exact: true }).waitFor();
            }
            await page.setViewportSize({width: 1440, height: 1600});
            await screenshot(page, 'pd-unmapped-diagnostics');
            await page.setViewportSize({width: 1440, height: 1000});
        });
        await check('mobile operations preserves readable main tiers and Store-row compute access', async () => {
            state.operationsOverview = mobileOverviewFixture();
            state.extraCapabilities = ['operations_metrics_read'];
            for (const width of [320, 375]) {
                await page.setViewportSize({width, height: 900});
                await page.goto(base + '/operations/overview');
                const topology = page.locator('.operations-main-topology');
                await topology.waitFor();
                assert.equal(await topology.locator('.operations-tier').count(), 3);
                assert.equal(await topology.locator('.operations-topology-node').count(), 8);
                await assertNoHorizontalOverflow(page);
                const cards = await topology.locator('.operations-topology-node').evaluateAll(nodes =>
                    nodes.map(element => {
                        const box = element.getBoundingClientRect();
                        const copy = element.querySelector('.operations-node-copy');
                        const range = document.createRange();
                        range.selectNodeContents(copy);
                        const text = range.getBoundingClientRect();
                        return {width: box.width, height: box.height, copyWidth: copy.clientWidth,
                            textInside: text.left >= box.left && text.right <= box.right + 1};
                    }));
                assert(cards.every(card => card.width >= 112 && card.height >= 44
                    && card.copyWidth >= 70 && card.textInside), 'Mobile main cards must remain readable');
                const peerLayout = await topology.evaluate(element => {
                    const stores = element.querySelector('.tier-store').getBoundingClientRect();
                    const entry = element.querySelector('.operations-vermeer-summary').getBoundingClientRect();
                    return {storeRight: stores.right, storeBottom: stores.bottom,
                        entryLeft: entry.left, entryBottom: entry.bottom};
                });
                assert(peerLayout.entryLeft > peerLayout.storeRight
                    && Math.abs(peerLayout.entryBottom - peerLayout.storeBottom) <= 1,
                'Vermeer must stay beside the Store layer without adding a fourth tier');
                await screenshot(page, `operations-mobile-${width}`);
                const mainNode = topology.locator('.tier-server .operations-topology-node').first();
                const target = await mainNode.getAttribute('href');
                await assertUsableControl(mainNode);
                await mainNode.click();
                await page.waitForURL(base + target);
                await page.getByRole('heading', {name: state.operationsOverview.nodes[0].name, exact: true}).waitFor();
                await page.locator('.operations-node-detail .operations-page-header button').first().click();
                await topology.waitFor();
                if (width === 375) {
                    const store = topology.locator('.tier-store .operations-topology-node').first();
                    await store.click();
                    const process = page.getByRole('region', {name: 'Store 进程生命周期'});
                    await process.getByText('已启动', {exact: true}).waitFor();
                    await process.getByText(/不能证明 PD 成员状态、分区健康或读写已就绪/).waitFor();
                    await page.getByRole('region', {name: '服务就绪状态'}).getByText('未就绪', {exact: true}).waitFor();
                    await page.locator('.operations-node-detail .operations-page-header button').first().click();
                    await topology.waitFor();
                }
                const summary = page.getByRole('button', {name: '查看计算集群', exact: true});
                await assertUsableControl(summary);
                await summary.click();
                await page.locator('.operations-vermeer-workbench').waitFor();
                assert.equal(await page.locator('.operations-vermeer-node').count(), 2);
                assert.equal(await page.getByText('已采集 2 / 2 个节点', {exact: true}).count(), 2);
                assert.deepEqual(await page.locator('.operations-vermeer-resource-fact strong').allTextContents(),
                    ['0.54 核', '2.4 GiB']);
                await assertNoHorizontalOverflow(page);
                await screenshot(page, `operations-mobile-compute-${width}`);
                await page.getByRole('button', {name: '返回主集群', exact: true}).click();
                await topology.waitFor();
                assert.equal(new URL(page.url()).searchParams.get('service'), null);
            }
            state.operationsOverview = null;
            state.extraCapabilities = [];
            await page.setViewportSize({width: 1440, height: 1000});
        });
        const anonymous = await setup(browser, false);
        await check('anonymous GraphSpaces visible with account and mutation actions hidden', async () => {
            await anonymous.page.goto(base + '/graphspace');
            await anonymous.page.getByTestId('graphspace-page-title').waitFor();
            assert.equal(await anonymous.page.locator('a[href="/account"]').count(), 0);
            assert.equal(await anonymous.page.getByRole('button', { name: '创建图空间', exact: true }).count(), 0);
            for (const mode of ['图模式', '列表模式']) {
                await anonymous.page.getByText(mode, { exact: true }).click();
                const container = mode === '图模式' ? '.ant-card' : 'tbody tr';
                for (const nickname of ['默认图空间', '记忆库']) {
                    const item = anonymous.page.locator(container).filter({has: anonymous.page.getByText(nickname, {exact: true})});
                    await item.waitFor({state: 'visible'});
                }
                assert.equal(await anonymous.page.getByRole('button', { name: '更多', exact: true }).count(), 0);
                assert.equal(await anonymous.page.getByText('编辑', { exact: true }).count(), 0);
                assert.equal(await anonymous.page.getByText('删除', { exact: true }).count(), 0);
            }
            await anonymous.page.getByText('图模式', { exact: true }).click();
            await screenshot(anonymous.page, 'graphspace-anonymous');
        });
        await check('algorithm search waits for selected graph in authenticated and anonymous modes', async () => {
            for (const item of [{page, state}, anonymous]) {
                let release;
                item.state.graphGate = new Promise(resolve => { release = resolve; });
                try {
                    await item.page.goto(base + '/algorithms/DEFAULT/hugegraph');
                    const search = item.page.getByPlaceholder('算法查询', {exact: true});
                    await search.waitFor({state: 'visible'});
                    assert(await search.isDisabled(), 'Search must be disabled while graph options are pending');
                    release();
                    const unrelated = item.page.getByText('查找所有路径（GET，基础版）', {exact: true}).first();
                    await unrelated.waitFor({state: 'visible'});
                    await search.fill('查找最短路径');
                    await item.page.getByText('查找最短路径', {exact: true}).first().waitFor({state: 'visible'});
                    await unrelated.waitFor({state: 'hidden'});
                    assert.equal(await search.inputValue(), '查找最短路径');
                }
                finally { release(); item.state.graphGate = null; }
            }
        });
    }
    catch (e) {
        failure = e.message;
        console.error(e.stack);
        for (const [contextIndex, ctx] of browser.contexts().entries()) {
            for (const [pageIndex, p] of ctx.pages().entries()) {
                console.log('PAGE', p.url(), await p.locator('body').innerText());
                await screenshot(p, `failure-context-${contextIndex}-page-${pageIndex}`);
            }
        }
    }
    finally {
        fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify({ status: !failure && checks.every(x => x.status === 'passed') && !errors.length && !unexpected.size ? 'passed' : 'failed', observedAt: new Date().toISOString(), browserVersion: browser.version(), timezone: 'Asia/Taipei', scope: 'Actual Chromium UI against mocked API responses; not real-cluster acceptance', checks, unexpectedApi: [...unexpected], pageErrors: errors, failure }, null, 2) + '\n');
        await browser.close();
    }
    if (failure || checks.some(x => x.status === 'failed') || errors.length || unexpected.size)
        process.exitCode = 1;
}
if (require.main === module) {
    main().catch(error => { console.error(error.stack); process.exitCode = 1; });
}
module.exports = {sessionFixture, queryFixture, graphViewFixture, graphsBySpace};
