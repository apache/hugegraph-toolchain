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

const roots = [
    'pages/Graph', 'pages/GraphSpace', 'pages/Schema', 'pages/Datasource',
    'pages/Task', 'pages/TaskEdit', 'pages/TaskDetail', 'pages/Meta', 'pages/My',
    'pages/Account', 'pages/Login', 'pages/Error404', 'modules/analysis',
    'modules/algorithm', 'modules/asyncTasks', 'modules/component',
    'components/ColorSelect', 'components/KeyboardAction',
    'components/FormListAction', 'components/RowActionButton',
];

const collectSourceFiles = directory => fs.readdirSync(directory, {withFileTypes: true})
    .flatMap(entry => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            return collectSourceFiles(target);
        }
        return /\.(js|jsx)$/.test(entry.name) && !/\.test\./.test(entry.name)
            ? [target] : [];
    });

const hasDirectIconClick = source => {
    const iconImports = [...source.matchAll(
        /import\s*\{([^}]+)\}\s*from\s*['"]@ant-design\/icons['"]/gs
    )].flatMap(match => match[1].split(',').map(name => name.trim()))
        .filter(name => /^[A-Z][A-Za-z]+(Outlined|Filled|TwoTone)$/.test(name));

    return iconImports.some(iconName => {
        const iconPattern = new RegExp(`<${iconName}\\b[^>]*\\bonClick=[^>]*>`, 'gs');
        return iconPattern.test(source);
    });
};

test('reachable workbench actions do not use click-only anchors or containers', () => {
    const offenders = roots.flatMap(root => collectSourceFiles(path.join(__dirname, root)))
        .filter(file => {
            const source = fs.readFileSync(file, 'utf8');
            if (/<a\b[^>]*\bonClick=/s.test(source)) {
                return true;
            }
            const inaccessibleContainer = [...source.matchAll(
                /<(?:span|div)\b[^>]*\bonClick=[^>]*>/gs
            )]
                .some(match => !/\bonKeyDown=/.test(match[0])
                    || !/\brole=/.test(match[0])
                    || !/\btabIndex=/.test(match[0]));
            return inaccessibleContainer || hasDirectIconClick(source);
        })
        .map(file => path.relative(__dirname, file));

    expect(offenders).toEqual([]);
});

test('task-name columns constrain long values and preserve the full name', () => {
    const taskList = fs.readFileSync(path.join(__dirname, 'pages/Task/index.js'), 'utf8');
    const asyncList = fs.readFileSync(
        path.join(__dirname, 'modules/asyncTasks/Detail/index.js'),
        'utf8'
    );

    [taskList, asyncList].forEach(source => {
        expect(source).toMatch(/dataIndex:\s*['"]task_name['"][\s\S]{0,200}width:\s*\d+/);
        expect(source).toMatch(/ellipsis=\{\{tooltip:\s*task_name\}\}/);
    });
});
