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

import {Alert, Button, Descriptions, Progress, Skeleton, Space, Statistic, Tooltip} from 'antd';
import {ArrowLeftOutlined, CheckCircleFilled} from '@ant-design/icons';
import {useCallback, useEffect, useRef, useState} from 'react';
import {useLocation, useNavigate, useParams} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {getNode} from '../../api/operations';
import {
    displayNodeType,
    HealthStatus,
    nodeRoleLabel,
    RefreshButton,
    SourceStrip,
    TierIcon,
} from './components';
import {formatMetricValue, formatObservedAt, markSourcesStale, selectAttentionSources} from './topology';
import {operationsReturnTo} from './navigation';
import SourceDiagnostics from './SourceDiagnostics';
import {ProcessLifecyclePanel, ReadinessPanel, markNodeStale} from './Readiness';
import './operations.scss';

const GROUPS_BY_TYPE = {
    SERVER: ['system', 'backend'],
    PD: ['system'],
    STORE: ['system', 'drive', 'raft', 'backend'],
};

const SOURCE_BY_TYPE = {SERVER: 'server', PD: 'pd', STORE: 'stores'};

const EMPTY_STATE_BY_AVAILABILITY = {
    AVAILABLE: 'metric_no_data',
    UNSUPPORTED: 'unsupported',
    MALFORMED: 'metric_malformed',
    UNAVAILABLE: 'unavailable',
};

const BYTE_KEYS = new Set([
    'capacity_bytes', 'available_bytes', 'heap_used_bytes', 'nonheap_used_bytes',
]);

const HIDDEN_METRIC_KEYS = {
    drive: new Set(['total_space', 'free_space', 'size_unit']),
    backend: new Set(['capacity_bytes', 'available_bytes']),
};

const metricLabel = (key, t) => t(`operations.metric_labels.${key}`, {
    defaultValue: key.replaceAll('_', ' '),
});

const metricGroupName = (group, nodeType, t) => {
    if (group === 'backend') {
        return t(nodeType === 'STORE'
            ? 'operations.metric_store_backend'
            : 'operations.metric_server_backend');
    }
    return t(`operations.metric_${group}`);
};

