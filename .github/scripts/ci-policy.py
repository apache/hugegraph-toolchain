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

"""Conservative module selection and truthful advisory CI reports."""

import argparse
import json
import os
import re
from pathlib import Path
import subprocess
from urllib.parse import quote

MODULES = {
    "server": ["server", "commons", "struct", "pd", "store", "hstore", "cluster", "docker", "helm", "dependency_license"],
    "toolchain": ["client", "loader", "tools", "spark", "hubble", "go"],
}
PREFIXES = {
    "server": {"hugegraph-server/": "server", "hugegraph-commons/": "commons",
               "hugegraph-struct/": "struct", "hugegraph-pd/": "pd", "hugegraph-store/": "store",
               "hugegraph-cluster-test/": "cluster", "docker/": "docker", "helm/": "helm"},
    "toolchain": {"hugegraph-client/": "client", "hugegraph-client-go/": "go",
                  "hugegraph-loader/": "loader", "hugegraph-tools/": "tools",
                  "hugegraph-spark-connector/": "spark", "hugegraph-hubble/": "hubble"},
}
WORKFLOWS = {
    "server": {"server-ci.yml": MODULES["server"], "commons-ci.yml": ["commons"],
               "pd-store-ci.yml": ["pd", "store", "hstore"], "cluster-test-ci.yml": ["cluster"],
               "docker-build-ci.yml": ["docker"], "helm-chart-ci.yml": ["helm"],
               "codeql-analysis.yml": [], "riscv64-ci.yml": ["server"], "check-dependencies.yml": ["dependency_license"]},
    "toolchain": {"client-ci.yml": ["client"], "client-go-ci.yml": ["go"],
                  "loader-ci.yml": ["loader"], "tools-ci.yml": ["tools"],
                  "spark-connector-ci.yml": ["spark"], "hubble-ci.yml": ["hubble"],
                  "codeql-analysis.yml": [], "dependency-license.yml": [], "license-checker.yml": []},
}
IMAGES = {"loader_image", "hubble_image"}


DEPENDENTS = {
    "server": {"commons": ["server", "pd", "store", "hstore", "cluster"],
               "struct": ["server", "pd", "store", "hstore", "cluster"],
               "server": ["pd", "store", "hstore", "cluster"], "pd": ["store", "hstore", "cluster"],
               "store": ["hstore", "cluster"], "hstore": ["cluster"]},
    "toolchain": {"client": ["loader", "tools", "spark", "hubble"], "loader": ["hubble"]},
}


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def api(path):
    result = subprocess.run(["gh", "api", "--method", "GET", path], check=True, capture_output=True, timeout=30)
    return json.loads(result.stdout)


def documentation(path, mode="100644"):
    """Only prose and static documentation assets; never source or config."""
    if mode != "100644":
        return False
    p = Path(path)
    prose_names = {"README.md", "README_CN.md", "README_ZH.md", "AGENTS.md"}
    module_roots = {prefix.rstrip("/") for mapping in PREFIXES.values() for prefix in mapping}
    module_roots.update("hugegraph-server/" + module for module in [
        "hugegraph-api", "hugegraph-core", "hugegraph-dist", "hugegraph-example",
        "hugegraph-hbase", "hugegraph-hstore", "hugegraph-rocksdb", "hugegraph-test"])
    if p.name in prose_names and (str(p.parent) == "." or str(p.parent) in module_roots):
        return True
    return path.startswith("docs/") and p.suffix.lower() in {".md", ".rst", ".txt", ".png", ".jpg", ".jpeg", ".svg"}


def unsafe_documentation(ref, paths):
    entries = subprocess.check_output(["git", "ls-tree", "-rz", "--full-tree", ref]).split(b"\0")
    for entry in entries:
        if not entry:
            continue
        metadata, name = entry.split(b"\t", 1)
        path = name.decode("utf-8", "surrogateescape")
        if path in paths and documentation(path) and metadata.split(b" ", 1)[0] != b"100644":
            return True
    return False


def packaged_image_document(path):
    p = Path(path)
    return (str(p.parent) in {"hugegraph-loader", "hugegraph-hubble"}
            and p.name.startswith("README"))


def image_only_path(path):
    return path in {".dockerignore", "hugegraph-loader/Dockerfile", "hugegraph-hubble/Dockerfile",
                    ".github/workflows/image-ci.yml", ".github/scripts/check-toolchain-image.py",
                    ".github/scripts/test_toolchain_image.py"}


