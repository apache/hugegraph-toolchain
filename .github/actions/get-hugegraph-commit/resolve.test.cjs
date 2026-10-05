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
const resolve = require('./resolve.cjs');
const sha = 'a'.repeat(40);

function client() {
  const calls = [];
  const github = { rest: {
    pulls: { get: async args => { calls.push(['pr', args]); return { data: { head: { sha } } }; } },
    repos: {
      getLatestRelease: async args => { calls.push(['release', args]); return { data: { tag_name: 'v1.7.0' } }; },
      getCommit: async args => { calls.push(['commit', args]); return { data: { sha } }; }
    }
  } };
  return { github, calls };
}

test('resolves explicit organization branch and verifies the pin', async () => {
  const { github, calls } = client();
  assert.deepEqual(await resolve(github, { repository: 'example/server',
    ref: 'integration-check', expectedCommit: sha }),
    { sha, fetchRef: 'integration-check' });
  assert.deepEqual(calls, [['commit', { owner: 'example', repo: 'server', ref: 'integration-check' }]]);
});

test('retains latest-release selection for existing callers', async () => {
  const { github, calls } = client();
  assert.deepEqual(await resolve(github, { repository: 'apache/hugegraph' }),
    { sha, fetchRef: 'refs/tags/v1.7.0' });
  assert.deepEqual(calls, [['release', { owner: 'apache', repo: 'hugegraph' }],
    ['commit', { owner: 'apache', repo: 'hugegraph', ref: 'refs/tags/v1.7.0' }]]);
});

test('resolves PR head from the selected repository', async () => {
  const { github, calls } = client();
  assert.deepEqual(await resolve(github, { repository: 'example/server', pr: '42' }),
    { sha, fetchRef: 'refs/pull/42/head' });
  assert.deepEqual(calls, [['pr', { owner: 'example', repo: 'server', pull_number: 42 }]]);
});

test('rejects invalid or ambiguous selectors before calling GitHub', async () => {
  for (const input of [{ repository: '../repo' }, { ref: 'master', pr: '42' },
    { pr: '1.5' }, { pr: '0' }, { expectedCommit: 'short' }]) {
    const { github, calls } = client();
    await assert.rejects(resolve(github, { repository: 'apache/hugegraph', ...input }));
    assert.equal(calls.length, 0);
  }
});

test('fails closed for a moved branch or API error', async () => {
  const { github } = client();
  await assert.rejects(resolve(github, { repository: 'example/server', ref: 'master',
    expectedCommit: '0'.repeat(40) }), /Server ref moved/);
  github.rest.repos.getCommit = async () => { throw new Error('Not Found'); };
  await assert.rejects(resolve(github, { repository: 'example/server', ref: 'missing' }), /Not Found/);
});
