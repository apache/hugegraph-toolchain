#!/usr/bin/env python3
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements. See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Check the failed run again immediately before an automatic retry."""

import argparse
import json
import os
import subprocess
from urllib.parse import quote, urlencode


def api(path):
    result = subprocess.run(
        ["gh", "api", "--method", "GET", path], check=True,
        capture_output=True, text=True,
    )
    return json.loads(result.stdout)


def decide(repository, run_id, expected_attempt, max_reruns, fetch=api):
    run = fetch(f"repos/{repository}/actions/runs/{run_id}")
    if (run.get("status") != "completed" or run.get("conclusion") != "failure"
            or run.get("run_attempt") != expected_attempt):
        return "skip", "source run changed or is no longer a completed failure"
    if expected_attempt > max_reruns:
        return "skip", "retry limit reached"
    sha = run.get("head_sha")
    if not sha:
        return "skip", "missing head SHA"
    if run.get("event") == "pull_request":
        def local(candidate):
            base_repository = candidate.get("base", {}).get("repo", {})
            return (base_repository.get("full_name") == repository
                    or base_repository.get("url") == f"https://api.github.com/repos/{repository}")

        candidates = [pr for pr in run.get("pull_requests", []) if local(pr)]
        if not candidates:
            candidates = [pr for pr in fetch(
                f"repos/{repository}/commits/{quote(sha, safe='')}/pulls") if local(pr)]
        for candidate in candidates:
            number = candidate.get("number")
            if not isinstance(number, int):
                continue
            pr = fetch(f"repos/{repository}/pulls/{number}")
            if (pr.get("base", {}).get("repo", {}).get("full_name") == repository
                    and pr.get("state") == "open" and pr.get("head", {}).get("sha") == sha):
                return "rerun", "open PR head unchanged"
        return "skip", "no open PR in this repository with the failed head"
    if run.get("event") == "push":
        branch = run.get("head_branch")
        if not branch:
            return "skip", "missing push branch"
        # Read from the workflow repository, never a similarly named fork branch.
        commits = fetch(f"repos/{repository}/commits?" + urlencode({"sha": branch, "per_page": 1}))
        if commits and commits[0].get("sha") == sha:
            return "rerun", "push branch head unchanged"
        return "skip", "push branch head moved"
    return "skip", "unsupported source event"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--run-id", required=True, type=int)
    parser.add_argument("--run-attempt", required=True, type=int)
    parser.add_argument("--max-reruns", required=True, type=int)
    args = parser.parse_args()
    try:
        action, reason = decide(args.repository, args.run_id, args.run_attempt, args.max_reruns)
    except (subprocess.SubprocessError, OSError, ValueError, KeyError, TypeError, AttributeError):
        action, reason = "skip", "unable to verify current run and source metadata"
    print(f"{action}: {reason}")
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        output.write(f"action={action}\nreason={reason}\n")


if __name__ == "__main__":
    main()
