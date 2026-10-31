/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {REQUIRED_CHECKS, validateReport, main} = require('./run_ui_deployment_regressions');
const {sessionFixture, queryFixture, graphViewFixture, graphsBySpace} = require('./run_ui_deployment_regressions_impl');

function passing() {
    return {status: 'passed', checks: REQUIRED_CHECKS.map(name => ({name, status: 'passed'})),
        unexpectedApi: [], pageErrors: [], failure: null};
}
function directory(t) {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'hubble-fixture-wrapper-test-'));
    t.after(() => fs.rmSync(output, {recursive: true, force: true}));
    return output;
}
function invoke(t, {report = passing(), raw, omit = false, result = {status: 0}, before = () => {}} = {}) {
    const output = directory(t);
    before(output);
    const value = main({outputDir: output, argv: [], log: () => {}, spawn: (_command, args, settings) => {
        assert.ok(args[0].endsWith('run_ui_deployment_regressions_impl.js'));
        assert.equal(settings.env.HUBBLE_UI_EVIDENCE_DIR, output);
        const reportPath = path.join(output, 'browser-report.json');
        assert.equal(fs.existsSync(reportPath), false, 'Previous report must be removed before spawning');
        if (!omit) fs.writeFileSync(reportPath, raw ?? JSON.stringify(report));
        return result;
    }});
    return {...value, output, saved: JSON.parse(fs.readFileSync(value.reportPath, 'utf8'))};
}

test('importing either module neither starts Chromium nor creates evidence files', t => {
    const output = path.join(directory(t), 'not-created');
    const required = ['./run_ui_deployment_regressions', './run_ui_deployment_regressions_impl']
        .map(file => require.resolve(file));
    const result = spawnSync(process.execPath, ['-e', required.map(file => `require(${JSON.stringify(file)})`).join(';')],
        {env: {...process.env, HUBBLE_UI_EVIDENCE_DIR: output}, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(output), false);
    assert.equal(result.stdout, '');
});

test('accepts all required checks exactly once and preserves the report', t => {
    const report = passing();
    assert.equal(validateReport(report), report);
    const result = invoke(t, {report});
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.saved, report);
});

for (const [name, alter] of [
    ['failed top-level status', value => {value.status = 'failed';}],
    ['empty checks', value => {value.checks = [];}],
    ['missing check', value => {value.checks.pop();}],
    ['duplicate check', value => {value.checks[1] = value.checks[0];}],
    ['unknown check', value => {value.checks[0].name = 'unknown';}],
    ['extra check', value => {value.checks.push({name: 'unknown', status: 'passed'});}],
    ['failed check', value => {value.checks[0].status = 'failed';}],
    ['skipped check', value => {value.checks[0].status = 'skipped';}],
    ['needs-input check', value => {value.checks[0].status = 'needs input';}],
    ['malformed check', value => {value.checks[0] = null;}],
    ['unexpected API call', value => {value.unexpectedApi = ['POST /wrong-scope'];}],
    ['page error', value => {value.pageErrors = ['RangeError'];}],
    ['missing API inventory', value => {delete value.unexpectedApi;}],
    ['missing page-error inventory', value => {delete value.pageErrors;}],
    ['non-array inventory', value => {value.pageErrors = {};}],
    ['failure detail', value => {value.failure = 'screenshot rejected';}],
]) {
    test(`rejects ${name} despite a zero process exit`, t => {
        const report = passing();
        alter(report);
        assert.throws(() => validateReport(report));
        const result = invoke(t, {report});
        assert.equal(result.exitCode, 1);
        assert.equal(result.saved.status, 'failed');
        assert.ok(result.saved.runnerFailure.message);
        if (report.failure) assert.equal(result.saved.failure, report.failure);
        if (report.pageErrors?.length) assert.deepEqual(result.saved.pageErrors, report.pageErrors);
    });
}

for (const [name, options] of [
    ['no report', {omit: true}],
    ['invalid JSON', {raw: '{broken'}],
    ['empty object', {report: {}}],
    ['null', {report: null}],
    ['array', {report: []}],
]) {
    test(`rejects ${name} and writes a fresh failure report`, t => {
        const result = invoke(t, options);
        assert.equal(result.exitCode, 1);
        assert.equal(result.saved.status, 'failed');
        assert.ok(result.saved.failure);
    });
}

