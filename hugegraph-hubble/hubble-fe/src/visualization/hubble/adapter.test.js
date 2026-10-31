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

import JSONbig from 'json-bigint';
import {adaptHubbleGraph, adaptHubbleSchema, exportHubbleGraph, hubbleRenderId, projectHubbleGraph} from './adapter';
import {mergeGraphData} from '../model/data';
import {normalizeIcon} from './styles';

const fixture = () => ({
    vertices: [
        {id: 1, label: 'person', properties: {name: 'Alice', active: false}, statistics: {degree: 2}},
        {id: '1', label: 'person', properties: {name: 'Bob', count: 0}},
    ],
    edges: [{id: 1, source: 1, target: '1', label: 'knows', properties: {since: 2026}, extra: {source: 'fixture'}}],
});

test('preserves original IDs, labels, endpoints and arbitrary raw fields for requests and export', () => {
    const input = fixture();
    const data = adaptHubbleGraph(input);
    expect(data.nodes[0].id).not.toBe(data.nodes[1].id);
    expect(data.nodes[0].id).not.toBe(data.edges[0].id);
    expect(data.edges[0].source).toBe(data.nodes[0].id);
    expect(data.edges[0].target).toBe(data.nodes[1].id);
    expect(data.edges[0].style.labelText).toBe('knows');
    expect(data.nodes[0].data.raw).toBe(input.vertices[0]);
    expect(exportHubbleGraph(data)).toEqual(input);
    expect(exportHubbleGraph(data).vertices[0].id).toBe(1);
    expect(exportHubbleGraph(data).vertices[1].id).toBe('1');
});

test('converts persisted display fields, joins, zero opacity and explicit no-arrow without mutating saved style', () => {
    const input = fixture();
    const meta = {vertexMeta: [{name: 'person', style: {color: '#008800', size: 'BIG', icon: 'user',
        display_fields: ['name', 'active'], join_symbols: [' / ']}}],
    edgeMeta: [{name: 'knows', style: {with_arrow: true, display_fields: ['since']}}]};
    const saved = {nodes: {person: {type: 'diamond', style: {fillOpacity: 0, lineWidth: 0},
        icon: {_iconName: 'UserOutlined'}, labelCfg: {position: 'right', style: {fontSize: 14}}}},
    edges: {knows: {style: {endArrow: false, lineDash: [5, 3]}}}};
    const before = JSON.stringify({input, meta, saved});
    const data = adaptHubbleGraph(input, meta, saved);
    expect(data.nodes[0]).toMatchObject({data: {shape: 'diamond', icon: 'UserOutlined'},
        style: {size: 40, fillOpacity: 0, lineWidth: 0, labelText: 'Alice / false',
            labelFontSize: 14, labelPlacement: 'right'}});
    expect(data.edges[0].style).toMatchObject({endArrow: false, lineDash: [5, 3], labelText: '2026'});
    expect(JSON.stringify({input, meta, saved})).toBe(before);
    expect(data.nodes[0].style.labelCfg).toBeUndefined();
    expect(data.nodes[0].style.stateStyles).toBeUndefined();
});

test('handles all schema nodes before validating edges and hides only preview text', () => {
    const input = {vertices: [{id: 'person', label: 'person', primary_keys: ['name'], properties: {name: 'text'},
        '~style': {color: '#1769e0', icon: 'UserOutlined'}}],
    edges: [{id: 'person-knows-person', source: 'person', target: 'person', label: 'knows',
        properties: {since: 'int'}, '~style': {color: '#0eb880', with_arrow: true}}]};
    const visible = adaptHubbleSchema(input);
    const compact = adaptHubbleSchema(input, false);
    expect(visible.nodes[0].style).toMatchObject({labelText: 'person', fill: '#1769e0'});
    expect(visible.edges[0].style).toMatchObject({labelText: 'knows', endArrow: true, labelBackground: false, labelTextBaseline: 'bottom'});
    expect(compact.nodes[0].style.labelText).toBe('');
    expect(compact.edges[0].style.labelText).toBe('');
    expect(exportHubbleGraph(compact)).toEqual(input);
});

test('keeps the regular edge label background for non-loop schema edges', () => {
    const input = {vertices: [{id: 'person'}, {id: 'city'}],
        edges: [{id: 'lives', source: 'person', target: 'city', label: 'lives'}]};
    expect(adaptHubbleSchema(input).edges[0].style).toMatchObject({labelBackground: true});
    expect(adaptHubbleSchema(input).edges[0].style.labelTextBaseline).toBeUndefined();
});

test('preserves legacy edge type selection when combined with custom properties', () => {
    const input = fixture();
    input.edges[0].id = 'long-business-edge-id';
    const meta = {edgeMeta: [{name: 'knows', style: {
        display_fields: ['since', '~id'], join_symbols: [' / '],
    }}]};
    const before = JSON.stringify(meta);
    const data = adaptHubbleGraph(input, meta);
    expect(data.edges[0].style.labelText).toBe('2026 / knows');
    expect(data.edges[0].data.raw.id).toBe('long-business-edge-id');
    expect(exportHubbleGraph(data)).toEqual(input);
    expect(JSON.stringify(meta)).toBe(before);
});

