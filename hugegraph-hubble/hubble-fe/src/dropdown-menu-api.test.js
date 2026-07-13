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

const dropdownSources = [
    'pages/Graph/Card.js',
    'pages/GraphSpace/Card.js',
    'modules/analysis/QueryBar/ContentCommon/index.js',
    'modules/component/NewConfig/index.js',
    'modules/component/ExportData/index.js',
];

test('reachable Dropdowns use the Ant Design menu API', () => {
    const offenders = dropdownSources.filter(file => {
        const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
        return /<Dropdown(?:\.Button)?\b[\s\S]*?\boverlay\s*=/u.test(source);
    });

    expect(offenders).toEqual([]);
});
