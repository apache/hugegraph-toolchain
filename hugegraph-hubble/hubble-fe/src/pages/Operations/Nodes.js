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

import {Alert, Button, Input, Select, Space, Table, Tooltip} from 'antd';
import {ReloadOutlined, SearchOutlined} from '@ant-design/icons';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {Link, useNavigate, useSearchParams} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {getNodes} from '../../api/operations';
import {HealthStatus, TierIcon} from './components';
import {formatObservedAt, hasStaleMetrics} from './topology';
import './operations.scss';

const stopRowNavigation = event => event.stopPropagation();

const Nodes = () => {
    const {t, i18n} = useTranslation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [data, setData] = useState({items: [], total: 0, observed_at: null, stale: false});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const params = useMemo(() => ({
        type: searchParams.get('type') || undefined,
        status: searchParams.get('status') || undefined,
        query: searchParams.get('query') || undefined,
        page: Number(searchParams.get('page') || 1),
        page_size: Number(searchParams.get('page_size') || 20),
        sort: searchParams.get('sort') || 'name',
        order: searchParams.get('order') || 'asc',
    }), [searchParams]);
    const [searchValue, setSearchValue] = useState(params.query ?? '');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await getNodes(params));
        }
        catch (requestError) {
            setError(requestError);
        }
        finally {
            setLoading(false);
        }
    }, [params]);

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
            width: 260,
            sortOrder: sortOrder('name'), render: (value, record) => (
                <Link
                    to={`/operations/nodes/${record.id}`}
                    onClick={stopRowNavigation}
                    aria-label={t('operations.view_node_details', {name: value})}
                >
                    <span className='operations-node-name'>
                        <TierIcon type={record.type} />
                        <Tooltip title={value ?? unavailable} placement='topLeft'>
                            <span className='operations-node-name-label' title={value ?? unavailable}>
                                {value ?? unavailable}
                            </span>
                        </Tooltip>
                    </span>
                </Link>
            )},
        {title: t('operations.type'), dataIndex: 'type', key: 'type', width: 86,
            sorter: true, sortOrder: sortOrder('type')},
        {title: t('operations.role'), dataIndex: 'role', key: 'role', width: 108,
            render: value => value ?? '—'},
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
                <Button icon={<ReloadOutlined />} loading={loading} onClick={load}>
                    {t('operations.refresh')}
                </Button>
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
                            options={['SERVER', 'PD', 'STORE'].map(value => ({value}))}
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
