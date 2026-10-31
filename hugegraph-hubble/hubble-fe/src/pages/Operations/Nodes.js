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

import {Alert, Button, Input, message, Select, Space, Table, Tag, Tooltip} from 'antd';
import {CopyOutlined, CrownOutlined, SearchOutlined} from '@ant-design/icons';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Link, useLocation, useNavigate, useSearchParams} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {getNodes, getOverview} from '../../api/operations';
import SourceDiagnostics, {DIAGNOSTICS_ID, SOURCE_TYPES} from './SourceDiagnostics';
import {isPdEnabled} from '../../utils/config';
import {
    displayNodeType,
    displayHealthStatus,
    HealthStatus,
    nodeRoleLabel,
    RefreshButton,
    TierIcon,
} from './components';
import {formatObservedAt, hasStaleMetrics, markSourcesStale, metricIssueReason} from './topology';
import {operationsReturnState} from './navigation';
import {markNodeStale, ReadinessStatus} from './Readiness';
import './operations.scss';

const stopRowNavigation = event => event.stopPropagation();

const shortNodeId = id => {
    const normalized = String(id ?? '');
    return normalized.length > 12 ? `…${normalized.slice(-12)}` : normalized;
};

const NodeIdentityCell = ({record, returnState, unavailable, t}) => {
    const name = record.name ?? unavailable;
    const copyId = useCallback(async event => {
        stopRowNavigation(event);
        try {
            await navigator.clipboard.writeText(record.id);
            message.success(t('operations.node_id_copied'));
        }
        catch {
            message.error(t('operations.node_id_copy_failed'));
        }
    }, [record.id, t]);
    const identityLabel = t('operations.node_identity_help', {name, id: record.id});
    const leader = record.role === 'LEADER';
    return (
        <span className='operations-node-identity-cell' aria-label={identityLabel}>
            <Link
                to={`/operations/nodes/${record.id}`}
                state={returnState}
                onClick={stopRowNavigation}
                aria-label={t('operations.view_node_details', {name})}
            >
                <span className='operations-node-name'>
                    <TierIcon type={record.type} />
                    <span className='operations-node-name-copy'>
                        <Tooltip title={identityLabel} placement='topLeft'>
                            <span className='operations-node-name-label'>{name}</span>
                        </Tooltip>
                        <span className='operations-node-id-label'>
                            {t('operations.node_id')}: {shortNodeId(record.id)}
                        </span>
                    </span>
                </span>
            </Link>
            {(record.role || record.type === 'STORE') && (
                <Tag
                    className={leader ? 'operations-node-role is-leader' : 'operations-node-role'}
                    icon={leader ? <CrownOutlined aria-hidden='true' /> : null}
                    aria-label={leader
                        ? t('operations.leader_role') : nodeRoleLabel(record, t)}
                >
                    {nodeRoleLabel(record, t)}
                </Tag>
            )}
            <Tooltip title={record.id}>
                <Button
                    className='operations-copy-node-id'
                    type='text'
                    shape='circle'
                    size='small'
                    icon={<CopyOutlined />}
                    aria-label={t('operations.copy_node_id')}
                    onClick={copyId}
                    onKeyDown={stopRowNavigation}
                />
            </Tooltip>
        </span>
    );
};

