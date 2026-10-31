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

import {DagreLayout, Graph, GraphEvent} from '@antv/g6';
import type {Command, EdgeData as EngineEdge, GraphData as EngineData, GraphOptions, History, IPointerEvent,
    NodeData as EngineNode} from '@antv/g6';
import type {GraphData, GraphEdge, GraphNode, NodeData, GraphStyle} from '../model/types';
import {mutableCopy} from '../model/ownership';
import {labelFontScale, labelVisibility} from '../model/labels';
import {PinBridge, registerExtensions} from './extensions';
import {adaptiveLayoutDefaults} from './layoutDefaults';
import type {ControllerOptions, GraphLayout, GraphRuntime, RuntimeEvent} from './types';

// G6 history walks object prototypes recursively, even for excluded draws.
// Keep the opaque business record in an array, which G6 treats atomically;
// json-bigint values otherwise lead its history alignment into prototype cycles.
// Engine records are detached from the controller's immutable snapshots.
const toEngineElementData = ({raw, ...data}: NodeData) => ({...mutableCopy(data), raw: [mutableCopy(raw)]});
const toEngineData = (data: Partial<GraphData>): EngineData => ({
    ...(data.nodes ? {nodes: data.nodes.map(node => ({...node, data: toEngineElementData(node.data), style: mutableCopy(node.style)}))} : {}),
    ...(data.edges ? {edges: data.edges.map(edge => ({...edge, data: toEngineElementData(edge.data), style: mutableCopy(edge.style)}))} : {}),
});
const readNodeData = (data: Record<string, unknown> | undefined): NodeData => {
    const raw = Array.isArray(data?.raw) && data.raw.length === 1 ? data.raw[0] : undefined;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Engine element lost its original data record');
    }
    return {...data, raw: raw as Record<string, unknown>};
};
const hasChanges = (command: Command): boolean => Object.values(command.current)
    .some((data: EngineData) => [data.nodes, data.edges, data.combos].some(items => Boolean(items?.length)));
// G6's default-style callback wins over DrawData. Leave automatic lane/loop
// geometry to the transform so stale model geometry cannot override its result.
// G6 caches default presentation before native pre-layout. Coordinates must
// come from DrawData so that initial seed positions cannot override final layout.
const nodePresentation = (style: EngineNode['style'] = {}) => {
    const {x: _x, y: _y, z: _z, ...presentation} = style;
    return presentation;
};
const edgePresentation = (style: EngineEdge['style'] = {}) => {
    const {curveOffset: _curveOffset, loopPlacement: _loopPlacement, loopDist: _loopDist, ...presentation} = style;
    return presentation;
};

/** Owns one real G6 instance. No application caller receives the Graph. */
export class G6Runtime implements GraphRuntime {
    private readonly graph: Graph;
    private initialized = false;
    private firstDataDrawPending = true;
    private readonly historyEnabled: boolean;
    private readonly fitZoomLimit: number;
    private readonly semanticZoom: boolean;
    private labels = {nodeLabels: true, edgeLabels: true};
    private fontScale = 1;
    private alive = true;
    private busy = false;
    private recording = false;
    private replaying = false;
    private handler: (event: RuntimeEvent) => void = () => {};
    private readonly bindings: Array<[string, (event: IPointerEvent) => void]> = [];
    private dragIdle: Promise<void> | null = null;
    private finishDrag?: () => void;