def select_images(paths):
    """Image packaging selection is independent of the Java consumer closure."""
    selected = set()
    for path in paths:
        p = Path(path)
        if path == "hugegraph-loader/Dockerfile":
            selected.add("loader_image")
        elif path == "hugegraph-hubble/Dockerfile":
            selected.add("hubble_image")
        elif (path in {"pom.xml", ".dockerignore", "hugegraph-client/pom.xml",
                           "hugegraph-tools/pom.xml", "hugegraph-spark-connector/pom.xml",
                           "hugegraph-dist/pom.xml"}
              or path.startswith((".mvn/", "hugegraph-dist/release-docs/"))):
            selected.update(IMAGES)
        elif path.startswith("hugegraph-loader/") and (
                p.name == "pom.xml" or path.startswith(("hugegraph-loader/assembly/descriptor/",
                                                       "hugegraph-loader/assembly/static/"))
                or packaged_image_document(path) or p.name.startswith(("LICENSE", "NOTICE"))):
            # Hubble's Dockerfile first builds and installs Client and Loader.
            selected.update(IMAGES)
        elif path.startswith("hugegraph-hubble/") and (
                p.name == "pom.xml" or "/assembly/descriptor/" in path or "/assembly/static/" in path
                or packaged_image_document(path)
                or path == "hugegraph-hubble/hubble-dist/assembly/travis/check-hubble-dist.sh"
                or path.startswith(("hugegraph-hubble/.mvn/", "hugegraph-hubble/hubble-fe/scripts/"))
                or (path.startswith("hugegraph-hubble/hubble-be/src/main/resources/")
                    and p.name in {"application.properties", "hugegraph-hubble.properties", "log4j2.xml"})
                or p.name in {"package.json", "yarn.lock", "package-lock.json", "webpack.config.js",
                              "tsconfig.json", "tsconfig.eslint.json", ".yarnrc", ".npmrc",
                              "config-overrides.js", ".babelrc", "babel.config.js"}):
            selected.add("hubble_image")
        elif documentation(path):
            continue
        elif path.startswith(".github/workflows/") and p.name in WORKFLOWS["toolchain"]:
            continue
        elif any(path.startswith(prefix) for prefix in PREFIXES["toolchain"]):
            # Ordinary application/test edits stay on their module behavior lanes.
            continue
        else:
            # Unknown shared inputs (including CI implementation) fail conservative.
            selected.update(IMAGES)
    return selected


def scan_languages(paths):
    """Scan supported sources, keeping unknown/shared build inputs conservative."""
    all_languages = {"java", "javascript", "python"}
    if not paths:
        return all_languages
    languages = set()
    for path in paths:
        p = Path(path)
        if documentation(path) or image_only_path(path):
            continue
        if p.suffix == ".py":
            languages.add("python")
        elif p.suffix in {".js", ".jsx", ".ts", ".tsx", ".cjs", ".mjs"}:
            languages.add("javascript")
        elif p.suffix == ".java":
            languages.add("java")
        elif path.startswith("hugegraph-client-go/"):
            continue  # Go is not a configured CodeQL language in this repository.
        elif path.startswith("hugegraph-hubble/hubble-fe/"):
            languages.add("javascript")
        elif path.startswith("hugegraph-hubble/hubble-be/"):
            languages.add("java")
        elif path.startswith("hugegraph-hubble/"):
            languages.update({"java", "javascript"})
        elif any(path.startswith(prefix) for prefix in (
                "hugegraph-client/", "hugegraph-loader/", "hugegraph-tools/",
                "hugegraph-spark-connector/")):
            languages.add("java")
        elif path.startswith(".github/workflows/") and p.name in WORKFLOWS["toolchain"]:
            modules = WORKFLOWS["toolchain"][p.name]
            if p.name == "codeql-analysis.yml":
                languages.update(all_languages)
            elif "hubble" in modules:
                languages.update({"java", "javascript"})
            elif set(modules) - {"go"}:
                languages.add("java")
        else:
            languages.update(all_languages)
    return languages


