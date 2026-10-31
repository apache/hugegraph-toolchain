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

import {GraphDataError, normalizeGraphData, renderId} from '../model/data';
import {immutableCopy} from '../model/ownership';
import type {ElementKind, GraphData, GraphEdge, GraphNode, NormalizeOptions} from '../model/types';
import {asRecord, edgeStyle, nodeShape, nodeStyle, normalizeIcon} from './styles';
import type {HubbleStyle} from './styles';
import {hubbleIconSource} from './icons';

export interface HubbleGraph {
    vertices: Record<string, unknown>[];
    edges: Record<string, unknown>[];
}
export interface HubbleMeta {
    vertexMeta?: Record<string, unknown>[];
    edgeMeta?: Record<string, unknown>[];
}
/** This is the complete existing persisted configuration; this adapter never writes it back. */
export interface HubbleSavedStyles {
    nodes?: Record<string, HubbleStyle>;
    edges?: Record<string, HubbleStyle>;
}
interface LosslessNumber {
    constructor: {isBigNumber(value: unknown): boolean};
    toString(): string;
    toFixed(): string;
}
const isBigNumber = (value: unknown): value is LosslessNumber => {
    if (value === null || typeof value !== 'object') {
        return false;
    }
    const candidate = value as Partial<LosslessNumber>;
    return typeof candidate.constructor?.isBigNumber === 'function'
        && candidate.constructor.isBigNumber(value) && typeof candidate.toString === 'function'
        && typeof candidate.toFixed === 'function';
};

/** Keep long JSON integer IDs exact and distinct from strings, without leaking number objects into the engine. */
export const hubbleRenderId = (kind: ElementKind, value: unknown): string => {
    if (typeof value === 'string' || typeof value === 'number') {
        return renderId(kind, value);
    }
    if (typeof value === 'bigint' || isBigNumber(value)) {
        const decimal = typeof value === 'bigint' ? value.toString() : value.toFixed();
        if (!/^-?\d+$/.test(decimal)) {
            throw new GraphDataError(`${kind} ID must be an integer`);
        }
        return `${kind}:${typeof value === 'bigint' ? 'bigint' : 'big-number'}:${decimal}`;
    }
    throw new GraphDataError(`${kind} has an unsupported business ID`);
};

const valueText = (value: unknown): string => {
    if (value === undefined || value === null) {
        return '';
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        || typeof value === 'bigint' || isBigNumber(value)) {
        return String(value);
    }
    return JSON.stringify(value);
};
const displayLabel = (record: Record<string, unknown>, style: HubbleStyle, edge: boolean): string => {
    const fields = Array.isArray(style.display_fields) && style.display_fields.every(item => typeof item === 'string')
        ? style.display_fields as string[] : ['~id'];
    // Legacy Hubble uses ~id for the edge type, including selections combined with properties.
    // Keep that saved meaning; the full business ID remains in raw for tooltips and export.
    const displayFields = edge ? fields.map(field => field === '~id' ? '~label' : field) : fields;
    const properties = asRecord(record.properties);
    const symbols = Array.isArray(style.join_symbols) ? style.join_symbols : [];
    return displayFields.map((field, index) => {
        const value = field === '~id' ? record.id : field === '~label' ? record.label ?? record.id : properties[field];
        const separator = index === 0 ? '' : typeof symbols[index - 1] === 'string' ? symbols[index - 1] : '\n';
        return separator + valueText(value);
    }).join('');
};
const metaIndex = (items: Record<string, unknown>[] = []): Map<string, HubbleStyle> => new Map(items.map(item =>
    [String(item.name), asRecord(item.style)]));