    constructor(container: HTMLElement, options: ControllerOptions = {}) {
        registerExtensions();
        const preset = options.preset ?? 'interactive';
        const interactive = preset === 'interactive';
        this.historyEnabled = interactive;
        this.semanticZoom = interactive;
        this.fitZoomLimit = interactive ? 1.35 : 1.5;
        // G6 5.1.1 forwards this public G Canvas option, omitted from its narrowed type.
        // Pure camera frames still draw in endFrame; skip the redundant per-element hooks.
        const canvas: NonNullable<GraphOptions['canvas']> & {disableRenderHooks: boolean} = {disableRenderHooks: true};
        this.graph = new Graph({
            container, width: Math.max(container.clientWidth, 1), height: Math.max(container.clientHeight, 1),
            canvas, autoResize: false, animation: false,
            padding: preset === 'thumbnail' ? 12 : options.minimap ? [36, 36, 36, 220] : 36,
            theme: options.theme ?? 'light', zoomRange: [0.03, 8], data: {nodes: [], edges: []},
            node: {
                type: datum => typeof datum.data?.shape === 'string' ? datum.data.shape : 'circle',
                style: datum => ({size: 36, fill: '#5C73E6', stroke: '#5C73E6', lineWidth: 1,
                    labelPlacement: 'bottom', labelFill: options.theme === 'dark' ? '#e8e8ec' : '#242938',
                    labelBackground: true, labelBackgroundFill: options.theme === 'dark' ? '#171923' : '#ffffff',
                    labelBackgroundOpacity: 0.85, cursor: preset === 'thumbnail' ? 'pointer' : 'grab',
                    ...nodePresentation(datum.style), ...this.labelTypography(datum.style, 12, [2, 4]),
                    label: datum.style?.label !== false && this.labels.nodeLabels}),
                state: {selected: datum => ({halo: false, lineWidth: 3, stroke: '#F59E0B',
                    ...this.labelTypography(datum.style, 12, [2, 4]), label: datum.style?.label !== false}),
                    active: {halo: false, lineWidth: 3, stroke: '#2563EB'},
                    focused: datum => ({label: datum.style?.label !== false})},
            },
            edge: {type: 'quadratic',
                style: datum => ({stroke: '#8D97B0', lineWidth: 1, endArrow: true,
                labelFill: options.theme === 'dark' ? '#e8e8ec' : '#49536A',
                labelBackground: true, labelBackgroundFill: options.theme === 'dark' ? '#171923' : '#ffffff',
                labelBackgroundOpacity: 0.85, loop: true, ...edgePresentation(datum.style),
                // Dragging fronts nodes; G6 then recomputes incident edge model layers on state updates.
                // Keep edge rendering below nodes so a crossing edge cannot steal their pointer events.
                zIndex: -1,
                ...this.labelTypography(datum.style, 11, [1, 3]),
                label: datum.style?.label !== false && this.labels.edgeLabels}),
            state: {selected: datum => ({halo: false, lineWidth: 3, stroke: '#F59E0B',
                ...this.labelTypography(datum.style, 11, [1, 3]), label: datum.style?.label !== false}),
                active: {halo: false, lineWidth: 2, stroke: '#2563EB'},
                focused: datum => ({label: datum.style?.label !== false})}},
            transforms: [{type: 'hubble-parallel-edges'}],
            behaviors: preset === 'thumbnail' ? [] : [
                'drag-canvas', 'zoom-canvas',
                {type: 'drag-element', shadow: false, hideEdge: 'none', animation: false,
                    enable: (event: IPointerEvent) => {
                        if (!this.alive || this.busy || event.targetType !== 'node') return false;
                        this.dragIdle = new Promise(resolve => { this.finishDrag = resolve; });
                        this.handler({type: 'leave'});
                        return true;
                    },
                    onFinish: () => {
                        this.finishDrag?.(); this.finishDrag = undefined; this.dragIdle = null;
                        if (this.alive) this.handler({type: 'dragEnd'});
                    }},
            ],
            plugins: [
                {type: 'hubble-pin-bridge', key: 'pins'},
                ...(interactive ? [{type: 'history', key: 'history', stackSize: 20,
                    beforeAddCommand: (command: Command) => this.recording && hasChanges(command),
                    afterAddCommand: () => {
                        if (!this.replaying) this.getHistory()?.redoStack.splice(0);
                    }}] : []),
                ...(interactive && options.minimap ? [{type: 'minimap', key: 'minimap', size: [180, 120], position: 'left-bottom'}] : []),
            ],
        });
        if (preset !== 'thumbnail') this.bindEvents();
    }

    async idleInteraction(): Promise<void> { if (this.dragIdle) await this.dragIdle; }
    onEvent(handler: (event: RuntimeEvent) => void): void { this.handler = handler; }

