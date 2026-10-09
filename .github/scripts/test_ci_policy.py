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
import textwrap
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

    def test_go_and_spark_only_plans_keep_runtime_fixtures(self):
        for module, path in [("go", "hugegraph-client-go/client.go"),
                             ("spark", "hugegraph-spark-connector/src/test/Test.scala")]:
            with self.subTest(module=module):
                plan = self.pr_plan([path])
                self.assertEqual([module], plan["selected"])
                self.assertTrue(plan["needsFixture"])
                self.assertTrue(plan[module])

    def test_external_inputs_record_current_go_runtime_without_java_sdk(self):
        workflow = (Path(__file__).resolve().parents[2] / ".github/workflows/ci.yml").read_text()
        script = textwrap.dedent(workflow.split("          python3 - <<'PYINPUTS'\n", 1)[1].split(
            "          PYINPUTS", 1)[0])
        for selected in (["go"], ["spark"], ["hubble"], policy.MODULES["toolchain"], []):
            with self.subTest(selected=selected), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / "scope.json").write_text(json.dumps({"selected": selected}))
                env = dict(os.environ, NEEDS_SERVER=str(bool(selected)).lower(),
                           NEEDS_CURRENT_SERVER=str(bool(set(selected) & {"go", "hubble"})).lower(),
                           SERVER_REPOSITORY="apache/hugegraph", SERVER_COMMIT="released", SERVER_REF="1.7.0",
                           CURRENT_REPOSITORY="apache/hugegraph", CURRENT_COMMIT="locked", CURRENT_REF="locked")
                subprocess.run([os.sys.executable, "-c", script], cwd=root, env=env, check=True)
                inputs = json.loads((root / "inputs.json").read_text())
                self.assertEqual(any(module != "go" for module in selected), "candidateSDK" in inputs)
                self.assertEqual(bool(set(selected) & {"go", "hubble"}), "currentServer" in inputs)
                if "currentServer" in inputs:
                    self.assertEqual("locked", inputs["currentServer"]["commit"])
                    self.assertEqual("17", inputs["currentServer"]["jdk"])
                if selected:
                    self.assertEqual("11", inputs["server"]["jdk"])
                else:
                    self.assertEqual({}, inputs)

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

    def test_hubble_and_go_gates_require_current_and_released_fixtures(self):
        for suite in ("hubble", "go"):
            plan = dict(self.plan(), expected=[suite])
            for producer in ("fixture", "current-fixture"):
                for state in (None, "failure", "cancelled", "skipped"):
                    results = {"plan": {"result": "success"}, suite: {"result": "success"},
                               "fixture": {"result": "success"}, "current-fixture": {"result": "success"}}
                    results[producer] = {"result": state}
                    with self.subTest(suite=suite, producer=producer, state=state), self.assertRaises(ValueError):
                        policy.gate(plan, results)
            results = {"plan": {"result": "success"}, suite: {"result": "success"},
                       "fixture": {"result": "success"}, "current-fixture": {"result": "success"}}
            self.assertEqual([suite], policy.gate(plan, results)["executed"])

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
                       **{"current-fixture": {"result": "success"}})
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
                               **{"current-fixture": {"result": "success"}})
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

    def test_regular_pr_recovers_stale_event_base_with_real_git(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.check_output(["git", *args], cwd=root, text=True).strip()
            git("init", "-q")
            git("config", "user.email", "ci@example.invalid")
            git("config", "user.name", "CI")
            (root / "README.md").write_text("base")
            (root / "hugegraph-hubble").mkdir()
            (root / "hugegraph-hubble/README.md").write_text("packaged docs")
            git("add", ".")
            git("commit", "-qm", "base")
            anchor = git("rev-parse", "HEAD")
            git("checkout", "-qb", "feature")
            (root / "hugegraph-loader").mkdir()
            (root / "hugegraph-loader/A.java").write_text("source")
            git("add", ".")
            git("commit", "-qm", "feature")
            head = git("rev-parse", "HEAD")
            old_merge = git("commit-tree", git("rev-parse", "HEAD^{tree}"),
                            "-p", anchor, "-p", head, "-m", "old merge")
            git("checkout", "-qb", "target", anchor)
            (root / "README.md").write_text("advanced master")
            git("commit", "-qam", "advance target")
            canonical = git("rev-parse", "HEAD")
            git("merge", "--no-ff", "-qm", "current merge", "feature")
            merge = git("rev-parse", "HEAD")
            live = self.live_pr()
            live["head"]["sha"] = head
            live["base"].update(sha=anchor, ref="target")
            event = {"pull_request": json.loads(json.dumps(dict(live, number=7)))}
            live.update(merge_commit_sha=merge)
            ref = {"object": {"type": "commit", "sha": canonical}}
            def fetch(path):
                if path == "repos/apache/t/pulls/7":
                    return live
                self.assertEqual("repos/apache/t/git/ref/heads/target", path)
                return ref
            old = os.getcwd()
            try:
                os.chdir(root)
                # Neither event nor REST snapshot has stack metadata. The real
                # checkout merges the current canonical target with the same head.
                plan = policy.create_plan("toolchain", event, "apache/t", fetch)
                self.assertEqual(canonical, plan["base"])
                self.assertEqual("target", plan["baseBranch"])
                self.assertNotIn("stack", plan)
                self.assertEqual(["hubble", "loader"], plan["selected"])
                results = {suite: {"result": "success"} for suite in plan["expected"]}
                results.update(plan={"result": "success"}, fixture={"result": "success"},
                               **{"current-fixture": {"result": "success"}})
                report = policy.gate(plan, results, fetch)
                self.assertEqual(canonical, report["base"])
                self.assertEqual("target", report["baseBranch"])
                for key, value in [("merge_commit_sha", old_merge),
                                   ("state", "closed"),
                                   ("head", dict(live["head"], sha=anchor)),
                                   ("base", dict(live["base"], ref="other"))]:
                    original = live[key]
                    live[key] = value
                    with self.subTest(field=key), self.assertRaises(policy.StaleInputError):
                        policy.create_plan("toolchain", event, "apache/t", fetch)
                    with self.subTest(gate=key), self.assertRaises(policy.StaleInputError):
                        policy.gate(plan, results, fetch)
                    live[key] = original
                ref["object"]["sha"] = anchor
                with self.assertRaises(policy.StaleInputError):
                    policy.create_plan("toolchain", event, "apache/t", fetch)
                with self.assertRaises(policy.StaleInputError):
                    policy.gate(plan, results, fetch)
                ref["object"]["sha"] = canonical
                # A rerun of an old checkout cannot claim the fresh merge.
                git("checkout", "--detach", "-q", old_merge)
                with self.assertRaises(policy.StaleInputError):
                    policy.gate(plan, results, lambda _: dict(live, head=dict(live["head"], sha=anchor)))
                stale_event = json.loads(json.dumps(event))
                stale_event["pull_request"]["base"]["sha"] = canonical
                with self.assertRaises(policy.StaleInputError):
                    policy.create_plan("toolchain", stale_event, "apache/t", fetch)
            finally:
                os.chdir(old)

    def test_native_stack_canonical_base_and_gate_freshness(self):
        # Reproduce GitHub native stacks: REST base.sha can remain at the old
        # head, while the merge's first parent wraps the actual branch head.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.check_output(["git", *args], cwd=root, text=True).strip()
            git("init", "-q")
            git("config", "user.email", "ci@example.invalid")
            git("config", "user.name", "CI")
            (root / "README.md").write_text("anchor")
            (root / "hugegraph-hubble").mkdir()
            (root / "hugegraph-hubble/README.md").write_text("Hubble")
            git("add", ".")
            git("commit", "-qm", "anchor")
            anchor = git("rev-parse", "HEAD")
            anchor_tree = git("rev-parse", "HEAD^{tree}")
            (root / "hugegraph-client").mkdir()
            (root / "hugegraph-client/A.java").write_text("canonical base")
            git("add", ".")
            git("commit", "-qm", "parent PR")
            canonical = git("rev-parse", "HEAD")
            canonical_tree = git("rev-parse", "HEAD^{tree}")
            (root / "hugegraph-loader").mkdir()
            (root / "hugegraph-loader/A.java").write_text("child PR")
            git("add", ".")
            git("commit", "-qm", "child PR")
            head = git("rev-parse", "HEAD")
            head_tree = git("rev-parse", "HEAD^{tree}")
            virtual = git("commit-tree", canonical_tree, "-p", anchor, "-p", canonical, "-m", "stack parent")
            merge = git("commit-tree", head_tree, "-p", virtual, "-p", head, "-m", "PR merge")
            unrelated = git("commit-tree", anchor_tree, "-m", "unrelated root")
            advanced = git("commit-tree", canonical_tree, "-p", canonical, "-m", "advanced base")
            wrong_tree = git("commit-tree", anchor_tree, "-p", anchor, "-p", canonical, "-m", "wrong tree")
            wrong_parents = git("commit-tree", canonical_tree, "-p", unrelated, "-p", canonical,
                                "-m", "wrong anchor")
            live = self.live_pr()
            live.update(merge_commit_sha=merge, stack={"id": 172, "number": 48, "position": 2, "size": 2,
                                                     "base": {"ref": "prerequisites", "sha": anchor}})
            live["head"]["sha"] = head
            live["base"].update(sha=anchor, ref="candidate")
            event = {"pull_request": json.loads(json.dumps(dict(live, number=7)))}
            ref = {"object": {"type": "commit", "sha": canonical}}
            def fetch(path):
                if path == "repos/apache/t/pulls/7":
                    return live
                self.assertEqual("repos/apache/t/git/ref/heads/candidate", path)
                return ref
            old = os.getcwd()
            try:
                os.chdir(root)
                git("checkout", "--detach", "-q", merge)
                plan = policy.create_plan("toolchain", event, "apache/t", fetch)
                self.assertEqual(canonical, plan["base"])
                self.assertEqual("candidate", plan["baseBranch"])
                self.assertEqual(live["stack"], plan["stack"])
                without_stack = {"pull_request": dict(event["pull_request"])}
                without_stack["pull_request"].pop("stack")
                self.assertEqual(plan["base"], policy.create_plan(
                    "toolchain", without_stack, "apache/t", fetch)["base"])
                # Parent PR changes must not replace the cumulative child diff.
                self.assertEqual(["hubble", "loader"], plan["selected"])
                results = {suite: {"result": "success"} for suite in plan["expected"]}
                results.update(plan={"result": "success"}, fixture={"result": "success"},
                               **{"current-fixture": {"result": "success"}})
                report = policy.gate(plan, results, fetch)
                self.assertEqual(canonical, report["base"])
                self.assertEqual("candidate", report["baseBranch"])
                self.assertEqual(live["stack"], report["stack"])
                # Advisory failures retain the same tested stack identity.
                failed = policy.result_report(plan, {"loader": {"result": "cancelled"}})
                self.assertEqual(canonical, failed["base"])
                self.assertEqual("candidate", failed["baseBranch"])
                self.assertEqual(live["stack"], failed["stack"])
                self.assertEqual("cancelled", failed["results"]["loader"]["result"])
                original = json.loads(json.dumps(live))
                for name in ["missing_stack", "changed_head", "changed_branch", "changed_stack", "changed_merge",
                             "changed_base_ref", "unrelated_anchor"]:
                    live = json.loads(json.dumps(original))
                    if name == "missing_stack":
                        del live["stack"]
                    elif name == "changed_head":
                        live["head"]["sha"] = advanced
                    elif name == "changed_branch":
                        live["head"]["ref"] = "other"
                    elif name == "changed_stack":
                        live["stack"]["id"] += 1
                    elif name == "changed_merge":
                        live["merge_commit_sha"] = advanced
                    elif name == "changed_base_ref":
                        live["base"]["ref"] = "other"
                    else:
                        live["stack"]["base"]["sha"] = unrelated
                    with self.subTest(change=name):
                        with self.assertRaises(policy.StaleInputError):
                            policy.create_plan("toolchain", event, "apache/t", fetch)
                        with self.assertRaises(policy.StaleInputError):
                            policy.gate(plan, results, fetch)
                live = json.loads(json.dumps(original))
                for bad_virtual in [wrong_tree, wrong_parents]:
                    bad_merge = git("commit-tree", head_tree, "-p", bad_virtual, "-p", head, "-m", "bad PR merge")
                    live["merge_commit_sha"] = bad_merge
                    git("checkout", "--detach", "-q", bad_merge)
                    with self.subTest(virtual=bad_virtual), self.assertRaises(policy.StaleInputError):
                        policy.create_plan("toolchain", event, "apache/t", fetch)
                # Even matching API stack metadata cannot authorize an unrelated
                # anchor. Exact parent IDs and tree equality alone are insufficient.
                live = json.loads(json.dumps(original))
                live["stack"]["base"]["sha"] = unrelated
                orphan_merge = git("commit-tree", head_tree, "-p", wrong_parents, "-p", head,
                                   "-m", "unrelated stack")
                live["merge_commit_sha"] = orphan_merge
                orphan_event = {"pull_request": json.loads(json.dumps(dict(live, number=7)))}
                git("checkout", "--detach", "-q", orphan_merge)
                with self.assertRaises(policy.StaleInputError):
                    policy.create_plan("toolchain", orphan_event, "apache/t", fetch)
                live = json.loads(json.dumps(original))
                git("checkout", "--detach", "-q", merge)
                ref["object"]["sha"] = advanced
                with self.assertRaises(policy.StaleInputError):
                    policy.create_plan("toolchain", event, "apache/t", fetch)
                with self.assertRaises(policy.StaleInputError):
                    policy.gate(plan, results, fetch)
                ref["object"].pop("sha")
                with self.assertRaises(policy.StaleInputError):
                    policy.create_plan("toolchain", event, "apache/t", fetch)
                ref["object"]["sha"] = canonical
                calls = []
                def temporarily_malformed_api(path):
                    calls.append(path)
                    if len(calls) == 1:
                        raise json.JSONDecodeError("malformed API JSON", "", 0)
                    return fetch(path)
                # A later healthy gate must never rescue an unverified plan:
                # the transient planner error aborts instead of returning one.
                with self.assertRaises(policy.StaleInputError):
                    policy.create_plan("toolchain", event, "apache/t", temporarily_malformed_api)
                self.assertEqual(1, len(calls))
                recovered = policy.create_plan("toolchain", event, "apache/t", temporarily_malformed_api)
                self.assertEqual(canonical, recovered["base"])
                self.assertEqual(recovered["expected"], policy.gate(
                    recovered, results, temporarily_malformed_api)["executed"])
            finally:
                os.chdir(old)

    def test_push_gate_does_not_query_pr(self):
        plan = dict(self.plan(), pr=0, expected=[], selected=[])
        policy.gate(plan, {"plan": {"result": "success"}},
                    lambda _: self.fail("push gate must not query a PR"))


if __name__ == "__main__":
    unittest.main()
