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

jest.mock('@antv/graphin-icons', () => ({
    __esModule: true,
    default: () => ({glyphs: []}),
}));

import {fitView, mapLayoutNameToLayoutDetails} from './graph';

it('skips fitting while the graph tab has no measurable viewport', () => {
    const resetMatrix = jest.fn();
    const graph = {
        get: key => ({
            width: 0,
            height: 0,
            group: {
                getCanvasBBox: () => ({height: 100, width: 100, x: 0, y: 0}),
                resetMatrix,
            },
        })[key],
        translate: jest.fn(),
        zoom: jest.fn(),
    };

    fitView(graph);

    expect(resetMatrix).not.toHaveBeenCalled();
    expect(graph.translate).not.toHaveBeenCalled();
    expect(graph.zoom).not.toHaveBeenCalled();
});

it('keeps a five-node query graph readable with collision-aware spacing', () => {
    const layout = mapLayoutNameToLayoutDetails({layout: 'force', nodeCount: 5});

    expect(layout).toMatchObject({
        type: 'force2',
        preventOverlap: true,
        linkDistance: 140,
        nodeStrength: 1800,
    });
    expect(layout.nodeSpacing({size: 60})).toBeGreaterThanOrEqual(32);
});

it('uses bounded force work for 309 and 600 node results', () => {
    const medium = mapLayoutNameToLayoutDetails({layout: 'force', nodeCount: 309});
    const large = mapLayoutNameToLayoutDetails({layout: 'force', nodeCount: 600});

    expect(medium.maxIteration).toBeLessThanOrEqual(500);
    expect(large.maxIteration).toBeLessThanOrEqual(300);
    expect(large.preventOverlap).toBe(false);
    expect(large.linkDistance).toBeLessThan(medium.linkDistance);
});