test('cannot reuse stale success and removes only known previous screenshot artifacts', t => {
    const result = invoke(t, {omit: true, before: output => {
        fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify(passing()));
        for (const name of ['graphspace-edit.png', 'failure-context-1-page-2.png', 'unrelated.png']) {
            fs.writeFileSync(path.join(output, name), 'old');
        }
    }});
    assert.equal(result.exitCode, 1);
    assert.equal(result.saved.failure.stage, 'runner_startup');
    assert.equal(fs.existsSync(path.join(result.output, 'graphspace-edit.png')), false);
    assert.equal(fs.existsSync(path.join(result.output, 'failure-context-1-page-2.png')), false);
    assert.equal(fs.readFileSync(path.join(result.output, 'unrelated.png'), 'utf8'), 'old');
});

test('a child nonzero exit cannot be hidden by its passed report', t => {
    const result = invoke(t, {result: {status: 7}});
    assert.equal(result.exitCode, 7);
    assert.equal(result.saved.status, 'failed');
    assert.equal(result.saved.runnerFailure.exitCode, 7);
});
test('a signaled child cannot be hidden by its passed report', t => {
    const result = invoke(t, {result: {status: null, signal: 'SIGTERM'}});
    assert.equal(result.exitCode, 1);
    assert.equal(result.saved.runnerFailure.signal, 'SIGTERM');
});
test('a spawn startup error produces evidence', t => {
    const result = invoke(t, {omit: true, result: {status: null, error: new Error('cannot start node')}});
    assert.equal(result.exitCode, 1);
    assert.match(result.saved.failure.message, /cannot start node/);
});
test('a thrown spawn failure also produces evidence', t => {
    const output = directory(t);
    const result = main({outputDir: output, log: () => {}, spawn: () => {throw new Error('startup threw');}});
    assert.equal(result.exitCode, 1);
    assert.match(result.report.failure.message, /startup threw/);
});

test('session fixture grants only GET for this logged-in authenticated context', () => {
    const response = sessionFixture({auth: true, loggedIn: true}, 'GET');
    assert.equal(response.status, 200);
    assert.equal(response.data.idle_timeout_seconds, 172800);
    assert.equal(response.data.activity_scope, 'fixture-smoke-admin-login');
    for (const state of [{auth: false, loggedIn: false}, {auth: false, loggedIn: true},
        {auth: true, loggedIn: false}, {}]) {
        const denied = sessionFixture(state, 'GET');
        assert.equal(denied.status, 401);
        assert.equal(denied.data, undefined);
    }
    for (const method of ['PUT', 'POST', 'DELETE']) {
        const denied = sessionFixture({auth: true, loggedIn: true}, method);
        assert.equal(denied.status, 405);
        assert.equal(denied.data, undefined);
    }
});
test('synchronous query fixture rejects a wrong method, scope or query instead of supplying successful data', () => {
    const path = '/graphspaces/soc_graph/graphs/second/gremlin-query';
    const body = {content: 'g.V().limit(2)', preview: true};
    assert.deepEqual(queryFixture('POST', path, body).data.graph_view.vertices.map(vertex => vertex.id),
        ['second-1', 'second-2']);
    assert.equal(queryFixture('POST', '/graphspaces/DEFAULT/graphs/hugegraph/gremlin-query',
        {content: 'g.V()', preview: true}).data.graph_view.vertices.length, 1);
    for (const [method, endpoint, content, status] of [
        ['PUT', path, body, 405], ['POST', path.replace('second', 'missing'), body, 404],
        ['POST', path, {content: 'g.V()', preview: true}, 400], ['POST', path, null, 400],
        ['POST', path, {content: body.content}, 400],
        ['POST', '/graphspaces/DEFAULT/graphs/hugegraph/gremlin-query', body, 400],
    ]) {
        const response = queryFixture(method, endpoint, content);
        assert.equal(response.status, status);
        assert.equal(response.data, undefined);
    }
});

test('graph card fixtures accept only existing graphs in their own GraphSpace', () => {
    for (const [space, graphs] of Object.entries(graphsBySpace)) {
        for (const graph of graphs) assert.equal(graph.graphspace, space);
    }
    for (const scope of ['DEFAULT/graphs/hugegraph', 'DEFAULT/graphs/default_only',
        'soc_graph/graphs/hugegraph', 'soc_graph/graphs/second']) {
        const base = `/graphspaces/${scope}`;
        assert.equal(graphViewFixture('GET', `${base}/schema/graphview`).status, 200);
        assert.equal(queryFixture('GET', `${base}/gremlin-query`).status, 200);
        assert.equal(graphViewFixture('POST', `${base}/schema/graphview`).status, 405);
    }
    for (const path of ['/graphspaces/DEFAULT/graphs/second',
        '/graphspaces/soc_graph/graphs/default_only', '/graphspaces/missing/graphs/hugegraph']) {
        assert.equal(graphViewFixture('GET', `${path}/schema/graphview`).status, 404);
        assert.equal(queryFixture('GET', `${path}/gremlin-query`).status, 404);
    }
});
