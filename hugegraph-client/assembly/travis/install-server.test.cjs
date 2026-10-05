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
const { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createHash } = require('node:crypto');

function cacheStamp(cache, repository, sha, archive) {
  const digest = createHash('sha256').update(readFileSync(join(cache, archive))).digest('hex');
  writeFileSync(join(cache, 'server-provenance'), `${repository}\n${sha}\n${archive}\n${digest}\n`);
}

function temp(t) {
  const root = mkdtempSync(join(tmpdir(), 'server-install-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

for (const installer of [
  join(__dirname, 'install-hugegraph-from-source.sh'),
  join(__dirname, '../../../hugegraph-tools/assembly/travis/install-hugegraph-from-source.sh'),
  join(__dirname, '../../../hugegraph-spark-connector/assembly/travis/install-hugegraph-from-source.sh')
]) {
test(`build-only ${installer} preserves source selection and packages without dependency installation`, t => {
  const root = temp(t);
  const source = join(root, 'source');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', source);
  git('-C', source, 'config', 'user.name', 'Fixture');
  git('-C', source, 'config', 'user.email', 'fixture@example.invalid');
  writeFileSync(join(source, 'pom.xml'), 'fixture');
  git('-C', source, 'add', 'pom.xml');
  git('-C', source, 'commit', '-m', 'initial');
  const sha = git('-C', source, 'rev-parse', 'HEAD');
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'curl'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
  writeFileSync(join(bin, 'mvn'), '#!/bin/bash\nprintf "%s\\n" "$@" > "$BUILD_ARGS"\nprintf "%s" "$MAVEN_ARGS" > "$BUILD_REPO"\n', { mode: 0o755 });
  const env = { ...process.env, SERVER_REPOSITORY: 'example/server', SERVER_FETCH_REF: sha,
    PATH: `${bin}:${process.env.PATH}`, BUILD_ARGS: join(root, 'args'), BUILD_REPO: join(root, 'repo'),
    MAVEN_ARGS: `-Dmaven.repo.local=${root}/isolated-m2`, GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: `url.file://${source}.insteadOf`, GIT_CONFIG_VALUE_0: 'https://github.com/example/server.git' };
  const run = args => spawnSync('bash', [installer, ...args],
    { cwd: root, env, encoding: 'utf8' });
  assert.notEqual(run([sha, '--unknown']).status, 0);
  assert.equal(existsSync(join(root, 'hugegraph')), false);
  const result = run([sha, '--build-only']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(env.BUILD_ARGS, 'utf8').trim().split('\n'),
    ['package', '-DskipTests', '-Dmaven.javadoc.skip=true', '-ntp']);
  assert.equal(readFileSync(env.BUILD_REPO, 'utf8'), env.MAVEN_ARGS);
  // No archive exists: success proves build-only did not attempt extraction/startup.
  assert.equal(readdirSync(root).some(name => name.startsWith('hugegraph-servers.')), false);
});
}

function serverFixture(fixture) {
  mkdirSync(join(fixture, 'conf/graphs'), { recursive: true });
  mkdirSync(join(fixture, 'bin'));
  writeFileSync(join(fixture, 'conf/graphs/hugegraph.properties'),
    'gremlin.graph=org.apache.hugegraph.HugeFactory\n');
  writeFileSync(join(fixture, 'conf/rest-server.properties'),
    'restserver.url=http://127.0.0.1:8080\nrpc.server_port=8091\n#auth.authenticator=none\n#auth.admin_pa=none\n');
  writeFileSync(join(fixture, 'conf/gremlin-server.yaml'), '#port: 8182\n');
  writeFileSync(join(fixture, 'bin/init-store.sh'),
    '#!/bin/bash\nset -e\nshopt -s dotglob\nread -r password\n[[ "$password" == pa ]]\n' +
    'for file in conf/graphs/*.properties; do\n' +
    '  name=$(basename "$file" .properties)\n' +
    '  if [[ ! "$name" =~ ^[a-zA-Z][a-zA-Z0-9_]{0,47}$ ]]; then\n' +
    '    echo "Invalid graph name: $name" >&2\n    exit 1\n  fi\n' +
    'done\nprintf "%s" "$JAVA_HOME" > initialized-with-jvm\n', { mode: 0o755 });
  writeFileSync(join(fixture, 'bin/start-hugegraph.sh'),
    '#!/bin/bash\nprintf "%s" "$JAVA_HOME" > started-with-jvm\n', { mode: 0o755 });
}

function runStarter(root, entries) {
  const archive = join(root, 'server.tar.gz');
  // Keep metadata entries as files on macOS too, matching the Linux CI extractor.
  const env = { ...process.env, COPYFILE_DISABLE: '1', RUNNER_TEMP: root, JAVA_HOME: '/fixture/java11' };
  const bin = join(root, 'tar-bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'curl'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
  env.PATH = `${bin}:${env.PATH}`;
  if (process.platform === 'darwin') {
    writeFileSync(join(bin, 'tar'),
      '#!/bin/bash\n[[ "$1" == -* ]] || set -- "-$1" "${@:2}"\n' +
      'exec /usr/bin/tar --no-mac-metadata "$@"\n', { mode: 0o755 });
    env.PATH = `${bin}:${env.PATH}`;
  }
  execFileSync('tar', ['czf', archive, '-C', root, ...entries], { env });
  const result = spawnSync('bash', [join(__dirname, 'start-hugegraph-servers.sh'), archive],
    { env, encoding: 'utf8' });
  const serverRoot = join(root, readdirSync(root).find(name => name.startsWith('hugegraph-servers.')));
  return { result, serverRoot };
}

for (const layout of [
  { name: 'direct candidate', top: 'apache-hugegraph-fixture', server: 'apache-hugegraph-fixture' },
  { name: 'official aggregate', top: 'apache-hugegraph-incubating-1.7.0',
    server: 'apache-hugegraph-incubating-1.7.0/apache-hugegraph-server-incubating-1.7.0' }
]) {
  test(`shared starter launches ${layout.name} HTTP/auth and HTTPS with caller JVM`, t => {
    const root = temp(t);
    serverFixture(join(root, layout.server));
    if (layout.server !== layout.top) {
      // Sibling components in the real release are not server candidates.
      mkdirSync(join(root, layout.top, 'apache-hugegraph-pd-incubating-1.7.0'));
      mkdirSync(join(root, layout.top, 'apache-hugegraph-store-incubating-1.7.0'));
    }
    const { result, serverRoot } = runStarter(root, [layout.top]);
    assert.equal(result.status, 0, result.stderr);
    for (const dir of [layout.server, 'hugegraph_https']) {
      const deployed = join(serverRoot, dir);
      assert.equal(readFileSync(join(deployed, 'started-with-jvm'), 'utf8'), '/fixture/java11');
      assert.equal(readFileSync(join(deployed, 'initialized-with-jvm'), 'utf8'), '/fixture/java11');
      assert.match(readFileSync(join(deployed, 'conf/graphs/hugegraph.properties'), 'utf8'), /HugeFactoryAuthProxy/);
      const rest = readFileSync(join(deployed, 'conf/rest-server.properties'), 'utf8');
      assert.match(rest, /auth.authenticator=org.apache.hugegraph.auth.StandardAuthenticator/);
      assert.match(rest, /auth.admin_pa=pa/);
      assert.match(rest, /batch.max_vertices_per_batch=500/);
      assert.match(rest, /batch.max_edges_per_batch=500/);
      assert.match(rest, dir === 'hugegraph_https' ? /rpc.server_port=8092/ : /rpc.server_port=8091/);
      assert.match(rest, dir === 'hugegraph_https' ? /https:\/\/127.0.0.1:8443/ : /http:\/\/127.0.0.1:8080/);
    }
    assert.match(readFileSync(join(serverRoot, 'hugegraph_https/conf/gremlin-server.yaml'), 'utf8'), /^port: 8282/m);
    assert.equal(existsSync(join(serverRoot, 'hugegraph_https/apache-hugegraph-pd-incubating-1.7.0')), false);
  });
}

test('shared starter rejects multiple runnable server distributions before starting either', t => {
  const root = temp(t);
  const top = 'apache-hugegraph-ambiguous';
  const paths = [top, `${top}/apache-hugegraph-server-nested`];
  paths.forEach(path => serverFixture(join(root, path)));
  const { result, serverRoot } = runStarter(root, [top]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Expected exactly one runnable server distribution, found 2/);
  for (const path of paths) {
    assert.equal(existsSync(join(serverRoot, path, 'initialized-with-jvm')), false);
    assert.equal(existsSync(join(serverRoot, path, 'started-with-jvm')), false);
  }
  assert.equal(existsSync(join(serverRoot, 'hugegraph_https')), false);
});

test('shared starter rejects an incomplete server before initialization', t => {
  const root = temp(t);
  const top = 'apache-hugegraph-incomplete';
  serverFixture(join(root, top));
  rmSync(join(root, top, 'conf/graphs/hugegraph.properties'));
  const { result, serverRoot } = runStarter(root, [top]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Expected exactly one runnable server distribution, found 0/);
  assert.equal(existsSync(join(serverRoot, top, 'initialized-with-jvm')), false);
  assert.equal(existsSync(join(serverRoot, top, 'started-with-jvm')), false);
  assert.equal(existsSync(join(serverRoot, 'hugegraph_https')), false);
});


test('shared starter removes AppleDouble sidecars without replacing released content', t => {
  const root = temp(t);
  const top = 'apache-hugegraph-incubating-1.7.0';
  const server = `${top}/apache-hugegraph-server-incubating-1.7.0`;
  serverFixture(join(root, server));
  mkdirSync(join(root, server, 'lib'));
  // GNU tar retains these macOS sidecars; ConfigUtil scans every *.properties.
  writeFileSync(join(root, server, 'conf/graphs/._hugegraph.properties'), 'metadata sidecar');
  writeFileSync(join(root, server, 'lib/._released.jar'), 'metadata sidecar');
  writeFileSync(join(root, server, 'lib/released.jar'), 'original released binary');
  writeFileSync(join(root, server, 'conf/.keep'), 'ordinary dotfile');
  writeFileSync(join(root, '._outside.properties'), 'outside the extracted distribution');
  const { result, serverRoot } = runStarter(root, [top]);
  assert.equal(result.status, 0, result.stderr);
  for (const dir of [server, 'hugegraph_https']) {
    const deployed = join(serverRoot, dir);
    assert.equal(readFileSync(join(deployed, 'started-with-jvm'), 'utf8'), '/fixture/java11');
    assert.equal(existsSync(join(deployed, 'conf/graphs/._hugegraph.properties')), false);
    assert.equal(existsSync(join(deployed, 'lib/._released.jar')), false);
    assert.equal(readFileSync(join(deployed, 'lib/released.jar'), 'utf8'), 'original released binary');
    assert.equal(readFileSync(join(deployed, 'conf/.keep'), 'utf8'), 'ordinary dotfile');
    assert.match(readFileSync(join(deployed, 'conf/graphs/hugegraph.properties'), 'utf8'), /HugeFactoryAuthProxy/);
  }
  assert.equal(readFileSync(join(root, '._outside.properties'), 'utf8'), 'outside the extracted distribution');
});

test('shared starter still rejects invalid non-metadata graph names', t => {
  const root = temp(t);
  const top = 'apache-hugegraph-invalid-graph';
  serverFixture(join(root, top));
  writeFileSync(join(root, top, 'conf/graphs/9invalid.properties'), 'invalid graph configuration');
  const { result, serverRoot } = runStarter(root, [top]);
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(join(serverRoot, top, 'conf/graphs/9invalid.properties')), true);
  assert.equal(existsSync(join(serverRoot, top, 'started-with-jvm')), false);
});


test('Loader reports ambiguous archives before shared startup', t => {
  const root = temp(t);
  const cache = join(root, 'cache');
  mkdirSync(cache);
  writeFileSync(join(cache, 'apache-hugegraph-cached.tar.gz'), 'cached archive');
  cacheStamp(cache, 'apache/hugegraph', 'a'.repeat(40), 'apache-hugegraph-cached.tar.gz');
  writeFileSync(join(root, 'apache-hugegraph-leftover.tar.gz'), 'leftover archive');
  const installer = join(__dirname, '../../../hugegraph-loader/assembly/travis/install-hugegraph-from-source.sh');
  const result = spawnSync('bash', [installer, 'a'.repeat(40)], {
    cwd: root, env: { ...process.env, SERVER_CACHE_DIR: cache }, encoding: 'utf8'
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Expected exactly one server archive, found:/);
  assert.match(result.stderr, /apache-hugegraph-cached\.tar\.gz/);
  assert.match(result.stderr, /apache-hugegraph-leftover\.tar\.gz/);
  assert.equal(readdirSync(root).some(name => name.startsWith('hugegraph-servers.')), false);
});

test('Loader retains its source cache while using the selected repository and shared startup', t => {
  const root = temp(t);
  const source = join(root, 'source');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', source);
  git('-C', source, 'config', 'user.name', 'Fixture');
  git('-C', source, 'config', 'user.email', 'fixture@example.invalid');
  writeFileSync(join(source, 'pom.xml'), 'fixture');
  git('-C', source, 'add', 'pom.xml');
  git('-C', source, 'commit', '-m', 'initial');
  const sha = git('-C', source, 'rev-parse', 'HEAD');
  const top = 'apache-hugegraph-loader-fixture';
  writeFileSync(join(source, 'pom.xml'), 'another commit');
  git('-C', source, 'commit', '-am', 'another commit');
  const anotherSha = git('-C', source, 'rev-parse', 'HEAD');
  serverFixture(join(root, top));
  const archive = join(root, 'fixture.tar.gz');
  execFileSync('tar', ['czf', archive, '-C', root, top],
    { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'curl'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
  writeFileSync(join(bin, 'mvn'), '#!/bin/bash\nprintf "%s\\n" "$@" > "$BUILD_ARGS"\n' +
    'mkdir -p hugegraph-server\ncp "$FIXTURE_ARCHIVE" hugegraph-server/apache-hugegraph-fixture.tar.gz\n' +
    'if [[ "$DUPLICATE_ARCHIVE" == true ]]; then\n' +
    '  cp "$FIXTURE_ARCHIVE" hugegraph-server/apache-hugegraph-other.tar.gz\nfi\n',
    { mode: 0o755 });
  const env = { ...process.env, SERVER_REPOSITORY: 'example/server', SERVER_FETCH_REF: sha,
    SERVER_CACHE_DIR: join(root, 'cache'), FIXTURE_ARCHIVE: archive, BUILD_ARGS: join(root, 'args'),
    PATH: `${bin}:${process.env.PATH}`, RUNNER_TEMP: root, JAVA_HOME: '/fixture/java11',
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `url.file://${source}.insteadOf`,
    GIT_CONFIG_VALUE_0: 'https://github.com/example/server.git' };
  const installer = join(__dirname, '../../../hugegraph-loader/assembly/travis/install-hugegraph-from-source.sh');
  for (const failure of [
    { name: 'checkout', extra: { SERVER_FETCH_REF: anotherSha }, error: /Server checkout mismatch/ },
    { name: 'build', extra: { DUPLICATE_ARCHIVE: 'true' }, error: /Expected exactly one built server archive/ }
  ]) {
    const cwd = join(root, `run-failed-${failure.name}`);
    const cache = join(root, `cache-failed-${failure.name}`);
    mkdirSync(cwd);
    const result = spawnSync('bash', [installer, sha], {
      cwd, env: { ...env, ...failure.extra, SERVER_CACHE_DIR: cache }, encoding: 'utf8'
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, failure.error);
    assert.deepEqual(readdirSync(cache), []);
    assert.equal(readdirSync(root).some(name => name.startsWith('hugegraph-servers.')), false);
  }
  for (const pass of ['build', 'cache']) {
    const cwd = join(root, `run-${pass}`);
    mkdirSync(cwd);
    const result = spawnSync('bash', [installer, pass === 'cache' ? sha.toUpperCase() : sha],
      { cwd, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(env.BUILD_ARGS, 'utf8').trim().split('\n'),
      ['package', '-DskipTests', '-Dmaven.javadoc.skip=true', '-ntp']);
    assert.equal(existsSync(join(cwd, 'hugegraph')), false);
    if (pass === 'build') {
      assert.deepEqual(readdirSync(env.SERVER_CACHE_DIR).sort(),
        ['apache-hugegraph-fixture.tar.gz', 'server-provenance']);
      assert.equal(readFileSync(join(env.SERVER_CACHE_DIR, 'server-provenance'), 'utf8'),
        `example/server\n${sha}\napache-hugegraph-fixture.tar.gz\n` +
        `${createHash('sha256').update(readFileSync(archive)).digest('hex')}\n`);
      // A cache hit must not execute Maven or reach the source repository again.
      writeFileSync(join(bin, 'mvn'), '#!/bin/bash\nexit 91\n', { mode: 0o755 });
      rmSync(source, { recursive: true, force: true });
    }
  }
  const otherCwd = join(root, 'run-other-commit');
  mkdirSync(otherCwd);
  const other = spawnSync('bash', [installer, anotherSha], { cwd: otherCwd, env, encoding: 'utf8' });
  assert.equal(other.status, 1);
  assert.match(other.stderr, /source or archive provenance mismatch/);
  assert.deepEqual(readdirSync(otherCwd), []);
  const deployments = readdirSync(root).filter(name => name.startsWith('hugegraph-servers.'));
  assert.equal(deployments.length, 2);
  for (const deployment of deployments) {
    for (const dir of [top, 'hugegraph_https']) {
      assert.equal(readFileSync(join(root, deployment, dir, 'started-with-jvm'), 'utf8'), '/fixture/java11');
    }
  }
});

for (const scenario of [
  { name: 'another commit', commit: 'b'.repeat(40), error: /provenance mismatch/ },
  { name: 'another repository', repository: 'example/other', error: /provenance mismatch/ },
  { name: 'a missing stamp', mutate: cache => rmSync(join(cache, 'server-provenance')),
    error: /missing provenance/ },
  { name: 'a tampered archive', mutate: cache => writeFileSync(join(cache, 'apache-hugegraph-fixture.tar.gz'),
    'modified archive'), error: /provenance mismatch/ },
  { name: 'multiple cached archives', mutate: cache => writeFileSync(join(cache, 'apache-hugegraph-other.tar.gz'),
    'another archive'), error: /exactly one regular server archive/ },
  { name: 'extra provenance data', mutate: cache => writeFileSync(join(cache, 'server-provenance'),
    readFileSync(join(cache, 'server-provenance'), 'utf8') + 'unexpected'), error: /provenance mismatch/ },
  { name: 'binary provenance data', mutate: cache => writeFileSync(join(cache, 'server-provenance'),
    readFileSync(join(cache, 'server-provenance'), 'utf8').replace('example/server', 'example/\0server')),
    error: /provenance mismatch/ },
  { name: 'executable metadata', mutate: cache => writeFileSync(join(cache, 'server-provenance'),
    '$(touch should-not-exist)\n' + 'a'.repeat(40) + '\napache-hugegraph-fixture.tar.gz\n' + '0'.repeat(64) + '\n'),
    error: /provenance mismatch/ }
]) {
  test(`Loader rejects ${scenario.name} without altering the custom cache or starting a server`, t => {
    const root = temp(t);
    const cache = join(root, 'cache');
    mkdirSync(cache);
    writeFileSync(join(cache, 'apache-hugegraph-fixture.tar.gz'), 'original archive');
    writeFileSync(join(cache, 'unrelated-file'), 'preserve this file');
    cacheStamp(cache, 'example/server', 'a'.repeat(40), 'apache-hugegraph-fixture.tar.gz');
    if (scenario.mutate) scenario.mutate(cache);
    const files = readdirSync(cache).map(name => [name, readFileSync(join(cache, name), 'utf8')]);
    const installer = join(__dirname, '../../../hugegraph-loader/assembly/travis/install-hugegraph-from-source.sh');
    const result = spawnSync('bash', [installer, scenario.commit || 'a'.repeat(40)], {
      cwd: root, env: { ...process.env, SERVER_CACHE_DIR: cache,
        SERVER_REPOSITORY: scenario.repository || 'example/server' }, encoding: 'utf8'
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, scenario.error);
    assert.match(result.stderr, /Use a fresh or separate SERVER_CACHE_DIR/);
    assert.deepEqual(readdirSync(cache).map(name => [name, readFileSync(join(cache, name), 'utf8')]), files);
    assert.equal(existsSync(join(root, 'hugegraph')), false);
    assert.equal(existsSync(join(root, 'should-not-exist')), false);
    assert.equal(readdirSync(root).some(name => name.startsWith('hugegraph-servers.')), false);
  });
}
