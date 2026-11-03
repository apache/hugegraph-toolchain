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

import {Alert, Button, Descriptions, Drawer, Empty, Table, Typography} from 'antd';
import {
    AppstoreOutlined,
    ArrowLeftOutlined,
    ClockCircleOutlined,
    CloudServerOutlined,
    DashboardOutlined,
    DatabaseOutlined,
    CheckCircleFilled,
    DeploymentUnitOutlined,
    ExclamationCircleFilled,
    QuestionCircleOutlined,
    RightOutlined,
    TagsOutlined,
} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import {HealthStatus} from './components';
import {formatObservedAt} from './topology';
import {
    formatProcessBytes,
    processMetric,
    vermeerAvailable,
    vermeerHealth,
    vermeerNodeId,
    vermeerNodeReady,
    vermeerNodes,
    vermeerObservedAt,
    vermeerResourceSummary,
    vermeerResourceValues,
    vermeerSelectedNode,
} from './vermeer';

const Reason = ({reason}) => {
    const {t} = useTranslation();
    return reason ? t(`operations.vermeer_reason_${reason}`, {
        defaultValue: t('operations.vermeer_unknown_reason'),
    }) : null;
};

const VermeerHealth = ({cluster, node, size = 'normal'}) => {
    const {t} = useTranslation();
    const ready = node ? vermeerNodeReady(node, cluster) : null;
    const health = node ? (ready === true ? 'UP' : ready === false ? 'DEGRADED' : 'UNKNOWN')
        : vermeerHealth(cluster);
    const Icon = health === 'UP' ? CheckCircleFilled
        : health === 'UNKNOWN' ? QuestionCircleOutlined : ExclamationCircleFilled;
    const label = node ? (ready === true ? 'ready' : ready === false ? 'not_ready' : 'unknown')
        : !cluster?.configured ? 'not_deployed'
            : health === 'UP' ? 'normal' : health === 'UNKNOWN' ? 'unknown' : 'attention';
    return (
        <span className={'operations-health status-' + health.toLowerCase() + ' is-' + size}>
            <Icon aria-hidden='true' /> {t('operations.vermeer_' + label)}
        </span>
    );
};

const VermeerSummary = ({cluster, onOpen}) => {
    const {t} = useTranslation();
    if (!cluster?.configured) {
        return null;
    }
    const workerCount = Number.isInteger(cluster.registered_workers)
        ? cluster.registered_workers : '—';
    return (
        <div className='operations-compute-entry'>
            <button
                type='button'
                className='operations-vermeer-summary'
                onClick={onOpen}
                aria-label={t('operations.vermeer_open')}
            >
                <DeploymentUnitOutlined className='operations-vermeer-icon' aria-hidden='true' />
                <span className='operations-vermeer-summary-copy'>
                    <strong>Vermeer</strong>
                    <span>{t('operations.vermeer_compute_service')}</span>
                    <VermeerHealth cluster={cluster} />
                    {cluster.stale && <small>{t('operations.stale')}</small>}
                    <small>{t('operations.vermeer_members', {
                        masters: cluster.master ? 1 : '—', workers: workerCount,
                    })}</small>
                </span>
                <RightOutlined aria-hidden='true' />
            </button>
            <span className='operations-vermeer-entry-hint'>{t('operations.vermeer_open')}</span>
        </div>
    );
};

const NodeResources = ({node, cluster}) => {
    const {t, i18n} = useTranslation();
    const values = vermeerResourceValues(node, cluster);
    const cpu = processMetric(values.cpu, i18n.language);
    const rss = formatProcessBytes(values.rss, i18n.language);
    const stale = values.stale;
    return (
        <span className='operations-vermeer-resources'>
            <span>{t('operations.vermeer_cpu')}: {cpu === null
                ? t('operations.unavailable') : t('operations.vermeer_cpu_value', {value: cpu})}</span>
            <span>{t('operations.vermeer_rss')}: {rss ?? t('operations.unavailable')}</span>
            {stale && <span className='operations-vermeer-stale-metrics'>{t('operations.stale')}</span>}
        </span>
    );
};

