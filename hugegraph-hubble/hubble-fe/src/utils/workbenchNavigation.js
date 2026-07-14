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

const getWorkbenchPageTitleKey = pathname => {
    if (pathname === '/' || /^\/navigation\/?$/.test(pathname)) {
        return 'workbench.page.navigation';
    }
    if (/^\/graphspace\/[^/]+\/schema\/?$/.test(pathname)) {
        return 'workbench.page.schema';
    }
    if (/^\/graphspace\/[^/]+\/graph\/[^/]+\/detail\/?$/.test(pathname)) {
        return 'workbench.page.graph_detail';
    }
    if (/^\/graphspace\/[^/]+\/graph\/[^/]+\/meta\/?$/.test(pathname)) {
        return 'workbench.page.graph_meta';
    }
    if (/^\/graphspace(?:\/[^/]+)?\/?$/.test(pathname)) {
        return 'workbench.page.graphs';
    }
    if (/^\/source\/?$/.test(pathname)) {
        return 'workbench.page.datasource';
    }
    if (/^\/task\/detail\/[^/]+\/?$/.test(pathname)) {
        return 'workbench.page.import_detail';
    }
    if (/^\/task(?:\/edit)?\/?$/.test(pathname)) {
        return 'workbench.page.import';
    }
    if (/^\/gremlin(?:\/[^/]+(?:\/[^/]+)?)?\/?$/.test(pathname)) {
        return 'workbench.page.query';
    }
    if (/^\/algorithms(?:\/[^/]+(?:\/[^/]+)?)?\/?$/.test(pathname)) {
        return 'workbench.page.algorithms';
    }
    if (/^\/asyncTasks\/result\/[^/]+\/[^/]+\/[^/]+\/?$/.test(pathname)) {
        return 'workbench.page.async_result';
    }
    if (/^\/asyncTasks(?:\/[^/]+(?:\/[^/]+)?)?\/?$/.test(pathname)) {
        return 'workbench.page.async_tasks';
    }
    if (/^\/account\/?$/.test(pathname)) {
        return 'workbench.page.account';
    }
    if (/^\/(?:profile|my)\/?$/.test(pathname)) {
        return 'workbench.page.profile';
    }
    if (/^\/operations\/overview\/?$/.test(pathname)) {
        return 'operations.overview';
    }
    if (/^\/operations\/nodes\/[^/]+\/?$/.test(pathname)) {
        return 'operations.node_detail';
    }
    if (/^\/operations\/nodes\/?$/.test(pathname)) {
        return 'operations.nodes';
    }
    return 'workbench.page.not_found';
};

export {getWorkbenchPageTitleKey};
