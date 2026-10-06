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

"""Executable Git fixtures for affected-module selection and current-run gating."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("policy", Path(__file__).with_name("ci-policy.py"))
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


class PolicyTest(unittest.TestCase):
    def live_pr(self):
        return {"state": "open", "head": {"sha": "new", "ref": "feature", "repo": {"full_name": "alice/t"}},
                "base": {"sha": "base", "repo": {"full_name": "apache/t"}}}

    def setUp(self):
        # All tests stay local; successful PR gates query only this current-PR fixture.
        api_mock = patch.object(policy, "api", return_value=self.live_pr())
        self.addCleanup(api_mock.stop)
        self.api_mock = api_mock.start()

    def test_codeql_uses_affected_supported_languages(self):
        cases = [
            (["README.md", "docs/ci.md"], set()),
            (["hugegraph-client-go/client.go"], set()),
            ([".github/workflows/client-go-ci.yml"], set()),
            (["hugegraph-loader/Dockerfile"], set()),
            (["hugegraph-hubble/README.md"], set()),
            ([".github/workflows/image-ci.yml"], set()),
            (["hugegraph-client/src/A.java"], {"java"}),
            (["hugegraph-loader/assembly/static/bin/hugegraph-loader.sh"], {"java"}),
            (["hugegraph-hubble/hubble-fe/src/App.tsx"], {"javascript"}),
            (["hugegraph-hubble/hubble-dist/assembly/static/conf/application.properties"], {"java", "javascript"}),
            ([".github/scripts/helper.py"], {"python"}),
            (["pom.xml"], {"java", "javascript", "python"}),
            ([".mvn/maven.config"], {"java", "javascript", "python"}),
            (["unknown-input"], {"java", "javascript", "python"}),
        ]
        for paths, expected in cases:
            with self.subTest(paths=paths):
                plan = self.pr_plan(paths)
                self.assertEqual(expected, set(json.loads(plan["security_languages"])))
                self.assertEqual(bool(expected), plan["security"])
        self.assertEqual({"java", "javascript", "python"}, policy.scan_languages([]))

    def test_shared_maven_config_selects_dependency_audit_and_consumers(self):
        plan = self.pr_plan([".mvn/maven.config"])
        self.assertTrue(plan["dependency_audit"])
        self.assertEqual(set(policy.MODULES["toolchain"]), set(plan["selected"]))
        self.assertEqual(policy.IMAGES, set(plan["selectedImages"]))
        for path in ["hugegraph-client/pom.xml", ".github/configs/settings.xml"]:
            self.assertTrue(policy.dependency_input(path))
        self.assertFalse(self.pr_plan(["docs/ci.md"])["dependency_audit"])

    def test_failure_summary_is_written_before_advisory_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            summary = Path(directory) / "summary.md"
            with patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": str(summary)}):
                with self.assertRaises(ValueError):
                    policy.gate(self.plan(), {"plan": {"result": "success"},
                                              "client": {"result": "cancelled"}})
            text = summary.read_text()
            self.assertIn("check-license-header", text)
            self.assertIn("| client | No |", text)
            self.assertIn("cancelled", text)

    def test_dependency_expansion(self):
        self.assertEqual({"client", "loader", "tools", "spark", "hubble"},
                         policy.select("toolchain", ["hugegraph-client/src/A.java"]))
        self.assertEqual({"loader", "hubble"}, policy.select("toolchain", ["hugegraph-loader/src/A.java"]))
        self.assertEqual({"server", "pd", "store", "hstore", "cluster"}, policy.select("server", ["hugegraph-server/A.java"]))

    def test_image_selection_is_separate_from_module_dependencies(self):
        for path in ["hugegraph-client/src/A.java", "hugegraph-loader/src/A.java",
                     "hugegraph-hubble/hubble-be/src/main/java/App.java",
                     "hugegraph-hubble/hubble-fe/src/App.js", "docs/ci.md"]:
            self.assertEqual(set(), policy.select_images([path]), path)
        for path, images in [
                ("hugegraph-loader/Dockerfile", {"loader_image"}),
                ("hugegraph-hubble/Dockerfile", {"hubble_image"}),
                (".dockerignore", policy.IMAGES),
                (".github/workflows/image-ci.yml", policy.IMAGES)]:
            self.assertEqual(images, policy.select_images([path]), path)
            self.assertEqual(set(), policy.select("toolchain", [path]), path)

    def test_image_packaging_and_shared_build_inputs(self):
        for path in ["pom.xml", ".mvn/maven.config", "hugegraph-client/pom.xml",
                     "hugegraph-dist/release-docs/licenses/dependency.txt",
                     "hugegraph-loader/pom.xml", "hugegraph-loader/assembly/descriptor/assembly.xml",
                     "hugegraph-loader/assembly/static/bin/hugegraph-loader.sh",
                     "hugegraph-loader/README_CN.md", ".github/scripts/new-input.py"]:
            self.assertEqual(policy.IMAGES, policy.select_images([path]), path)
        for path in ["hugegraph-hubble/pom.xml", "hugegraph-hubble/hubble-be/pom.xml",
                     "hugegraph-hubble/hubble-dist/assembly/static/conf/hugegraph-hubble.properties",
                     "hugegraph-hubble/hubble-dist/assembly/descriptor/assembly.xml",
                     "hugegraph-hubble/hubble-dist/assembly/travis/check-hubble-dist.sh",
                     "hugegraph-hubble/hubble-fe/yarn.lock", "hugegraph-hubble/README.md",
                     "hugegraph-hubble/hubble-be/src/main/resources/application.properties"]:
            self.assertEqual({"hubble_image"}, policy.select_images([path]), path)

    def test_server_backend_and_startup_dependents(self):
        selected = policy.select("server", ["hugegraph-server/hugegraph-hstore/src/test/HstoreTableTest.java"])
        self.assertIn("hstore", selected)
        self.assertIn("pd_store", policy.suites("server", selected))
        selected = policy.select("server", ["hugegraph-server/hugegraph-dist/src/assembly/travis/test-start-hugegraph-pd.sh"])
        self.assertIn("pd_store", policy.suites("server", selected))
        self.assertIn("docker", selected)
        for module in ["hugegraph-core", "hugegraph-api", "hugegraph-test"]:
            selected = policy.select("server", [f"hugegraph-server/{module}/src/main/A.java"])
            self.assertIn("hstore", selected)
            self.assertIn("server", selected)
        self.assertEqual(set(), policy.select("server", ["hugegraph-server/hugegraph-hstore/README.md"]))
        self.assertIn("hstore", policy.select("server", ["hugegraph-server/hugegraph-rocksdb/src/main/A.java"]))

    def test_audited_consumer_edges(self):
        expected = {"server", "pd", "store", "hstore", "cluster"}
        for path in ["hugegraph-server/hugegraph-hstore/src/A.java", "hugegraph-server/hugegraph-rocksdb/A.java"]:
            self.assertTrue(expected.issubset(policy.select("server", [path])))
            self.assertNotIn("helm", policy.select("server", [path]))
        self.assertEqual(set(policy.MODULES["server"]), policy.select("server", [".github/workflows/server-ci.yml"]))
        self.assertTrue({"commons", "docker"}.issubset(policy.select("server", [
            "hugegraph-commons/hugegraph-common/src/main/resources/version.properties"])))
        self.assertIn("go", policy.select("toolchain", ["hugegraph-client/assembly/travis/start-hugegraph-servers.sh"]))
        self.assertNotIn("go", policy.select("toolchain", ["hugegraph-client/src/A.java"]))
        self.assertNotIn("server", policy.select("server", ["hugegraph-pd/src/A.java"]))
        self.assertTrue({"store", "docker"}.issubset(policy.select("server", [
            "hugegraph-store/hg-store-dist/src/assembly/static/bin/util.sh"])))

    def test_version_resource_follows_real_docker_consumer(self):
        root = Path(__file__).resolve().parents[2]
        consumer = root / ".github/workflows/docker-build-ci.yml"
        if not consumer.exists():
            self.skipTest("Server Docker consumer is not in the Toolchain repository")
        resource = next(line.strip().rstrip(")") for line in consumer.read_text().splitlines()
                        if line.strip().startswith("hugegraph-commons/") and "version.properties" in line)
        self.assertTrue((root / resource).is_file())
        self.assertTrue({"commons", "docker"}.issubset(policy.select("server", [resource])))

    def test_single_workflow_has_no_global_fanout(self):
        self.assertEqual({"hubble"}, policy.select("toolchain", [".github/workflows/hubble-ci.yml"]))
        self.assertEqual({"docker"}, policy.select("server", [".github/workflows/docker-build-ci.yml"]))

    def test_unknown_and_proto_fail_conservative(self):
        for path in ["pom.xml", ".github/scripts/new.py", "hugegraph-pd/api.proto", "mystery"]:
            self.assertEqual(set(policy.MODULES["server"]), policy.select("server", [path]))

    def test_strict_docs_allowlist(self):
        self.assertEqual(set(), policy.select("server", ["README.md", "docs/guide.md"]))
        for path in ["hugegraph-client/src/test/resources/README.md", "docs/type.ts", "docs/config.yml", "docs/example.java", "hugegraph-server/type.ts"]:
            self.assertTrue(policy.select("server", [path]))


    def plan(self):
        return {"schema": 1, "project": "toolchain", "repository": "apache/t", "pr": 7,
                "source": "alice/t", "branch": "feature", "base": "base", "head": "new",
                "testedMergeSHA": "merge", "expected": ["client"], "selected": ["client"],
                "externalInputs": {"toolchainJDK": ["11", "17"]}}

    def pr_plan(self, paths):
        live = self.live_pr()
        event = {"pull_request": dict(live, number=7)}
        def git(*args):
            if args[0] == "show":
                return "base new"
            if args[0] == "diff":
                return "\n".join(paths)
            return "merge"
        def fetch(path):
            self.assertEqual("repos/apache/t/pulls/7", path)
            return live
        with patch.object(policy, "git", side_effect=git), patch.object(
                policy, "unsafe_documentation", return_value=False), patch.object(
                policy, "packaged_readme_state", return_value="valid"):
            return policy.create_plan("toolchain", event, "apache/t", fetch)

    def test_cumulative_pr_docs_update_runs_affected_consumers_again(self):
        for document in ["README.md", "hugegraph-hubble/README.md"]:
            with self.subTest(document=document):
                plan = self.pr_plan(["hugegraph-client/src/A.java", document])
                self.assertEqual({"client", "loader", "tools", "spark", "hubble"}, set(plan["selected"]))
                self.assertTrue(plan["needsFixture"])
                self.assertTrue(all(plan[module] for module in plan["selected"]))
                self.assertEqual(document.startswith("hugegraph-hubble/"), plan["hubble_image"])

    def test_pure_documentation_pr_has_no_modules_or_fixtures(self):
        plan = self.pr_plan(["README.md", "docs/ci.md"])
        self.assertEqual([], plan["expected"])
        self.assertFalse(plan["needsFixture"])
        policy.gate(plan, {"plan": {"result": "success"}})

    def test_packaged_readme_selects_image_on_plain_documentation_pr(self):
        plan = self.pr_plan(["hugegraph-hubble/README.md"])
        self.assertEqual(["hubble_image"], plan["expected"])
        self.assertFalse(plan["needsFixture"])

    def test_image_only_plan_and_gate_require_no_server_fixture(self):
        plan = self.pr_plan(["hugegraph-loader/Dockerfile"])
        self.assertEqual(["loader_image"], plan["expected"])
        self.assertFalse(plan["needsFixture"])
        results = {"plan": {"result": "success"}, "loader_image": {"result": "success"}}
        self.assertEqual(["loader_image"], policy.gate(plan, results)["executed"])
        for state in [None, "skipped", "cancelled", "failure"]:
            results["loader_image"]["result"] = state
            with self.subTest(state=state), self.assertRaises(ValueError):
                policy.gate(plan, results)

    def test_gate_rejects_missing_failed_cancelled_skipped(self):
        for result in [None, "failure", "cancelled", "skipped"]:
            with self.subTest(result=result), self.assertRaises(ValueError):
                policy.gate(self.plan(), {"plan": {"result": "success"}, "client": {"result": result},
                                          "fixture": {"result": "success"}})

    def test_gate_records_current_attempt_without_external_proof(self):
        results = {"plan": {"result": "success"}, "client": {"result": "success"},
                   "fixture": {"result": "success"}}
        with patch.dict(os.environ, {"GITHUB_RUN_ID": "42", "GITHUB_RUN_ATTEMPT": "2"}), patch.object(
                policy, "api", return_value=self.live_pr()) as fetch:
            report = policy.gate(self.plan(), results)
            fetch.assert_called_once_with("repos/apache/t/pulls/7")
        self.assertEqual(["client"], report["executed"])
        self.assertEqual(results, report["results"])
        self.assertEqual(42, report["runID"])
        self.assertEqual(2, report["runAttempt"])

    def test_old_receipt_cannot_satisfy_current_selected_failure(self):
        plan = dict(self.plan(), reused={"client": {"runID": 41, "jobIDs": [123]}})
        for state in ["failure", "skipped"]:
            with self.subTest(state=state), self.assertRaises(ValueError):
                policy.gate(plan, {"plan": {"result": "success"}, "client": {"result": state},
                                   "fixture": {"result": "success"}})

    def test_incomplete_pr_event_never_becomes_a_push_plan(self):
        event = {"pull_request": dict(self.live_pr(), number=7)}
        cases = []
        for change in ("null_repo", "missing_repo", "missing_number", "empty_ref"):
            altered = json.loads(json.dumps(event))
            pr = altered["pull_request"]
            if change == "null_repo":
                pr["head"]["repo"] = None
            elif change == "missing_repo":
                del pr["head"]["repo"]
            elif change == "missing_number":
                del pr["number"]
            else:
                pr["head"]["ref"] = ""
            cases.append(altered)
        cases.extend([{"pull_request": {}}, {"pull_request": None}])
        with patch.object(policy, "git", return_value="merge"):
            for altered in cases:
                with self.subTest(event=altered), self.assertRaises(policy.StaleInputError):
                    policy.create_plan('toolchain', altered, 'apache/t',
                                       lambda _: self.fail("Incomplete identity must fail before any API query"))

    def test_gate_refuses_failed_planner_even_empty_selection(self):
        for result in ["failure", "skipped", "cancelled", None]:
            plan = dict(self.plan(), expected=[])
            with self.subTest(result=result), self.assertRaises(ValueError):
                policy.gate(plan, {"plan": {"result": result}})

    def test_fixture_missing_rejects_successful_test(self):
        with self.assertRaises(ValueError):
            policy.gate(self.plan(), {"plan": {"result": "success"}, "client": {"result": "success"}})

    def test_hubble_gate_requires_current_and_released_fixtures(self):
        plan = dict(self.plan(), expected=["hubble"])
        for producer in ("fixture", "hubble-fixture"):
            for state in (None, "failure", "cancelled", "skipped"):
                results = {"plan": {"result": "success"}, "hubble": {"result": "success"},
                           "fixture": {"result": "success"}, "hubble-fixture": {"result": "success"}}
                results[producer] = {"result": state}
                with self.subTest(producer=producer, state=state), self.assertRaises(ValueError):
                    policy.gate(plan, results)

    def test_real_git_doc_modes_and_packaged_readme_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.check_output(["git", *args], cwd=root, text=True).strip()
            git("init", "-q")
            git("config", "user.email", "ci@example.invalid")
            git("config", "user.name", "CI")
            (root / "README.md").write_text("initial")
            (root / "hugegraph-hubble").mkdir()
            readme = root / "hugegraph-hubble/README.md"
            readme.write_text("nonempty docs")
            git("add", ".")
            git("commit", "-qm", "base")
            base = git("rev-parse", "HEAD")
            old = os.getcwd()
            try:
                os.chdir(root)
                self.assertEqual("valid", policy.packaged_readme_state("HEAD"))
                for content in ["changed docs", "", "  \t\n"]:
                    readme.write_text(content)
                    git("commit", "-qam", "docs")
                    self.assertEqual(content.strip() != "", policy.packaged_readme_state("HEAD") == "valid")
                readme.write_text("nonempty")
                readme.chmod(0o755)
                git("add", ".")
                git("commit", "-qm", "executable docs")
                self.assertTrue(policy.unsafe_documentation("HEAD", ["hugegraph-hubble/README.md"]))
                self.assertNotEqual("valid", policy.packaged_readme_state("HEAD"))
                readme.unlink()
                readme.symlink_to("missing-target")
                git("add", ".")
                git("commit", "-qm", "symlink docs")
                self.assertTrue(policy.unsafe_documentation("HEAD", ["hugegraph-hubble/README.md"]))
                self.assertNotEqual("valid", policy.packaged_readme_state("HEAD"))
                readme.unlink()
                git("add", ".")
                git("commit", "-qm", "deleted docs")
                self.assertEqual("missing", policy.packaged_readme_state("HEAD"))
            finally:
                os.chdir(old)
            event = root / "event.json"
            event.write_text(json.dumps({"before": base}))
            output = root / "output"
            subprocess.run(["python3", str(Path(policy.__file__).resolve()), "plan", "--project", "toolchain",
                            "--repository", "apache/t", "--event-path", str(event),
                            "--output", str(root / "plan.json")], cwd=root, check=True,
                           env={**os.environ, "GITHUB_OUTPUT": str(output)})
            self.assertIn("client=true\n", output.read_text())
            plan = json.loads((root / "plan.json").read_text())
            self.assertEqual(set(policy.MODULES["toolchain"]), set(plan["selected"]))
            self.assertEqual({"hubble_image"}, set(plan["selectedImages"]))

    def test_api_failure_runs_full_required_without_losing_pr_identity(self):
        event = {"pull_request": dict(self.live_pr(), number=7)}
        def git(*args):
            return "base new" if args[0] == "show" else "merge"
        def fail(path):
            raise subprocess.CalledProcessError(1, "gh")
        with patch.object(policy, "git", side_effect=git):
            plan = policy.create_plan("toolchain", event, "apache/t", fail)
        self.assertEqual(set(policy.MODULES["toolchain"]), set(plan["selected"]))
        self.assertEqual((7, "alice/t", "feature", "base", "new"),
                         tuple(plan[key] for key in ["pr", "source", "branch", "base", "head"]))
        results = {suite: {"result": "success"} for suite in plan["expected"]}
        results.update(plan={"result": "success"}, fixture={"result": "success"},
                       **{"hubble-fixture": {"result": "success"}})
        with self.assertRaises(subprocess.CalledProcessError):
            policy.gate(plan, results, fail)
        self.assertEqual(plan["expected"], policy.gate(plan, results)["executed"])
        self.api_mock.assert_called_once_with("repos/apache/t/pulls/7")

    def test_real_pr_git_snapshot_and_final_gate_freshness(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.check_output(["git", *args], cwd=root, text=True).strip()
            git("init", "-q")
            git("config", "user.email", "ci@example.invalid")
            git("config", "user.name", "CI")
            (root / "README.md").write_text("base")
            git("add", ".")
            git("commit", "-qm", "base")
            base = git("rev-parse", "HEAD")
            git("checkout", "-qb", "feature")
            (root / "hugegraph-client").mkdir()
            (root / "hugegraph-client/A.java").write_text("source")
            git("add", ".")
            git("commit", "-qm", "source")
            head = git("rev-parse", "HEAD")
            tree = git("rev-parse", "HEAD^{tree}")
            merge = git("commit-tree", tree, "-p", base, "-p", head, "-m", "PR merge")
            advanced_head = git("commit-tree", tree, "-p", head, "-m", "new source head")
            advanced_base = git("commit-tree", git("rev-parse", base + "^{tree}"),
                                "-p", base, "-m", "new target base")
            git("checkout", "--detach", "-q", merge)
            live = self.live_pr()
            live["head"]["sha"], live["base"]["sha"] = head, base
            event = {"pull_request": dict(live, number=7)}
            old = os.getcwd()
            try:
                os.chdir(root)
                plan = policy.create_plan("toolchain", event, "apache/t", lambda _: live)
                results = {suite: {"result": "success"} for suite in plan["expected"]}
                results.update(plan={"result": "success"}, fixture={"result": "success"},
                               **{"hubble-fixture": {"result": "success"}})
                self.assertEqual(plan["expected"], policy.gate(plan, results, lambda _: live)["executed"])
                for section, field, value in [("head", "sha", advanced_head),
                                              ("head", "ref", "other-branch"),
                                              ("head", "repo", {"full_name": "other/fork"}),
                                              ("base", "repo", {"full_name": "other/target"})]:
                    changed = dict(live, **{section: dict(live[section], **{field: value})})
                    with self.subTest(section=section, field=field):
                        with self.assertRaises(policy.StaleInputError):
                            policy.create_plan("toolchain", event, "apache/t", lambda _: changed)
                        with self.assertRaises(policy.StaleInputError):
                            policy.gate(plan, results, lambda _: changed)
                changed_base = dict(live, base=dict(live["base"], sha=advanced_base))
                self.assertEqual(plan["expected"], policy.create_plan(
                    "toolchain", event, "apache/t", lambda _: changed_base)["expected"])
                self.assertEqual(plan["expected"], policy.gate(plan, results, lambda _: changed_base)["executed"])
                with self.assertRaises(policy.StaleInputError):
                    policy.gate(plan, results, lambda _: dict(live, state="closed"))
                git("checkout", "--detach", "-q", head)
                with self.assertRaises(policy.StaleInputError):
                    policy.create_plan("toolchain", event, "apache/t", lambda _: live)
            finally:
                os.chdir(old)

    def test_push_gate_does_not_query_pr(self):
        plan = dict(self.plan(), pr=0, expected=[], selected=[])
        policy.gate(plan, {"plan": {"result": "success"}},
                    lambda _: self.fail("push gate must not query a PR"))


if __name__ == "__main__":
    unittest.main()
