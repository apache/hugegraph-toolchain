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
    applySemanticZoom,
    getSemanticZoomVisibility,
    isSemanticZoomCandidate,
    setItemLabelVisibility,
} from './graphSemanticZoom';

describe('graph semantic zoom', () => {
    it('keeps every label visible for small graph results', () => {
        expect(isSemanticZoomCandidate({nodes: new Array(100), edges: new Array(200)}))
            .toBe(false);
        expect(getSemanticZoomVisibility({itemCount: 300, zoom: 0.4}))
            .toEqual({nodeLabels: true, edgeLabels: true});
    });

    it('progressively reveals labels for dense graph results', () => {
        expect(isSemanticZoomCandidate({nodes: new Array(300), edges: new Array(600)}))
            .toBe(true);
        expect(getSemanticZoomVisibility({itemCount: 900, zoom: 0.5}))
            .toEqual({nodeLabels: false, edgeLabels: false});
        expect(getSemanticZoomVisibility({itemCount: 900, zoom: 2.1}))
            .toEqual({nodeLabels: true, edgeLabels: false});
        expect(getSemanticZoomVisibility({itemCount: 900, zoom: 3.1}))
            .toEqual({nodeLabels: true, edgeLabels: true});
    });

    it('locks dense item and zoom boundaries', () => {
        expect(getSemanticZoomVisibility({itemCount: 799, zoom: 0.1}))
            .toEqual({nodeLabels: true, edgeLabels: true});
        expect(getSemanticZoomVisibility({itemCount: 800, zoom: 1.99}))
            .toEqual({nodeLabels: false, edgeLabels: false});
        expect(getSemanticZoomVisibility({itemCount: 800, zoom: 2}))
            .toEqual({nodeLabels: true, edgeLabels: false});
        expect(getSemanticZoomVisibility({itemCount: 800, zoom: 2.99}))
            .toEqual({nodeLabels: true, edgeLabels: false});
        expect(getSemanticZoomVisibility({itemCount: 800, zoom: 3}))
            .toEqual({nodeLabels: true, edgeLabels: true});
    });

    it('handles missing or partial graph data without hiding labels', () => {
        expect(isSemanticZoomCandidate()).toBe(false);
        expect(isSemanticZoomCandidate({nodes: [{id: '1'}]})).toBe(false);
        expect(getSemanticZoomVisibility({})).toEqual({
            nodeLabels: true,
            edgeLabels: true,
        });
    });

    it('changes only the G6 label shape visibility', () => {
        const icon = {get: jest.fn(() => 'icon-shape')};
        const label = {
            get: jest.fn(() => 'text-shape'),
            hide: jest.fn(),
            show: jest.fn(),
        };
        const item = {
            getContainer: () => ({find: matcher => [icon, label].find(matcher)}),
        };

        expect(setItemLabelVisibility(item, false)).toBe(true);
        expect(label.hide).toHaveBeenCalledTimes(1);
        expect(label.show).not.toHaveBeenCalled();
        expect(setItemLabelVisibility(item, true)).toBe(true);
        expect(label.show).toHaveBeenCalledTimes(1);
    });

    it('updates dense labels only when visibility crosses a zoom threshold', () => {
        const node = {getContainer: () => ({find: () => null})};
        const edge = {getContainer: () => ({find: () => null})};
        const graph = {
            getEdges: jest.fn(() => [edge]),
            getNodes: jest.fn(() => [node]),
            getZoom: jest.fn(() => 0.5),
        };
        const data = {nodes: new Array(300), edges: new Array(600)};
        const initial = applySemanticZoom(graph, data);
        graph.getNodes.mockClear();
        graph.getEdges.mockClear();

        expect(applySemanticZoom(graph, data, {previousVisibility: initial}))
            .toEqual(initial);
        expect(graph.getNodes).not.toHaveBeenCalled();
        expect(graph.getEdges).not.toHaveBeenCalled();

        graph.getZoom.mockReturnValue(2.1);
        expect(applySemanticZoom(graph, data, {previousVisibility: initial}))
            .toEqual({nodeLabels: true, edgeLabels: false});
        expect(graph.getNodes).toHaveBeenCalledTimes(1);
        expect(graph.getEdges).not.toHaveBeenCalled();
    });

    it('tolerates a partially destroyed graph without item accessors', () => {
        expect(() => applySemanticZoom({getZoom: () => 1}, {
            nodes: new Array(400),
            edges: new Array(400),
        }, {force: true})).not.toThrow();
    });
});