    private labelTypography(style: EngineNode['style'] | EngineEdge['style'], defaultSize: number, defaultPadding: number[]): {
        labelFontSize: number; labelLineHeight: number; labelPadding: number | number[];
    } {
        const nonnegative = (value: unknown): value is number =>
            typeof value === 'number' && Number.isFinite(value) && value >= 0;
        const size = nonnegative(style?.labelFontSize) ? style.labelFontSize : defaultSize;
        const lineHeight = nonnegative(style?.labelLineHeight) ? style.labelLineHeight : size * 4 / 3;
        const padding = style?.labelPadding;
        return {labelFontSize: size / this.fontScale, labelLineHeight: lineHeight / this.fontScale,
            labelPadding: nonnegative(padding) ? padding / this.fontScale
                : (Array.isArray(padding) && padding.every(nonnegative) ? padding : defaultPadding)
                    .map(value => value / this.fontScale)};
    }

    private bindEvents(): void {
        for (const kind of ['node', 'edge'] as const) {
            for (const [name, type] of [['click', 'click'], ['dblclick', 'doubleClick'],
                ['pointerenter', 'hover'], ['pointerleave', 'leave'], ['contextmenu', 'contextMenu']] as const) {
                const handler = (event: IPointerEvent) => {
                    if (!this.alive) return;
                    if (type === 'hover' && this.dragIdle) return;
                    if (type === 'contextMenu') event.preventDefault();
                    const id = 'id' in event.target ? String(event.target.id) : undefined;
                    this.handler({type, id, kind, client: {x: event.client.x, y: event.client.y},
                        ...(type === 'click' && (event.shiftKey || event.ctrlKey || event.metaKey)
                            ? {additiveSelection: true} : {})});
                };
                this.graph.on(`${kind}:${name}`, handler);
                this.bindings.push([`${kind}:${name}`, handler]);
            }
        }
        const canvasClick = () => { if (this.alive) this.handler({type: 'canvasClick'}); };
        this.graph.on('canvas:click', canvasClick);
        this.bindings.push(['canvas:click', canvasClick]);
        const viewport = () => { if (this.alive) this.handler({type: 'viewport'}); };
        this.graph.on(GraphEvent.AFTER_TRANSFORM, viewport);
        this.bindings.push([GraphEvent.AFTER_TRANSFORM, viewport]);
    }

    private getHistory(): History | undefined {
        return this.initialized && this.historyEnabled ? this.graph.getPluginInstance<History>('history') : undefined;
    }
    private getPins(): PinBridge | undefined {
        return this.initialized ? this.graph.getPluginInstance<PinBridge>('pins') : undefined;
    }

    private async commit(record: boolean, run: () => Promise<void>): Promise<void> {
        if (this.dragIdle) await this.dragIdle;
        if (!this.alive) return;
        const history = this.getHistory();
        // G6 5.1.1 trims a full stack BEFORE consulting beforeAddCommand.
        // Preserve the plugin's public stacks around excluded system draws.
        const saved = !record && history ? {undo: [...history.undoStack], redo: [...history.redoStack]} : null;
        this.busy = true;
        this.recording = record;
        try { await run(); }
        finally {
            if (saved && history) { history.undoStack = saved.undo; history.redoStack = saved.redo; }
            this.recording = true;
            this.busy = false;
        }
    }

    async replace(data: GraphData, layout: GraphLayout | null): Promise<void> {
        await this.commit(false, async () => {
            // Compute before the first draw, so large datasets never create a full set of labels first.
            const zoom = this.initialized ? this.graph.getZoom() : 1;
            this.labels = this.semanticZoom
                ? labelVisibility(data.nodes.length + data.edges.length, zoom)
                : {nodeLabels: true, edgeLabels: true};
            this.fontScale = this.semanticZoom ? labelFontScale(zoom) : 1;
            const incoming = toEngineData(data);
            if (layout?.type === 'd3-force' && incoming.edges?.length && incoming.nodes?.length
                && incoming.nodes.length <= 50 && incoming.edges.length <= Math.min(50, incoming.nodes.length * 2)
                && incoming.nodes.every(node => !Number.isFinite(node.style?.x) && !Number.isFinite(node.style?.y))) {
                // Dagre ranks synchronously: only seed small, sparse fresh results.
                // Other results use force directly; supplied coordinates keep their starting positions.
                const seed = new DagreLayout({rankdir: 'TB', nodeSize: 48, nodesep: 90, ranksep: 140});
                try {
                    await seed.execute({nodes: incoming.nodes, edges: incoming.edges});
                    const positions = new Map<string, {x: number; y: number}>();
                    seed.forEachNode(node => positions.set(String(node.id), {x: node.x, y: node.y}));
                    incoming.nodes.forEach(node => {node.style = {...node.style, ...positions.get(node.id)};});
                }
                finally { seed.destroy(); }
                if (!this.alive) return;
            }
            this.graph.setData(incoming);
            // Native pre-layout computes positions before constructing shapes.
            // An empty initial draw must not consume the first real dataset.
            const preLayout = this.firstDataDrawPending && data.nodes.length > 0 && layout && layout.type !== 'columns';
            if (data.nodes.length) this.firstDataDrawPending = false;
            if (preLayout) await this.runLayout(layout, true);
            else {
                await this.graph.draw();
                this.initialized = true;
                if (this.alive && layout) await this.runLayout(layout);
            }
        });
    }

