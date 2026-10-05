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
from pathlib import Path
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
