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

import {
    CheckCircleFilled,
    ClockCircleFilled,
    CloseCircleFilled,
    DatabaseOutlined,
    DeploymentUnitOutlined,
    ExclamationCircleFilled,
    QuestionCircleOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
} from '@ant-design/icons';
import {Button, Tooltip} from 'antd';
import {Link} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {
    formatObservedAge,
    formatObservedAt,
    hasStaleMetrics,
    selectTierNodes,
} from './topology';

const STATUS_ICON = {
    UP: CheckCircleFilled,
    DEGRADED: ExclamationCircleFilled,
    DOWN: CloseCircleFilled,
    UNKNOWN: QuestionCircleOutlined,
};

const formatReason = (reason, t) => {
    return reason ? t(`operations.reason_${reason}`, {
        defaultValue: reason.replaceAll('_', ' '),
    }) : null;
};

const NODE_TYPE_LABELS = {
    SERVER: 'Server',
    PD: 'PD',
    STORE: 'Store',
};

const displayNodeType = type => NODE_TYPE_LABELS[type] ?? type ?? '—';

const HealthStatus = ({status = 'UNKNOWN', reason, stale = false, size = 'normal'}) => {
    const {t} = useTranslation();
    const normalized = STATUS_ICON[status] ? status : 'UNKNOWN';
    const Icon = STATUS_ICON[normalized];
    return (
        <span className={`operations-health status-${normalized.toLowerCase()} is-${size}`}>
            <Icon aria-hidden='true' />
            <span>{normalized}</span>
            {stale && (
                <span className='operations-health-stale'>
                    <ClockCircleFilled aria-hidden='true' /> {t('operations.stale')}
                </span>
            )}
            {reason && (
                <span className='operations-health-reason'>{formatReason(reason, t)}</span>
            )}
        </span>
    );
};

const SourceStrip = ({sources = {}, detailed = false,
    sourceNames = ['server', 'pd', 'stores']}) => {
    const {t, i18n} = useTranslation();
    return (
        <section
            className={`operations-source-strip${detailed ? ' is-detailed' : ''}`}
            aria-label={t('operations.sources')}
        >
            {sourceNames.map(name => {
                const source = sources[name] ?? {};
                const age = source.observed_at ? formatObservedAge(
                    source.observed_at,
                    i18n.language,
                    t('operations.unavailable')
                ) : null;
                const observed = source.observed_at ? formatObservedAt(
                    source.observed_at,
                    i18n.language,
                    t('operations.unavailable')
                ) : null;
                const showLastSuccess = detailed || source.stale
                    || source.status !== 'UP' || source.availability !== 'AVAILABLE';
                return (
                    <div className='operations-source' key={name}>
                        <strong>
                            {displayNodeType(name === 'stores'
                                ? 'STORE' : name.toUpperCase())}
                        </strong>
                        <HealthStatus status={source.status} />
                        <span className='operations-source-state'>
                            {t(`operations.availability_${(
                                source.availability ?? 'UNSUPPORTED'
                            ).toLowerCase()}`, {defaultValue: source.availability ?? 'UNSUPPORTED'})}
                            {detailed && observed
                                ? ` · ${t('operations.observed_at')}: ${observed}`
                                : (age ? ` · ${age}` : '')}
                            {source.stale ? ` · ${t('operations.stale')}` : ''}
                            {source.reason ? ` · ${formatReason(source.reason, t)}` : ''}
                            {showLastSuccess && source.last_success_at
                                ? ` · ${t('operations.last_success')}: ${formatObservedAt(
                                    source.last_success_at,
                                    i18n.language,
                                    t('operations.unavailable')
                                )}`
                                : ''}
                        </span>
                    </div>
                );
            })}
        </section>
    );
};

const TIER_ICONS = {
    SERVER: DeploymentUnitOutlined,
    PD: SafetyCertificateOutlined,
    STORE: DatabaseOutlined,
};

const TierIcon = ({type}) => {
    const Icon = TIER_ICONS[type] ?? DeploymentUnitOutlined;
    return (
        <span className={`operations-node-icon type-${type?.toLowerCase()}`}>
            <Icon aria-label={`${type} icon`} role='img' />
        </span>
    );
};

const RefreshButton = ({loading = false, onClick}) => {
    const {t} = useTranslation();
    const label = t('operations.refresh');
    return (
        <Tooltip title={label}>
            <Button
                className='operations-refresh-button'
                type='text'
                shape='circle'
                icon={<ReloadOutlined />}
                loading={loading}
                onClick={onClick}
                aria-label={label}
            />
        </Tooltip>
    );
};

const TierNode = ({node}) => (
    <Link
        className={[
            'operations-topology-node',
            `status-${node.status?.toLowerCase()}`,
            node.type === 'PD' && node.role === 'LEADER' ? 'is-axis-node' : '',
        ].filter(Boolean).join(' ')}
        to={`/operations/nodes/${node.id}`}
        aria-label={`${node.type} ${node.name} ${node.role ?? ''} ${node.status}`}
    >
        <TierIcon type={node.type} />
        <span className='operations-node-copy'>
            <strong>{node.name}</strong>
            <span>{node.role ?? node.version ?? '—'}</span>
        </span>
        <HealthStatus status={node.status} stale={hasStaleMetrics(node)} />
    </Link>
);

const TopologyTier = ({type, nodes}) => {
    const {t} = useTranslation();
    const tier = selectTierNodes(nodes, type);
    return (
        <section className={`operations-tier tier-${type.toLowerCase()}`}>
            <div className='operations-tier-label'>
                <Link className='operations-tier-title' to={`/operations/nodes?type=${type}`}>
                    {displayNodeType(type)} {t('operations.tier')}
                </Link>
                <span>
                    {t('operations.node_count', {
                        count: nodes.filter(node => node.type === type).length,
                    })}
                </span>
            </div>
            <div className='operations-tier-branch' data-node-count={tier.visible.length}>
                {tier.visible.map((node, index) => (
                    <TierNode
                        key={node.id}
                        node={node}
                        index={index}
                    />
                ))}
                {tier.overflow > 0 && (
                    <Link
                        className='operations-topology-overflow'
                        to={`/operations/nodes?type=${type}`}
                        aria-label={t('operations.more_nodes', {count: tier.overflow})}
                    >
                        +{tier.overflow}
                    </Link>
                )}
            </div>
        </section>
    );
};

const ClusterTopology = ({nodes = []}) => {
    const {t} = useTranslation();
    return (
        <div className='operations-topology' aria-label={t('operations.topology_label')}>
            {['SERVER', 'PD', 'STORE'].map(type => (
                <TopologyTier
                    key={type}
                    type={type}
                    nodes={Array.isArray(nodes) ? nodes : []}
                />
            ))}
        </div>
    );
};

export {
    HealthStatus,
    SourceStrip,
    ClusterTopology,
    TierIcon,
    RefreshButton,
    formatReason,
    displayNodeType,
};
