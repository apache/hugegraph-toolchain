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

module.exports = async function resolve(github, { repository, ref = '', pr = '', expectedCommit = '' }) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repository)) {
    throw new Error('Invalid server repository');
  }
  if (expectedCommit && !/^[0-9a-f]{40}$/i.test(expectedCommit)) {
    throw new Error('Expected commit must be a full SHA');
  }
  if (ref && pr) throw new Error('Select either ref or server-pr-number');
  const [owner, repo] = repository.split('/');
  let sha;
  let fetchRef;
  if (pr) {
    if (!/^[1-9][0-9]*$/.test(pr) || !Number.isSafeInteger(Number(pr))) {
      throw new Error('Invalid server PR number');
    }
    const { data: pull } = await github.rest.pulls.get({ owner, repo, pull_number: Number(pr) });
    sha = pull.head.sha;
    fetchRef = `refs/pull/${pr}/head`;
  } else {
    if (ref) {
      fetchRef = ref;
    } else {
      const { data: release } = await github.rest.repos.getLatestRelease({ owner, repo });
      fetchRef = `refs/tags/${release.tag_name}`;
    }
    // The commits API peels annotated tags, including nested tags, to a commit.
    const { data: commit } = await github.rest.repos.getCommit({ owner, repo, ref: fetchRef });
    sha = commit.sha;
  }
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('Server API returned an invalid commit SHA');
  if (expectedCommit && sha.toLowerCase() !== expectedCommit.toLowerCase()) {
    throw new Error(`Server ref moved: expected ${expectedCommit}, resolved ${sha}`);
  }
  return { sha, fetchRef };
};
