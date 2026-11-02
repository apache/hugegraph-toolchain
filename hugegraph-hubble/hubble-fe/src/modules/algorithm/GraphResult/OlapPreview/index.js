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
import {Alert, Button, Empty, Segmented, Spin, Table} from 'antd';
import {useTranslation} from 'react-i18next';
import * as api from '../../../../api';
import {Link} from 'react-router-dom';
import {GraphCanvas} from '../../../../visualization/react';
import {adaptHubbleGraph} from '../../../../visualization/hubble/adapter';
import c from './index.module.scss';

const PAGE_SIZE = 30;
const MAX_POINTS = 300;
const valueText = value => typeof value === 'string' ? value : JSON.stringify(value ?? null);
const compact = (value, max) => value.length > max ? `${value.slice(0, max - 1)}…` : value;

// A result is an ID/value pair, not a graph vertex or an edge. Keep this view
// read-only and do not feed synthetic elements into the editable graph canvas.
const OlapPreview = ({graphSpace, graph, taskId}) => {
    const {t} = useTranslation();
    const [state, setState] = useState({phase: 'waiting'});
    const [mode, setMode] = useState('graph');
    const [cursor, setCursor] = useState(null);
    const [requestPage, setRequestPage] = useState(0);
    const [statusAttempt, setStatusAttempt] = useState(0);
    const accumulated = useRef([]);
    const accumulatedEdges = useRef(new Map());
    const edgePages = useRef(new Map());

    useEffect(() => {
        let active = true;
        let timer;
        let misses = 0;
        let seen = false;
        const load = async () => {
            try {
                const response = await api.analysis.fetchManageTaskById(graphSpace, graph, taskId);
                if (!active) return;
                if (response?.status !== 200 || !Array.isArray(response.data)) throw new Error();
                const task = response.data.find(item => String(item.id) === String(taskId));
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
    }, [graphSpace, graph, statusAttempt, taskId]);

    useEffect(() => {
        if (!requestPage || cursor === null) return undefined;
        let active = true;
        const load = async () => {
            try {
                const response = await api.analysis.fetchOlapPreviewEdges(graphSpace, graph, taskId, cursor, PAGE_SIZE);
                if (!active) return;
                if (response?.status === 200 && response.data?.result_status === 'expired') {
                    setState(previous => previous.vertices ? {...previous, phase: 'ready', resultExpired: true,
                        hasMore: false} : {phase: 'expired'});
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
                    edgeStatus, missingEdgePages: missing,
                    next: response.data.cursor, hasMore: response.data.has_more === true});
            } catch {
                if (active) setState(previous => previous.vertices
                    ? {...previous, phase: 'ready', pageError: true}
                    : {phase: 'error'});
            }
        };
        load();
        return () => { active = false; };
    }, [cursor, graph, graphSpace, requestPage, taskId]);

    const vertices = useMemo(() => state.vertices || [], [state.vertices]);
    const graphData = useMemo(() => {
        const adapted = adaptHubbleGraph({vertices: vertices.map(item => ({id: String(item.ID),
            properties: {result: valueText(item.Value)}})), edges: state.edges || []});
        return {...adapted, nodes: adapted.nodes.map((node, index) => ({...node,
            style: {...node.style, size: 42, labelFontSize: 12,
                labelText: `${compact(String(vertices[index].ID), 16)}\n${compact(valueText(vertices[index].Value), 14)}`},
        })), edges: adapted.edges.map(edge => ({...edge, style: {...edge.style, labelText: ''}}))};
    }, [vertices, state.edges]);
    const columns = [{title: t('analysis.algorithm.preview_id'), dataIndex: 'ID', render: value => String(value)},
        {title: t('analysis.algorithm.preview_value'), dataIndex: 'Value', render: valueText}];
    return <div className={c.preview}>
        <div className={c.header}>
            <strong>{t('analysis.algorithm.preview_title')}</strong>
            <Link to={`/asyncTasks/${encodeURIComponent(graphSpace)}/${encodeURIComponent(graph)}`
                + `?taskId=${encodeURIComponent(taskId)}&submitted=1`}>
                {t('analysis.algorithm.preview_task_detail')}
            </Link>
        </div>
        {state.phase === 'waiting' && <Spin description={t('analysis.algorithm.preview_running')} />}
        {state.phase === 'loading' && <Spin description={t('analysis.algorithm.preview_loading')} />}
        {['status_error', 'not_found'].includes(state.phase) && <Alert type='warning' showIcon
            title={t(state.phase === 'not_found' ? 'analysis.algorithm.preview_not_found' : 'analysis.algorithm.preview_error')}
            action={<Button onClick={() => { setState({phase: 'waiting'}); setStatusAttempt(value => value + 1); }}>
                {t('analysis.async_task.retry_result')}
            </Button>} />}
        {state.phase === 'failed' && <Alert type='error' showIcon title={t('analysis.algorithm.preview_failed')} />}
        {state.phase === 'expired' && <Alert type='warning' showIcon title={t('analysis.algorithm.preview_expired')} />}
        {state.phase === 'error' && <Alert type='error' showIcon title={t('analysis.algorithm.preview_error')}
            action={<Button onClick={() => { setState({phase: 'loading'}); setRequestPage(page => page + 1); }}>
                {t('analysis.async_task.retry_result')}
            </Button>} />}
        {state.phase === 'ready' && <>
            {state.resultExpired && <Alert type='warning' showIcon title={t('analysis.algorithm.preview_expired')} />}
            {state.pageError && <Alert type='error' showIcon title={t('analysis.algorithm.preview_error')}
                action={<Button onClick={() => setRequestPage(page => page + 1)}>
                    {t('analysis.async_task.retry_result')}
                </Button>} />}
            <Alert type='info' showIcon title={t('analysis.algorithm.preview_sample', {count: vertices.length})}
                description={t('analysis.algorithm.preview_no_edges')} />
            {state.edgeStatus === 'loading' && <Spin description={t('analysis.algorithm.preview_edges_loading')} />}
            {state.edgeStatus === 'unavailable' && <Alert type='warning' showIcon
                title={t('analysis.algorithm.preview_edges_unavailable')} />}
            {state.edgeStatus === 'partial' && <Alert type='info' showIcon
                title={t('analysis.algorithm.preview_edges_partial', {count: state.edges.length})} />}
            {state.missingEdgePages && <Alert type='warning' showIcon
                title={t('analysis.algorithm.preview_edges_missing', {pages: state.missingEdgePages})} />}
            <Segmented value={mode} onChange={setMode} options={['graph', 'table', 'json'].map(value => ({
                value, label: t(`analysis.algorithm.preview_${value}`),
            }))} />
            {vertices.length === 0 ? <Empty description={t('analysis.algorithm.preview_empty')} /> : mode === 'graph'
                ? <div className={c.canvas} aria-label={t('analysis.algorithm.preview_graph')}>
                    <GraphCanvas data={graphData} datasetKey={`${vertices.length}-${state.edges?.length || 0}`}
                        preset='preview' layout={{type: 'grid', options: {nodeSize: 54, nodeSpacing: 36}}}
                        style={{height: '100%'}} />
                </div> : mode === 'table'
                    ? <Table size='small' pagination={false} columns={columns} dataSource={vertices}
                        rowKey={item => String(item.ID)} />
                    : <pre className={c.json}>{JSON.stringify(vertices, null, 2)}</pre>}
            {state.hasMore && !state.pageError && vertices.length < MAX_POINTS &&
                <Button disabled={state.edgeStatus === 'loading'} onClick={() => {
                setCursor(state.next);
                setRequestPage(page => page + 1);
            }}>{t('analysis.algorithm.preview_more')}</Button>}
            {state.hasMore && vertices.length >= MAX_POINTS && <p>{t('analysis.algorithm.preview_limit')}</p>}
        </>}
    </div>;
};

export default OlapPreview;
