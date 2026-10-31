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

const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');

const REQUIRED_CHECKS = Object.freeze([
    'authenticated login and GraphSpace/account visibility',
    'GraphSpace title date and header whitespace navigate exactly to selected space',
    'GraphSpace menu edit does not navigate and current quota is editable',
    'late GraphSpace details cannot overwrite a newly opened editor',
    'Graph context switches via actual header selectors',
    'core query actions are usable at desktop and compact widths',
    'routine query limit is quiet canvas note without unknown totals',
    'truncation is compact with details on demand',
    'async task ID remains visible in the selected graph and failure is actionable',
    'PD unmapped metrics have localized three-node source diagnostics',
    'mobile operations preserves readable main tiers and Store-row compute access',
    'anonymous GraphSpaces visible with account and mutation actions hidden',
    'algorithm search waits for selected graph in authenticated and anonymous modes',
]);

function validateReport(report) {
    if (!report || typeof report !== 'object' || Array.isArray(report) || report.status !== 'passed') {
        throw new Error('Browser report must have status passed');
    }
    if (!Array.isArray(report.checks) || report.checks.length !== REQUIRED_CHECKS.length) {
        throw new Error(`Browser report must contain all ${REQUIRED_CHECKS.length} required checks`);
    }
    const names = new Set();
    for (const check of report.checks) {
        if (!check || !REQUIRED_CHECKS.includes(check.name) || names.has(check.name) || check.status !== 'passed') {
            throw new Error('Browser report checks must be known, unique and passed');
        }
        names.add(check.name);
    }
    for (const key of ['unexpectedApi', 'pageErrors']) {
        if (!Array.isArray(report[key]) || report[key].length !== 0) {
            throw new Error(`Browser report contains or omits ${key}`);
        }
    }
    if (report.failure !== undefined && report.failure !== null) {
        throw new Error('Browser report contains a failure');
    }
    return report;
}

const screenshotNames = new Set([
    'graphspace-authenticated', 'graphspace-edit', 'graph-context-switch',
    'query-routine-limit', 'query-truncated', 'query-preview-details',
    'query-core-1440', 'query-core-1024',
    'query-core-1440', 'query-core-1024',
    'async-task-submitted', 'async-task-result-limit', 'pd-unmapped-diagnostics',
    'operations-mobile-320', 'operations-mobile-375',
    'operations-mobile-compute-320', 'operations-mobile-compute-375',
    'graphspace-anonymous', 'failure',
].map(name => `${name}.png`));
function main({outputDir, env = process.env, argv = process.argv.slice(2), spawn = spawnSync,
    log = console.error} = {}) {
    const output = outputDir || env.HUBBLE_UI_EVIDENCE_DIR ||
        fs.mkdtempSync(path.join(os.tmpdir(), 'hubble-deployment-ui-'));
    fs.mkdirSync(output, {recursive: true});
    const reportPath = path.join(output, 'browser-report.json');
    // A reused evidence directory must never make this invocation look successful.
    fs.rmSync(reportPath, {force: true});
    for (const name of fs.readdirSync(output)) {
        if (screenshotNames.has(name) || /^failure-context-\d+-page-\d+\.png$/.test(name)) {
            fs.rmSync(path.join(output, name), {force: true});
        }
    }
    const implementation = path.join(__dirname, 'run_ui_deployment_regressions_impl.js');
    let result;
    try {
        result = spawn(process.execPath, [implementation, ...argv], {
            cwd: process.cwd(), env: {...env, HUBBLE_UI_EVIDENCE_DIR: output}, stdio: 'inherit',
        });
    }
    catch (error) { result = {error, status: null}; }
    const missingReport = !fs.existsSync(reportPath);
    let report, failure;
    try {
        report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        validateReport(report);
    }
    catch (error) { failure = error.message; }
    if (result.error || result.signal || result.status !== 0) {
        failure = result.error?.message || (result.signal ? `Runner terminated by signal ${result.signal}`
            : `Runner exited with status ${result.status ?? 'unknown'}`);
    }
    if (failure) {
        const processFailed = result.error || result.signal || result.status !== 0;
        const stage = missingReport ? 'runner_startup' : processFailed ? 'runner_process' : 'report_validation';
        const runnerFailure = {stage, message: failure,
            exitCode: result.status ?? null, ...(result.signal ? {signal: result.signal} : {})};
        report = {
            observedAt: new Date().toISOString(), browserVersion: null, timezone: 'Asia/Taipei',
            scope: 'Deployment regression runner failed to prove its required browser fixture checks',
            checks: [], unexpectedApi: [], pageErrors: [],
            ...(report && typeof report === 'object' && !Array.isArray(report) ? report : {}),
            status: 'failed', failure: report?.failure ?? runnerFailure, runnerFailure,
        };
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
        log(`Deployment regression report rejected at ${reportPath}: ${failure}`);
    }
    return {exitCode: failure ? (Number.isInteger(result.status) && result.status > 0 ? result.status : 1) : 0,
        reportPath, report};
}

if (require.main === module) {
    try { process.exitCode = main().exitCode; }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {REQUIRED_CHECKS, validateReport, main};