def select(project, paths):
    selected = set()
    for path in paths:
        if project == "toolchain" and image_only_path(path):
            continue
        if documentation(path):
            continue
        if project == "server" and (Path(path).name == "pom.xml" or path.startswith("install-dist/")):
            selected.add("dependency_license")
        if path.startswith(".github/workflows/") and Path(path).name in WORKFLOWS[project]:
            selected.update(WORKFLOWS[project][Path(path).name])
            continue
        if path.endswith(".proto"):
            return set(MODULES[project])
        if project == "server" and path == "hugegraph-commons/hugegraph-common/src/main/resources/version.properties":
            selected.update(["commons", "docker"])
            continue
        if project == "server" and path == "hugegraph-store/hg-store-dist/src/assembly/static/bin/util.sh":
            selected.update(["store", "docker"])
            continue
        if project == "toolchain" and path.startswith("hugegraph-client/assembly/travis/"):
            selected.update(["client", "go"])
            continue
        if project == "server":
            if path.startswith("hugegraph-server/hugegraph-hstore/"):
                selected.update(["server", "hstore"])
                continue
            if path.startswith("hugegraph-server/hugegraph-dist/"):
                selected.update(["server", "pd", "store", "hstore", "docker", "cluster"])
                continue
            if path.startswith(("hugegraph-server/hugegraph-core/", "hugegraph-server/hugegraph-api/",
                                "hugegraph-server/hugegraph-test/")):
                selected.update(["server", "hstore"])
                continue
        module = next((value for prefix, value in PREFIXES[project].items() if path.startswith(prefix)), None)
        if module is None or path.endswith(".proto"):
            return set(MODULES[project])
        selected.add(module)
        if project == "server" and ("Dockerfile" in Path(path).name or "docker-entrypoint" in path):
            selected.add("docker")
    changed = True
    while changed:
        before = set(selected)
        for module in before:
            selected.update(DEPENDENTS[project].get(module, []))
        changed = before != selected
    return selected


def packaged_readme_state(ref):
    path = "hugegraph-hubble/README.md"
    entry = git("ls-tree", ref, "--", path)
    if not entry:
        return "missing"
    mode, kind, blob = entry.split("\t", 1)[0].split()
    if mode != "100644" or kind != "blob":
        return "invalid-mode:" + mode + ":" + blob
    content = subprocess.check_output(["git", "cat-file", "blob", blob])
    return "valid" if content.strip() else "empty:" + blob


def suites(project, selected):
    if project == "toolchain":
        return sorted(selected)
    result = []
    if "server" in selected:
        result.extend(["server_memory", "server_rocksdb"])
    for module in ["commons", "cluster", "docker", "helm", "dependency_license"]:
        if module in selected:
            result.append(module)
    if selected.intersection({"pd", "store", "hstore", "struct"}):
        result.append("pd_store")
    return sorted(result)


class StaleInputError(RuntimeError):
    """The checkout no longer represents the current PR inputs."""


def require_current_pr(plan, fetch):
    if not plan["pr"]:
        return
    live = fetch(f"repos/{plan['repository']}/pulls/{plan['pr']}")
    if (live.get("state") != "open" or live["head"]["sha"] != plan["head"]
            or live["head"]["repo"]["full_name"] != plan["source"]
            or live["head"]["ref"] != plan["branch"]
            or live["base"]["repo"]["full_name"] != plan["repository"]):
        raise StaleInputError("PR inputs changed; refresh the branch and start a new PR run")
    if "stack" in plan:
        # Native stacks can leave REST base.sha at an older snapshot. The actual
        # branch ref, rather than that snapshot, identifies the tested base.
        ref = fetch(f"repos/{plan['repository']}/git/ref/heads/{quote(plan['baseBranch'], safe='')}")
        if (live.get("stack") != plan["stack"] or live["base"].get("ref") != plan["baseBranch"]
                or ref.get("object", {}).get("sha") != plan["base"]
                or live.get("merge_commit_sha") != plan["testedMergeSHA"]):
            raise StaleInputError("PR stack or canonical base changed; start a new PR run")


def record_stack_merge(plan, event_pr, parents, fetch):
    """Accept only GitHub's native stack merge of the canonical base tree."""
    try:
        live = fetch(f"repos/{plan['repository']}/pulls/{plan['pr']}")
        stack = live["stack"]
        branch = live["base"]["ref"]
        anchor = stack["base"]["sha"]
        if (type(stack["id"]) is not int or stack["id"] <= 0
                or type(stack["number"]) is not int or stack["number"] <= 0
                or type(stack["position"]) is not int or stack["position"] <= 1
                or type(stack["size"]) is not int or stack["size"] < stack["position"]
                or not stack["base"]["ref"] or not anchor or not branch
                or event_pr["base"]["ref"] != branch
                or ("stack" in event_pr and event_pr["stack"] != stack)
                or live.get("merge_commit_sha") != plan["testedMergeSHA"]
                or len(parents) != 2 or parents[1] != plan["head"]):
            raise StaleInputError("checkout lacks a valid native PR stack merge identity")
        ref = fetch(f"repos/{plan['repository']}/git/ref/heads/{quote(branch, safe='')}")
        canonical = ref["object"]["sha"]
        virtual = parents[0]
        if (ref["object"].get("type") != "commit" or not canonical
                or git("show", "-s", "--format=%P", virtual).split() != [anchor, canonical]
                or git("rev-parse", virtual + "^{tree}") != git("rev-parse", canonical + "^{tree}")
                or git("merge-base", anchor, canonical) != anchor):
            raise StaleInputError("stack virtual parent does not prove the current canonical base")
        plan.update(base=canonical, baseBranch=branch, stack=stack)
        require_current_pr(plan, fetch)
    except (ValueError, KeyError, TypeError, AttributeError, subprocess.SubprocessError, OSError) as error:
        raise StaleInputError("native PR stack identity could not be verified") from error