const displayGroup = (group, t) => group === '$'
    ? t('operations.vermeer_default_group') : group ?? '—';

const VermeerNode = ({node, cluster, onOpen}) => {
    const {t, i18n} = useTranslation();
    const values = vermeerResourceValues(node, cluster);
    const cpu = processMetric(values.cpu, i18n.language);
    const rss = formatProcessBytes(values.rss, i18n.language);
    const Icon = node.role === 'MASTER' ? CloudServerOutlined : DeploymentUnitOutlined;
    const resources = [cpu !== null ? 'CPU ' + t('operations.vermeer_cpu_value', {value: cpu}) : null,
        rss ? 'RSS ' + rss : null]
        .filter(Boolean).join(' · ');
    return (
        <button type='button' className='operations-topology-node operations-vermeer-node'
            onClick={() => onOpen(vermeerNodeId(node))}>
            <Icon className='operations-vermeer-icon' aria-hidden='true' />
            <span className='operations-node-copy'>
                <strong>{node.name ?? node.id}</strong>
                <span>{node.role === 'MASTER' ? 'Master' : 'Worker'} · {node.version ?? '—'}</span>
                {node.role === 'WORKER' && <span>{t('operations.vermeer_group')}: {displayGroup(node.group, t)}</span>}
                <VermeerHealth cluster={cluster} node={node} />
            </span>
            <span className='operations-vermeer-node-metrics'>{resources
                || t('operations.vermeer_resources_unavailable')}</span>
        </button>
    );
};

const observedTierCount = (cluster, role, members) => {
    if (vermeerAvailable(cluster)) {
        return members.length;
    }
    if (cluster?.stale) {
        if (members.length > 0) {
            return members.length;
        }
        if (role === 'WORKER' && Number.isInteger(cluster.registered_workers)
            && cluster.registered_workers >= 0) {
            return cluster.registered_workers;
        }
    }
    return null;
};

