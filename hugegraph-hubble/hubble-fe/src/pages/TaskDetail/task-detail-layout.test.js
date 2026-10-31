/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
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

const component = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
const stylesheet = fs.readFileSync(path.join(__dirname, 'index.module.scss'), 'utf8');

test('allocates stable single-line widths across the task detail table', () => {
    expect(component).toContain('className={style.task_detail_table}');
    expect(component).toContain("scroll={{x: 'max-content'}}");
    expect(component.match(/ellipsis: true/g)?.length).toBe(6);
    expect(component).toContain('width: 240');
    expect(component).not.toContain('width: 400');
    expect(stylesheet).toMatch(
        /\.task_detail_table\s*\{[\s\S]*\.ant-table-cell[\s\S]*white-space:\s*nowrap/
    );
});
