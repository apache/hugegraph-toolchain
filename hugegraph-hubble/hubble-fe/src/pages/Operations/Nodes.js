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
import {Link, useNavigate, useSearchParams} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {getNodes} from '../../api/operations';
import {isPdEnabled} from '../../utils/config';
import {displayNodeType, HealthStatus, RefreshButton, TierIcon} from './components';
import {formatObservedAt, hasStaleMetrics} from './topology';
import './operations.scss';

const stopRowNavigation = event => event.stopPropagation();

const shortNodeId = id => {
    const normalized = String(id ?? '');
    return normalized.length > 12 ? `…${normalized.slice(-12)}` : normalized;
};

const NodeIdentityCell = ({record, unavailable, t}) => {
    const name = record.name ?? unavailable;
    const copyId = useCallback(async event => {
        stopRowNavigation(event);
        try {
            await navigator.clipboard.writeText(record.id);
            message.success(t('operations.node_id_copied'));
        }
        catch (error) {
            message.error(t('operations.node_id_copy_failed'));
        }
    }, [record.id, t]);
    const identityLabel = t('operations.node_identity_help', {name, id: record.id});
    const leader = record.role === 'LEADER';
    return (
        <span className='operations-node-identity-cell' aria-label={identityLabel}>
            <Link
                to={`/operations/nodes/${record.id}`}
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
            {record.role && (
                <Tag
                    className={leader ? 'operations-node-role is-leader' : 'operations-node-role'}
                    icon={leader ? <CrownOutlined aria-hidden='true' /> : null}
                    aria-label={leader ? t('operations.leader_role') : record.role}
                >
                    {record.role}
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
    const [searchValue, setSearchValue] = useState(params.query ?? '');

    const load = useCallback(async () => {
        const request = ++requestSequence.current;
        setLoading(true);
        setError(null);
        try {
            const response = await getNodes(params);
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
            setError(requestError);
        }
        finally {
            if (request === requestSequence.current) {
                setLoading(false);
            }
        }
    }, [params, pdMode]);

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
    const changeSearch = useCallback(event => {
        const value = event.currentTarget.value;
        setSearchValue(value);
        if (!value) {
            clearSearch();
        }
    }, [clearSearch]);
    const row = useCallback(record => ({
        tabIndex: 0,
        onClick: () => navigate(`/operations/nodes/${record.id}`),
        onKeyDown: event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate(`/operations/nodes/${record.id}`);
            }
        },
    }), [navigate]);
    const changeTable = useCallback((pagination, filters, sorter) => update({
        page: String(pagination.current),
        page_size: String(pagination.pageSize),
        sort: sorter.field || 'name',
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
                <NodeIdentityCell record={record} unavailable={unavailable} t={t} />
            )},
        {title: t('operations.type'), dataIndex: 'type', key: 'type', width: 86,
            sorter: true, sortOrder: sortOrder('type'), render: displayNodeType},
        {title: t('operations.status'), dataIndex: 'status', key: 'status', width: 140,
            sorter: true, sortOrder: sortOrder('status'),
            render: (value, record) => (
                <HealthStatus status={value} stale={hasStaleMetrics(record)} />
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
                <RefreshButton loading={loading} onClick={load} />
            </header>
            {error && (
                <Alert type='warning' showIcon message={t('operations.load_failed')} />
            )}
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
                                .map(value => ({value}))}
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
