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

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Button, Card, Dropdown, Space, Typography, Tooltip} from 'antd';
import {DownOutlined, UnorderedListOutlined} from '@ant-design/icons';
import {Link, useNavigate} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {GraphCanvas} from '../../visualization/react';
import dayjs from 'dayjs';
import _ from 'lodash';
import {adaptHubbleSchema} from '../../visualization/hubble/adapter';
import {isPdEnabled} from '../../utils/config';
import style from './index.module.scss';
import {byteConvert} from '../../utils/format';
import {getResourceDisplayName} from '../../utils/displayName';
import * as api from '../../api';
import {useAuthContext} from '../../auth/AuthContext';
import {sanitizePublicError} from '../../utils/publicError';
import {formatRecordedCount, isKnownCount} from '../../utils/graphStatistics';

const EMPTY_SCHEMA = {vertices: [], edges: []};
const CARD_LAYOUT = {type: 'dagre', options: {rankdir: 'LR', nodesep: 30, ranksep: 60}};
// This exact response is emitted only when the requested graph has no loaded
// Vermeer snapshot. Other 400, authorization and transport errors stay errors.
const VERMEER_LOAD_REQUIRED = 'Load this graph from OLAP graph compute before collecting Vermeer statistics';

const isVermeerLoadRequired = (source, error) => {
    const response = error?.response;
    const body = response?.data && typeof response.data === 'object' ? response.data : response;
    return source === 'vermeer' && Number(body?.status ?? response?.status) === 400
        && (body?.message ?? response?.message) === VERMEER_LOAD_REQUIRED;
};

const formatSnapshotTime = value => {
    if (value == null || value === '') return '--';
    const date = dayjs(typeof value === 'string' && /^\d{13}$/.test(value) ? Number(value) : value);
    return date.isValid() ? date.format('YYYY-MM-DD HH:mm:ss') : '--';
};

const TitleField = ({item, onClick, onKeyDown, schemaTypeCounts}) => {
    const {t} = useTranslation();
    const pdMode = isPdEnabled();
    const graphName = getResourceDisplayName(item.name, item.nickname);
    const graphspaceName = item.graphspace === 'DEFAULT'
        ? t('graphspace.default_name')
        : getResourceDisplayName(item.graphspace, item.graphspace_nickname);
    const displayName = pdMode
        ? `${_.truncate(graphspaceName, {length: 12})}-${_.truncate(graphName, {length: 12})}`
        : graphName;
    const fullTitle = pdMode
        ? `${graphspaceName}-${graphName}`
        : graphName;
    const createdAt = item.create_time
        ? dayjs(item.create_time).format('YYYY-MM-DD')
        : '--';

    return (
        <>
            <Typography.Text
                style={{maxWidth: 244}}
                ellipsis={{ellipsis: true}}
                title={fullTitle}
                onClick={onClick}
                onKeyDown={onKeyDown}
                role='button'
                tabIndex={0}
            >
                {displayName}
            </Typography.Text>
            {item.default && <span className={style.default}>{t('common.label.default')}</span>}
            <div className={style.subtitle}>
                {t('graph.card.storage')}: {item.storage >= 0 ? byteConvert(item.storage) : '--'}
                {' / '}
                {t('graph.col.create_time')}: {createdAt}
                {' / '}
                {schemaTypeCounts ? t('graph.card.schema_types', schemaTypeCounts) : t('graph.card.schema_info')}
            </div>
        </>
    );
};

