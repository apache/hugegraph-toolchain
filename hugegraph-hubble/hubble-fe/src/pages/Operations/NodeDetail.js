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

import {Alert, Button, Descriptions, Progress, Skeleton, Space, Statistic} from 'antd';
import {ArrowLeftOutlined} from '@ant-design/icons';
import {useCallback, useEffect, useRef, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {getNode} from '../../api/operations';
import {isPdEnabled} from '../../utils/config';
import {
    displayNodeType,
    HealthStatus,
    RefreshButton,
    SourceStrip,
    TierIcon,
} from './components';
import {formatMetricValue, formatObservedAt} from './topology';
import './operations.scss';

const GROUPS_BY_TYPE = {
    SERVER: ['system', 'backend'],
    PD: ['system'],
    STORE: ['system', 'drive', 'raft', 'backend'],
};

const SOURCE_BY_TYPE = {SERVER: 'server', PD: 'pd', STORE: 'stores'};

const EMPTY_STATE_BY_AVAILABILITY = {
    UNSUPPORTED: 'unsupported',
    MALFORMED: 'metric_malformed',
    UNAVAILABLE: 'unavailable',
};

const BYTE_KEYS = new Set([
    'capacity_bytes', 'available_bytes', 'heap_used_bytes', 'nonheap_used_bytes',
]);

const metricLabel = (key, t) => t(`operations.metric_labels.${key}`, {
    defaultValue: key.replaceAll('_', ' '),
});

const formatBytes = value => {
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let size = Number(value);
    if (!Number.isFinite(size)) {
        return null;
    }
    let unit = 0;
    while (Math.abs(size) >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit += 1;
    }
    return `${new Intl.NumberFormat(undefined, {maximumFractionDigits: 1}).format(size)} `
        + units[unit];
};

const formatDuration = value => {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) {
        return null;
    }
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.round(seconds % 60);
    return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
};

const formatUnitValue = (value, unit) => {
    const amount = Number(value);
    const normalized = String(unit ?? '').toUpperCase();
    if (!Number.isFinite(amount)) {
        return null;
    }
    if (normalized === 'MB' && Math.abs(amount) >= 1024) {
        return `${new Intl.NumberFormat(undefined, {maximumFractionDigits: 1})
            .format(amount / 1024)} GiB`;
    }
    return `${new Intl.NumberFormat(undefined, {maximumFractionDigits: 1}).format(amount)}`
        + `${normalized ? ` ${normalized}` : ''}`;
};

const formatDisplayValue = (key, value, parentKey, values, unavailable) => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return typeof value === 'string' ? value : unavailable;
    }
    if (BYTE_KEYS.has(key)) {
        return formatBytes(value) ?? unavailable;
    }
    if (['mem_total', 'mem_used'].includes(key) || (['heap', 'nonheap'].includes(parentKey)
        && ['used', 'max', 'committed'].includes(key))) {
        return formatUnitValue(value, 'MB') ?? unavailable;
    }
    if (key === 'uptime') {
        return formatDuration(Number(value) / 1000) ?? unavailable;
    }
    if (key.endsWith('_seconds')) {
        return formatDuration(value) ?? unavailable;
    }
    if (key.endsWith('_cpu_usage')) {
        return `${new Intl.NumberFormat(undefined, {maximumFractionDigits: 1})
            .format(Number(value) * 100)}%`;
    }
    const unit = parentKey === 'garbage_collector' && key.endsWith('_time')
        ? values.time_unit : (['total_space', 'usable_space', 'free_space'].includes(key)
            ? values.size_unit : '');
    if (unit) {
        return formatUnitValue(value, unit) ?? unavailable;
    }
    return formatMetricValue(
        new Intl.NumberFormat(undefined, {maximumFractionDigits: 2}).format(Number(value)),
        unit
    );
};

const capacitySummary = values => {
    const total = Number(values?.capacity_bytes ?? values?.total_space);
    const available = Number(values?.available_bytes ?? values?.usable_space);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(available)) {
        return null;
    }
    const used = Math.max(0, total - available);
    return {
        used,
        total,
        percent: Math.round(used / total * 100),
        unit: values?.capacity_bytes !== undefined ? 'B' : values?.size_unit,
    };
};

const formatCapacityValue = (value, unit) => {
    return String(unit).toUpperCase() === 'B'
        ? formatBytes(value) : formatUnitValue(value, unit);
};