test('retains explicitly hidden edge labels and explicit type display fields', () => {
    const input = fixture();
    const adapt = display_fields => adaptHubbleGraph(input, {edgeMeta: [{name: 'knows',
        style: {display_fields}}]}).edges[0].style.labelText;
    expect(adapt([])).toBe('');
    expect(adapt(['~label', 'since'])).toBe('knows\n2026');
});

test('adapts edge-only responses against the existing node set and rejects missing endpoints by default', () => {
    const current = adaptHubbleGraph(fixture());
    const partial = {vertices: [], edges: [{id: 'extra', source: '1', target: 1, label: 'knows', properties: {}}]};
    expect(() => adaptHubbleGraph(partial)).toThrow('missing node');
    const adapted = adaptHubbleGraph(partial, {}, {}, {existingNodeIds: new Set(current.nodes.map(node => node.id))});
    expect(mergeGraphData(current, adapted).addedEdgeIds).toEqual(['edge:string:extra']);
});

test('retains production JSONbig long IDs and does not collapse them with string IDs', () => {
    const input = JSONbig.parse('{"vertices":[{"id":9007199254740993,"label":"person","properties":{}},'
        + '{"id":"9007199254740993","label":"person","properties":{}}],'
        + '"edges":[{"id":"long","source":9007199254740993,"target":"9007199254740993","label":"knows"}]}');
    const data = adaptHubbleGraph(input);
    expect(data.nodes[0].id).toBe('node:big-number:9007199254740993');
    expect(data.nodes[1].id).toBe('node:string:9007199254740993');
    expect(data.edges[0].source).toBe(data.nodes[0].id);
    expect(exportHubbleGraph(data).vertices[0].id).toBe(input.vertices[0].id);
    expect(JSON.stringify(exportHubbleGraph(data))).toBe(JSON.stringify(input));
    const exponential = JSONbig.parse('{"id":1000000000000000000000000000000}').id;
    expect(hubbleRenderId('node', exponential)).toBe('node:big-number:1000000000000000000000000000000');
    expect(hubbleRenderId('node', 9007199254740993n)).toBe('node:bigint:9007199254740993');
    expect(() => hubbleRenderId('node', {constructor: {name: 'BigNumber'}, toString: () => '1'}))
        .toThrow('unsupported business ID');
});

test('legacy icon spelling is converted without accepting an undefined icon component', () => {
    expect(normalizeIcon('user')).toBe('UserOutlined');
    expect(normalizeIcon('insurance ')).toBe('InsuranceOutlined');
    expect(normalizeIcon('UserOutlined')).toBe('UserOutlined');
    expect(normalizeIcon('unknown-icon')).toBeUndefined();
    expect(normalizeIcon('')).toBeUndefined();
});


test('keeps explicitly disabled icons hidden and falls back safely for unknown enum values', () => {
    const data = adaptHubbleGraph(fixture(), {vertexMeta: [{name: 'person',
        style: {icon: 'UserOutlined', size: '__proto__'}}]},
    {nodes: {person: {icon: {show: false}}}});
    expect(data.nodes[0].style.iconSrc).toBeUndefined();
    expect(data.nodes[0].data.icon).toBeUndefined();
    expect(data.nodes[0].style.size).toBe(30);
});


test('projects dangling business edges without weakening strict graph validation or changing typed IDs', () => {
    const raw = JSONbig.parse('{"vertices":[{"id":1},{"id":"1"},{"id":900719925474099312345}],'
        + '"edges":[{"id":1,"source":1,"target":"1"},{"id":"1","source":1,"target":"missing"},'
        + '{"id":900719925474099312345,"source":900719925474099312345,"target":2}]}');
    expect(() => adaptHubbleGraph(raw)).toThrow(/endpoint|missing/i);
    const projected = projectHubbleGraph(raw);
    expect(projected.graph.vertices).toEqual(raw.vertices);
    expect(projected.graph.edges).toEqual([raw.edges[0]]);
    expect(projected.pendingEdges).toEqual(raw.edges.slice(1));
    expect(projected.pendingEdges[1].id.toFixed()).toBe('900719925474099312345');
    expect(projected.pendingEdges[0]).not.toBe(raw.edges[1]);
    expect(Object.isFrozen(projected.pendingEdges[0])).toBe(true);
    expect(exportHubbleGraph(adaptHubbleGraph(projected.graph), projected.pendingEdges)).toEqual(raw);
    const promoted = projectHubbleGraph({...raw, vertices: [...raw.vertices, {id: 'missing'}, {id: 2}]});
    expect(promoted.pendingEdges).toEqual([]);
    expect(promoted.graph.edges).toEqual(raw.edges);
});

test('projection still rejects unsupported endpoint IDs and duplicate typed edge IDs', () => {
    expect(() => projectHubbleGraph({vertices: [], edges: [{id: 'e', source: {}, target: 2}]}))
        .toThrow(/unsupported/);
    expect(() => projectHubbleGraph({vertices: [], edges: [
        {id: 'e', source: 1, target: 2}, {id: 'e', source: 2, target: 3},
    ]})).toThrow(/duplicate/i);
});

test('raw export gives a currently drawn edge priority over an older pending record of the same typed ID', () => {
    const raw = fixture();
    expect(exportHubbleGraph(adaptHubbleGraph(raw), [
        {...raw.edges[0], label: 'old'}, {id: '1', source: 1, target: 'missing'},
    ]).edges).toEqual([...raw.edges, {id: '1', source: 1, target: 'missing'}]);
});
