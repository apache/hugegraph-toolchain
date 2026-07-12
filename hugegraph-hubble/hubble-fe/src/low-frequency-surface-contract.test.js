/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

import fs from 'fs';
import path from 'path';

const read = relativePath => fs.readFileSync(path.join(__dirname, relativePath), 'utf8');

test('low-frequency pages use bounded token-based surfaces', () => {
    const profile = read('pages/My/index.module.scss');
    const notFound = read('pages/Error404/index.module.scss');
    const asyncResult = read('modules/asyncTasks/Result/index.module.scss');

    expect(profile).not.toMatch(/width:\s*600px/);
    expect(profile).not.toMatch(/margin-top:\s*60px/);
    expect(profile).toContain('var(--workbench-color-surface)');
    expect(notFound).toContain('var(--workbench-color-surface)');
    expect(asyncResult).toContain('var(--workbench-color-surface)');
});
