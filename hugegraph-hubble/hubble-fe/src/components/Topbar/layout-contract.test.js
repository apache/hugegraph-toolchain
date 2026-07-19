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

const component = fs.readFileSync(path.join(__dirname, 'index.ant.js'), 'utf8');
const stylesheet = fs.readFileSync(path.join(__dirname, 'index.module.scss'), 'utf8');

test('keeps graph context left while centering page context in the viewport', () => {
    expect(component).toContain('className={style.leftContainer}');
    expect(stylesheet).toMatch(/\.header\s*\{[\s\S]*display:\s*grid/);
    expect(stylesheet).toMatch(
        /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\)/
    );
    expect(stylesheet).toMatch(/\.pageContext\s*\{[\s\S]*justify-self:\s*center/);
    expect(stylesheet).toMatch(/\.rightContainer\s*\{[\s\S]*justify-self:\s*end/);
    expect(stylesheet).toMatch(/\.leftContainer\s*\{[\s\S]*grid-column:\s*1/);
    expect(stylesheet).toMatch(/\.pageContext\s*\{[\s\S]*grid-column:\s*2/);
    expect(stylesheet).toMatch(/\.rightContainer\s*\{[\s\S]*grid-column:\s*3/);
});
