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

import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {compileString} from 'sass';

it('keeps the emphasized interval inline while the help title remains a block', () => {
    const scss = readFileSync(resolve(__dirname, 'index.module.scss'), 'utf8');
    const style = document.createElement('style');
    style.textContent = compileString(scss).css;
    document.head.appendChild(style);
    document.body.innerHTML = '<div class="gremlinAsyncTask"><section class="help">'
        + '<strong>Title</strong><p><span class="refreshHint">Every <strong>5 seconds</strong>'
        + ' refreshes</span></p></section></div>';
    const [title, interval] = document.querySelectorAll('.help strong');
    expect(getComputedStyle(title).display).toBe('block');
    expect(getComputedStyle(interval).display).not.toBe('block');
    expect(getComputedStyle(interval.parentElement).whiteSpace).toBe('nowrap');
    style.remove();
    document.body.innerHTML = '';
});
