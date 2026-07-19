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

test('scopes the modal surface contract to the Ant Design portal root', () => {
    const modal = blockFor('.ant-modal-root {');

    expect(modal).toMatch(/\.ant-modal-content\s*\{/);
    expect(modal).toMatch(/border-radius:\s*(?:10|11|12)px/);
    expect(modal).toContain('.ant-modal-mask');
    expect(modal).toContain('box-shadow:');
    expect(modal).toContain('.ant-form-item-required');
    expect(modal).toContain('.ant-form-item-has-error');
    expect(modal).toContain('.ant-input-disabled');
    expect(modal).toContain('.ant-input-number-disabled');
    expect(modal).toContain('.ant-checkbox-wrapper:focus-within');
    expect(modal).toContain('.ant-radio-wrapper:focus-within');
    expect(modal).toContain('.ant-switch:focus-visible');
    expect(modal).toContain(':hover');
    expect(modal).toContain(':focus');
});

test('uses a restrained modal entrance and honors reduced motion', () => {
    const modal = blockFor('.ant-modal-root {');
    const reducedMotion = blockFor('@media (prefers-reduced-motion: reduce) {');

    expect(modal).toContain('opacity: 0');
    expect(modal).toMatch(/translateY\(8px\)\s+scale\(\.985\)/);
    expect(modal).toContain('opacity: 1');
    expect(modal).toContain('translateY(0) scale(1)');
    expect(reducedMotion).toContain('.ant-modal');
    expect(reducedMotion).toContain('transform: none !important');
});