def create_plan(project, event, repository, fetch=api, external_inputs=None):
    plan = {"schema": 1, "project": project, "repository": repository, "pr": 0,
            "source": repository, "branch": "", "base": "", "head": git("rev-parse", "HEAD"),
            "reason": "affected inputs from the cumulative PR diff",
            "externalInputs": external_inputs or {}, "testedMergeSHA": git("rev-parse", "HEAD")}
    selected_images = set()
    conservative_scan = False
    try:
        pr = event.get("pull_request")
        if "pull_request" in event:
            if not isinstance(pr, dict) or type(pr.get("number")) is not int or pr["number"] <= 0:
                raise StaleInputError("PR event lacks a valid number")
            plan["pr"] = pr["number"]
            # An incomplete PR event must never fall back to a push plan with pr=0.
            try:
                plan.update(source=pr["head"]["repo"]["full_name"], base=pr["base"]["sha"],
                            head=pr["head"]["sha"], branch=pr["head"]["ref"])
            except (KeyError, TypeError) as error:
                raise StaleInputError("PR event lacks required input identity") from error
            if not all(isinstance(plan[key], str) and plan[key] for key in ("source", "base", "head", "branch")):
                raise StaleInputError("PR event has an empty input identity")
            parents = git("show", "-s", "--format=%P", plan["testedMergeSHA"]).split()
            if parents != [plan["base"], plan["head"]]:
                record_stack_merge(plan, pr, parents, fetch)
            else:
                require_current_pr(plan, fetch)
            # head/base objects must exist locally; workflow fetches both before planning.
            ancestor = git("merge-base", plan["base"], plan["head"])
            paths = git("diff", "--no-renames", "--name-only", ancestor, plan["head"]).splitlines()
        else:
            plan["base"] = event.get("before", "")
            paths = git("diff", "--no-renames", "--name-only", plan["base"], plan["head"]).splitlines()
        selected = select(project, paths)
        selected_images = select_images(paths) if project == "toolchain" else set()
        if unsafe_documentation(plan["base"], paths) or unsafe_documentation(plan["testedMergeSHA"], paths):
            selected = set(MODULES[project])
            conservative_scan = True
        if project == "toolchain" and packaged_readme_state(plan["testedMergeSHA"]) != "valid":
            selected = set(MODULES[project])
            conservative_scan = True
    except (subprocess.SubprocessError, OSError, ValueError, KeyError, TypeError, AttributeError):
        selected = set(MODULES[project])
        selected_images = set(IMAGES) if project == "toolchain" else set()
        plan["reason"] = "selection unavailable: full validation coverage"
        conservative_scan = True
    if not selected and not selected_images:
        plan["reason"] = "cumulative PR diff contains only plain prose documentation; modules unaffected"
    plan["selected"] = sorted(selected)
    for module in MODULES[project]:
        plan[module] = module in selected
    plan["expected"] = sorted(suites(project, selected) + list(selected_images))
    plan["selectedImages"] = sorted(selected_images)
    for image in IMAGES:
        plan[image] = image in selected_images
    plan["pd_store"] = any(plan.get(m, False) for m in ["pd", "store", "hstore", "struct"])
    plan["needsFixture"] = project == "toolchain" and any(plan.get(m, False) for m in MODULES[project])
    plan["fixture"] = plan["needsFixture"]
    plan["compatibility"] = project == "server" and bool(selected.intersection({"server", "commons", "struct", "pd", "store", "hstore", "cluster"}))
    paths = locals().get("paths", [])
    plan["changedPaths"] = paths
    plan["selectionReasons"] = {
        suite: [path for path in paths if suite in (suites(project, select(project, [path]))
                                                  + list(select_images([path]) if project == "toolchain" else []))]
        for suite in plan["expected"]
    }
    plan["dependency_audit"] = (not paths or any(dependency_input(path) for path in paths))
    if project == "toolchain" and plan["dependency_audit"]:
        plan["expected"].append("dependency-audit")
        plan["selectionReasons"]["dependency-audit"] = [path for path in paths if dependency_input(path)]
    languages = scan_languages([] if conservative_scan else paths)
    plan["security"] = bool(languages)
    plan["security_languages"] = json.dumps(sorted(languages))
    write_summary(plan)
    return plan


