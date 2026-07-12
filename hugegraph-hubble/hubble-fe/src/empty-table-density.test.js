/*
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

test('uses a responsive centered contract for global table empty states', () => {
    const appCss = fs.readFileSync(path.join(__dirname, 'App.css'), 'utf8');
    const workbenchCss = fs.readFileSync(
        path.join(__dirname, 'styles/workbench.scss'),
        'utf8'
    );
    const emptyRule = appCss.match(
        /\.ant-table-tbody \.ant-empty-normal\s*\{([^}]*)\}/
    )?.[1] || '';

    expect(workbenchCss).toContain(
        '--workbench-table-empty-min-height: clamp('
    );
    expect(emptyRule).toContain(
        'min-height: var(--workbench-table-empty-min-height)'
    );
    expect(emptyRule).toContain('display: flex');
    expect(emptyRule).toContain('justify-content: center');
    expect(emptyRule).toContain('margin: 0');
    expect(emptyRule).not.toMatch(/margin:\s*200px/);
});
