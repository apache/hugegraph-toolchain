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

import {useEffect, useMemo, useRef, useState} from 'react';
import {Button, Empty, Segmented, Select, Spin, Table} from 'antd';
import {useTranslation} from 'react-i18next';
import * as api from '../../../../api';
import {Link} from 'react-router-dom';
import {GraphCanvas} from '../../../../visualization/react';
import {adaptHubbleGraph} from '../../../../visualization/hubble/adapter';
import {useOlapTasks} from '../../olapTaskRegistry';
import {displayTaskId} from '../../../asyncTasks/taskIdentity';
import c from './index.module.scss';

const PAGE_SIZE = 12;
const MAX_POINTS = 300;
const PATH_SIZE = 6;
const PREVIEW_LAYOUT = {type: 'grid', options: {nodeSize: 54, nodeSpacing: 36}};
const valueText = value => typeof value === 'string' ? value : JSON.stringify(value ?? null);
const compact = (value, max) => value.length > max ? `${value.slice(0, max - 1)}…` : value;

export const buildConnectedSample = (vertices = [], edges = [], maxNodes = PATH_SIZE) => {
    const nodes = new Map(vertices.map(vertex => [String(vertex.ID), vertex]));
    const adjacency = new Map();
    for (const edge of edges) {
        const source = String(edge.source);
        const target = String(edge.target);
        if (!nodes.has(source) || !nodes.has(target)) continue;
        const targets = adjacency.get(source) || [];
        if (!targets.includes(target)) targets.push(target);
        adjacency.set(source, targets);
    }
    let best = [];
    for (const start of nodes.keys()) {
        const path = [start];
        const visited = new Set(path);
        let current = start;
        while (path.length < maxNodes) {
            const next = (adjacency.get(current) || []).find(id => !visited.has(id));
            if (!next) break;
            path.push(next);
            visited.add(next);
            current = next;
        }
        if (path.length > best.length) best = path;
    }
    return best.length > 1 ? best.map(id => nodes.get(id)) : [];
};