    async patch(data: Partial<GraphData>, record: boolean): Promise<void> {
        await this.commit(record, async () => {
            const incoming = toEngineData(data);
            const add: EngineData = {nodes: [], edges: []};
            const update: EngineData = {nodes: [], edges: []};
            for (const node of incoming.nodes ?? []) {
                (this.graph.hasNode(node.id) ? update.nodes! : add.nodes!).push(node);
            }
            for (const edge of incoming.edges ?? []) {
                (this.graph.hasEdge(edge.id!) ? update.edges! : add.edges!).push(edge);
            }
            this.placeNewNodes(add.nodes!);
            this.graph.addData(add);
            this.graph.updateData(update);
            // A manual add can be the first nonempty display after an empty
            // query. Its existing shapes must use post-layout on later replace.
            if (add.nodes!.length) this.firstDataDrawPending = false;
            await this.graph.draw();
        });
    }

    private placeNewNodes(nodes: EngineNode[]): void {
        const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
        const positioned = (node: EngineNode) => finite(node.style?.x) && finite(node.style?.y);
        const missing = nodes.filter(node => !positioned(node));
        if (!missing.length) return;
        const [width, height] = this.graph.getSize();
        if (!finite(width) || !finite(height) || width <= 0 || height <= 0) return;
        const diameter = missing.reduce((largest, node) => {
            const size = node.style?.size;
            return Math.max(largest, ...(Array.isArray(size) ? size : [size]).filter(finite));
        }, 36);
        const zoom = this.graph.getZoom();
        const spacing = diameter * (finite(zoom) && zoom > 0 ? zoom : 1) + 12;
        const insetX = Math.min(spacing / 2, width / 2);
        const insetY = Math.min(spacing / 2, height / 2);
        // Prefer the visible centre, then nearby free slots. A bounded set keeps placement
        // linear even for a large expansion, whose subsequent layout owns final positions.
        const fractions = [0.5, 0.35, 0.65, 0.2, 0.8];
        const candidates = fractions.flatMap(y => fractions.map(x =>
            [insetX + (width - insetX * 2) * x, insetY + (height - insetY * 2) * y] as [number, number]));
        const clearance = candidates.map(() => Infinity);
        const occupy = (point: ArrayLike<number>) => {
            if (!finite(point[0]) || !finite(point[1])) return;
            candidates.forEach(([x, y], index) => {
                clearance[index] = Math.min(clearance[index], Math.hypot(x - point[0], y - point[1]));
            });
        };
        for (const node of [...this.graph.getNodeData(), ...nodes.filter(positioned)]) {
            if (positioned(node) && node.style?.visibility !== 'hidden') {
                occupy(this.graph.getViewportByCanvas([node.style!.x!, node.style!.y!]));
            }
        }
        for (const node of missing) {
            const free = clearance.findIndex(distance => distance >= spacing);
            const index = free >= 0 ? free : clearance.reduce((best, distance, current) =>
                distance > clearance[best] ? current : best, 0);
            const point = this.graph.getCanvasByViewport(candidates[index]);
            if (!finite(point[0]) || !finite(point[1])) continue;
            // Explicit coordinates, including zero and a supplied single axis, stay authoritative.
            node.style = {...node.style, x: finite(node.style?.x) ? node.style.x : point[0],
                y: finite(node.style?.y) ? node.style.y : point[1]};
            occupy(this.graph.getViewportByCanvas([node.style.x!, node.style.y!]));
        }
    }

