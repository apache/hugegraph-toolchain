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

const stylesheet = fs.readFileSync(path.join(__dirname, 'index.module.scss'), 'utf8');

const ruleBody = selector => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return stylesheet.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] || '';
};

it('keeps shortcut hints in a compact top corner overlay outside code flow', () => {
    const contentRule = ruleBody(':global(.cm-content)');
    const shortcutRule = ruleBody('.editorShortcutHints');

    expect(contentRule).not.toMatch(/padding-bottom/);
    expect(contentRule).toMatch(/padding-right:\s*280px/);
    expect(shortcutRule).toMatch(/position:\s*absolute/);
    expect(shortcutRule).toMatch(/top:\s*8px/);
    expect(shortcutRule).toMatch(/right:\s*112px/);
    expect(shortcutRule).not.toMatch(/\bbottom:/);
    expect(shortcutRule).not.toMatch(/\bleft:/);
    expect(shortcutRule).toMatch(/max-width:\s*calc\(100% - 128px\)/);
    expect(shortcutRule).toMatch(/pointer-events:\s*none/);
});
