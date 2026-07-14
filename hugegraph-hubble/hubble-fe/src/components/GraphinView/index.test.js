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

import {render} from '@testing-library/react';
import {GraphinContext} from '@antv/graphin';
import {GraphDoubleClick} from './index';

jest.mock('@antv/graphin', () => {
    const React = require('react');
    const EmptyComponent = () => null;
    return {
        __esModule: true,
        default: EmptyComponent,
        GraphinContext: React.createContext({}),
        Behaviors: {
            DragCanvas: EmptyComponent,
            ZoomCanvas: EmptyComponent,
            DragNode: EmptyComponent,
            ClickSelect: EmptyComponent,
            Hoverable: EmptyComponent,
        },
        Components: {Tooltip: EmptyComponent},
    };
});

test('registers, dispatches and removes node and edge double-click listeners', () => {
    const listeners = new Map();
    const graph = {
        on: jest.fn((event, listener) => listeners.set(event, listener)),
        off: jest.fn(),
    };
    const onDoubleClick = jest.fn();
    const {unmount} = render(
        <GraphinContext.Provider value={{graph}}>
            <GraphDoubleClick onDoubleClick={onDoubleClick} />
        </GraphinContext.Provider>
    );

    expect(graph.on).toHaveBeenCalledWith('node:dblclick', expect.any(Function));
    expect(graph.on).toHaveBeenCalledWith('edge:dblclick', expect.any(Function));

    const nodeModel = {data: {label: 'person'}};
    const node = {
        _cfg: {id: 'person', type: 'node'},
        getModel: () => nodeModel,
    };
    const event = {item: node};
    listeners.get('node:dblclick')(event);
    expect(onDoubleClick).toHaveBeenCalledWith(
        'person', 'node', nodeModel.data, nodeModel, node, event
    );

    unmount();
    expect(graph.off).toHaveBeenCalledWith(
        'node:dblclick', listeners.get('node:dblclick')
    );
    expect(graph.off).toHaveBeenCalledWith(
        'edge:dblclick', listeners.get('edge:dblclick')
    );
});
