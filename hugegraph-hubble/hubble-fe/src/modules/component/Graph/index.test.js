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

import {
    applyGraphDataUpdate,
    preserveNodePositions,
    shouldKeepGraphCanvas,
    shouldRestartGraphLayout,
} from './data';

const data = {
    nodes: [{id: 'a'}, {id: 'b'}],
    edges: [{id: 'a-knows-b', source: 'a', target: 'b'}],
};

test('does not restart layout when a repeated query returns the same topology', () => {
    const repeated = {
        nodes: data.nodes.map(node => ({...node})).reverse(),
        edges: data.edges.map(edge => ({...edge})),
    };

    expect(shouldRestartGraphLayout(data, repeated)).toBe(false);
});

test('restarts layout once when a new query result repeats the same topology', () => {
    const repeated = {
        nodes: data.nodes.map(node => ({...node})),
        edges: data.edges.map(edge => ({...edge})),
    };

    expect(shouldRestartGraphLayout(data, repeated, 1, 2)).toBe(true);
    expect(shouldRestartGraphLayout(repeated, repeated, 2, 2)).toBe(false);
});

test('keeps node coordinates when a repeated query refreshes graph data', () => {
    const graphItems = [
        {getModel: () => ({id: 'a', x: 120, y: 80})},
        {getModel: () => ({id: 'b', x: 360, y: 240})},
    ];

    expect(preserveNodePositions(data, graphItems).nodes).toEqual([
        {id: 'a', x: 120, y: 80},
        {id: 'b', x: 360, y: 240},
    ]);
});

test('runs exactly one explicit layout for each new query result', () => {
    const graph = {
        changeData: jest.fn(),
        updateLayout: jest.fn(),
        getNodes: jest.fn(() => []),
    };
    const repeated = {
        nodes: data.nodes.map(node => ({...node})),
        edges: data.edges.map(edge => ({...edge})),
    };

    expect(applyGraphDataUpdate({
        graph,
        previousData: data,
        nextData: repeated,
        layout: {type: 'force2'},
        previousRevision: 1,
        nextRevision: 2,
    })).toBe(true);
    expect(graph.changeData).toHaveBeenCalledWith(repeated, false);
    expect(graph.updateLayout).toHaveBeenCalledTimes(1);
});

test('preserves dragged positions without relayout for the same result revision', () => {
    const graph = {
        changeData: jest.fn(),
        updateLayout: jest.fn(),
        getNodes: jest.fn(() => [
            {getModel: () => ({id: 'a', x: 120, y: 80})},
            {getModel: () => ({id: 'b', x: 360, y: 240})},
        ]),
    };

    expect(applyGraphDataUpdate({
        graph,
        previousData: data,
        nextData: {...data},
        layout: {type: 'force2'},
        previousRevision: 2,
        nextRevision: 2,
    })).toBe(false);
    expect(graph.changeData.mock.calls[0][0].nodes).toEqual([
        {id: 'a', x: 120, y: 80},
        {id: 'b', x: 360, y: 240},
    ]);
    expect(graph.changeData.mock.calls[0][1]).toBe(false);
    expect(graph.updateLayout).not.toHaveBeenCalled();
});

test('keeps the existing canvas mounted while a repeated query is loading', () => {
    expect(shouldKeepGraphCanvas(true, 'loading', data)).toBe(true);
    expect(shouldKeepGraphCanvas(true, 'loading', {nodes: [], edges: []})).toBe(false);
    expect(shouldKeepGraphCanvas(false, 'loading', data)).toBe(false);
    expect(shouldKeepGraphCanvas(true, 'success', data)).toBe(false);
});