const GraphCard = ({item, menus, canMutate = true, canComputeStatistics = false}) => {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const graphName = getResourceDisplayName(item.name, item.nickname);
    const graphspace = item.graphspace || 'DEFAULT';
    const {identityEpoch} = useAuthContext();
    const key = JSON.stringify([graphspace, item.name, identityEpoch]);
    const collectionRequest = useRef(null);
    const [collecting, setCollecting] = useState(false);
    const [collectionError, setCollectionError] = useState('');
    const [vermeerLoadRequired, setVermeerLoadRequired] = useState(false);
    const [collectionSource, setCollectionSource] = useState('server');
    const [schema, setSchema] = useState(null);
    const [snapshot, setSnapshot] = useState(null);
    const schemaView = item.schemaview || (schema?.key === key ? schema.data : null);
    const statistic = snapshot?.key === key && snapshot.collected ? snapshot.data
        : item.statistic?.vertex != null && item.statistic?.edge != null
            ? item.statistic : snapshot?.key === key ? snapshot.data : null;
    useEffect(() => {
        collectionRequest.current = null;
        setCollecting(false);
        setCollectionError('');
        setVermeerLoadRequired(false);
        setCollectionSource('server');
        return () => { collectionRequest.current = null; };
    }, [key]);

    const collectStatistics = async (source = 'server') => {
        if (collectionRequest.current !== null) return;
        const request = Symbol('graph-card-statistics');
        collectionRequest.current = request;
        setCollecting(true);
        setCollectionError('');
        setVermeerLoadRequired(false);
        setCollectionSource(source);
        try {
            const config = {suppressBusinessErrorToast: true};
            let response;
            if (source === 'vermeer') {
                response = await api.manage.getVermeerStatistic(graphspace, item.name, config);
            } else {
                response = await api.manage.getGraphStatistic(graphspace, item.name, config);
            }
            if (collectionRequest.current !== request) return;
            if (response?.status !== 200 || !isKnownCount(response.data?.vertex_count)
                || !isKnownCount(response.data?.edge_count)) {
                throw Object.assign(new Error(''), {response});
            }
            setSnapshot({key, collected: true, data: {
                ...response.data,
                source: response.data.source || source,
                vertex: response.data.vertex_count,
                edge: response.data.edge_count,
            }});
        } catch (error) {
            if (collectionRequest.current === request) {
                setVermeerLoadRequired(isVermeerLoadRequired(source, error));
                setCollectionError(sanitizePublicError(error?.response?.data?.message
                    ?? error?.response?.message ?? error?.message)
                    || t('graph.detail.statistics_unavailable'));
            }
        } finally {
            if (collectionRequest.current === request) {
                collectionRequest.current = null;
                setCollecting(false);
            }
        }
    };
    useEffect(() => {
        let active = true;
        if (!item.schemaview) {
            api.manage.getGraphView(graphspace, item.name, {suppressBusinessErrorToast: true}).then(res => {
                if (active) setSchema({key, data: res.status === 200 ? res.data : null, loaded: true});
            }).catch(() => {
                if (active) setSchema({key, data: null, loaded: true});
            });
        }
        if (item.statistic?.vertex == null || item.statistic?.edge == null) {
            api.analysis.getGraphData(graphspace, item.name, {suppressBusinessErrorToast: true}).then(res => {
                if (active) setSnapshot(current => current?.key === key && current.collected ? current : {key, data: res.status === 200 ? {
                    ...res.data, vertex: res.data?.vertexcount, edge: res.data?.edgecount,
                } : null, error: res.status !== 200});
            }).catch(() => {
                if (active) setSnapshot(current => current?.key === key && current.collected
                    ? current : {key, data: null, error: true});
            });
        }
        return () => { active = false; };
    }, [graphspace, item.name, item.schemaview, item.statistic, key]);
    const prepared = useMemo(() => {
        try {
            return {data: adaptHubbleSchema(schemaView || EMPTY_SCHEMA), error: null};
        }
        catch (error) {
            return {data: {nodes: [], edges: []}, error};
        }
    }, [schemaView]);
    const schemaIsEmpty = !prepared.error && prepared.data.nodes.length === 0 && prepared.data.edges.length === 0;
    const hasElementCounts = isKnownCount(statistic?.vertex) && isKnownCount(statistic?.edge);
    const overviewPath = `/graphspace/${graphspace}/graph/${item.name}/detail`;
    const schemaPath = `/graphspace/${graphspace}/graph/${item.name}/meta`;

    const handleGotoAnalysis = useCallback(() => {
        navigate(`/gremlin/${item.graphspace || 'DEFAULT'}/${item.name}`);
    }, [item, navigate]);

    const handleGotoSchema = useCallback(() => {
        navigate(schemaPath);
    }, [navigate, schemaPath]);

    const handleSchemaKeyDown = useCallback(event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleGotoSchema();
        }
    }, [handleGotoSchema]);

    return (
        <Card styles={{header: {
                paddingLeft: 20,
            }}}
            className={style.card}
            title={(
                <TitleField
                    item={item}
                    onClick={handleGotoSchema}
                    onKeyDown={handleSchemaKeyDown}
                    schemaTypeCounts={schemaView ? {
                        vertices: schemaView.vertices?.length || 0,
                        edges: schemaView.edges?.length || 0,
                    } : null}
                />
            )}

            extra={(
                <Dropdown
                    menu={{items: menus}}
                    trigger={['click']}
                >
                    <Button
                        type='text'
                        icon={<UnorderedListOutlined />}
                        aria-label={t('graph.card.more_actions', {graph: graphName})}
                    />
                </Dropdown>
            )}
            actions={[
                <Tooltip fresh key='counts' title={(vermeerLoadRequired && t('graph.card.vermeer_load_first')) || collectionError || (statistic?.source === 'vermeer'
                    ? `${t('graph.card.element_counts', {
                        vertices: formatRecordedCount(statistic.vertex, statistic),
                        edges: formatRecordedCount(statistic.edge, statistic),
                    })} — ${t('graph.card.vermeer_statistics_snapshot', {time: formatSnapshotTime(statistic.update_time)})}`
                    : hasElementCounts ? t(statistic.scan_limit > 0
                        ? 'graph.detail.bounded_statistics_hint' : 'graph.card.counts_tooltip',
                        {limit: statistic.scan_limit}) : t('graph.card.collect_counts'))}>
                    <div className={style.count_group}>
                        {statistic?.source === 'vermeer' && (
                            <span className={style.count_source}>{t('graph.card.vermeer_snapshot_label')}</span>
                        )}
                        <div className={style.count_actions}>
                        <Button className={style.count_button} type='link' size='small' loading={collecting}
                            aria-label={statistic?.source === 'vermeer' ? `${t('graph.card.vermeer_snapshot_label')} · `
                                + t('graph.card.element_counts', {
                                    vertices: formatRecordedCount(statistic.vertex, statistic),
                                    edges: formatRecordedCount(statistic.edge, statistic),
                                }) : undefined}
                            title={hasElementCounts ? t('graph.card.element_counts', {
                                vertices: formatRecordedCount(statistic.vertex, statistic),
                                edges: formatRecordedCount(statistic.edge, statistic),
                            }) : undefined}
                            onClick={() => collectStatistics(collectionSource)}>
                            <span className={style.element_counts}>
                                {hasElementCounts ? t('graph.card.element_counts', {
                                    vertices: formatRecordedCount(statistic.vertex, statistic),
                                    edges: formatRecordedCount(statistic.edge, statistic),
                                }) : t(collectionError ? 'graph.detail.retry_statistics'
                                    : snapshot?.key === key
                                        ? snapshot.error ? 'graph.detail.statistics_unavailable'
                                            : 'graph.detail.not_collected' : 'graph.detail.loading')}
                            </span>
                        </Button>
                        {canComputeStatistics && <Dropdown menu={{items: [
                            {key: 'server', label: t('graph.card.server_statistics')},
                            {key: 'vermeer', label: t('graph.card.vermeer_statistics')},
                        ], onClick: ({key: source}) => collectStatistics(source)}} trigger={['click']}>
                            <Button type='text' size='small' icon={<DownOutlined />}
                                disabled={collecting} aria-label={t('graph.card.statistics_source')} />
                        </Dropdown>}
                        </div>
                    </div>
                </Tooltip>,
                <Link key='overview' to={overviewPath}>{t('graph.card.overview')}</Link>,
                <Link key='query' to={`/gremlin/${graphspace}/${item.name}`}>
                    {t('graph.card.query_graph')}
                </Link>,
            ].filter(Boolean)}
        >
            {!schemaView ? (
                <div className={style.empty_schema}>
                    <span>{t(schema?.key === key && schema.loaded
                        ? 'graph.card.schema_unavailable' : 'graph.card.schema_loading')}</span>
                    <Button size='small' onClick={handleGotoSchema}>{t('graph.menu.view_schema')}</Button>
                </div>
            ) : prepared.error ? (
                <div role='alert'>{t('schema.image_view.load_failed')}</div>
            ) : schemaIsEmpty ? (
                <div className={style.empty_schema}>
                    <strong>{t('graph.card.empty_schema')}</strong>
                    <span>{t('graph.card.empty_schema_help')}</span>
                    <Space>
                        <Button
                            type={canMutate ? 'primary' : 'default'}
                            size='small'
                            onClick={handleGotoSchema}
                        >
                            {canMutate
                                ? t('graph.card.open_schema')
                                : t('graph.menu.view_schema')}
                        </Button>
                        <Button size='small' onClick={handleGotoAnalysis}>
                            {t('graph.card.query_graph')}
                        </Button>
                    </Space>
                </div>
            ) : (
                <div
                    className={style.card_content}
                    onClick={handleGotoSchema}
                    onKeyDown={handleSchemaKeyDown}
                    role='button'
                    tabIndex={0}
                    aria-label={t('graph.card.view_schema', {graph: graphName})}
                >
                    <GraphCanvas
                        key={JSON.stringify([graphspace, item.name])}
                        data={prepared.data}
                        preset='thumbnail'
                        layout={CARD_LAYOUT}
                        style={{height: 153}}
                        aria-label={t('graph.card.view_schema', {graph: graphName})}
                    />
                </div>
            )}
            {vermeerLoadRequired && (
                <div className={style.statistics_guidance} role='status'>
                    <span>{t('graph.card.vermeer_load_first')}</span>
                    <Link to={`/algorithms/${encodeURIComponent(graphspace)}/${encodeURIComponent(item.name)}?engine=olap`}>
                        {t('graph.card.open_graph_compute')}
                    </Link>
                </div>
            )}
        </Card>
    );
};

export default GraphCard;
