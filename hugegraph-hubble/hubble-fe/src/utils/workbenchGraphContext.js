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

import {DEFAULT_GRAPHSPACE} from './productMode';
import {scopedStorageKey} from './user';

const STORAGE_KEY = 'hubble_workbench_graph_context';

const decodePathPart = value => {
    try {
        return decodeURIComponent(value);
    }
    catch (error) {
        return value;
    }
};

const extractWorkbenchGraphContext = pathname => {
    const asyncResultRoute = pathname.match(
        /^\/asyncTasks\/result\/([^/]+)\/([^/]+)\/[^/]+\/?$/
    );
    if (asyncResultRoute) {
        return {
            graphspace: decodePathPart(asyncResultRoute[1]),
            graph: decodePathPart(asyncResultRoute[2]),
        };
    }

    const graphRoute = pathname.match(
        /^\/graphspace\/([^/]+)\/graph\/([^/]+)\/(?:detail|meta)\/?$/
    );
    if (graphRoute) {
        return {
            graphspace: decodePathPart(graphRoute[1]),
            graph: decodePathPart(graphRoute[2]),
        };
    }

    const analysisRoute = pathname.match(
        /^\/(?:gremlin|algorithms|asyncTasks)\/([^/]+)\/([^/]+)\/?$/
    );
    if (analysisRoute) {
        return {
            graphspace: decodePathPart(analysisRoute[1]),
            graph: decodePathPart(analysisRoute[2]),
        };
    }

    const graphspaceRoute = pathname.match(/^\/graphspace\/([^/]+)(?:\/schema)?\/?$/);
    if (graphspaceRoute) {
        return {graphspace: decodePathPart(graphspaceRoute[1])};
    }

    return {};
};

const resolveWorkbenchGraphContext = ({pdEnabled, routeContext = {}, storedContext = {}}) => {
    if (!pdEnabled) {
        const routeIsDefault = routeContext.graphspace === DEFAULT_GRAPHSPACE;
        const storedIsDefault = storedContext.graphspace === DEFAULT_GRAPHSPACE;
        const graph = routeIsDefault
            ? (routeContext.graph || (storedIsDefault ? storedContext.graph : undefined))
            : (!routeContext.graphspace && storedIsDefault ? storedContext.graph : undefined);

        return graph
            ? {graphspace: DEFAULT_GRAPHSPACE, graph}
            : {graphspace: DEFAULT_GRAPHSPACE};
    }

    if (routeContext.graphspace) {
        const graph = routeContext.graph || (
            routeContext.graphspace === storedContext.graphspace ? storedContext.graph : undefined
        );
        return graph
            ? {graphspace: routeContext.graphspace, graph}
            : {graphspace: routeContext.graphspace};
    }

    if (storedContext.graphspace) {
        return storedContext.graph
            ? {graphspace: storedContext.graphspace, graph: storedContext.graph}
            : {graphspace: storedContext.graphspace};
    }

    return {};
};

const readWorkbenchGraphContext = (storage = localStorage) => {
    try {
        const value = JSON.parse(storage.getItem(scopedStorageKey(STORAGE_KEY)) || '{}');
        if (!value || typeof value.graphspace !== 'string' || !value.graphspace) {
            return {};
        }
        return typeof value.graph === 'string' && value.graph
            ? {graphspace: value.graphspace, graph: value.graph}
            : {graphspace: value.graphspace};
    }
    catch (error) {
        return {};
    }
};

const writeWorkbenchGraphContext = (storage = localStorage, context = {}) => {
    if (typeof context.graphspace !== 'string' || !context.graphspace) {
        return false;
    }
    const value = typeof context.graph === 'string' && context.graph
        ? {graphspace: context.graphspace, graph: context.graph}
        : {graphspace: context.graphspace};
    try {
        storage.setItem(scopedStorageKey(STORAGE_KEY), JSON.stringify(value));
        return true;
    }
    catch (error) {
        return false;
    }
};

const clearWorkbenchGraphContext = (storage = localStorage) => {
    storage.removeItem(scopedStorageKey(STORAGE_KEY));
};

export {
    extractWorkbenchGraphContext,
    resolveWorkbenchGraphContext,
    readWorkbenchGraphContext,
    writeWorkbenchGraphContext,
    clearWorkbenchGraphContext,
};
