#!/bin/bash
#
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements. See the NOTICE file distributed with this
# work for additional information regarding copyright ownership. The ASF
# licenses this file to You under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
# WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
# License for the specific language governing permissions and limitations
# under the License.
#
set -euo pipefail

if [[ $# -ne 3 || "$2" != /* || -e "$2" || "$3" != /* || ! -d "$3" || -e "$3/org/apache/hugegraph" ]]; then
    echo "Usage: install-candidate-sdk.sh <commit SHA> <new source directory> <isolated Maven repository>" >&2
    exit 1
fi

if [[ -z "${JAVA_HOME:-}" || ! -x "$JAVA_HOME/bin/java" ]]; then
    echo "Set JAVA_HOME to an installed JDK 17 or newer before building the candidate SDK" >&2
    exit 1
fi
JAVA_VERSION=$("$JAVA_HOME/bin/java" -XshowSettings:properties -version 2>&1 |
    awk -F ' = ' '/java.specification.version =/ {print $2}')
if [[ ! "$JAVA_VERSION" =~ ^[0-9]+$ || "$JAVA_VERSION" -lt 17 ]]; then
    echo "Candidate SDK requires JDK 17 or newer, found: $JAVA_VERSION" >&2
    exit 1
fi
export PATH="$JAVA_HOME/bin:$PATH"

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
SOURCE_DIR=$2
# TODO(apache/hugegraph#3263): temporary pre-merge source; after merge use apache/hugegraph and a verified ASF SHA.
SERVER_REPOSITORY=${SERVER_REPOSITORY:-hugegraph/hugegraph}
SERVER_FETCH_REF=${SERVER_FETCH_REF:-$1}
export SERVER_REPOSITORY SERVER_FETCH_REF
CANDIDATE_REPO=$3
bash "$SCRIPT_DIR/checkout-server.sh" "$1" "$SOURCE_DIR"
# Install the entire locked reactor so Common, Core, PD and Store share one source.
# The fixture installers retain package-only semantics and use another repository.
# Flatten the root too: license metadata rebuilds installed parent models, whose
# raw ${revision} otherwise becomes an invalid artifact request outside the reactor.
(cd "$SOURCE_DIR" && mvn "-Dmaven.repo.local=$CANDIDATE_REPO" \
    org.codehaus.mojo:flatten-maven-plugin:1.2.7:flatten install \
    -Dflatten.mode=resolveCiFriendliesOnly -DupdatePomFile=true \
    -DskipTests -Dmaven.javadoc.skip=true -ntp)
ACTUAL_COMMIT=$(git -C "$SOURCE_DIR" rev-parse HEAD)
python3 - "$SOURCE_DIR" "$CANDIDATE_REPO" "${SERVER_REPOSITORY:-apache/hugegraph}" \
    "$ACTUAL_COMMIT" "$JAVA_HOME" "$JAVA_VERSION" <<'PY_MANIFEST'
import hashlib
import json
import os
import pathlib
import sys
import xml.etree.ElementTree as ET

source, repo, repository, commit, java_home, java_version = sys.argv[1:]
source_root = pathlib.Path(source)
repo = pathlib.Path(repo)
ns = {'m': 'http://maven.apache.org/POM/4.0.0'}
revision = ET.parse(source_root / 'pom.xml').getroot().findtext('m:properties/m:revision', namespaces=ns)
if not revision or '${' in revision:
    raise SystemExit('Candidate source has no concrete root revision')
# Interpret only the known SDK module coordinates from this pinned reactor.
# Parent models are required too: central fallback must not change their dependency management.
required_modules = [
    'pom.xml',
    'hugegraph-commons/pom.xml',
    'hugegraph-server/pom.xml',
    'hugegraph-pd/pom.xml',
    'hugegraph-store/pom.xml',
    'hugegraph-commons/hugegraph-common/pom.xml',
    'hugegraph-server/hugegraph-core/pom.xml',
    'hugegraph-struct/pom.xml',
    'hugegraph-pd/hg-pd-common/pom.xml',
    'hugegraph-pd/hg-pd-client/pom.xml',
    'hugegraph-pd/hg-pd-grpc/pom.xml',
    'hugegraph-store/hg-store-common/pom.xml',
    'hugegraph-store/hg-store-client/pom.xml',
    'hugegraph-store/hg-store-grpc/pom.xml',
]


def locally_installed(path):
    origins = path.parent / '_remote.repositories'
    return origins.is_file() and f'{path.name}>=' in origins.read_text().splitlines()


required = []
for module in required_modules:
    project = ET.parse(source_root / module).getroot()
    group = project.findtext('m:groupId', namespaces=ns) or project.findtext('m:parent/m:groupId', namespaces=ns)
    artifact = project.findtext('m:artifactId', namespaces=ns)
    version = project.findtext('m:version', namespaces=ns) or project.findtext('m:parent/m:version', namespaces=ns)
    packaging = project.findtext('m:packaging', default='jar', namespaces=ns)
    version = (version or '').replace('${revision}', revision)
    if not group or not artifact or not version or '${' in version or packaging not in ('jar', 'pom'):
        raise SystemExit(f'Unsupported required candidate SDK coordinates: {module}')
    directory = repo / group.replace('.', '/') / artifact / version
    files = []
    for extension in (['pom', 'jar'] if packaging == 'jar' else ['pom']):
        path = directory / f'{artifact}-{version}.{extension}'
        if not path.is_file():
            raise SystemExit(f'Missing required candidate SDK artifact: {path}')
        if not locally_installed(path):
            raise SystemExit(f'Required candidate SDK artifact was not locally installed: {path}')
        files.append(str(path.relative_to(repo)))
    required.append({'group_id': group, 'artifact_id': artifact, 'version': version,
                     'packaging': packaging, 'source_pom': module, 'files': files})

artifacts = []
for path in sorted((repo / 'org/apache/hugegraph').rglob('*')):
    if path.suffix not in ('.jar', '.pom'):
        continue
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    artifacts.append({'path': str(path.relative_to(repo)), 'sha256': digest.hexdigest(),
                      'source_reactor_install': locally_installed(path)})
manifest = {'repository': repository, 'commit': commit, 'source_dir': source,
            'fetch_ref': os.environ['SERVER_FETCH_REF'], 'source_revision': revision,
            'java_home': java_home, 'java_version': java_version,
            'required_sdk_modules': required, 'artifacts': artifacts}
(repo / 'candidate-sdk-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
PY_MANIFEST

printf '%s@%s\n' "$SERVER_REPOSITORY" "$ACTUAL_COMMIT" > "$CANDIDATE_REPO/candidate-source.txt"
