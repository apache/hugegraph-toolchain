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

import {Alert, Button, Empty, message, Progress, Radio, Skeleton, Table, Tooltip} from 'antd';
import {
    ApartmentOutlined,
    CrownOutlined,
    DatabaseOutlined,
    DeploymentUnitOutlined,
    ExportOutlined,
    HddOutlined,
    RightOutlined,
} from '@ant-design/icons';
import {useCallback, useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Link} from 'react-router-dom';
import {getDashboard} from '../../api/auth';
import {getOverview} from '../../api/operations';
import {normalizeDashboardUrl} from '../../modules/navigation/ConsoleItem/dashboard';
import {
    ClusterTopology,
    displayNodeType,
    HealthStatus,
    RefreshButton,
    SourceStrip,
} from './components';
import {
    formatMetricValue,
    formatObservedAge,
    formatObservedAt,
    hasStaleMetrics,
    selectAttentionNodes,
} from './topology';
import './operations.scss';
import {TopbarPageContextSlot} from '../../components/Topbar/PageContextSlot';

const Overview = () => {
    const {t, i18n} = useTranslation();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [view, setView] = useState('topology');
    const [dashboard, setDashboard] = useState({status: 'checking', url: ''});
    const requestSequence = useRef(0);

    const load = useCallback(async refresh => {
        const request = ++requestSequence.current;
        data ? setRefreshing(true) : setLoading(true);
        setError(null);
        try {
            const response = await getOverview(refresh);
            if (request === requestSequence.current) {
                setData(response);
            }
        }
        catch (requestError) {
            if (request !== requestSequence.current) {
                return;
            }
            if ([401, 403].includes(requestError?.status)) {
                setData(null);
            }
            setError(requestError);
        }
        finally {
            if (request === requestSequence.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, [data]);

    useEffect(() => {
        load(false);
        // The first request must not restart when the snapshot changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        let cancelled = false;
        getDashboard().then(response => {
            if (cancelled) {
                return;
            }
            if (response?.status !== 200) {
                setDashboard({status: 'unavailable', url: ''});
                return;
            }
            if (!response.data?.configured) {
                setDashboard({status: 'unconfigured', url: ''});
                return;
            }
            const url = normalizeDashboardUrl(
                response.data.address, response.data.protocol
            );
            setDashboard({
                status: response.data.available ? 'configured' : 'unavailable',
                url,
            });
        }).catch(requestError => {
            if (cancelled) {
                return;
            }
            const status = requestError?.response?.status ?? requestError?.status;
            setDashboard({
                status: status === 401 || status === 403 ? 'hidden' : 'unavailable',
                url: '',
            });
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const refresh = useCallback(() => load(true), [load]);
    const changeView = useCallback(event => setView(event.target.value), []);
    const openDashboard = useCallback(() => {
        const popup = window.open(
            `${dashboard.url}/monitor/machine`,
            '_blank',
            'noopener,noreferrer'
        );
        if (!popup) {
            message.error(t('navigation_page.dashboard_popup_blocked'));
        }
    }, [dashboard.url, t]);

    if (loading && !data) {
        return <Skeleton active paragraph={{rows: 12}} />;
    }
    if (error && !data) {
        return (
            <main className='operations-page operations-overview'>
                <header className='operations-page-header'>
                    <div>
                        <h2>{t('operations.overview')}</h2>
                        <p className='operations-page-description'>
                            {t('operations.overview_description')}
                        </p>
                    </div>
                </header>
                <Alert
                    type='error'
                    showIcon
                    message={t('operations.load_failed')}
                    action={(
                        <Button size='small' onClick={refresh}>
                            {t('common.action.retry')}
                        </Button>
                    )}
                />
            </main>
        );
    }

    const unavailable = t('operations.unavailable');
    const observed = formatObservedAt(data?.observed_at, i18n.language, unavailable);
    const observedAge = formatObservedAge(
        data?.observed_at, i18n.language, unavailable
    );
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    const attentionNodes = selectAttentionNodes(nodes);
    const facts = data?.facts ?? {};
    const pdLeader = facts.pd_leader ?? nodes.find(node => (
        node.type === 'PD' && node.role === 'LEADER'
    ))?.name;
    const capacityPercent = Number.isFinite(facts.capacity_used)
        && Number.isFinite(facts.capacity_total) && facts.capacity_total > 0
        ? Math.round(facts.capacity_used / facts.capacity_total * 100)
        : null;
    const dashboardStatusReason = dashboard.status === 'checking'
        ? t('navigation_page.dashboard_checking')
        : dashboard.status === 'unconfigured'
            ? t('navigation_page.dashboard_unconfigured')
            : dashboard.status === 'unavailable'
                ? t('navigation_page.dashboard_unavailable') : undefined;
    const dashboardReason = [
        t('operations.dashboard_external_context'),
        dashboardStatusReason,
    ].filter(Boolean).join(' ');
    const nodeColumns = [
        {
            title: t('operations.node'),
            dataIndex: 'name',
            render: (name, node) => (
                <Link to={`/operations/nodes/${node.id}`}>{name ?? unavailable}</Link>
            ),
        },
        {title: t('operations.tier_header'), dataIndex: 'type', render: displayNodeType},
        {title: t('operations.role'), dataIndex: 'role', render: value => value ?? '—'},
        {
            title: t('operations.status'),
            dataIndex: 'status',
            render: (status, node) => (
                <HealthStatus status={status} stale={hasStaleMetrics(node)} />
            ),
        },
    ];
    const attentionColumns = [
        {
            title: t('operations.node'),
            dataIndex: 'name',
            render: name => <strong>{name ?? unavailable}</strong>,
        },
        {title: t('operations.tier_header'), dataIndex: 'type', render: displayNodeType},
        {title: t('operations.role'), dataIndex: 'role', render: value => value ?? '—'},
        {
            title: t('operations.status'),
            dataIndex: 'status',
            render: (status, node) => (
                <HealthStatus status={status} stale={hasStaleMetrics(node)} />
            ),
        },
        {
            title: t('operations.last_observed'),
            dataIndex: 'observed_at',
            render: value => formatObservedAt(
                value ?? data?.observed_at, i18n.language, unavailable
            ),
        },
        {
            title: t('operations.action'),
            key: 'action',
            render: (_, node) => (
                <Link to={`/operations/nodes/${node.id}`}>
                    {t('operations.view_details')}
                </Link>
            ),
        },
    ];
    const factRows = [
        {key: 'pd', icon: CrownOutlined, label: t('operations.fact_pd_leader'), value: pdLeader},
        {
            key: 'stores',
            icon: DatabaseOutlined,
            label: t('operations.fact_stores_up'),
            value: facts.stores_up === null || facts.stores_up === undefined
                ? null : `${facts.stores_up} / ${facts.stores ?? '—'}`,
        },
        {
            key: 'graphs',
            icon: DeploymentUnitOutlined,
            label: t('operations.fact_graphs'),
            value: facts.graphs,
        },
        {
            key: 'partitions',
            icon: ApartmentOutlined,
            label: t('operations.fact_partitions'),
            value: facts.partitions,
        },
        {
            key: 'replicas',
            icon: DatabaseOutlined,
            label: t('operations.fact_replicas'),
            value: facts.replicas,
        },
        {
            key: 'data_size',
            icon: HddOutlined,
            label: t('operations.fact_data_size'),
            value: facts.data_size === null || facts.data_size === undefined
                ? null : `${facts.data_size} ${facts.data_size_unit ?? ''}`.trim(),
        },
    ];

    return (
        <main className='operations-page operations-overview'>
            <header className='operations-page-header'>
                <div>
                    <h2>{t('operations.overview')}</h2>
                    <p className='operations-page-description'>
                        {t('operations.overview_description')}
                    </p>
                    <div className='operations-overall-status'>
                        <HealthStatus
                            status={data?.status}
                            reason={data?.reason}
                            size='large'
                        />
                        <span>
                            {t('operations.observed_at')}: {observed} · {observedAge}
                        </span>
                        {data?.stale && <strong>{t('operations.stale')}</strong>}
                    </div>
                </div>
                <div className='operations-header-actions operations-header-tools'>
                    {dashboard.status !== 'hidden' && (
                        <span className='operations-advanced-monitoring'>
                            <Tooltip title={dashboardReason}>
                                <span
                                    tabIndex={dashboardReason ? 0 : undefined}
                                    aria-label={dashboardReason
                                        ? `${t('operations.advanced_monitoring')}: ${dashboardReason}`
                                        : undefined}
                                >
                                    <Button
                                        type='text'
                                        icon={<ExportOutlined />}
                                        disabled={dashboard.status !== 'configured'}
                                        onClick={openDashboard}
                                        aria-label={t('operations.advanced_monitoring')}
                                    >
                                        {t('operations.advanced_monitoring')}
                                    </Button>
                                </span>
                            </Tooltip>
                        </span>
                    )}
                    <RefreshButton
                        loading={refreshing}
                        onClick={refresh}
                    />
                </div>
            </header>

            {data?.nodes ? (
                <>
                    <section className='operations-workbench'>
                        {error && (
                            <Alert
                                type='warning'
                                showIcon
                                message={t('operations.refresh_failed')}
                            />
                        )}
                        <TopbarPageContextSlot>
                            <Radio.Group
                                role='radiogroup'
                                aria-label={t('operations.overview_view_mode')}
                                className='operations-view-switch'
                                value={view}
                                onChange={changeView}
                                optionType='button'
                                buttonStyle='solid'
                                options={[
                                    {label: t('operations.topology_view'), value: 'topology'},
                                    {label: t('operations.node_list_view'), value: 'nodes'},
                                ]}
                            />
                        </TopbarPageContextSlot>
                        <div className='operations-overview-grid'>
                            <section className='operations-topology-surface'>
                                <div className='operations-section-heading'>
                                    <div>
                                        <h3>
                                            {view === 'topology'
                                                ? t('operations.topology')
                                                : t('operations.node_list_view')}
                                        </h3>
                                        <span>{t('operations.logical_relationship')}</span>
                                    </div>
                                </div>
                                {nodes.length === 0
                                    ? <Empty description={t('operations.empty_cluster')} />
                                    : view === 'topology'
                                        ? <ClusterTopology nodes={nodes} />
                                        : (
                                            <Table
                                                components={{
                                                    table: tableProps => (
                                                        <table
                                                            {...tableProps}
                                                            aria-label={t(
                                                                'operations.cluster_nodes'
                                                            )}
                                                        />
                                                    ),
                                                }}
                                                rowKey='id'
                                                columns={nodeColumns}
                                                dataSource={nodes}
                                                pagination={{pageSize: 8, hideOnSinglePage: true}}
                                                size='small'
                                            />
                                        )}
                            </section>
                            <aside className='operations-facts'>
                                <h3>{t('operations.cluster_facts')}</h3>
                                <div className='operations-fact-list'>
                                    {factRows.map(fact => {
                                        const Icon = fact.icon;
                                        return (
                                            <div
                                                className={`operations-fact fact-${fact.key}`}
                                                key={fact.key}
                                            >
                                                <Icon aria-hidden='true' />
                                                <span>{fact.label}</span>
                                                <strong>
                                                    {formatMetricValue(
                                                        fact.value, '', unavailable
                                                    )}
                                                </strong>
                                            </div>
                                        );
                                    })}
                                    <div className='operations-fact operations-capacity-fact'>
                                        <HddOutlined aria-hidden='true' />
                                        <span>{t('operations.fact_capacity')}</span>
                                        <strong>
                                            {capacityPercent === null ? unavailable : (
                                                `${facts.capacity_used} / ${facts.capacity_total} `
                                                + `${facts.capacity_unit ?? ''} `
                                                + `(${capacityPercent}%)`
                                            )}
                                        </strong>
                                        {capacityPercent !== null && (
                                            <Progress
                                                aria-label={t('operations.fact_capacity')}
                                                aria-valuemin={0}
                                                aria-valuemax={100}
                                                aria-valuenow={capacityPercent}
                                                percent={capacityPercent}
                                                showInfo={false}
                                                size='small'
                                            />
                                        )}
                                    </div>
                                </div>
                                <Link className='operations-facts-link' to='/operations/nodes'>
                                    {t('operations.view_all_nodes')} <RightOutlined />
                                </Link>
                            </aside>
                        </div>
                        <SourceStrip sources={data?.sources} />
                    </section>
                    {nodes.length > 0 && (
                        <section
                            className='operations-surface operations-attention'
                            aria-label={t('operations.attention_nodes')}
                        >
                            <div className='operations-attention-heading'>
                                <h3>{t('operations.attention_nodes')}</h3>
                                <Link to='/operations/nodes'>
                                    {t('operations.view_all_nodes')} <RightOutlined />
                                </Link>
                            </div>
                            {attentionNodes.length > 0 ? (
                                <Table
                                    rowKey='id'
                                    columns={attentionColumns}
                                    dataSource={attentionNodes}
                                    pagination={false}
                                    size='small'
                                />
                            ) : <p>{t('operations.all_nodes_healthy')}</p>}
                        </section>
                    )}
                </>
            ) : (
                <Alert
                    type='info'
                    showIcon
                    message={t('operations.health_only')}
                    description={t('operations.health_only_description')}
                />
            )}
        </main>
    );
};

export default Overview;
