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

"""Behavioral tests for push retry freshness, without credentials or network."""
import importlib.util
from pathlib import Path
import unittest
import os
import subprocess
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("check_rerun", Path(__file__).with_name("check-rerun.py"))
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class FreshnessTest(unittest.TestCase):
    def setUp(self):
        self.repository = "hugegraph/hugegraph-toolchain"
        self.run = {"status": "completed", "conclusion": "failure", "run_attempt": 1,
                    "event": "push", "head_sha": "old", "head_branch": "release/test"}
        self.head = "old"
        self.calls = []

    def fetch(self, path):
        self.calls.append(path)
        if "/actions/runs/" in path:
            return self.run
        if "/commits?" in path:
            return [{"sha": self.head}]
        raise AssertionError("unnecessary external lookup: " + path)

    def decide(self):
        return checker.decide(self.repository, 42, 1, 2, self.fetch)[0]

    def test_push_checks_repository_and_encodes_branch(self):
        self.assertEqual("rerun", self.decide())
        self.assertIn(f"repos/{self.repository}/commits?sha=release%2Ftest&per_page=1", self.calls)
        self.head = "new"
        self.assertEqual("skip", self.decide())

    def test_pr_skips_without_pr_or_artifact_queries(self):
        self.run["event"] = "pull_request"
        self.assertEqual("skip", self.decide())
        self.assertEqual([f"repos/{self.repository}/actions/runs/42"], self.calls)

    def test_api_failure_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "output"
            with patch.dict(os.environ, {"GITHUB_OUTPUT": str(output)}), patch(
                    "sys.argv", ["check-rerun.py", "--repository", self.repository,
                                 "--run-id", "42", "--run-attempt", "1", "--max-reruns", "2"]), patch.object(
                    checker, "decide", side_effect=subprocess.CalledProcessError(1, "gh")):
                checker.main()
            self.assertIn("action=skip\n", output.read_text())

    def test_changed_attempt(self):
        self.run["run_attempt"] = 2
        self.assertEqual("skip", self.decide())

    def test_current_run_must_remain_failed_and_completed(self):
        for key, value in (("status", "in_progress"), ("conclusion", "success"),
                           ("conclusion", "cancelled")):
            with self.subTest(key=key, value=value):
                old = self.run[key]
                self.run[key] = value
                self.assertEqual("skip", self.decide())
                self.run[key] = old

    def test_retry_limit(self):
        self.run["run_attempt"] = 2
        self.assertEqual("rerun", checker.decide(self.repository, 42, 2, 2, self.fetch)[0])
        self.run["run_attempt"] = 3
        self.assertEqual("skip", checker.decide(self.repository, 42, 3, 2, self.fetch)[0])

    def test_unsupported_event(self):
        self.run["event"] = "workflow_dispatch"
        self.assertEqual("skip", self.decide())

    def test_missing_metadata(self):
        for key in ["head_sha", "head_branch"]:
            with self.subTest(key=key):
                old = self.run[key]
                self.run[key] = None
                self.assertEqual("skip", self.decide())
                self.run[key] = old


if __name__ == "__main__":
    unittest.main()