const Nodes = () => {
    const {t, i18n} = useTranslation();
    const pdMode = isPdEnabled();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [data, setData] = useState({items: [], total: 0, observed_at: null, stale: false});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const requestSequence = useRef(0);
    const params = useMemo(() => ({
        type: pdMode ? searchParams.get('type') || undefined : 'SERVER',
        status: searchParams.get('status') || undefined,
        query: searchParams.get('query') || undefined,
        page: Number(searchParams.get('page') || 1),
        page_size: Number(searchParams.get('page_size') || 20),
        sort: searchParams.get('sort') || 'name',
        order: searchParams.get('order') || 'asc',
    }), [pdMode, searchParams]);
    const sourceName = searchParams.get('source');
    const selectedSource = SOURCE_TYPES[sourceName] ? sourceName : undefined;
    const [searchValue, setSearchValue] = useState(params.query ?? '');

    const load = useCallback(async (refresh = false) => {
        const request = ++requestSequence.current;
        setLoading(true);
        setError(null);
        try {
            let response = await getNodes(refresh ? {...params, refresh: true} : params);
            if (selectedSource && !response.sources) {
                const overview = await getOverview();
                response = {...response, sources: overview.sources};
            }
            if (request === requestSequence.current) {
                if (pdMode) {
                    setData(response);
                }
                else {
                    const items = response.items.filter(item => item.type === 'SERVER');
                    setData({
                        ...response,
                        items,
                        total: items.length === response.items.length
                            ? response.total : items.length,
                    });
                }
            }
        }
        catch (requestError) {
            if (request !== requestSequence.current) {
                return;
            }
            if ([401, 403].includes(requestError?.status)) {
                setData({items: [], total: 0, observed_at: null, stale: false});
            }
            else {
                setData(snapshot => ({...snapshot, stale: true,
                    items: snapshot.items.map(markNodeStale),
                    diagnostic_nodes: snapshot.diagnostic_nodes?.map(markNodeStale),
                    sources: markSourcesStale(snapshot.sources)}));
            }
            setError(requestError);
        }
        finally {
            if (request === requestSequence.current) {
                setLoading(false);
            }
        }
    }, [params, pdMode, selectedSource]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        setSearchValue(params.query ?? '');
    }, [params.query]);

    const update = useCallback(values => {
        const next = new URLSearchParams(searchParams);
        Object.entries(values).forEach(([key, value]) => {
            value ? next.set(key, value) : next.delete(key);
        });
        if (!Object.prototype.hasOwnProperty.call(values, 'page')) {
            next.set('page', '1');
        }
        setSearchParams(next, {replace: true});
    }, [searchParams, setSearchParams]);

    const changeType = useCallback(value => update({type: value}), [update]);
    const changeStatus = useCallback(value => update({status: value}), [update]);
    const search = useCallback(() => update({query: searchValue}), [searchValue, update]);
    const clearSearch = useCallback(() => update({query: undefined}), [update]);
    const hasUserFilters = Boolean(
        (pdMode && params.type) || params.status || params.query
    );
    const clearFilters = useCallback(() => {
        setSearchValue('');
        update({
            type: undefined,
            status: undefined,
            query: undefined,
            page: '1',
        });
    }, [update]);
    const changeSearch = useCallback(event => {
        const value = event.currentTarget.value;
        setSearchValue(value);
        if (!value) {
            clearSearch();
        }
    }, [clearSearch]);
    const row = useCallback(record => ({
        tabIndex: 0,
        onClick: () => navigate(
            `/operations/nodes/${record.id}`,
            {state: operationsReturnState(location)}
        ),
        onKeyDown: event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate(
                    `/operations/nodes/${record.id}`,
                    {state: operationsReturnState(location)}
                );
            }
        },
    }), [location, navigate]);
    const changeTable = useCallback((pagination, filters, sorter) => update({
        page: String(pagination.current),
        page_size: String(pagination.pageSize),
        // Columns without a dataIndex (observed_at) leave sorter.field undefined,
        // so fall back to the column key that sortOrder() also matches on.
        sort: (sorter.columnKey ?? sorter.field) || 'name',
        order: sorter.order === 'descend' ? 'desc' : 'asc',
    }), [update]);
    const sortOrder = field => {
        return params.sort === field
            ? (params.order === 'desc' ? 'descend' : 'ascend')
            : null;
    };
    const unavailable = t('operations.unavailable');
    const observed = formatObservedAt(data.observed_at, i18n.language, unavailable);

    const columns = [
        {title: t('operations.node'), dataIndex: 'name', key: 'name', sorter: true,
            width: 330,
            sortOrder: sortOrder('name'), render: (_, record) => (
                <NodeIdentityCell
                    record={record}
                    returnState={operationsReturnState(location)}
                    unavailable={unavailable}
                    t={t}
                />
            )},
        {title: t('operations.type'), dataIndex: 'type', key: 'type', width: 86,
            sorter: true, sortOrder: sortOrder('type'), render: displayNodeType},
        {title: t('operations.status'), dataIndex: 'status', key: 'status', width: 140,
            sorter: true, sortOrder: sortOrder('status'),
            render: (value, record) => (
                <span className='operations-node-status'>
                    <HealthStatus status={value} reason={metricIssueReason(record)}
                        stale={data.stale || hasStaleMetrics(record)} />
                    <ReadinessStatus readiness={record.readiness} />
                </span>
            )},
        {title: t('operations.last_observed'), key: 'observed_at', width: 208,
            sorter: true, sortOrder: sortOrder('observed_at'), render: () => observed},
        {title: t('operations.version'), dataIndex: 'version', key: 'version', width: 104,
            responsive: ['lg'], render: value => value ?? '—'},
    ];

    return (
        <main className='operations-page operations-nodes'>
            <header className='operations-page-header'>
                <div>
                    <h2>{t('operations.nodes')}</h2>
                    <p className='operations-page-description'>
                        {t('operations.nodes_description')}
                    </p>
                    <div className='operations-overall-status'>
                        <span>{t('operations.observed_at')}: {observed}</span>
                        {data.stale && <strong>{t('operations.stale')}</strong>}
                    </div>
                </div>
                <RefreshButton loading={loading} onClick={() => load(true)} />
            </header>
            {error && (
                <Alert type='warning' showIcon title={t('operations.load_failed')} />
            )}
            <SourceDiagnostics
                sources={data.sources}
                sourceName={selectedSource}
                nodes={data.diagnostic_nodes ?? data.items}
                complete={Array.isArray(data.diagnostic_nodes)}
                focus={Boolean(selectedSource) && !loading && location.hash === `#${DIAGNOSTICS_ID}`}
            />
            <section className='operations-surface'>
                <div className='operations-filter-row'>
                    <Space wrap className='operations-filters'>
                        <Select
                            allowClear
                            value={params.type}
                            placeholder={t('operations.all_types')}
                            aria-label={t('operations.node_type_filter')}
                            onChange={changeType}
                            options={(pdMode ? ['SERVER', 'PD', 'STORE'] : ['SERVER'])
                                .map(value => ({
                                    value,
                                    label: displayNodeType(value),
                                }))}
                        />
                        <Select
                            allowClear
                            value={params.status}
                            placeholder={t('operations.all_statuses')}
                            aria-label={t('operations.node_status_filter')}
                            onChange={changeStatus}
                            options={['UP', 'DEGRADED', 'DOWN', 'UNKNOWN']
                                .map(value => ({
                                    value,
                                    label: displayHealthStatus(value, t),
                                }))}
                        />
                        <Input
                            allowClear
                            prefix={<SearchOutlined />}
                            value={searchValue}
                            placeholder={t('operations.search_nodes')}
                            aria-label={t('operations.search_nodes')}
                            onPressEnter={search}
                            onChange={changeSearch}
                        />
                        {hasUserFilters && (
                            <Button onClick={clearFilters}>
                                {t('operations.clear_filters')}
                            </Button>
                        )}
                    </Space>
                    <strong className='operations-result-count'>
                        {t('operations.result_count', {count: Number(data.total)})}
                    </strong>
                </div>
                <Table
                    className='operations-nodes-table'
                    rowKey='id'
                    loading={loading}
                    dataSource={data.items}
                    columns={columns}
                    onRow={row}
                    onChange={changeTable}
                    pagination={{
                        current: params.page,
                        pageSize: params.page_size,
                        total: Number(data.total),
                        showSizeChanger: true,
                    }}
                />
            </section>
        </main>
    );
};

export default Nodes;
