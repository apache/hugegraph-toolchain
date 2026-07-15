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

const isJsonBigNumber = value => {
    return value !== null
        && typeof value === 'object'
        && typeof value.constructor?.isBigNumber === 'function'
        && value.constructor.isBigNumber(value)
        && typeof value.toString === 'function';
};

const projectJsonValue = (value, ancestors = new WeakSet()) => {
    if (typeof value === 'bigint' || isJsonBigNumber(value)) {
        return value.toString();
    }
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (ancestors.has(value)) {
        return '[Circular]';
    }
    ancestors.add(value);
    const projected = Array.isArray(value) ? [] : {};
    Object.keys(value).forEach(key => {
        Object.defineProperty(projected, key, {
            configurable: true,
            enumerable: true,
            value: projectJsonValue(value[key], ancestors),
            writable: true,
        });
    });
    ancestors.delete(value);
    return projected;
};

const getJsonViewContent = jsonView => {
    const projected = projectJsonValue(jsonView?.data ?? []);
    if (projected !== null && typeof projected === 'object') {
        return projected;
    }
    return {value: projected};
};

const getQueryResultStandbyMessage = (t, isQueryMode) => {
    if (isQueryMode === false) {
        return t('analysis.query_result.task_not_started');
    }
    return t('analysis.query_result.not_started');
};

const GRAPH_NODE_LIMIT = 300;
const GRAPH_EDGE_LIMIT = 300;

const getGraphViewLimitStatus = (graphView = {}) => {
    const nodeCount = Array.isArray(graphView.vertices) ? graphView.vertices.length : 0;
    const edgeCount = Array.isArray(graphView.edges) ? graphView.edges.length : 0;
    return {
        nodeCount,
        edgeCount,
        exceeded: nodeCount > GRAPH_NODE_LIMIT || edgeCount > GRAPH_EDGE_LIMIT,
    };
};

export {
    GRAPH_EDGE_LIMIT,
    GRAPH_NODE_LIMIT,
    getGraphViewLimitStatus,
    getJsonViewContent,
    getQueryResultStandbyMessage,
    isJsonBigNumber,
    projectJsonValue,
};