// A result is an ID/value pair, not a graph vertex or an edge. Keep this view
// read-only and do not feed synthetic elements into the editable graph canvas.
const OlapPreview = ({graphSpace, graph, taskId, warning, restoredOlapTask, onSelectTask}) => {
    const {t} = useTranslation();
    const recentTasks = useOlapTasks(graphSpace, graph);
    const [activeTaskId, setActiveTaskId] = useState(Number(taskId));
    const [state, setState] = useState({phase: 'waiting'});
    const [mode, setMode] = useState('graph');
    const [canvasController, setCanvasController] = useState(null);
    const canvasHost = useRef(null);
    const [cursor, setCursor] = useState(null);
    const [requestPage, setRequestPage] = useState(0);
    const [statusAttempt, setStatusAttempt] = useState(0);
    const accumulated = useRef([]);
    const accumulatedEdges = useRef(new Map());
    const edgePages = useRef(new Map());
    const pageInFlight = useRef(false);
    const taskOptions = useMemo(() => {
        const current = Number(taskId);
        return recentTasks.some(task => task.id === current) ? recentTasks
            : [{id: current, algorithm: ''}, ...recentTasks];
    }, [recentTasks, taskId]);

    useEffect(() => setActiveTaskId(Number(taskId)), [taskId]);


    useEffect(() => {
        accumulated.current = [];
        accumulatedEdges.current = new Map();
        edgePages.current = new Map();
        pageInFlight.current = false;
        setCursor(null);
        setRequestPage(0);
        setState({phase: 'waiting'});
        let active = true;
        let timer;
        let misses = 0;
        let seen = false;
        const load = async () => {
            try {
                const response = await api.analysis.fetchManageTaskById(graphSpace, graph, activeTaskId);
                if (!active) return;
                if (response?.status !== 200 || !Array.isArray(response.data)) throw new Error();
                const task = response.data.find(item => String(item.id) === String(activeTaskId));
                if (!task) {
                    misses += 1;
                    if (seen || misses >= 12) { setState({phase: 'not_found'}); return; }
                    timer = setTimeout(load, 5000);
                    return;
                }
                seen = true;
                if (['queued', 'running', 'pending'].includes(task.task_status)) {
                    timer = setTimeout(load, 5000);
                    return;
                }
                if (task.task_status !== 'success') {
                    setState({phase: 'failed'});
                    return;
                }
                setState({phase: 'loading'});
                setCursor(0);
                setRequestPage(page => page + 1);
            } catch {
                if (active) setState({phase: 'status_error'});
            }
        };
        load();
        return () => { active = false; clearTimeout(timer); };
    }, [activeTaskId, graphSpace, graph, statusAttempt]);

    useEffect(() => {
        if (!requestPage || cursor === null) return undefined;
        let active = true;
        const load = async () => {
            try {
                const response = await api.analysis.fetchOlapPreviewEdges(
                    graphSpace, graph, activeTaskId, cursor, PAGE_SIZE
                );
                if (!active) return;
                if (response?.status === 200 && response.data?.result_status === 'too_large') {
                    setState(previous => previous.vertices ? {...previous, phase: 'ready', pageError: false,
                        pageLoading: false, resultTooLarge: true, hasMore: false} : {phase: 'too_large'});
                    return;
                }
                if (response?.status === 200 && response.data?.result_status === 'expired') {
                    setState(previous => previous.vertices ? {...previous, phase: 'ready', resultExpired: true, pageError: false,
                        pageLoading: false, hasMore: false} : {phase: 'expired'});
                    return;
                }
                if (response?.status !== 200 || !Array.isArray(response.data?.vertices) ||
                    response.data.vertices.length > PAGE_SIZE ||
                    (response.data.has_more === true &&
                     (!Number.isSafeInteger(response.data.cursor) || response.data.cursor <= cursor))) {
                    throw new Error();
                }
                const pageVertices = response.data.vertices;
                const vertices = [...(cursor === 0 ? [] : accumulated.current), ...pageVertices];
                accumulated.current = vertices;
                if (cursor === 0) { accumulatedEdges.current = new Map(); edgePages.current = new Map(); }
                const ids = new Set(pageVertices.map(item => String(item.ID)));
                const edges = response.data.edges;
                let edgeStatus = 'unavailable';
                if (response.data.edges_status === 'available' && Array.isArray(edges) && edges.length <= 30 &&
                    edges.every(edge => typeof edge.source === 'string' && typeof edge.target === 'string' &&
                        ids.has(edge.source) && ids.has(edge.target))) {
                    for (const edge of edges) {
                        const key = JSON.stringify([edge.source, edge.target]);
                        accumulatedEdges.current.set(key, {id: key, source: edge.source, target: edge.target});
                    }
                    edgeStatus = 'partial';
                }
                if (pageVertices.length) {
                    edgePages.current.set(cursor, {failed: edgeStatus !== 'partial', count: pageVertices.length,
                        truncated: response.data.truncated === true});
                }
                const missing = [...edgePages.current.entries()].filter(([, page]) => page.failed)
                    .map(([start, page]) => `${start + 1}–${start + page.count}`).join(', ');
                setState({phase: 'ready', vertices, edges: [...accumulatedEdges.current.values()],
                    edgeStatus: [...edgePages.current.values()].some(page => !page.failed) ? 'partial' : 'unavailable',
                    missingEdgePages: missing, pageLoading: false,
                    next: response.data.cursor, hasMore: response.data.has_more === true});
            } catch {
                if (active) setState(previous => previous.vertices
                    ? {...previous, phase: 'ready', pageError: true, pageLoading: false}
                    : {phase: 'error'});
            } finally {
                if (active) pageInFlight.current = false;
            }
        };
        load();
        return () => { active = false; };
    }, [activeTaskId, cursor, graph, graphSpace, requestPage]);

    // GraphCanvas preserves user zoom on ordinary resizes. This bounded preview
    // needs to fit again when its host changes width, including sidebar changes.
    useEffect(() => {
        const host = canvasHost.current;
        if (mode !== 'graph' || !host || !canvasController || typeof ResizeObserver === 'undefined') return undefined;
        let timer;
        let previous = '';
        const observer = new ResizeObserver(entries => {
            const rect = entries[0]?.contentRect;
            if (!rect || rect.width <= 0 || rect.height <= 0) return;
            const size = `${Math.round(rect.width)}:${Math.round(rect.height)}`;
            if (size === previous) return;
            previous = size;
            clearTimeout(timer);
            timer = setTimeout(() => { void canvasController.setLayout(PREVIEW_LAYOUT).catch(() => {}); }, 150);
        });
        observer.observe(host);
        return () => { clearTimeout(timer); observer.disconnect(); };
    }, [canvasController, mode, state.phase]);

    const vertices = useMemo(() => state.vertices || [], [state.vertices]);
    const connectedSample = useMemo(() => buildConnectedSample(vertices, state.edges), [state.edges, vertices]);
    const graphData = useMemo(() => {
        const adapted = adaptHubbleGraph({vertices: vertices.map(item => ({id: String(item.ID),
            properties: {result: valueText(item.Value)}})), edges: state.edges || []});
        return {...adapted, nodes: adapted.nodes.map((node, index) => ({...node,
            style: {...node.style, size: 42, labelFontSize: 12,
                labelText: `${compact(String(vertices[index].ID), 10)}\n${compact(valueText(vertices[index].Value), 10)}`},
        })), edges: adapted.edges.map(edge => ({...edge, style: {...edge.style, labelText: ''}}))};
    }, [vertices, state.edges]);
    const columns = [{title: t('analysis.algorithm.preview_id'), dataIndex: 'ID', render: value => String(value)},
        {title: t('analysis.algorithm.preview_value'), dataIndex: 'Value', render: valueText}];
    const connectedSampleLabel = `${t('analysis.algorithm.preview_graph')} · ${t(
        'analysis.algorithm.preview_edges_partial', {count: state.edges?.length || 0})}`;
    return <div className={c.preview}>
        <div className={c.header}>
            <strong>{t('analysis.algorithm.preview_title')}</strong>
            <div className={c.headerActions}>
                {taskOptions.length > 1 && <Select className={c.runSelect} size='small' virtual={false}
                    aria-label={t('analysis.algorithm.preview_title')} value={activeTaskId}
                    onChange={value => { setActiveTaskId(value); onSelectTask?.(value); }} options={taskOptions.map(task => ({
                        value: task.id,
                        label: task.algorithm ? `${task.algorithm} · ${displayTaskId(task.id)}` : displayTaskId(task.id),
                    }))} />}
                {state.phase !== 'waiting' && <Link to={`/asyncTasks/${encodeURIComponent(graphSpace)}/${encodeURIComponent(graph)}`
                    + `?taskId=${encodeURIComponent(activeTaskId)}&submitted=1`}>
                    {t('analysis.algorithm.preview_task_detail')}
                </Link>}
            </div>
        </div>
        {warning && <div className={c.problem} role='status'>{warning}</div>}
        {state.phase === 'waiting' && <div className={c.asyncStatus}>
            <Spin description={t('analysis.algorithm.preview_running')} />
            <p>{t('analysis.algorithm.preview_async_hint')}</p>
            <Link to={`/asyncTasks/${encodeURIComponent(graphSpace)}/${encodeURIComponent(graph)}`
                + `?taskId=${encodeURIComponent(activeTaskId)}&submitted=1`}>
                {t('analysis.algorithm.preview_task_detail')}
            </Link>
        </div>}
        {state.phase === 'loading' && <Spin description={t('analysis.algorithm.preview_loading')} />}
        {['status_error', 'not_found'].includes(state.phase) && <div className={c.problem} role='status'>
            <span>{t(state.phase === 'not_found' ? 'analysis.algorithm.preview_not_found' : 'analysis.algorithm.preview_error')}</span>
            <Button onClick={() => { setState({phase: 'waiting'}); setStatusAttempt(value => value + 1); }}>
                {t('analysis.async_task.retry_result')}
            </Button>
        </div>}
        {state.phase === 'failed' && <p className={c.problem} role='status'>{t('analysis.algorithm.preview_failed')}</p>}
        {state.phase === 'expired' && <p className={c.problem} role='status'>{t('analysis.algorithm.preview_expired')}</p>}
        {state.phase === 'too_large' && <p className={c.problem} role='status'>{t('analysis.algorithm.preview_too_large')}</p>}
        {state.phase === 'error' && <div className={c.problem} role='status'>
            <span>{t('analysis.algorithm.preview_error')}</span>
            <Button onClick={() => { setState({phase: 'loading'}); setRequestPage(page => page + 1); }}>
                {t('analysis.async_task.retry_result')}
            </Button>
        </div>}
        {state.phase === 'ready' && <>
            {state.resultTooLarge && <p className={c.problem} role='status'>{t('analysis.algorithm.preview_too_large')}</p>}
            {state.resultExpired && <p className={c.problem} role='status'>{t('analysis.algorithm.preview_expired')}</p>}
            {state.pageError && <div className={c.problem} role='status'>
                <span>{t('analysis.algorithm.preview_error')}</span>
                <Button loading={state.pageLoading} onClick={() => {
                    if (pageInFlight.current) return;
                    pageInFlight.current = true;
                    setState(previous => ({...previous, pageLoading: true}));
                    setRequestPage(page => page + 1);
                }}>
                    {t('analysis.async_task.retry_result')}
                </Button>
            </div>}
            {state.edgeStatus === 'loading' && <Spin description={t('analysis.algorithm.preview_edges_loading')} />}
            {connectedSample.length > 1 && <section className={c.pathCard}
                aria-label={connectedSampleLabel}>
                <div className={c.pathHeading}>
                    <strong>{t('analysis.algorithm.preview_graph')}</strong>
                    <span>{t('analysis.algorithm.preview_edges_partial', {count: state.edges.length})}</span>
                </div>
                <div className={c.pathTrack}>
                    {connectedSample.map((item, index) => <div className={c.pathStep} key={String(item.ID)}>
                        {index > 0 && <span className={c.pathArrow} aria-hidden='true'>→</span>}
                        <div className={c.pathNode} title={`${String(item.ID)} · ${valueText(item.Value)}`}>
                            <span className={c.pathId}>{compact(String(item.ID), 18)}</span>
                            <span className={c.pathValue}>{compact(valueText(item.Value), 24)}</span>
                        </div>
                    </div>)}
                </div>
            </section>}
            <Segmented value={mode} onChange={setMode} options={['graph', 'table', 'json'].map(value => ({
                value, label: t(`analysis.algorithm.preview_${value}`),
            }))} />
            <div className={c.sampleNote}>
                {restoredOlapTask && activeTaskId === Number(taskId) && <span>{t('analysis.algorithm.preview_restored_hint')}</span>}
                <span>{t('analysis.algorithm.preview_sample', {count: vertices.length})} · {t('analysis.algorithm.preview_no_edges')}</span>
                {state.edgeStatus === 'partial' && <span>{t('analysis.algorithm.preview_edges_partial', {count: state.edges.length})}</span>}
                {state.missingEdgePages ? <span>{t('analysis.algorithm.preview_edges_missing', {pages: state.missingEdgePages})}</span>
                    : state.edgeStatus === 'unavailable' && <span>{t('analysis.algorithm.preview_edges_unavailable')}</span>}
            </div>
            {vertices.length === 0 ? <Empty description={t('analysis.algorithm.preview_empty')} /> : mode === 'graph'
                ? <div ref={canvasHost} className={c.canvas} aria-label={t('analysis.algorithm.preview_graph')}>
                    <GraphCanvas data={graphData}
                        datasetKey={`${activeTaskId}-${vertices.length}-${state.edges?.length || 0}`}
                        preset='preview' onReady={setCanvasController} layout={PREVIEW_LAYOUT}
                        style={{height: '100%'}} />
                </div> : mode === 'table'
                    ? <Table size='small' pagination={false} columns={columns} dataSource={vertices}
                        rowKey={item => String(item.ID)} />
                    : <pre className={c.json}>{JSON.stringify(vertices, null, 2)}</pre>}
            {state.hasMore && !state.pageError && vertices.length < MAX_POINTS &&
                <Button loading={state.pageLoading} disabled={state.pageLoading} onClick={() => {
                if (pageInFlight.current) return;
                pageInFlight.current = true;
                setState(previous => ({...previous, pageLoading: true}));
                setCursor(state.next);
                setRequestPage(page => page + 1);
            }}>{t('analysis.algorithm.preview_more')}</Button>}
            {state.hasMore && vertices.length >= MAX_POINTS && <p>{t('analysis.algorithm.preview_limit')}</p>}
        </>}
    </div>;
};

export default OlapPreview;