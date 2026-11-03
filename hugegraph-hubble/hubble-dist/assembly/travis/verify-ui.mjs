/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {buildFrontend, fingerprint, validOutput} from './build-frontend.mjs';
import {validateReport} from './run_ui_deployment_regressions.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(directory, '../../../hubble-fe');
const defaultOutput = path.resolve(directory, '../../../target/hubble-ui-fixture');
const VERMEER_CHECK = 'concurrent Vermeer submissions retain both compact connected previews';

async function runnerFingerprint() {
  // These Node runners live outside the frontend build inventory.
  const hash = createHash('sha256');
  for (const file of ['verify-ui.mjs', 'run_ui_deployment_regressions.js',
    'run_ui_deployment_regressions_impl.js', 'vermeer_concurrent_preview_browser.cjs',
    'run_ui_browser_smoke.js', 'ui_auth.js', 'ui_usability.js']) {
    hash.update(file + '\0');
    hash.update(await readFile(path.join(directory, file)));
  }
  return hash.digest('hex');
}

async function previewBuild(frontend) {
  const require = createRequire(path.join(frontend, 'package.json'));
  const {preview} = await import(pathToFileURL(require.resolve('vite')).href);
  const server = await preview({root: frontend, configFile: path.join(frontend, 'vite.config.mjs'),
    preview: {host: '127.0.0.1', port: 0, strictPort: true, open: false}});
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') {
    await server.close();
    throw new Error('Production preview did not bind a local TCP port');
  }
  return {url: `http://127.0.0.1:${address.port}`, close: () => server.close()};
}

export function terminateBrowserProcess(child, signal, dependencies = {}) {
  const platform = dependencies.platform || process.platform;
  const killProcess = dependencies.killProcess || process.kill;
  const runTaskkill = dependencies.runTaskkill || spawnSync;
  try {
    if (platform === 'win32' && child.pid) {
      const result = runTaskkill('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore', windowsHide: true,
      });
      if (result.error) {
        if (result.error.code === 'ENOENT') child.kill(signal);
        else throw result.error;
      }
      return;
    }
    if (platform !== 'win32' && child.pid) killProcess(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function runBrowserScript(script, url, outputDir, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('Verification interrupted')); return; }
    const grouped = process.platform !== 'win32';
    const child = spawn(process.execPath, [path.join(directory, script)], {
      stdio: 'inherit', detached: grouped,
      env: {...process.env, HUBBLE_URL: url, HUBBLE_UI_EVIDENCE_DIR: outputDir},
    });
    let forceTimer;
    let timedOut = false;
    const kill = name => terminateBrowserProcess(child, name);
    const stop = () => {
      kill('SIGTERM');
      forceTimer = setTimeout(() => kill('SIGKILL'), 3000);
      forceTimer.unref();
    };
    const timer = setTimeout(() => { timedOut = true; stop(); }, 180000);
    child.once('exit', () => clearTimeout(forceTimer));
    child.once('error', reject);
    signal.addEventListener('abort', stop, {once: true});
    child.once('close', (code, childSignal) => {
      if (grouped && (signal.aborted || timedOut)) kill('SIGKILL');
      clearTimeout(timer);
      clearTimeout(forceTimer);
      signal.removeEventListener('abort', stop);
      if (code === 0 && !signal.aborted && !timedOut) resolve();
      else reject(new Error(timedOut ? `${script} exceeded 180 seconds`
        : `${script} failed (${childSignal || code})`));
    });
  });
}

export function runBrowser(url, outputDir, signal) {
  return runBrowserScript('run_ui_deployment_regressions.js', url, outputDir, signal);
}

export function runVermeerBrowser(url, outputDir, signal) {
  return runBrowserScript('vermeer_concurrent_preview_browser.cjs', url, outputDir, signal);
}

export function validateVermeerReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report) || report.status !== 'passed') {
    throw new Error('Vermeer browser report must have status passed');
  }
  if (!Array.isArray(report.checks) || report.checks.length !== 1 ||
      report.checks[0]?.name !== VERMEER_CHECK || report.checks[0]?.status !== 'passed') {
    throw new Error('Vermeer browser report must contain its required passed check');
  }
  for (const key of ['unexpectedApi', 'pageErrors']) {
    if (!Array.isArray(report[key]) || report[key].length !== 0) {
      throw new Error(`Vermeer browser report contains or omits ${key}`);
    }
  }
  if (report.failure !== undefined && report.failure !== null) {
    throw new Error('Vermeer browser report contains a failure');
  }
  return report;
}

