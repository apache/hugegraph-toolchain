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

const stylesheet = fs.readFileSync(path.join(__dirname, 'workbench.scss'), 'utf8');

const blockFor = selector => {
    const start = stylesheet.indexOf(selector);
    expect(start).toBeGreaterThan(-1);
    const open = stylesheet.indexOf('{', start);
    let depth = 0;
    for (let index = open; index < stylesheet.length; index += 1) {
        if (stylesheet[index] === '{') {
            depth += 1;
        }
        else if (stylesheet[index] === '}') {
            depth -= 1;
            if (depth === 0) {
                return stylesheet.slice(start, index + 1);
            }
        }
    }
    throw new Error(`Unclosed style block: ${selector}`);
};

test('defines a focus-visible ring contract for discrete workbench controls', () => {
    expect(stylesheet).toContain('--workbench-focus-ring:');
    ['.workbench-navigation {', '.workbench-topbar {', '#workbench-main {',
        '.workbench-login {'].forEach(selector => {
        const block = blockFor(selector);
        expect(block).toContain(':focus-visible');
        expect(block).toContain('box-shadow: var(--workbench-focus-ring)');
    });
});

test('does not erase keyboard focus or show the ring for generic focus', () => {
    expect(stylesheet).not.toMatch(/outline:\s*none/);
    expect(stylesheet).not.toMatch(/(^|[^-]):focus\s*\{[^}]*workbench-focus-ring/s);
    expect(stylesheet).not.toMatch(/(?:input|textarea|select|picker).*:focus-visible/i);
});