    layout(layout: GraphLayout): Promise<void> { return this.commit(false, async () => this.runLayout(layout)); }
    private async runLayout(layout: GraphLayout, preLayout = false): Promise<void> {
        const fixed = this.graph.getNodeData().filter(node => node.data?.fixed)
            .map(node => ({id: node.id, style: {x: node.style?.x, y: node.style?.y}}));
        if (layout.type === 'columns') {
            const data = this.graph.getNodeData();
            const groups = new Map<string, EngineNode[]>();
            for (const node of data) {
                const group = typeof node.data?.group === 'string' ? node.data.group : 'middle';
                const nodes = groups.get(group) ?? []; nodes.push(node); groups.set(group, nodes);
            }
            const names = ['start', ...[...groups.keys()].filter(name => name !== 'start' && name !== 'end'), 'end'];
            const positions = names.flatMap((name, column) => (groups.get(name) ?? []).map((node, row) => ({id: node.id,
                style: {x: column * 240, y: row * 90 - ((groups.get(name)?.length ?? 1) - 1) * 45}})));
            this.graph.updateNodeData(positions);
            await this.graph.draw();
        }
        else {
            const defaults = layout.type === 'd3-force' || layout.type === 'radial'
                ? adaptiveLayoutDefaults(layout, this.graph.getNodeData())
                : layout.type === 'dagre' ? {rankdir: 'LR', ranksep: 100, nodesep: 60}
                : layout.type === 'circular' ? {nodeSpacing: 0,
                    ...(layout.options?.startRadius === undefined && layout.options?.endRadius === undefined
                        ? {radius: Math.max(120, this.graph.getNodeData().length * 100 / (2 * Math.PI))} : {})}
                : layout.type === 'grid' ? {preventOverlap: true, nodeSize: 48, nodeSpacing: 36}
                : {preventOverlap: true, nodeSize: 48, nodeSpacing: 24};
            const type = layout.type === 'd3-force' ? 'hubble-pinned-d3-force' : layout.type;
            // Post-layout includes hidden rendered nodes; keep the same layout
            // input when simulating before the initial shapes exist.
            const options = {...defaults, ...layout.options, type, animation: false, enableWorker: false, preLayout,
                ...(preLayout ? {isLayoutInvisibleNodes: true} : {})};
            this.graph.setLayout(options);
            if (preLayout) {
                await this.graph.render();
                this.initialized = true;
            }
            else await this.graph.layout(options);
        }
        if (!this.alive) return;
        const restore = fixed.filter(node => {
            const current = this.graph.getNodeData(node.id).style;
            return current?.x !== node.style.x || current?.y !== node.style.y;
        });
        if (restore.length) { this.graph.updateNodeData(restore); await this.graph.draw(); }
        if (this.alive) this.syncPins();
    }

    remove(ids: {nodes: string[]; edges: string[]}): Promise<void> {
        return this.commit(false, async () => { this.graph.removeData(ids); await this.graph.draw(); });
    }
    setMinimap(visible: boolean): void {
        this.graph.setOptions({padding: visible ? [36, 36, 36, 220] : 36});
        this.graph.setPlugins(previous => [
            ...previous.filter(plugin => typeof plugin !== 'object' || plugin.key !== 'minimap'),
            ...(visible ? [{type: 'minimap', key: 'minimap', size: [180, 120], position: 'left-bottom'}] : []),
        ]);
    }