const formatBytes = value => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
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
            .format(amount / 1024)} GB`;
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
    if (parentKey === 'garbage_collector' && key.endsWith('_time')) {
        return formatMetricValue(
            new Intl.NumberFormat(undefined, {maximumFractionDigits: 2})
                .format(Number(value)),
            values.time_unit
        );
    }
    const unit = ['total_space', 'usable_space', 'free_space'].includes(key)
        ? values.size_unit : '';
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

const MetricStatistics = ({entries, values}) => {
    const {t} = useTranslation();
    const unavailable = t('operations.unavailable');
    return (
        <div className='operations-system-statistics operations-group-statistics'>
            {entries.map(([key, value]) => (
                <div className='operations-statistic-card' key={key}>
                    <span className='operations-statistic-title'>
                        {metricLabel(key, t)}
                    </span>
                    <div className='operations-statistic-value'>
                        {value !== null && typeof value === 'object'
                            && !Array.isArray(value)
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
                    </div>
                </div>
            ))}
        </div>
    );
};

const sumMetricValues = (values, suffix) => {
    const matching = Object.entries(values ?? {})
        .filter(([key, value]) => key.endsWith(suffix) && Number.isFinite(Number(value)))
        .map(([, value]) => Number(value));
    return matching.length > 0
        ? matching.reduce((total, value) => total + value, 0)
        : null;
};

const SystemMetricContent = ({values = {}}) => {
    const {t} = useTranslation();
    const unavailable = t('operations.unavailable');
    const basic = values.basic && typeof values.basic === 'object' ? values.basic : {};
    const thread = values.thread && typeof values.thread === 'object' ? values.thread : {};
    const garbageCollector = values.garbage_collector
        && typeof values.garbage_collector === 'object'
        ? values.garbage_collector : {};
    const garbageCollectionCount = sumMetricValues(garbageCollector, '_count');
    const garbageCollectionTime = sumMetricValues(garbageCollector, '_time');
    const runtimeStats = [
        ['process_cpu_usage', values.process_cpu_usage],
        ['system_cpu_usage', values.system_cpu_usage],
        ['systemload_average', values.systemload_average ?? basic.systemload_average],
        ['cpu_count', values.cpu_count ?? basic.processors],
        ['uptime_seconds', values.uptime_seconds
            ?? (basic.uptime === undefined || basic.uptime === null
                ? null : Number(basic.uptime) / 1000)],
        ['threads_live', values.threads_live ?? thread.count],
        ['heap_used_bytes', values.heap_used_bytes],
        ['nonheap_used_bytes', values.nonheap_used_bytes],
        ['garbage_collection_count', garbageCollectionCount],
        ['garbage_collection_time', garbageCollectionTime],
    ].filter(([, value]) => value !== undefined && value !== null);
    const memoryValues = [
        ['heap_usage', values.heap],
        ['nonheap_usage', values.nonheap],
    ].filter(([, value]) => value && typeof value === 'object');
    const handledKeys = new Set([
        'basic', 'heap', 'nonheap', 'thread', 'process_cpu_usage',
        'system_cpu_usage', 'systemload_average', 'cpu_count', 'uptime_seconds',
        'threads_live', 'heap_used_bytes', 'nonheap_used_bytes',
        'garbage_collector',
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
                            value={formatDisplayValue(
                                key,
                                value,
                                key === 'garbage_collection_time'
                                    ? 'garbage_collector' : null,
                                key === 'garbage_collection_time'
                                    ? garbageCollector : values,
                                unavailable
                            )}
                        />
                    ))}
                </div>
            )}
            {supplementalEntries.length > 0 && (
                <MetricStatistics entries={supplementalEntries} values={values} />
            )}
        </div>
    );
};

const MetricGroup = ({group, name, values, status = {}, emptyMessage}) => {
    const {t, i18n} = useTranslation();
    const metricValues = values && typeof values === 'object' && !Array.isArray(values)
        ? values : {};
    const failedGraphs = status.diagnostics?.failed_graphs;
    const entries = Object.entries(group === 'backend'
        && Number.isSafeInteger(failedGraphs) && failedGraphs >= 0
        ? {...metricValues, failed_graphs: failedGraphs} : metricValues);
    const visibleEntries = entries.filter(([key]) =>
        !HIDDEN_METRIC_KEYS[group]?.has(key)
    );
    const availability = status.availability ?? 'UNSUPPORTED';
    const emptyState = EMPTY_STATE_BY_AVAILABILITY[availability] ?? 'unavailable';
    const showLastSuccess = status.last_success_at != null
        && (status.stale || status.observed_at == null);
    const displayedAt = showLastSuccess ? status.last_success_at : status.observed_at;
    const displayedTime = displayedAt == null ? null : formatObservedAt(
        displayedAt, i18n.language, t('operations.unavailable')
    );
    const availabilityLabel = t(`operations.availability_${availability.toLowerCase()}`, {
        defaultValue: availability,
    });
    const reasonLabel = status.reason ? t(`operations.reason_${status.reason}`, {
        defaultValue: status.reason.replaceAll('_', ' '),
    }) : null;
    const upgradeHelp = status.reason === 'unsupported_version'
        ? t('operations.reason_unsupported_version_help') : null;
    const availabilityStatus = (
        <strong className={`availability-${availability.toLowerCase()}`}>
            {availabilityLabel}
        </strong>
    );
    const statusDetails = (
        <div
            className='operations-metric-status'
            role='status'
            aria-label={availabilityLabel}
        >
            {status.fresh && !status.stale && (
                <Tooltip title={t('operations.fresh')}>
                    <CheckCircleFilled
                        className='operations-metric-fresh'
                        role='img'
                        aria-label={t('operations.fresh')}
                    />
                </Tooltip>
            )}
            {status.stale && <span>{t('operations.stale')}</span>}
            {reasonLabel && <span>{reasonLabel}</span>}
            {displayedTime && (
                <span>{t(showLastSuccess ? 'operations.last_success' : 'operations.last_observed')}: {displayedTime}</span>
            )}
        </div>
    );
    const metricHeader = (
        <header className='operations-metric-header'>
            <div className='operations-metric-title-row'>
                <h3>{name}</h3>
                {upgradeHelp ? (
                    <Tooltip title={upgradeHelp}>
                        <span tabIndex={0}>{availabilityStatus}</span>
                    </Tooltip>
                ) : availabilityStatus}
            </div>
            {statusDetails}
        </header>
    );
    const capacity = capacitySummary(values);
    if (visibleEntries.length === 0 && !capacity) {
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
            {group === 'system'
                ? <SystemMetricContent values={values} />
                : <MetricStatistics entries={visibleEntries} values={values} />}
        </section>
    );
};

const NodeDetail = () => {
    const {t, i18n} = useTranslation();
    const {nodeId} = useParams();
    const navigate = useNavigate();
    const location = useLocation();
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
            else {
                setData(snapshot => snapshot && {...snapshot, stale: true,
                    node: markNodeStale(snapshot.node),
                    sources: markSourcesStale(snapshot.sources)});
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
    const back = useCallback(() => {
        navigate(operationsReturnTo(location), {replace: true});
    }, [location, navigate]);
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
                    title={t('operations.node_unavailable')}
                    action={(
                        <Space>
                            <Button size='small' onClick={back}>
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
        return {availability: node.metrics?.[group] ? 'AVAILABLE' : 'UNSUPPORTED', stale: data?.stale === true};
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
                                {displayNodeType(node.type)} · {
                                    node.role
                                        ? nodeRoleLabel(node, t)
                                        : (node.version ?? t('operations.unavailable'))
                                }
                            </span>
                        </div>
                        <HealthStatus status={node.status} stale={data?.stale} size='large' />
                    </section>
                    <div className='operations-overall-status'>
                        <span>{t('operations.last_observed')}: {observed}</span>
                        {data?.stale && <strong>{t('operations.stale')}</strong>}
                    </div>
                </div>
                <RefreshButton loading={loading} onClick={refresh} />
            </header>
            {error && (
                <Alert type='warning' showIcon title={t('operations.refresh_failed')} />
            )}
            <SourceStrip
                sources={data?.sources}
                sourceNames={[SOURCE_BY_TYPE[node.type] ?? 'server']}
            />
            {selectAttentionSources({[SOURCE_BY_TYPE[node.type]]: source}).length > 0 && (
                <SourceDiagnostics sources={data?.sources}
                    sourceName={SOURCE_BY_TYPE[node.type]} nodes={[node]} />
            )}
            <section
                className='operations-surface operations-node-summary'
                aria-labelledby='operations-node-summary-heading'
            >
                <h3 id='operations-node-summary-heading'>
                    {t('operations.node_profile')}
                </h3>
                <Descriptions
                    column={{xxl: 4, xl: 3, lg: 2, md: 1, sm: 1, xs: 1}}
                    items={[
                        {key: 'type', label: t('operations.type'), children: displayNodeType(node.type)},
                        node.role && {key: 'role', label: t('operations.role'), children: nodeRoleLabel(node, t)},
                        {key: 'version', label: t('operations.version'), children: node.version ?? '—'},
                        {key: 'id', label: t('operations.node_id'), children: node.id},
                    ].filter(Boolean)}
                />
            </section>
            <ReadinessPanel readiness={node.readiness} />
            {node.type === 'STORE' && <ProcessLifecyclePanel lifecycle={node.process_lifecycle} />}
            <section
                className='operations-metric-grid'
                aria-label={t('operations.node_metrics')}
            >
                {applicableMetricGroups.map(group => {
                    const status = metricStatus(group);
                    return (
                        <MetricGroup
                            key={group}
                            group={group}
                            name={metricGroupName(group, node.type, t)}
                            values={node.metrics?.[group]}
                            status={status}
                        />
                    );
                })}
            </section>
        </main>
    );
};

export default NodeDetail;