const MemoryUsage = ({label, values, unavailable, t}) => {
    const used = Number(values?.used);
    const maximum = Number(values?.max);
    const hasUsed = Number.isFinite(used);
    const hasMaximum = Number.isFinite(maximum) && maximum > 0;
    const percent = hasUsed && hasMaximum
        ? Math.min(100, Math.max(0, Math.round(used / maximum * 100))) : 0;
    const usedLabel = hasUsed ? formatUnitValue(used, 'MB') : unavailable;
    const maximumLabel = hasMaximum ? formatUnitValue(maximum, 'MB') : unavailable;

    return (
        <div className='operations-memory-usage'>
            <div>
                <strong>{label}</strong>
                <span>{usedLabel} / {maximumLabel}</span>
            </div>
            <Progress
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={hasMaximum ? percent : undefined}
                aria-valuetext={`${usedLabel} / ${maximumLabel}`}
                percent={percent}
                showInfo={hasMaximum}
                strokeColor='var(--workbench-color-brand-strong)'
            />
            {Number.isFinite(Number(values?.committed)) && (
                <div className='operations-memory-committed'>
                    {metricLabel('committed', t)}: {' '}
                    {formatUnitValue(values.committed, 'MB')}
                </div>
            )}
        </div>
    );
};

const SystemMetricContent = ({values = {}}) => {
    const {t} = useTranslation();
    const unavailable = t('operations.unavailable');
    const basic = values.basic && typeof values.basic === 'object' ? values.basic : {};
    const thread = values.thread && typeof values.thread === 'object' ? values.thread : {};
    const runtimeStats = [
        ['process_cpu_usage', values.process_cpu_usage],
        ['system_cpu_usage', values.system_cpu_usage],
        ['systemload_average', values.systemload_average ?? basic.systemload_average],
        ['cpu_count', values.cpu_count ?? basic.processors],
        ['uptime', basic.uptime],
        ['uptime_seconds', values.uptime_seconds],
    ].filter(([, value]) => value !== undefined && value !== null);
    const threadStats = ['count', 'daemon', 'peak']
        .filter(key => thread[key] !== undefined && thread[key] !== null);
    const memoryValues = [
        ['heap_usage', values.heap],
        ['nonheap_usage', values.nonheap],
    ].filter(([, value]) => value && typeof value === 'object');
    const basicDetails = ['mem_total', 'mem_used']
        .filter(key => basic[key] !== undefined && basic[key] !== null);
    const handledKeys = new Set([
        'basic', 'heap', 'nonheap', 'thread', 'process_cpu_usage',
        'system_cpu_usage', 'systemload_average', 'cpu_count', 'uptime_seconds',
    ]);
    const supplementalEntries = Object.entries(values)
        .filter(([key]) => !handledKeys.has(key));

    return (
        <div className='operations-system-metrics'>
            {memoryValues.length > 0 && (
                <div
                    className='operations-system-memory'
                    role='group'
                    aria-label={t('operations.memory_usage')}
                >
                    {memoryValues.map(([labelKey, memory]) => (
                        <MemoryUsage
                            key={labelKey}
                            label={t(`operations.${labelKey}`)}
                            values={memory}
                            unavailable={unavailable}
                            t={t}
                        />
                    ))}
                </div>
            )}
            {runtimeStats.length > 0 && (
                <div
                    className='operations-system-statistics'
                    role='group'
                    aria-label={t('operations.cpu_runtime')}
                >
                    {runtimeStats.map(([key, value]) => (
                        <Statistic
                            key={key}
                            title={metricLabel(key, t)}
                            value={formatDisplayValue(key, value, null, values, unavailable)}
                        />
                    ))}
                </div>
            )}
            {threadStats.length > 0 && (
                <div
                    className='operations-system-statistics'
                    role='group'
                    aria-label={metricLabel('thread', t)}
                >
                    {threadStats.map(key => (
                        <Statistic
                            key={key}
                            title={metricLabel(key, t)}
                            value={thread[key]}
                        />
                    ))}
                </div>
            )}
            {basicDetails.length > 0 && (
                <div className='operations-system-details'>
                    {basicDetails.map(key => (
                        <div key={key}>
                            {metricLabel(key, t)}: {' '}
                            {formatDisplayValue(key, basic[key], 'basic', basic, unavailable)}
                        </div>
                    ))}
                </div>
            )}
            {supplementalEntries.length > 0 && (
                <Descriptions
                    className='operations-system-supplemental'
                    layout='vertical'
                    colon={false}
                    column={{xxl: 3, xl: 2, lg: 2, md: 1, sm: 1, xs: 1}}
                >
                    {supplementalEntries.map(([key, value]) => (
                        <Descriptions.Item key={key} label={metricLabel(key, t)}>
                            {value !== null && typeof value === 'object' && !Array.isArray(value)
                                ? Object.entries(value).map(([nestedKey, nestedValue]) => (
                                    <div key={nestedKey}>
                                        {metricLabel(nestedKey, t)}: {' '}
                                        {formatDisplayValue(
                                            nestedKey, nestedValue, key, value, unavailable
                                        )}
                                    </div>
                                ))
                                : formatDisplayValue(
                                    key, value, null, values, unavailable
                                )}
                        </Descriptions.Item>
                    ))}
                </Descriptions>
            )}
        </div>
    );
};

