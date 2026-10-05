/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

test('checkout verifies actual git HEAD and refuses missing/moving refs and existing directories', t => {
  const root = mkdtempSync(join(tmpdir(), 'server-checkout-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', source);
  git('-C', source, 'config', 'user.name', 'Fixture');
  git('-C', source, 'config', 'user.email', 'fixture@example.invalid');
  writeFileSync(join(source, 'file'), 'one');
  git('-C', source, 'add', 'file');
  git('-C', source, 'commit', '-m', 'initial');
  git('-C', source, 'branch', '-M', 'candidate');
  const first = git('-C', source, 'rev-parse', 'HEAD');
  const env = { ...process.env, SERVER_REPOSITORY: 'example/server', SERVER_FETCH_REF: 'candidate',
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `url.file://${source}.insteadOf`,
    GIT_CONFIG_VALUE_0: 'https://github.com/example/server.git' };
  const checkout = (name, sha, extra = {}) => spawnSync('bash',
    [join(__dirname, 'checkout-server.sh'), sha, join(root, name)],
    { env: { ...env, ...extra }, encoding: 'utf8' });
  const result = checkout('success', first);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git('-C', join(root, 'success'), 'rev-parse', 'HEAD'), first);
  assert.notEqual(checkout('success', first).status, 0);
  assert.notEqual(checkout('missing', first, { SERVER_FETCH_REF: 'absent' }).status, 0);
  writeFileSync(join(source, 'file'), 'two');
  git('-C', source, 'commit', '-am', 'advance');
  const moved = checkout('moved', first);
  assert.notEqual(moved.status, 0);
  assert.match(moved.stderr, /Server checkout mismatch/);
  assert.notEqual(checkout('invalid', 'short').status, 0);
  assert.equal(existsSync(join(root, 'invalid')), false);
  assert.notEqual(checkout('bad-repo', first, { SERVER_REPOSITORY: '../server' }).status, 0);
  assert.equal(existsSync(join(root, 'bad-repo')), false);
});
