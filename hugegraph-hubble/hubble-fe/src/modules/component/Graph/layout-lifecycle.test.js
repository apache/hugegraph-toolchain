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

import React from 'react';
import {render, waitFor} from '@testing-library/react';
import Graph from './index';

const mockGraphInstances = [];

const mockCreateGraph = options => {
    const handlers = {};
    const config = {...options};
    const group = {
        resetMatrix: jest.fn(),
        getCanvasBBox: jest.fn(() => ({x: 0, y: 0, width: 320, height: 240})),
    };
    const instance = {
        destroyed: false,
        on: jest.fn((name, handler) => {
            handlers[name] = handler;
        }),
        get: jest.fn(key => ({
            canvas: {set: jest.fn()},
            group,
            height: 600,
            layout: config.layout,
            width: 800,
        })[key]),
        set: jest.fn((key, value) => {
            if (key === 'layout') {
                config.layout = value;
            }
        }),
        getZoom: jest.fn(() => 1),
        getNodes: jest.fn(() => []),
        getEdges: jest.fn(() => []),
        data: jest.fn(),
        refresh: jest.fn(),
        changeSize: jest.fn(),
        translate: jest.fn(),
        zoom: jest.fn(() => true),
        destroy: jest.fn(),
        changeData: jest.fn(() => {
            // G6 changeData() reads this flag from cfg.layout. Its second
            // argument controls stack behavior, not automatic relayout.
            if (config.layout?.relayoutAtChangeData !== false) {
                instance.updateLayout(config.layout);
            }
        }),
        updateLayout: jest.fn(layout => {
            config.layout = layout;
            handlers.afterlayout?.();
        }),
        render: jest.fn(() => {
            handlers.afterrender?.();
            handlers.afterlayout?.();
        }),
    };
    mockGraphInstances.push({config, group, instance});
    return instance;
};

jest.mock('@antv/g6', () => ({
    __esModule: true,
    default: {
        Graph: function MockGraph(options) {
            return mockCreateGraph(options);
        },
    },
}));
jest.mock('@antv/graphin-icons', () => ({
    __esModule: true,
    default: () => ({glyphs: []}),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));
jest.mock('resize-observer-polyfill', () => ({
    __esModule: true,
    default: class ResizeObserver {
        observe() {}
        disconnect() {}
    },
}));
jest.mock('../../../customHook/useCustomNode', () => () => {});
jest.mock('../../../customHook/useCustomGrid', () => () => {});
jest.mock('../../../customHook/useCustomEdge', () => () => {});

const graphData = nodeCount => ({
    nodes: Array.from({length: nodeCount}, (_, index) => ({id: String(index)})),
    edges: [],
});

beforeEach(() => {
    mockGraphInstances.length = 0;
});

test('keeps automatic changeData relayout disabled in the actual G6 layout config', async () => {
    render(
        <Graph
            data={graphData(10)}
            layout={{layout: 'force', nodeCount: 10}}
            layoutRevision={1}
        />
    );

    await waitFor(() => expect(mockGraphInstances).toHaveLength(1));
    expect(mockGraphInstances[0].config.layout).toMatchObject({
        type: 'force2',
        relayoutAtChangeData: false,
    });
});

test('does not let graph-level position animation overwrite a completed force layout', async () => {
    render(
        <Graph
            data={graphData(7)}
            layout={{layout: 'force', nodeCount: 7}}
            layoutRevision={1}
        />
    );

    await waitFor(() => expect(mockGraphInstances).toHaveLength(1));

    // Force2 is deliberately synchronous (`layout.animate: false`). G6's
    // graph-level animation otherwise starts positionsAnimate() after the
    // layout, racing result refreshes and restoring stale grid positions.
    expect(mockGraphInstances[0].config.animate).toBe(false);
});

test('does not layout or fit a metadata refresh at the same result revision', async () => {
    const initialData = graphData(10);
    const view = render(
        <Graph
            data={initialData}
            layout={{layout: 'force', nodeCount: 10}}
            layoutRevision={1}
        />
    );
    await waitFor(() => expect(mockGraphInstances).toHaveLength(1));
    const {instance} = mockGraphInstances[0];
    instance.updateLayout.mockClear();
    instance.translate.mockClear();

    view.rerender(
        <Graph
            data={{...initialData, nodes: initialData.nodes.map(node => ({...node}))}}
            layout={{layout: 'force', nodeCount: 10}}
            layoutRevision={1}
        />
    );

    await waitFor(() => expect(instance.changeData).toHaveBeenCalled());
    expect(instance.updateLayout).not.toHaveBeenCalled();
    expect(instance.translate).not.toHaveBeenCalled();
});

test('lays out and fits a new 600-node revision once with the new large-graph config', async () => {
    const view = render(
        <Graph
            data={graphData(10)}
            layout={{layout: 'force', nodeCount: 10}}
            layoutRevision={1}
        />
    );
    await waitFor(() => expect(mockGraphInstances).toHaveLength(1));
    const {instance} = mockGraphInstances[0];
    instance.changeData.mockClear();
    instance.updateLayout.mockClear();
    instance.translate.mockClear();

    view.rerender(
        <Graph
            data={graphData(600)}
            layout={{layout: 'force', nodeCount: 600}}
            layoutRevision={2}
        />
    );

    await waitFor(() => expect(instance.updateLayout).toHaveBeenCalledTimes(1));
    expect(instance.updateLayout).toHaveBeenCalledWith(expect.objectContaining({
        linkDistance: 48,
        maxIteration: 260,
        preventOverlap: false,
        relayoutAtChangeData: false,
    }));
    expect(instance.translate).toHaveBeenCalledTimes(1);
});

test('restores the changeData guard after a user layout change', async () => {
    const view = render(
        <Graph
            data={graphData(10)}
            layout={{layout: 'force', nodeCount: 10}}
            layoutRevision={1}
        />
    );
    await waitFor(() => expect(mockGraphInstances).toHaveLength(1));
    const {config, instance} = mockGraphInstances[0];

    // LayoutConfigPanel replaces cfg.layout with an ordinary layout object.
    instance.updateLayout({type: 'circular'});
    expect(config.layout.relayoutAtChangeData).toBeUndefined();
    instance.changeData.mockClear();
    instance.updateLayout.mockClear();
    instance.translate.mockClear();

    view.rerender(
        <Graph
            data={graphData(12)}
            layout={{layout: 'force', nodeCount: 12}}
            layoutRevision={2}
        />
    );

    await waitFor(() => expect(instance.updateLayout).toHaveBeenCalledTimes(1));
    expect(instance.set).toHaveBeenCalledWith('layout', expect.objectContaining({
        type: 'circular',
        relayoutAtChangeData: false,
    }));
    expect(instance.updateLayout).toHaveBeenCalledWith(expect.objectContaining({
        type: 'circular',
        relayoutAtChangeData: false,
    }));
    expect(instance.translate).toHaveBeenCalledTimes(1);
});