const MetricGroup = ({group, name, values, status = {}, emptyMessage}) => {
    const {t, i18n} = useTranslation();
    const entries = values && typeof values === 'object' && !Array.isArray(values)
        ? Object.entries(values) : [];
    const availability = status.availability ?? 'UNSUPPORTED';
    const emptyState = EMPTY_STATE_BY_AVAILABILITY[availability] ?? 'unavailable';
    const observed = status.observed_at ? formatObservedAt(
        status.observed_at, i18n.language, t('operations.unavailable')
    ) : null;
    const lastSuccess = status.last_success_at ? formatObservedAt(
        status.last_success_at, i18n.language, t('operations.unavailable')
    ) : null;
    const availabilityLabel = t(`operations.availability_${availability.toLowerCase()}`, {
        defaultValue: availability,
    });
    const reasonLabel = status.reason ? t(`operations.reason_${status.reason}`, {
        defaultValue: status.reason.replaceAll('_', ' '),
    }) : null;
    const statusDetails = (
        <div
            className='operations-metric-status'
            role='status'
            aria-label={availabilityLabel}
        >
            {status.fresh && <span>{t('operations.fresh')}</span>}
            {status.stale && <span>{t('operations.stale')}</span>}
            {reasonLabel && <span>{reasonLabel}</span>}
            {observed && <span>{t('operations.observed_at')}: {observed}</span>}
            {lastSuccess && <span>{t('operations.last_success')}: {lastSuccess}</span>}
        </div>
    );
    const metricHeader = (
        <header className='operations-metric-header'>
            <div className='operations-metric-title-row'>
                <h3>{name}</h3>
                <strong className={`availability-${availability.toLowerCase()}`}>
                    {availabilityLabel}
                </strong>
            </div>
            {statusDetails}
        </header>
    );
    const capacity = capacitySummary(values);
    if (entries.length === 0) {
        return (
            <section className='operations-surface operations-metric-group'>
                {metricHeader}
                <div className='operations-metric-empty' role='note'>
                    {emptyMessage ?? t(`operations.${emptyState}`)}
                </div>
            </section>
        );
    }
    return (
        <section className='operations-surface operations-metric-group'>
            {metricHeader}
            {capacity && (
                <div className='operations-capacity-summary'>
                    <div>
                        <strong>{t('operations.capacity_usage')}</strong>
                        <span>
                            {formatCapacityValue(capacity.used, capacity.unit)} / {' '}
                            {formatCapacityValue(capacity.total, capacity.unit)}
                        </span>
                    </div>
                    <Progress
                        aria-label={t('operations.capacity_usage')}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={capacity.percent}
                        percent={capacity.percent}
                        showInfo
                        strokeColor='#1769e0'
                    />
                </div>
            )}
            {group === 'system' ? <SystemMetricContent values={values} /> : (
                <Descriptions
                    layout='vertical'
                    colon={false}
                    column={{xxl: 3, xl: 2, lg: 2, md: 1, sm: 1, xs: 1}}
                >
                    {entries.map(([key, value]) => (
                        <Descriptions.Item key={key} label={metricLabel(key, t)}>
                            {value !== null && typeof value === 'object' && !Array.isArray(value)
                                ? Object.entries(value).map(([nestedKey, nestedValue]) => (
                                    <div key={nestedKey}>
                                        {metricLabel(nestedKey, t)}: {' '}
                                        {formatDisplayValue(
                                            nestedKey, nestedValue, key, value,
                                            t('operations.unavailable')
                                        )}
                                    </div>
                                ))
                                : formatDisplayValue(
                                    key, value, null, values, t('operations.unavailable')
                                )}
                        </Descriptions.Item>
                    ))}
                </Descriptions>
            )}
        </section>
    );
};

