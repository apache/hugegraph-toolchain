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

jest.mock('@antv/graphin-icons', () => () => ({glyphs: []}));

import {
    formatToDownloadData,
    formatToGraphData,
} from './formatGraphResultData';

const metaData = {
    vertexMeta: [
        {
            name: 'person',
            style: {
                display_fields: ['~id'],
            },
        },
    ],
    edgeMeta: [
        {
            name: 'knows',
            style: {
                display_fields: ['~id'],
            },
        },
    ],
};

test('uses a readable edge label by default without losing the full edge id', () => {
    const graphData = formatToGraphData({
        vertices: [],
        edges: [
            {
                id: 'edge-1',
                label: 'knows',
                source: 'v1',
                target: 'v2',
                properties: {},
            },
        ],
    }, metaData, {});

    expect(graphData.edges[0].id).toBe('edge-1');
    expect(graphData.edges[0].label).toBe('knows');
    expect(graphData.edges[0].rawLabel).toBe('knows');
    expect(graphData.edges[0].itemType).toBe('knows');
    expect(graphData.edges[0].legendType).toBe('knows');
});

test('falls back to the full edge id when the edge label is missing', () => {
    const graphData = formatToGraphData({
        vertices: [],
        edges: [{id: 'edge-1', source: 'v1', target: 'v2', properties: {}}],
    }, metaData, {});

    expect(graphData.edges[0].label).toBe('edge-1');
    expect(graphData.edges[0].id).toBe('edge-1');
});

test('exports raw edge label instead of display label', () => {
    const graphData = formatToGraphData({
        vertices: [],
        edges: [
            {
                id: 'edge-1',
                label: 'knows',
                source: 'v1',
                target: 'v2',
                properties: {since: 2026},
            },
        ],
    }, {
        ...metaData,
        edgeMeta: [
            {
                name: 'knows',
                style: {
                    display_fields: ['since'],
                },
            },
        ],
    }, {});

    expect(graphData.edges[0].label).toBe('2026');
    expect(formatToDownloadData(graphData).edges[0]).toEqual({
        id: 'edge-1',
        label: 'knows',
        source: 'v1',
        target: 'v2',
        properties: {since: 2026},
    });
});