/** Parse all nodes before validating edges, including references to later nodes and self-loops. */
export const adaptHubbleGraph = (input: HubbleGraph, meta: HubbleMeta = {},
    savedStyles: HubbleSavedStyles = {}, options: NormalizeOptions = {}): GraphData => {
    if (!input || !Array.isArray(input.vertices) || !Array.isArray(input.edges)) {
        throw new GraphDataError('Hubble graph requires vertices and edges arrays');
    }
    const vertexMeta = metaIndex(meta.vertexMeta);
    const edgeMeta = metaIndex(meta.edgeMeta);
    const nodes: GraphNode[] = input.vertices.map(raw => {
        const label = typeof raw.label === 'string' ? raw.label : undefined;
        const persisted = vertexMeta.get(label ?? '') ?? asRecord(raw['~style']);
        const customized = savedStyles.nodes?.[label ?? ''] ?? {};
        const iconConfig = asRecord(customized.icon);
        const icon = iconConfig.show === false ? undefined : normalizeIcon(iconConfig._iconName ?? persisted.icon);
        const style = nodeStyle(persisted, customized, displayLabel(raw, persisted, false));
        const iconSource = hubbleIconSource(icon, style.iconFill);
        if (iconSource) {
            style.iconSrc = iconSource;
            style.iconWidth = style.iconFontSize ?? 12;
            style.iconHeight = style.iconFontSize ?? 12;
        }
        return {
            id: hubbleRenderId('node', raw.id),
            data: {raw, ...(label === undefined ? {} : {label, legend: label}),
                shape: nodeShape(customized.type), ...(icon ? {icon} : {})},
            style,
        };
    });
    const edges: GraphEdge[] = input.edges.map(raw => {
        const label = typeof raw.label === 'string' ? raw.label : undefined;
        const persisted = edgeMeta.get(label ?? '') ?? asRecord(raw['~style']);
        const customized = savedStyles.edges?.[label ?? ''] ?? {};
        return {
            id: hubbleRenderId('edge', raw.id),
            source: hubbleRenderId('node', raw.source),
            target: hubbleRenderId('node', raw.target),
            data: {raw, ...(label === undefined ? {} : {label, legend: label})},
            style: edgeStyle(persisted, customized, displayLabel(raw, persisted, true)),
        };
    });
    return normalizeGraphData({nodes, edges}, options);
};

export const adaptHubbleSchema = (input: HubbleGraph, showLabels = true): GraphData => {
    const data = adaptHubbleGraph(input);
    return {
        nodes: data.nodes.map(node => ({...node,
            style: {...node.style, labelText: showLabels ? valueText(node.data.raw.label ?? node.data.raw.id) : ''}})),
        edges: data.edges.map(edge => ({...edge,
            style: {...edge.style, labelText: showLabels ? valueText(edge.data.raw.label ?? edge.data.raw.id) : '',
                // Keep the loop visible and place its label just outside the stroke.
                ...(edge.source === edge.target ? {labelBackground: false, labelTextBaseline: 'bottom'} : {})}})),
    };
};

/** Hubble may return an incomplete edge view. Retain its owned raw records outside the strict engine model. */
export const projectHubbleGraph = (input: HubbleGraph, existingNodeIds: ReadonlySet<string> = new Set()):
    {graph: HubbleGraph; pendingEdges: Record<string, unknown>[]} => {
    if (!input || !Array.isArray(input.vertices) || !Array.isArray(input.edges)) {
        throw new GraphDataError('Hubble graph requires vertices and edges arrays');
    }
    const nodes = new Set(existingNodeIds);
    input.vertices.forEach(raw => nodes.add(hubbleRenderId('node', raw.id)));
    const seen = new Set<string>();
    const edges: Record<string, unknown>[] = [];
    const pendingEdges: Record<string, unknown>[] = [];
    for (const raw of input.edges) {
        const id = hubbleRenderId('edge', raw.id);
        if (seen.has(id)) throw new GraphDataError(`Duplicate edge ID ${id}`);
        seen.add(id);
        const source = hubbleRenderId('node', raw.source);
        const target = hubbleRenderId('node', raw.target);
        if (nodes.has(source) && nodes.has(target)) edges.push(raw);
        else pendingEdges.push(immutableCopy(raw));
    }
    return {graph: {vertices: input.vertices, edges}, pendingEdges};
};

/** Return original records, including typed IDs, endpoints, statistics and undrawn business edges. */
export const exportHubbleGraph = (data: GraphData, pendingEdges: Record<string, unknown>[] = []): HubbleGraph => {
    const edges = data.edges.map(edge => edge.data.raw);
    const ids = new Set(edges.map(edge => hubbleRenderId('edge', edge.id)));
    for (const raw of pendingEdges) {
        const id = hubbleRenderId('edge', raw.id);
        if (!ids.has(id)) { edges.push(raw); ids.add(id); }
    }
    return {vertices: data.nodes.map(node => node.data.raw), edges};
};