const NodeDetail = () => {
    const {t, i18n} = useTranslation();
    const pdMode = isPdEnabled();
    const {nodeId} = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const requestSequence = useRef(0);
    const load = useCallback(async refresh => {
        const request = ++requestSequence.current;
        setLoading(true);
        setError(null);
        try {
            const response = await getNode(nodeId, refresh);
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
            }
        }
    }, [nodeId]);

    useEffect(() => {
        load(false);
    }, [load]);
    const back = useCallback(() => navigate(-1), [navigate]);
    const refresh = useCallback(() => load(true), [load]);

    if (loading && !data) {
        return <Skeleton active paragraph={{rows: 10}} />;
    }
    if (error && !data) {
        return (
            <main className='operations-page operations-node-detail'>
                <header className='operations-page-header'>
                    <div><h2>{t('operations.node_detail')}</h2></div>
                </header>
                <Alert
                    type='error'
                    showIcon
                    message={t('operations.node_unavailable')}
                    action={(
                        <Space>
                            <Button href='/operations/nodes' size='small'>
                                {t('operations.back_to_nodes')}
                            </Button>
                            <Button size='small' type='primary' onClick={refresh}>
                                {t('common.action.retry')}
                            </Button>
                        </Space>
                    )}
                />
            </main>
        );
    }
    const node = data?.node ?? {};
    const observed = formatObservedAt(
        data?.observed_at, i18n.language, t('operations.unavailable')
    );
    const source = data?.sources?.[SOURCE_BY_TYPE[node.type]] ?? {};
    const applicableMetricGroups = GROUPS_BY_TYPE[node.type] ?? [];
    const metricStatus = group => {
        const current = node.metric_statuses?.[group];
        if (current) {
            return current;
        }
        if (GROUPS_BY_TYPE[node.type] && !applicableMetricGroups.includes(group)) {
            return {availability: 'NOT_APPLICABLE'};
        }
        if (source.availability && source.availability !== 'AVAILABLE') {
            return {
                availability: 'UNAVAILABLE',
                observed_at: source.observed_at,
                last_success_at: source.last_success_at,
                fresh: source.fresh,
                stale: source.stale,
                reason: source.reason,
            };
        }
        return {availability: node.metrics?.[group] ? 'AVAILABLE' : 'UNSUPPORTED'};
    };
    const metricScopeMessage = (group, status) => {
        if (status.availability !== 'NOT_APPLICABLE') {
            return null;
        }
        if (['drive', 'raft'].includes(group)) {
            return t('operations.metric_scope_store_only', {
                metric: t(`operations.metric_${group}`),
                nodeType: displayNodeType(node.type),
            });
        }
        if (group === 'backend' && node.type === 'PD') {
            return t('operations.metric_scope_backend', {
                nodeType: displayNodeType(node.type),
            });
        }
        return null;
    };
    return (
        <main className='operations-page operations-node-detail'>
            <header className='operations-page-header'>
                <div>
                    <Button
                        type='link'
                        icon={<ArrowLeftOutlined />}
                        onClick={back}
                    >
                        {t('operations.back')}
                    </Button>
                    <section
                        className='operations-node-identity'
                        aria-label={t('operations.node_identity')}
                    >
                        <TierIcon type={node.type} />
                        <div>
                            <h2>{node.name ?? t('operations.unavailable')}</h2>
                            <span>
                                {displayNodeType(node.type)} · {node.role ?? node.version
                                    ?? t('operations.unavailable')}
                            </span>
                        </div>
                        <HealthStatus status={node.status} size='large' />
                    </section>
                    <div className='operations-overall-status'>
                        <span>{t('operations.observed_at')}: {observed}</span>
                        {data?.stale && <strong>{t('operations.stale')}</strong>}
                    </div>
                </div>
                <RefreshButton loading={loading} onClick={refresh} />
            </header>
            {error && (
                <Alert type='warning' showIcon message={t('operations.refresh_failed')} />
            )}
            <SourceStrip
                sources={data?.sources}
                sourceNames={pdMode ? undefined : ['server']}
                detailed
            />
            <section
                className='operations-surface operations-node-summary'
                aria-labelledby='operations-node-summary-heading'
            >
                <h3 id='operations-node-summary-heading'>
                    {t('operations.node_profile')}
                </h3>
                <Descriptions column={{xxl: 4, xl: 3, lg: 2, md: 1, sm: 1, xs: 1}}>
                    <Descriptions.Item label={t('operations.type')}>
                        {displayNodeType(node.type)}
                    </Descriptions.Item>
                    {node.role && (
                        <Descriptions.Item label={t('operations.role')}>
                            {node.role}
                        </Descriptions.Item>
                    )}
                    <Descriptions.Item label={t('operations.version')}>
                        {node.version ?? '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('operations.node_id')}>{node.id}</Descriptions.Item>
                </Descriptions>
            </section>
            <section
                className='operations-metric-grid'
                aria-label={t('operations.node_metrics')}
            >
                {(pdMode ? ['system', 'drive', 'raft', 'backend']
                    : applicableMetricGroups).map(group => {
                    const status = metricStatus(group);
                    return (
                        <MetricGroup
                            key={group}
                            group={group}
                            name={t(`operations.metric_${group}`)}
                            values={node.metrics?.[group]}
                            status={status}
                            emptyMessage={metricScopeMessage(group, status)}
                        />
                    );
                })}
            </section>
        </main>
    );
};

export default NodeDetail;
