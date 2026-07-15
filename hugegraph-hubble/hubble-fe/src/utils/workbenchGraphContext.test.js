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

import {
    extractWorkbenchGraphContext,
    resolveWorkbenchGraphContext,
    readWorkbenchGraphContext,
    writeWorkbenchGraphContext,
} from './workbenchGraphContext';

describe('workbench graph context contract', () => {
    beforeEach(() => {
        sessionStorage.clear();
        localStorage.clear();
        sessionStorage.setItem('user_', JSON.stringify({
            id: 'alice',
            user_name: 'alice',
        }));
    });

    test.each([
        ['/graphspace/space_a/graph/graph_a/detail', {graphspace: 'space_a', graph: 'graph_a'}],
        ['/graphspace/space_a/graph/graph_a/meta', {graphspace: 'space_a', graph: 'graph_a'}],
        ['/gremlin/space_a/graph_a', {graphspace: 'space_a', graph: 'graph_a'}],
        ['/algorithms/space_a/graph_a', {graphspace: 'space_a', graph: 'graph_a'}],
        ['/asyncTasks/space_a/graph_a', {graphspace: 'space_a', graph: 'graph_a'}],
        [
            '/asyncTasks/result/space_a/graph_a/task_1',
            {graphspace: 'space_a', graph: 'graph_a'},
        ],
        ['/graphspace/space_a/schema', {graphspace: 'space_a'}],
        ['/graphspace/space_a', {graphspace: 'space_a'}],
        ['/navigation', {}],
    ])('extracts context from %s', (pathname, expected) => {
        expect(extractWorkbenchGraphContext(pathname)).toEqual(expected);
    });

    test('route context wins over a stored selection', () => {
        expect(resolveWorkbenchGraphContext({
            pdEnabled: true,
            routeContext: {graphspace: 'route_space', graph: 'route_graph'},
            storedContext: {graphspace: 'saved_space', graph: 'saved_graph'},
        })).toEqual({graphspace: 'route_space', graph: 'route_graph'});
    });

    test('async result route cannot restore a graph from another GraphSpace', () => {
        const routeContext = extractWorkbenchGraphContext(
            '/asyncTasks/result/space_a/graph_a/task_1'
        );
        expect(resolveWorkbenchGraphContext({
            pdEnabled: true,
            routeContext,
            storedContext: {graphspace: 'space_b', graph: 'graph_b'},
        })).toEqual({graphspace: 'space_a', graph: 'graph_a'});
    });

    test('changing graphspace does not reuse a graph from another graphspace', () => {
        expect(resolveWorkbenchGraphContext({
            pdEnabled: true,
            routeContext: {graphspace: 'route_space'},
            storedContext: {graphspace: 'saved_space', graph: 'saved_graph'},
        })).toEqual({graphspace: 'route_space'});
    });

    test('non-PD always fixes graphspace to DEFAULT', () => {
        expect(resolveWorkbenchGraphContext({
            pdEnabled: false,
            routeContext: {graphspace: 'illegal_space', graph: 'graph_a'},
            storedContext: {graphspace: 'saved_space', graph: 'saved_graph'},
        })).toEqual({graphspace: 'DEFAULT'});
    });

    test('non-PD graph list keeps the selected graph in the only graphspace', () => {
        expect(resolveWorkbenchGraphContext({
            pdEnabled: false,
            routeContext: {graphspace: 'DEFAULT'},
            storedContext: {graphspace: 'DEFAULT', graph: 'hugegraph'},
        })).toEqual({graphspace: 'DEFAULT', graph: 'hugegraph'});
    });

    test('persists only a valid graph selection and survives malformed storage', () => {
        const storage = {
            value: '{bad-json',
            getItem: jest.fn(() => storage.value),
            setItem: jest.fn((key, value) => {
                storage.value = value;
            }),
        };

        expect(readWorkbenchGraphContext(storage)).toEqual({});
        writeWorkbenchGraphContext(storage, {graphspace: 'space_a', graph: 'graph_a'});
        expect(readWorkbenchGraphContext(storage)).toEqual({
            graphspace: 'space_a',
            graph: 'graph_a',
        });
        expect(storage.setItem).toHaveBeenCalledTimes(1);
    });

    test('returns false when browser storage rejects writes', () => {
        const storage = {
            setItem: jest.fn(() => {
                throw new Error('storage disabled');
            }),
        };

        expect(writeWorkbenchGraphContext(storage, {graphspace: 'space_a'})).toBe(false);
    });

    test('does not restore another user graph context', () => {
        writeWorkbenchGraphContext(localStorage, {
            graphspace: 'alice_space',
            graph: 'alice_graph',
        });
        sessionStorage.setItem('user_', JSON.stringify({
            id: 'bob',
            user_name: 'bob',
        }));

        expect(readWorkbenchGraphContext(localStorage)).toEqual({});
    });
});