    read(): GraphData {
        const data = this.graph.getData();
        return {nodes: data.nodes.map(node => ({id: node.id, data: readNodeData(node.data),
            ...(node.style ? {style: node.style as GraphStyle} : {})})),
        edges: data.edges.map(edge => ({id: edge.id!, source: edge.source, target: edge.target,
            data: readNodeData(edge.data), ...(edge.style ? {style: edge.style as GraphStyle} : {})}))};
    }
    readElement(kind: 'node', id: string): GraphNode;
    readElement(kind: 'edge', id: string): GraphEdge;
    readElement(kind: 'node' | 'edge', id: string): GraphNode | GraphEdge {
        if (kind === 'node') {
            const node = this.graph.getNodeData(id);
            return {id: node.id, data: readNodeData(node.data), ...(node.style ? {style: node.style as GraphStyle} : {})};
        }
        const edge = this.graph.getEdgeData(id);
        return {id: edge.id!, source: edge.source, target: edge.target, data: readNodeData(edge.data),
            ...(edge.style ? {style: edge.style as GraphStyle} : {})};
    }
    states(states: Record<string, string[]>): Promise<void> {
        return this.commit(false, async () => { await this.graph.setElementState(states, false); });
    }
    async refreshLabelVisibility(itemCount: number): Promise<void> {
        if (!this.alive || !this.initialized || !this.semanticZoom) return;
        const zoom = this.graph.getZoom();
        const next = labelVisibility(itemCount, zoom);
        const fontScale = labelFontScale(zoom);
        if (next.nodeLabels === this.labels.nodeLabels && next.edgeLabels === this.labels.edgeLabels
            && fontScale === this.fontScale) return;
        await this.commit(false, async () => {
            const previous = this.labels;
            const previousScale = this.fontScale;
            this.labels = next;
            this.fontScale = fontScale;
            try {
                const options = this.graph.getOptions();
                // Camera-derived styles change only at density/font buckets, never the saved data or layout.
                if ((previous.nodeLabels !== next.nodeLabels || previousScale !== fontScale) && options.node) {
                    this.graph.setNode(options.node);
                }
                if ((previous.edgeLabels !== next.edgeLabels || previousScale !== fontScale) && options.edge) {
                    this.graph.setEdge(options.edge);
                }
                await this.graph.draw();
            }
            catch (error) { this.labels = previous; this.fontScale = previousScale; throw error; }
        });
    }
    visibility(ids: string[], visible: boolean): Promise<void> {
        return this.commit(false, async () => {
            if (ids.length) await this.graph.setElementVisibility(
                Object.fromEntries(ids.map(id => [id, visible ? 'visible' as const : 'hidden' as const])), false);
        });
    }
    async fitView(): Promise<void> {
        if (!this.initialized || !this.graph.getNodeData().length) return;
        await this.graph.fitView({}, false);
        // A tiny graph should be centered without enlarging labels to fill the entire viewport.
        if (this.alive && this.graph.getZoom() > this.fitZoomLimit) await this.graph.zoomTo(this.fitZoomLimit, false);
    }
    async zoomBy(factor: number): Promise<void> { if (this.initialized) await this.graph.zoomBy(factor, false); }
    async resize(width: number, height: number): Promise<void> {
        const [previousWidth, previousHeight] = this.graph.getSize();
        if (width === previousWidth && height === previousHeight) return;
        this.graph.resize(width, height);
        // G6's minimap listens to viewport transforms, not size changes. Reapply
        // the current zoom without animation to refresh its mask without fitting the graph.
        if (this.initialized && this.graph.getPluginInstance('minimap')) {
            await this.graph.zoomTo(this.graph.getZoom(), false);
        }
    }
    async exportPng(): Promise<string> {
        const image = new Image();
        image.src = await this.graph.toDataURL({type: 'image/png', mode: 'overall'});
        await image.decode();
        // Export the whole result on white, independently of the screen's CSS background and camera.
        const padding = Math.round(30 * (globalThis.devicePixelRatio || 1));
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth + padding * 2;
        canvas.height = image.naturalHeight + padding * 2;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Unable to create the PNG export canvas');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, padding, padding);
        return canvas.toDataURL('image/png');
    }
    async history(action: 'undo' | 'redo' | 'clear'): Promise<void> {
        const history = this.getHistory();
        if (!history) return;
        if (action === 'clear') { history.clear(); return; }
        this.replaying = true;
        this.recording = true;
        try {
            history[action]();
            await this.commit(false, async () => { await this.graph.draw(); });
        }
        finally { this.replaying = false; }
    }
    historyState(): {canUndo: boolean; canRedo: boolean} {
        const history = this.getHistory();
        return {canUndo: history?.canUndo() ?? false, canRedo: history?.canRedo() ?? false};
    }
    syncPins(ids?: string[]): void { this.getPins()?.sync(ids); }
    releasePins(ids: string[]): void { this.getPins()?.release(ids); }
    stop(): void {
        this.alive = false;
        this.handler = () => {};
        this.finishDrag?.(); this.finishDrag = undefined; this.dragIdle = null;
        if (this.initialized) this.graph.stopLayout();
    }
    destroy(): void {
        this.bindings.forEach(([name, handler]) => this.graph.off(name, handler));
        this.bindings.length = 0;
        this.graph.destroy();
    }
}
