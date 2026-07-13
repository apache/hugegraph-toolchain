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

import {getWorkbenchPageTitleKey} from './workbenchNavigation';

test.each([
    ['/navigation', 'workbench.page.navigation'],
    ['/graphspace', 'workbench.page.graphs'],
    ['/graphspace/DEFAULT/schema', 'workbench.page.schema'],
    ['/graphspace/DEFAULT/graph/hugegraph/detail', 'workbench.page.graph_detail'],
    ['/graphspace/DEFAULT/graph/hugegraph/meta', 'workbench.page.graph_meta'],
    ['/source', 'workbench.page.datasource'],
    ['/task/edit', 'workbench.page.import'],
    ['/task/detail/1', 'workbench.page.import_detail'],
    ['/gremlin/DEFAULT/hugegraph', 'workbench.page.query'],
    ['/algorithms/DEFAULT/hugegraph', 'workbench.page.algorithms'],
    ['/asyncTasks/result/DEFAULT/hugegraph/2', 'workbench.page.async_result'],
    ['/account', 'workbench.page.account'],
    ['/my', 'workbench.page.profile'],
    ['/profile', 'workbench.page.profile'],
    ['/unknown', 'workbench.page.not_found'],
    ['/source-unknown', 'workbench.page.not_found'],
    ['/source/unknown', 'workbench.page.not_found'],
    ['/navigation-old', 'workbench.page.not_found'],
    ['/navigation/old', 'workbench.page.not_found'],
    ['/foo/schema', 'workbench.page.not_found'],
    ['/task/detail', 'workbench.page.not_found'],
    ['/asyncTasks/result', 'workbench.page.async_tasks'],
])('maps %s to %s', (pathname, expected) => {
    expect(getWorkbenchPageTitleKey(pathname)).toBe(expected);
});