async function currentBuild(frontend, inputHash) {
  const {packageManager} = JSON.parse(await readFile(path.join(frontend, 'package.json'), 'utf8'));
  const currentHash = await fingerprint(frontend, 'production', process.versions.node, packageManager.slice(5));
  return currentHash === inputHash && await validOutput(frontend, inputHash, 'production');
}

// Dependency injection is used only by lifecycle tests; the CLI always uses the real build and browser.
export async function verifyUi({frontend = frontendRoot, outputDir = defaultOutput} = {}, dependencies = {}) {
  const build = dependencies.build || (() => buildFrontend({frontend}));
  const serve = dependencies.serve || (() => previewBuild(frontend));
  const run = dependencies.run || runBrowser;
  const shouldRunVermeer = dependencies.runVermeer !== undefined || dependencies.run === undefined;
  const runVermeer = dependencies.runVermeer || runVermeerBrowser;
  const unchanged = dependencies.unchanged || (hash => currentBuild(frontend, hash));
  const runnerHash = dependencies.runnerHash || runnerFingerprint;
  const evidence = path.resolve(outputDir);
  await mkdir(evidence, {recursive: true});
  const reportPath = path.join(evidence, 'verification.json');
  const browserPath = path.join(evidence, 'browser-report.json');
  const vermeerPath = path.join(evidence, 'vermeer-concurrent-preview-report.json');
  await rm(reportPath, {force: true});
  await rm(browserPath, {force: true});
  await rm(vermeerPath, {force: true});
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: frontend, encoding: 'utf8'});
  const dirty = spawnSync('git', ['status', '--porcelain'], {cwd: frontend, encoding: 'utf8'});
  const report = {schema: 1, layer: 'controlled-browser', status: 'failed',
    startedAt: new Date().toISOString(), commit: revision.status === 0 ? revision.stdout.trim() : null,
    dirty: dirty.status === 0 ? Boolean(dirty.stdout.trim()) : null,
    coverage: 'Production UI with fixture APIs; not live Server/PD/Store/Vermeer acceptance',
    browserReport: browserPath, vermeerBrowserReport: vermeerPath};
  const controller = new AbortController();
  const interrupted = () => controller.abort();
  let server;
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);
  try {
    report.runnerHash = await runnerHash();
    const result = await build();
    report.inputHash = result.inputHash;
    if (controller.signal.aborted) throw new Error('Verification interrupted');
    server = await serve();
    report.url = server.url;
    await run(server.url, evidence, controller.signal);
    if (controller.signal.aborted) throw new Error('Verification interrupted');
    const browser = validateReport(JSON.parse(await readFile(browserPath, 'utf8')));
    let vermeer;
    if (shouldRunVermeer) {
      await runVermeer(server.url, evidence, controller.signal);
      if (controller.signal.aborted) throw new Error('Verification interrupted');
      vermeer = validateVermeerReport(JSON.parse(await readFile(vermeerPath, 'utf8')));
    }
    if (!await unchanged(report.inputHash)) throw new Error('Build inputs or output changed during verification');
    if (report.runnerHash !== await runnerHash()) throw new Error('Browser runner changed during verification');
    report.checks = vermeer ? [...browser.checks, ...vermeer.checks] : browser.checks;
    report.browserVersion = browser.browserVersion;
    if (vermeer) report.vermeerBrowserVersion = vermeer.browserVersion;
    report.status = 'passed';
  } catch (error) {
    report.failure = error.message;
  } finally {
    try { await server?.close(); }
    catch (error) { report.status = 'failed'; report.failure = `Preview cleanup failed: ${error.message}`; }
    if (controller.signal.aborted) { report.status = 'failed'; report.failure = 'Verification interrupted'; }
    process.removeListener('SIGINT', interrupted);
    process.removeListener('SIGTERM', interrupted);
    report.finishedAt = new Date().toISOString();
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const {values} = parseArgs({options: {'output-dir': {type: 'string'}, help: {type: 'boolean'}}});
  if (values.help) console.log('Usage: pnpm verify:ui [--output-dir DIR]\nBuilds/verifies production output and runs fixture browser checks. No real cluster is started.');
  else verifyUi({outputDir: values['output-dir']}).then(report => {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.status === 'passed' ? 0 : 1;
  }).catch(error => {console.error(error.message); process.exitCode = 1;});
}
