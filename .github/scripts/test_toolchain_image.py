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

"""Prevent a tag resolving to an unrelated image from providing runtime evidence."""

import importlib.util
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("images", Path(__file__).with_name("check-toolchain-image.py"))
images = importlib.util.module_from_spec(spec)
spec.loader.exec_module(images)


class RuntimeImageTest(unittest.TestCase):
    def test_rejects_container_using_a_different_image(self):
        with patch.object(images, "output", return_value="sha256:old"):
            with self.assertRaisesRegex(RuntimeError, "expected built image sha256:pr"):
                images.verify_image("hubble", "sha256:pr")

    def test_rejects_empty_build_result(self):
        with patch.object(images, "output", return_value=""):
            with self.assertRaises(RuntimeError):
                images.verify_image("loader", "")

    def test_accepts_built_image(self):
        with patch.object(images, "output", return_value="sha256:pr"):
            images.verify_image("hubble", "sha256:pr")

    def test_requires_application_identity_and_version_not_just_http_success(self):
        for body in [None, [], {}, {"status": 200}, {"status": 200, "data": []},
                     {"status": 200, "data": {"name": "hugegraph-hubble"}},
                     {"status": 401, "data": {"name": "hugegraph-hubble", "version": "3.0"}},
                     {"status": 200, "data": {"name": "other", "version": "3.0"}}]:
            self.assertFalse(images.valid_hubble_about(body), body)
        self.assertTrue(images.valid_hubble_about(
            {"status": 200, "data": {"name": "hugegraph-hubble", "version": "3.0.0"}}))

    def test_hubble_exit_is_not_readiness_success(self):
        with patch.object(images, "output", side_effect=["127.0.0.1:12345", "false"]):
            with self.assertRaisesRegex(RuntimeError, "exited before becoming ready"):
                images.wait_hubble("hubble")

    def test_loader_executes_the_public_script_with_its_permissions_and_shebang(self):
        with tempfile.TemporaryDirectory() as temporary:
            script = Path(temporary) / "bin/hugegraph-loader.sh"
            script.parent.mkdir()
            script.write_text('#!/bin/sh\nprintf "Usage: loader --help\\n"\n')

            def execute(*args):
                self.assertEqual(args[:3], ("docker", "exec", "loader"))
                return subprocess.check_output(args[3:], cwd=temporary, text=True)

            with patch.object(images, "output", side_effect=execute):
                script.chmod(0o755)
                images.check_loader("loader")
                script.chmod(0o644)
                with self.assertRaises(PermissionError):
                    images.check_loader("loader")
                script.chmod(0o755)
                script.write_text('#!/missing/interpreter\nprintf "Usage: loader --help\\n"\n')
                with self.assertRaises(FileNotFoundError):
                    images.check_loader("loader")


class HubbleEntryTest(unittest.TestCase):
    def setUp(self):
        self.routes = {
            "/": ("text/html", '<html><div id="root"></div><script src="/main.js"></script>'
                  '<link rel="stylesheet" href="/main.css"></html>'),
            "/main.js": ("application/javascript", 'document.getElementById("root");'),
            "/main.css": ("text/css", "body { margin: 0; }"),
        }
        self.requested = []
        routes, requested = self.routes, self.requested

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                requested.append(self.path)
                content_type, body = routes.get(self.path, ("text/html", ""))
                if content_type == "redirect":
                    self.send_response(302)
                    self.send_header("Location", body)
                    self.end_headers()
                    return
                self.send_response(200 if self.path in routes else 404)
                self.send_header("Content-Type", content_type)
                self.end_headers()
                self.wfile.write(body.encode())

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.origin = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def test_checks_root_javascript_and_stylesheets(self):
        images.check_hubble_ui(self.origin)
        self.assertEqual(self.requested, ["/", "/main.js", "/main.css"])

    def test_rejects_a_backend_only_page_and_an_unbuilt_template(self):
        for page in ['<html>backend ready</html>', '<div id="root"></div>']:
            self.routes["/"] = ("text/html", page)
            with self.subTest(page=page), self.assertRaises(RuntimeError):
                images.check_hubble_ui(self.origin)

    def test_rejects_missing_assets_including_spa_html_fallback_and_empty_success(self):
        for path in ["/main.js", "/main.css"]:
            original = self.routes[path]
            for content_type, body in [("text/html", self.routes["/"][1]),
                                       (original[0], "  \n"),
                                       (original[0], "<!DOCTYPE html><html>fallback</html>")]:
                self.routes[path] = (content_type, body)
                with self.subTest(path=path, content_type=content_type, body=body), self.assertRaises(RuntimeError):
                    images.check_hubble_ui(self.origin)
            del self.routes[path]
            with self.assertRaises(images.urllib.error.HTTPError):
                images.check_hubble_ui(self.origin)
            self.routes[path] = original

    def test_does_not_fetch_external_scripts(self):
        self.routes["/"] = ("text/html", '<div id="root"></div>'
                            '<script src="https://external.invalid/app.js"></script>')
        with self.assertRaisesRegex(RuntimeError, "missing a local JavaScript bundle"):
            images.check_hubble_ui(self.origin)
        self.assertEqual(self.requested, ["/"])

    def test_does_not_follow_asset_redirects_outside_the_container(self):
        self.routes["/main.js"] = ("redirect", "https://external.invalid/app.js")
        with self.assertRaises(images.urllib.error.HTTPError):
            images.check_hubble_ui(self.origin)
        self.assertEqual(self.requested, ["/", "/main.js"])
