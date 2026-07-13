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

// const hint = [
//     'g',
//     'graph',
//     'out', 'int', 'both', 'outE', 'inE', 'bothE', 'outV', 'inV', 'bothV', 'otherV',
//     'hasNext', 'next', 'tryNext', 'toList', 'toSet', 'toBulkSet', 'fill', 'iterate',
//     'addV', 'addE', 'aggregate', 'and', 'as',
//     'barrier', 'branch', 'by',
//     'call', 'cap', 'choose', 'coalesce', 'coin', 'connectedComponent', 'constant', 'count', 'cyclicPath',
//     'dedup', 'drop',
//     'E', 'element', 'elementMap', 'emit', 'explain',
//     'fail', 'filter', 'flatMap', 'fold', 'from',
//     'group', 'groupCount',
//     'has', 'hasLabel', 'hasId', 'hasKey', 'hasValue', 'hasNot',
//     'id', 'identity', 'index', 'inject', 'io', 'is',
//     'key',
//     'label', 'limit', 'local', 'loops',
//     'map', 'match', 'math', 'max', 'mean', 'mergeE', 'mergeV', 'min',
//     'none', 'not',
//     'option', 'optional', 'or', 'order',
//     'pageRank', 'path', 'peerPressure', 'profile', 'project', 'program', 'properties', 'property',
//     'propertiesMap',
//     'range', 'read', 'repeat',
//     'sack', 'sample', 'select', 'shortestPath', 'sideEffect', 'simplePath', 'skip', 'subgraph', 'sum',
//     'tail', 'timeLimit', 'to', 'tree',
//     'unfold', 'union', 'until',
//     'V', 'value', 'valueMap', 'values',
//     'where', 'with', 'write',
// ];

// const highlight = [];

// export {hint, highlight};


const functionCompletion = label => ({
    label,
    type: 'function',
    apply: `${label}()`,
});

const hint = [
    {label: 'g', type: 'constant'},
    {label: 'graph', type: 'constant'},
    functionCompletion('out'),
    functionCompletion('in'),
    functionCompletion('both'),
    {label: 'outE', type: 'function'},
    {label: 'inE', type: 'function'},
    {label: 'bothE', type: 'function'},
    {label: 'outV', type: 'function'},
    {label: 'inV', type: 'function'},
    {label: 'bothV', type: 'function'},
    {label: 'otherV', type: 'function'},
    {label: 'hasNext', type: 'function'},
    {label: 'next', type: 'function'},
    {label: 'tryNext', type: 'function'},
    {label: 'toList', type: 'function'},
    {label: 'toSet', type: 'function'},
    {label: 'toBulkSet', type: 'function'},
    {label: 'fill', type: 'function'},
    {label: 'iterate', type: 'function'},
    {label: 'addV', type: 'function'},
    {label: 'addE', type: 'function'},
    {label: 'aggregate', type: 'function'},
    {label: 'and', type: 'function'},
    {label: 'as', type: 'function'},
    {label: 'barrier', type: 'function'},
    {label: 'branch', type: 'function'},
    {label: 'by', type: 'function'},
    {label: 'call', type: 'function'},
    {label: 'cap', type: 'function'},
    {label: 'choose', type: 'function'},
    {label: 'coalesce', type: 'function'},
    {label: 'coin', type: 'function'},
    {label: 'connectedComponent', type: 'function'},
    {label: 'constant', type: 'function'},
    {label: 'count', type: 'function'},
    {label: 'cyclicPath', type: 'function'},
    {label: 'dedup', type: 'function'},
    {label: 'drop', type: 'function'},
    {label: 'E', type: 'function'},
    {label: 'element', type: 'function'},
    {label: 'elementMap', type: 'function'},
    {label: 'emit', type: 'function'},
    {label: 'explain', type: 'function'},
    {label: 'fail', type: 'function'},
    {label: 'filter', type: 'function'},
    {label: 'flatMap', type: 'function'},
    {label: 'fold', type: 'function'},
    {label: 'from', type: 'function'},
    {label: 'group', type: 'function'},
    {label: 'groupCount', type: 'function'},
    {label: 'has', type: 'function'},
    {label: 'hasLabel', type: 'function'},
    {label: 'hasId', type: 'function'},
    {label: 'hasKey', type: 'function'},
    {label: 'hasValue', type: 'function'},
    {label: 'hasNot', type: 'function'},
    {label: 'id', type: 'function'},
    {label: 'identity', type: 'function'},
    {label: 'index', type: 'function'},
    {label: 'inject', type: 'function'},
    {label: 'io', type: 'function'},
    {label: 'is', type: 'function'},
    {label: 'key', type: 'function'},
    {label: 'label', type: 'function'},
    {label: 'limit', type: 'function'},
    {label: 'local', type: 'function'},
    {label: 'loops', type: 'function'},
    {label: 'map', type: 'function'},
    {label: 'match', type: 'function'},
    {label: 'math', type: 'function'},
    {label: 'max', type: 'function'},
    {label: 'mean', type: 'function'},
    {label: 'mergeE', type: 'function'},
    {label: 'mergeV', type: 'function'},
    {label: 'min', type: 'function'},
    {label: 'none', type: 'function'},
    {label: 'not', type: 'function'},
    {label: 'option', type: 'function'},
    {label: 'optional', type: 'function'},
    {label: 'or', type: 'function'},
    {label: 'order', type: 'function'},
    {label: 'pageRank', type: 'function'},
    {label: 'path', type: 'function'},
    {label: 'peerPressure', type: 'function'},
    {label: 'profile', type: 'function'},
    {label: 'project', type: 'function'},
    {label: 'program', type: 'function'},
    {label: 'properties', type: 'function'},
    {label: 'property', type: 'function'},
    {label: 'propertiesMap', type: 'function'},
    {label: 'range', type: 'function'},
    {label: 'read', type: 'function'},
    {label: 'repeat', type: 'function'},
    {label: 'sack', type: 'function'},
    {label: 'sample', type: 'function'},
    {label: 'select', type: 'function'},
    {label: 'shortestPath', type: 'function'},
    {label: 'sideEffect', type: 'function'},
    {label: 'simplePath', type: 'function'},
    {label: 'skip', type: 'function'},
    {label: 'subgraph', type: 'function'},
    {label: 'sum', type: 'function'},
    {label: 'tail', type: 'function'},
    {label: 'timeLimit', type: 'function'},
    {label: 'to', type: 'function'},
    {label: 'tree', type: 'function'},
    {label: 'unfold', type: 'function'},
    {label: 'union', type: 'function'},
    {label: 'until', type: 'function'},
    {label: 'V', type: 'function'},
    {label: 'value', type: 'function'},
    {label: 'valueMap', type: 'function'},
    {label: 'values', type: 'function'},
    {label: 'where', type: 'function'},
    {label: 'with', type: 'function'},
    {label: 'write', type: 'function'},
];

const highlight = [];
const completionHint = hint.map(item => (
    item.type === 'function' && !item.apply
        ? {...item, apply: `${item.label}()`}
        : item
));

export {completionHint as hint, highlight};
