#!/bin/bash
#
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
set -euo pipefail

# BSD tar otherwise synthesizes AppleDouble files from macOS extended attributes.
export COPYFILE_DISABLE=1

if [[ $# -ne 2 || ! -d "$1" ]]; then
    echo "Usage: $0 <release-directory> <output.tar.gz>" >&2
    exit 1
fi

release_dir=$1
archive=$2
release_name=$(basename "${release_dir}")
release_parent=$(cd "$(dirname "${release_dir}")" && pwd)
mkdir -p "$(dirname "${archive}")"
archive="$(cd "$(dirname "${archive}")" && pwd)/$(basename "${archive}")"

# A release directory may have been run locally. Preserve its databases and
# other runtime files, but never include them in a distributable archive.
tar -czf "${archive}" \
    --exclude='._*' --exclude='*/._*' \
    --exclude="${release_name}/data" \
    --exclude="${release_name}/logs" \
    --exclude="${release_name}/upload-files" \
    --exclude='*.db' --exclude='*.lock' --exclude='*.log' \
    --exclude='*.pid' --exclude='*/pid' \
    -C "${release_parent}" "${release_name}"