def dependency_input(path):
    return bool(re.search(r"(^|/)(pom\.xml|package\.json|yarn\.lock|package-lock\.json)$|"
                          r"(^|/)(assembly|licenses)/|(^|/)(LICENSE|NOTICE)$|dependency/|"
                          r"^\.mvn/|^\.github/(configs/|workflows/(license-checker|dependency-license)\.yml)", path))


def write_summary(plan, results=None):
    summary = "## Module validation (advisory)\n\n"
    summary += "Required: **check-license-header** only. Module, image and scan results do not block merging.\n\n"
    summary += plan.get("reason", "affected inputs") + "\n\n"
    summary += "| Check | Required | Selection reason | Result |\n| --- | --- | --- | --- |\n"
    for suite in sorted(set(MODULES[plan["project"]]) | IMAGES | {"dependency-audit"}):
        selected = suite in plan["expected"]
        reason = ", ".join(plan.get("selectionReasons", {}).get(suite, [])) or (
            plan.get("reason", "affected inputs") if selected else "unaffected")
        reason = reason.replace("|", "\\|").replace("\n", " ")
        state = results.get(suite, {}).get("result", "missing") if results is not None and selected else (
            "scheduled" if selected else "not selected")
        summary += f"| {suite} | No | {reason} | {state} |\n"
    summary += f"\nTested head: `{plan['head']}`; base: `{plan['base']}`; checkout: `{plan['testedMergeSHA']}`.\n"
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as stream:
            stream.write(summary)


def result_report(plan, results):
    report = {key: plan[key] for key in ["schema", "repository", "project", "pr", "source", "branch", "base",
                                        "head", "testedMergeSHA", "externalInputs"]}
    if "stack" in plan:
        report.update(baseBranch=plan["baseBranch"], stack=plan["stack"])
    report.update(runID=int(os.environ.get("GITHUB_RUN_ID", "0")),
                  runAttempt=int(os.environ.get("GITHUB_RUN_ATTEMPT", "1")),
                  executed=plan["expected"], results=results)
    return report


def gate(plan, results, fetch=None):
    write_summary(plan, results)
    if results.get("plan", {}).get("result") != "success":
        raise ValueError("planner did not succeed")
    for suite in plan["expected"]:
        if results.get(suite, {}).get("result") != "success":
            raise ValueError("selected suite did not succeed: " + suite)
    if plan["project"] == "toolchain":
        if set(plan["expected"]).intersection(MODULES["toolchain"]):
            if results.get("fixture", {}).get("result") != "success":
                raise ValueError("selected tests lack successful fixture")
        if "hubble" in plan["expected"] and results.get("hubble-fixture", {}).get("result") != "success":
            raise ValueError("selected Hubble tests lack successful baseline fixture")
    require_current_pr(plan, fetch or api)
    return result_report(plan, results)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("plan")
    p.add_argument("--project", choices=MODULES, required=True)
    p.add_argument("--event-path", required=True)
    p.add_argument("--repository", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--inputs-json")
    p = sub.add_parser("gate")
    p.add_argument("--plan", required=True)
    p.add_argument("--results", required=True)
    p.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.command == "plan":
        external = json.loads(Path(args.inputs_json).read_text()) if args.inputs_json else None
        value = create_plan(args.project, json.loads(Path(args.event_path).read_text()), args.repository,
                            external_inputs=external)
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
                for key, item in value.items():
                    if isinstance(item, bool):
                        output.write(f"{key}={str(item).lower()}\n")
                output.write(f"security_languages={value['security_languages']}\nplan_file={args.output}\n")
    else:
        plan = json.loads(Path(args.plan).read_text())
        results = json.loads(Path(args.results).read_text())
        # Preserve diagnostic results even when an advisory job fails or is missing.
        Path(args.output).write_text(json.dumps(result_report(plan, results), indent=2) + "\n")
        value = gate(plan, results)
    Path(args.output).write_text(json.dumps(value, indent=2) + "\n")


if __name__ == "__main__":
    main()
