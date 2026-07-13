/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

import zhCN from '../i18n/resources/zh-CN/modules/pages.json';
import enUS from '../i18n/resources/en-US/modules/pages.json';

test.each([
    [zhCN, 'GraphSpace 名称', '别名 / 备注名', '图名称'],
    [enUS, 'GraphSpace Name', 'Alias / Note', 'Graph Name'],
])('uses user-facing path-name semantics instead of internal IDs', (
    resource, spaceName, displayName, graphName
) => {
    expect(resource.graphspace.form.id).toBe(spaceName);
    expect(resource.graphspace.form.name).toBe(displayName);
    expect(resource.graph.form.name).toBe(graphName);
    expect(resource.graph.form.nickname).toBe(displayName);
    expect(resource.graphspace.card.graph_id).toContain(graphName);
});

test('explains name scope, immutability, and public uses in both languages', () => {
    expect(zhCN.graphspace.form.id_help).toContain('全局唯一');
    expect(zhCN.graphspace.form.id_help).toContain('URL / API / 权限');
    expect(zhCN.graph.form.name_help).toContain('当前 GraphSpace 内唯一');
    expect(zhCN.graph.form.name_help).toContain('不同 GraphSpace 可以同名');
    expect(enUS.graphspace.form.id_help).toContain('globally unique');
    expect(enUS.graph.form.name_help).toContain('unique only within the current GraphSpace');
    expect(enUS.graph.form.name_help).toContain('same name');
});
