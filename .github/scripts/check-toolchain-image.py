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

"""Build and start the selected Toolchain Dockerfile from this checkout."""

import json
from html.parser import HTMLParser
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.error
from urllib.parse import urljoin, urlparse
import urllib.request


def output(*args):
    return subprocess.check_output(args, text=True, timeout=60).strip()


def verify_image(container, built):
    actual = output("docker", "inspect", "--format", "{{.Image}}", container)
    if not built or actual != built:
        raise RuntimeError(f"Container {container} uses {actual}; expected built image {built}")


def valid_hubble_about(body):
    if not isinstance(body, dict) or body.get("status") != 200:
        return False
    data = body.get("data")
    return (isinstance(data, dict) and data.get("name") == "hugegraph-hubble"
            and isinstance(data.get("version"), str) and bool(data["version"].strip()))


def check_loader(container):
    help_text = output("docker", "exec", container, "./bin/hugegraph-loader.sh", "--help")
    if "--help" not in help_text or "Usage:" not in help_text:
        raise RuntimeError("Loader CLI did not produce its usage contract")


class HubblePage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.has_root = False
        self.scripts = []
        self.styles = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "div" and attrs.get("id") == "root":
            self.has_root = True
        if tag == "script" and attrs.get("src"):
            self.scripts.append(attrs["src"])
        if tag == "link" and "stylesheet" in attrs.get("rel", "").lower().split() and attrs.get("href"):
            self.styles.append(attrs["href"])


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, newurl):
        return None


def check_hubble_ui(origin):
    page_url = origin + "/"
    opener = urllib.request.build_opener(NoRedirect)
    with opener.open(page_url, timeout=5) as response:
        if response.headers.get_content_type() != "text/html":
            raise RuntimeError("Hubble UI did not return HTML")
        page = HubblePage()
        page.feed(response.read().decode("utf-8"))
    if not page.has_root:
        raise RuntimeError("Hubble UI is missing its React root")
    def local(ref):
        parsed = urlparse(urljoin(page_url, ref))
        return (parsed.scheme, parsed.netloc) == (urlparse(origin).scheme, urlparse(origin).netloc)

    scripts = [urljoin(page_url, ref) for ref in page.scripts if local(ref)]
    styles = [urljoin(page_url, ref) for ref in page.styles if local(ref)]
    if not scripts:
        raise RuntimeError("Hubble UI is missing a local JavaScript bundle")
    for resource, types in ([(url, {"text/javascript", "application/javascript", "application/x-javascript"})
                             for url in scripts] + [(url, {"text/css"}) for url in styles]):
        with opener.open(resource, timeout=5) as response:
            body = response.read()
            if response.headers.get_content_type() not in types or not body.strip() or body.lstrip().startswith(b"<"):
                raise RuntimeError("Hubble UI asset is empty or has invalid content: " + resource)


def wait_hubble(container):
    port = output("docker", "port", container, "8088/tcp").splitlines()[0].rsplit(":", 1)[1]
    deadline = time.monotonic() + 120
    last_error = "no response"
    while time.monotonic() < deadline:
        if output("docker", "inspect", "--format", "{{.State.Running}}", container) != "true":
            raise RuntimeError("Hubble exited before becoming ready")
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/about", timeout=5) as response:
                body = json.load(response)
                if valid_hubble_about(body):
                    check_hubble_ui(f"http://127.0.0.1:{port}")
                    return
                last_error = str(body)
        except (OSError, ValueError, urllib.error.HTTPError) as error:
            last_error = str(error)
        time.sleep(2)
    raise RuntimeError("Hubble readiness failed: " + last_error)


def main(module):
    if module not in {"loader", "hubble"}:
        raise ValueError("Select loader or hubble")
    tag = f"hugegraph/{module}:ci-{os.environ['GITHUB_RUN_ID']}-{os.environ['GITHUB_RUN_ATTEMPT']}"
    container = f"hg-{module}-{os.environ['GITHUB_RUN_ID']}-{os.environ['GITHUB_RUN_ATTEMPT']}"
    with tempfile.TemporaryDirectory() as temporary:
        iidfile = Path(temporary) / "image-id"
        subprocess.run(["docker", "build", "--progress=plain", "--iidfile", str(iidfile),
                        "-t", tag, "-f", f"hugegraph-{module}/Dockerfile", "."], check=True, timeout=2400)
        built = iidfile.read_text().strip()
        try:
            args = ["docker", "run", "-d", "--pull", "never", "--name", container]
            if module == "hubble":
                args += ["-p", "127.0.0.1::8088"]
            subprocess.run(args + [tag], check=True, timeout=60)
            verify_image(container, built)
            if module == "loader":
                check_loader(container)
            else:
                wait_hubble(container)
            if output("docker", "inspect", "--format", "{{.State.Running}}", container) != "true":
                raise RuntimeError(f"{module} exited after its runtime check")
        except BaseException:
            subprocess.run(["docker", "logs", "--tail", "200", container], check=False, timeout=30)
            raise
        finally:
            subprocess.run(["docker", "rm", "-f", container], check=False, timeout=60)


if __name__ == "__main__":
    main(sys.argv[1])
