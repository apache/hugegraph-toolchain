/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs';
import path from 'path';

test('default graph flow handles arrays and owns one actionable error', () => {
    const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
    const defaultFlow = source.slice(
        source.indexOf('const setDefault ='),
        source.indexOf('const handleBack =')
    );

    expect(defaultFlow).toContain('Array.isArray(value)');
    expect(defaultFlow).toContain('defaults.some(defaultGraph => defaultGraph !== graph)');
    expect(defaultFlow).toContain('suppressBusinessErrorToast: true');
    expect(defaultFlow).not.toContain('message.error(res.message)');
});

test('uses a conservative graph-clear contract', () => {
    const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');

    expect(source).toContain('const clearGraph =');
    expect(source).not.toContain('clearSchema');
    expect(source).not.toContain('clearGraphData');
});