const VermeerTopology = ({cluster, nodes, onOpen}) => {
    const {t} = useTranslation();
    return (
        <div className='operations-vermeer-topology' aria-label={t('operations.vermeer_topology')}>
            {['MASTER', 'WORKER'].map(role => {
                const members = nodes.filter(node => node.role === role);
                const count = observedTierCount(cluster, role, members);
                return (
                    <section className='operations-vermeer-tier' key={role}>
                        <div className='operations-tier-label'>
                            <strong>{t('operations.vermeer_tier_' + role.toLowerCase())}</strong>
                            <span>
                                {count === null ? t('operations.vermeer_node_count_unknown')
                                    : t('operations.node_count', {count})}
                                {cluster?.stale && count !== null
                                    && ' · ' + t('operations.vermeer_historical_snapshot')}
                            </span>
                        </div>
                        <div className='operations-vermeer-branch' data-role={role} data-node-count={members.length}>
                            {members.length ? members.map(node => (
                                <VermeerNode
                                    key={vermeerNodeId(node)}
                                    node={node}
                                    cluster={cluster}
                                    onOpen={onOpen}
                                />
                            )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={role === 'WORKER' && count !== 0
                                    ? t('operations.vermeer_worker_info_unavailable')
                                    : t('operations.vermeer_no_' + role.toLowerCase())} />}
                        </div>
                    </section>
                );
            })}
        </div>
    );
};

const VermeerFacts = ({cluster, nodes}) => {
    const {t, i18n} = useTranslation();
    const available = vermeerAvailable(cluster);
    const workers = nodes.filter(node => node.role === 'WORKER');
    const versions = [...new Set(nodes.map(node => node.version).filter(Boolean))];
    const groupsKnown = workers.every(node => typeof node.group === 'string' && node.group.length > 0);
    const groupCount = new Set(workers.map(node => node.group)).size;
    const resources = vermeerResourceSummary(nodes, cluster);
    const facts = [
        {key: 'master', icon: DeploymentUnitOutlined, label: t('operations.vermeer_master_status'),
            value: cluster?.master ? <VermeerHealth cluster={cluster} node={cluster.master} /> : '—'},
        {key: 'ready', icon: CheckCircleFilled, label: t('operations.vermeer_ready_workers'),
            value: available && Number.isInteger(cluster?.ready_workers)
                && Number.isInteger(cluster?.registered_workers)
                ? cluster.ready_workers + ' / ' + cluster.registered_workers : '—'},
        {key: 'registered', icon: DeploymentUnitOutlined, label: t('operations.vermeer_registered_workers'),
            value: available && Number.isInteger(cluster?.registered_workers) ? cluster.registered_workers : '—'},
        {key: 'groups', icon: AppstoreOutlined, label: t('operations.vermeer_worker_groups'),
            value: available && groupsKnown ? groupCount : '—'},
        {key: 'versions', icon: TagsOutlined, label: t('operations.version'),
            value: available && versions.length ? versions.join(' / ') : '—'},
        {key: 'cpu', icon: DashboardOutlined, label: t('operations.vermeer_collected_cpu'),
            value: resources.cpu.value === null ? t('operations.unavailable')
                : t('operations.vermeer_cpu_value', {value: processMetric(resources.cpu.value, i18n.language)}),
            coverage: available ? t('operations.vermeer_resource_coverage', {
                collected: resources.cpu.collected, total: resources.total,
            }) : t('operations.vermeer_resource_unconfirmed')},
        {key: 'rss', icon: DatabaseOutlined, label: t('operations.vermeer_collected_rss'),
            value: formatProcessBytes(resources.rss.value, i18n.language) ?? t('operations.unavailable'),
            coverage: available ? t('operations.vermeer_resource_coverage', {
                collected: resources.rss.collected, total: resources.total,
            }) : t('operations.vermeer_resource_unconfirmed')},
        {key: 'observed', icon: ClockCircleOutlined, label: t('operations.last_observed'),
            value: formatObservedAt(vermeerObservedAt(cluster),
                i18n.language, t('operations.unavailable'))},
    ];
    return (
        <aside className='operations-facts operations-vermeer-facts'>
            <h3>{t('operations.vermeer_cluster_facts')}</h3>
            <div className='operations-fact-list'>
                {facts.map(fact => {
                    const Icon = fact.icon;
                    return (
                        <div className={'operations-fact' + (fact.coverage ? ' operations-vermeer-resource-fact' : '')
                            + (fact.key === 'cpu' ? ' is-resource-start' : '')} key={fact.key}>
                            <Icon aria-hidden='true' />
                            <span>{fact.label}</span>
                            <span className='operations-vermeer-fact-value'>
                                <strong>{fact.value}</strong>
                                {fact.coverage && <small>{fact.coverage}</small>}
                            </span>
                        </div>
                    );
                })}
            </div>
            {cluster?.stale && <p className='operations-vermeer-resource-note'>{t('operations.stale')}</p>}
        </aside>
    );
};

const VermeerNodeDetails = ({node, cluster}) => {
    const {t, i18n} = useTranslation();
    const checks = node.checks ?? {};
    const observedAt = vermeerAvailable(cluster)
        ? node.observed_at ?? vermeerObservedAt(cluster) : vermeerObservedAt(cluster);
    const checkKeys = node.role === 'MASTER' ? ['http_ready', 'initialized', 'service_online']
        : ['registered', 'connection_ready', 'load_stream_ready', 'compute_stream_ready',
            'superstep_stream_ready'];
    return (
        <div className='operations-vermeer-details'>
            <VermeerHealth cluster={cluster} node={node} />
            {node.reason && <p><Reason reason={node.reason} /></p>}
            {cluster.stale && <Alert type='warning' showIcon title={t('operations.stale')}
                description={t('operations.vermeer_stale_description')} />}
            <h3>{t('operations.vermeer_readiness_checks')}</h3>
            <div className='operations-vermeer-checks'>
                {checkKeys.filter(key => key in checks).map(key => (
                    <div key={key}>
                        <span>{t('operations.vermeer_check_' + key)}</span>
                        <VermeerHealth cluster={cluster} node={{ready: checks[key]}} />
                    </div>
                ))}
                {Object.keys(checks).length === 0 && <p>{t('operations.vermeer_checks_unavailable')}</p>}
            </div>
            <h3>{t('operations.vermeer_core_resources')}</h3>
            <NodeResources node={node} cluster={cluster} />
            {node.metric_status?.reason && (
                <p><Reason reason={node.metric_status.reason} /></p>
            )}
            <p className='operations-vermeer-resource-note'>
                {t('operations.vermeer_process_scope')}
                {typeof node.metrics?.sample_window_seconds === 'number' && (
                    ' · ' + t('operations.vermeer_sample_window', {
                        seconds: node.metrics.sample_window_seconds,
                    })
                )}
            </p>
            <h3>{t('operations.vermeer_node_information')}</h3>
            <Descriptions column={1} size='small' items={[
                {key: 'role', label: t('operations.role'), children: node.role === 'MASTER' ? 'Master' : 'Worker'},
                {key: 'group', label: t('operations.vermeer_group'), children: displayGroup(node.group, t)},
                {key: 'version', label: t('operations.version'), children: node.version ?? '—'},
                {key: 'address', label: t('operations.vermeer_address'), children: node.grpc_peer
                    ? <Typography.Text copyable={{text: node.grpc_peer, tooltips: [
                        t('operations.vermeer_copy_address'), t('operations.vermeer_address_copied'),
                    ]}}>{node.grpc_peer}</Typography.Text> : '—'},
                {key: 'launch', label: t('operations.vermeer_launch_time'), children: formatObservedAt(
                    typeof node.launch_time === 'string' ? Date.parse(node.launch_time) : node.launch_time,
                    i18n.language, t('operations.unavailable')
                )},
                {key: 'observed', label: t('operations.observed_at'), children: formatObservedAt(
                    observedAt,
                    i18n.language, t('operations.unavailable')
                )},
            ]} />
        </div>
    );
};

const VermeerOverview = ({cluster, mainStatus, mainStale, view, selectedNode, fullDetail, onSelect, onFullDetail}) => {
    const {t, i18n} = useTranslation();
    const nodes = vermeerNodes(cluster);
    const selected = vermeerSelectedNode(nodes, selectedNode);
    const available = vermeerAvailable(cluster);
    const listCountKnown = available || Boolean(cluster?.stale && nodes.length > 0);
    const columns = [
        {title: t('operations.node'), key: 'name', render: (_, node) => (
            <Button type='link' className='operations-node-name-link'
                onClick={() => onSelect(vermeerNodeId(node))}>{node.name ?? node.id}</Button>
        )},
        {title: t('operations.role'), dataIndex: 'role', render: role => role === 'MASTER' ? 'Master' : 'Worker'},
        {title: t('operations.status'), key: 'status', render: (_, node) => (
            <VermeerHealth cluster={cluster} node={node} />
        )},
        {title: t('operations.vermeer_group'), dataIndex: 'group', render: value => displayGroup(value, t)},
        {title: t('operations.version'), dataIndex: 'version', render: value => value ?? '—'},
        {title: t('operations.vermeer_cpu'), key: 'cpu', render: (_, node) => {
            const values = vermeerResourceValues(node, cluster);
            const cpu = processMetric(values.cpu, i18n.language);
            return cpu !== null ? t('operations.vermeer_cpu_value', {value: cpu})
                : t(values.stale ? 'operations.stale' : 'operations.unavailable');
        }},
        {title: t('operations.vermeer_rss'), key: 'rss', render: (_, node) => {
            const values = vermeerResourceValues(node, cluster);
            return formatProcessBytes(values.rss, i18n.language)
                ?? t(values.stale ? 'operations.stale' : 'operations.unavailable');
        }},
        {title: t('operations.action'), key: 'action', render: (_, node) => (
            <Button type='link' aria-label={t('operations.view_node_details', {name: node.name ?? node.id})}
                onClick={() => onSelect(vermeerNodeId(node))}>{t('operations.view_details')}</Button>
        )},
    ];
    return (
        <section className='operations-workbench operations-vermeer-workbench'>
            <div className='operations-vermeer-cluster-heading'>
                <div>
                    <h3>{t('operations.vermeer_cluster')}</h3>
                    <p>{t('operations.vermeer_worker_counts', {
                        ready: available && Number.isInteger(cluster?.ready_workers) ? cluster.ready_workers : '—',
                        registered: Number.isInteger(cluster?.registered_workers) ? cluster.registered_workers : '—',
                    })}</p>
                </div>
                <VermeerHealth cluster={cluster} />
            </div>
            {(!available || cluster?.status !== 'UP') && (
                <Alert className='operations-vermeer-alert' type={cluster?.configured ? 'warning' : 'info'} showIcon
                    title={!cluster?.configured ? t('operations.vermeer_not_deployed')
                        : cluster?.stale ? t('operations.stale') : t('operations.vermeer_attention')}
                    description={<Reason reason={cluster?.reason ?? (cluster?.configured
                        ? 'vermeer_cluster_unavailable' : 'vermeer_disabled')} />} />
            )}
            {fullDetail && selected ? (
                <>
                    <Button type='link' aria-label={t('operations.vermeer_back_cluster')}
                        icon={<ArrowLeftOutlined aria-hidden='true' />} onClick={() => onSelect(null)}>
                        {t('operations.vermeer_back_cluster')}
                    </Button>
                    <h3>{selected.name ?? selected.id}</h3>
                    <VermeerNodeDetails node={selected} cluster={cluster} />
                </>
            ) : (
                <>
                    {view === 'topology' && (
                        <div className='operations-overview-grid operations-vermeer-overview-grid'>
                            <section className='operations-topology-surface'>
                                <VermeerTopology cluster={cluster} nodes={nodes} onOpen={onSelect} />
                            </section>
                            <VermeerFacts cluster={cluster} nodes={nodes} />
                        </div>
                    )}
                    <div className='operations-vermeer-node-list'>
                        <h3>{t('operations.node_list_view')} ({listCountKnown ? nodes.length
                            : t('operations.vermeer_node_count_unknown')})
                            {cluster?.stale && listCountKnown
                                && ' · ' + t('operations.vermeer_historical_snapshot')}
                        </h3>
                        <Table rowKey={vermeerNodeId} dataSource={nodes} columns={columns}
                            pagination={nodes.length > 10 ? {pageSize: 10} : false} size='small'
                            scroll={{x: 800}}
                            locale={{emptyText: t('operations.vermeer_no_nodes')}} />
                    </div>
                    <Drawer title={selected?.name ?? selected?.id} open={Boolean(selected)}
                        onClose={() => onSelect(null)} size={440}
                        footer={<Button type='primary' onClick={onFullDetail}>
                            {t('operations.vermeer_full_detail')}
                        </Button>}>
                        {selected && <VermeerNodeDetails node={selected} cluster={cluster} />}
                    </Drawer>
                </>
            )}
            <div className='operations-vermeer-main-context'>
                <span>{t('operations.vermeer_main_cluster')}: <HealthStatus status={mainStatus} stale={mainStale} /></span>
            </div>
        </section>
    );
};

export {VermeerHealth, Reason as VermeerReason, VermeerSummary};
export default VermeerOverview;
