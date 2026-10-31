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

import {Alert, Descriptions, Table} from 'antd';
import {useEffect, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {displayNodeType, formatReason, HealthStatus} from './components';
import {formatBytes, formatObservedAt, selectAttentionSources} from './topology';
import {sourceHealthStatus} from './sourceHealth';
import {metricNumber} from './vermeer';

const SOURCE_TYPES = {server: 'SERVER', pd: 'PD', stores: 'STORE'};
const DIAGNOSTICS_ID = 'operations-source-diagnostics';

const DiagnosticRequest = ({diagnostics = {}, owner}) => {
    const {t, i18n} = useTranslation();
    const bytes = value => {
        const formatted = formatBytes(value);
        return formatted ? `${formatted} (${new Intl.NumberFormat(i18n.language).format(value)} B)` : null;
    };
    const responseBytes = bytes(diagnostics.response_bytes);
    const limit = bytes(diagnostics.max_response_bytes);
    const failedGraphs = Number.isSafeInteger(diagnostics.failed_graphs) && diagnostics.failed_graphs >= 0
        ? diagnostics.failed_graphs : null;
    if (!diagnostics.request_path && !diagnostics.http_status && !responseBytes && !limit && failedGraphs === null) {
        return null;
    }
    return (
        <Descriptions title={owner} size='small' column={{xs: 1, sm: 2, lg: 3}} items={[
            diagnostics.request_path && {
                key: 'request', label: t('operations.diagnostic_request'),
                children: <code>{diagnostics.request_path}</code>,
            },
            diagnostics.http_status && {
                key: 'http', label: t('operations.diagnostic_http_status'), children: diagnostics.http_status,
            },
            responseBytes && {
                key: 'size', label: t('operations.diagnostic_response_size'),
                children: diagnostics.response_size_exact === false
                    ? t('operations.diagnostic_size_at_least', {size: responseBytes}) : responseBytes,
            },
            limit && {key: 'limit', label: t('operations.diagnostic_response_limit'), children: limit},
            failedGraphs !== null && {key: 'failed-graphs', label: t('operations.metric_labels.failed_graphs'),
                children: failedGraphs},
        ].filter(Boolean)} />
    );
};

const PdMetricMapping = ({mapping, nodes}) => {
    const {t} = useTranslation();
    if (!mapping) {
        return null;
    }
    const unavailable = t('operations.unavailable');
    const comparison = matches => t(matches ? 'operations.diagnostic_address_matches'
        : 'operations.diagnostic_address_differs');
    return (
        <div className='operations-pd-mapping'>
            <h4>{t('operations.diagnostic_pd_address_comparison')}</h4>
            <Descriptions size='small' column={{xs: 1, md: 3}} items={[
                {key: 'configured', label: t('operations.diagnostic_pd_configured_address'), span: 3,
                    children: <code>{mapping.configured_origin || unavailable}</code>},
                {key: 'status', label: t('operations.diagnostic_pd_mapping_result'),
                    children: t(`operations.diagnostic_pd_mapping_${mapping.status}`, {defaultValue: unavailable})},
                {key: 'count', label: t('operations.diagnostic_pd_matching_nodes'),
                    children: `${mapping.matched_nodes ?? 0} / ${mapping.discovered_nodes ?? 0}`},
            ]} />
            <Table size='small' pagination={false} rowKey='node_id' dataSource={mapping.members ?? []}
                tableLayout='fixed' scroll={{x: 860}}
                columns={[
                    {key: 'node', width: 160, title: t('operations.node_identity'), render: (_, member) => (
                        nodes.find(node => node.id === member.node_id)?.name ?? member.node_id
                    )},
                    {dataIndex: 'origin', width: 360, title: t('operations.diagnostic_pd_member_address'),
                        render: origin => <code>{origin || unavailable}</code>},
                    {dataIndex: 'origin_matches', width: 200, title: t('operations.diagnostic_pd_origin_comparison'),
                        render: (matches, member) => member.endpoint_valid ? comparison(matches) : unavailable},
                    {dataIndex: 'base_path_matches', width: 140, title: t('operations.diagnostic_pd_path_comparison'),
                        render: (matches, member) => member.endpoint_valid ? comparison(matches) : unavailable},
                ]} />
            <p>{t('operations.diagnostic_pd_address_privacy')}</p>
            {mapping.omitted_members > 0 && <p>{t('operations.diagnostic_pd_omitted_members', {
                count: mapping.omitted_members,
            })}</p>}
        </div>
    );
};

// These are one configured endpoint's response, not a discovered PD node
// and not an aggregation: a Service may route consecutive scrapes elsewhere.
const PdEndpointMetrics = ({sample, sourceStale}) => {
    const {t, i18n} = useTranslation();
    if (!sample) return null;
    const status = sample.metric_status ?? {};
    const fresh = !sourceStale && !status.stale && status.fresh === true
        && status.availability === 'AVAILABLE';
    const metrics = fresh ? sample.metrics ?? {} : {};
    const format = key => {
        const value = metricNumber(metrics[key]);
        if (value === null) return t('operations.unavailable');
        if (key.endsWith('_bytes')) return formatBytes(value) ?? t('operations.unavailable');
        if (key.endsWith('_cpu_usage')) {
            return new Intl.NumberFormat(i18n.language, {style: 'percent', maximumFractionDigits: 2}).format(value);
        }
        return new Intl.NumberFormat(i18n.language, {maximumFractionDigits: 2}).format(value);
    };
    const keys = ['process_cpu_usage', 'system_cpu_usage', 'cpu_count', 'heap_used_bytes',
        'nonheap_used_bytes', 'threads_live', 'uptime_seconds'];
    return <div className='operations-pd-endpoint-metrics'>
        <h4>{t('operations.diagnostic_pd_endpoint_sample')}</h4>
        <p>{t('operations.diagnostic_pd_endpoint_sample_help')}</p>
        <Descriptions size='small' column={{xs: 1, sm: 2, lg: 3}} items={[
            {key: 'status', label: t('operations.source_collection_status'),
                children: sourceStale || status.stale ? t('operations.stale')
                    : t(`operations.availability_${(status.availability ?? 'UNKNOWN').toLowerCase()}`,
                        {defaultValue: t('operations.unavailable')})},
            {key: 'observed', label: t('operations.last_observed'),
                children: formatObservedAt(status.observed_at, i18n.language, t('operations.unavailable'))},
            ...keys.filter(key => metrics[key] !== undefined && metrics[key] !== null)
                .map(key => ({key, label: t(`operations.metric_labels.${key}`), children: format(key)})),
        ]} />
        {!fresh && <p>{sourceStale || status.stale ? t('operations.stale')
            : formatReason(status.reason, t) || t('operations.unavailable')}</p>}
        <DiagnosticRequest diagnostics={status.diagnostics} />
    </div>;
};

const RecoverySteps = ({unmappedPd, largeResponse, raftTooLarge}) => {
    const {t} = useTranslation();
    if (!unmappedPd && !largeResponse) {
        return null;
    }
    const keys = unmappedPd ? ['pd_endpoint', 'pd_config', 'pd_restart']
        : ['response_limit', ...(raftTooLarge ? ['raft_summary'] : []), 'response_config'];
    return <ol className='operations-diagnostic-steps'>
        {keys.map(key => <li key={key}>{t(`operations.diagnostic_step_${key}`)}</li>)}
    </ol>;
};

const SourceDiagnostics = ({sources = {}, sourceName, nodes = [], focus = false, complete = false}) => {
    const {t, i18n} = useTranslation();
    const panel = useRef(null);
    const selected = sourceName && SOURCE_TYPES[sourceName]
        ? (sources[sourceName] ? [{name: sourceName, ...sources[sourceName]}] : [])
        : selectAttentionSources(sources);
    useEffect(() => {
        if (focus && panel.current) {
            panel.current.focus({preventScroll: true});
            panel.current.scrollIntoView?.({block: 'start'});
        }
    }, [focus, sourceName, sources]);
    if (!selected.length) {
        return null;
    }
    const time = value => formatObservedAt(value, i18n.language, t('operations.unavailable'));
    return (
        <section id={DIAGNOSTICS_ID} ref={panel} tabIndex={-1}
            className='operations-surface operations-source-diagnostics'
            aria-label={t('operations.source_diagnostics')}>
            <h3>{t('operations.source_diagnostics')}</h3>
            <p>{t('operations.source_diagnostics_help')}</p>
            {selected.map(source => {
                const type = SOURCE_TYPES[source.name];
                const recovered = sourceHealthStatus(source) === 'UP';
                const failures = nodes.filter(node => node.type === type).flatMap(node => (
                    Object.entries(node.metric_statuses ?? {}).filter(([, status]) => (
                        ['UNAVAILABLE', 'MALFORMED'].includes(status.availability)
                            || status.stale && status.availability !== 'UNSUPPORTED'
                            || status.availability === 'UNSUPPORTED'
                                && ['unsupported_version', 'pd_metrics_unmapped'].includes(status.reason)
                                && (source.availability === 'PARTIAL'
                                    || ['DOWN', 'DEGRADED'].includes(source.status))
                    )).map(([group, status]) => ({node, group, status}))
                ));
                const unmappedPd = type === 'PD' && (source.reason === 'pd_metrics_unmapped'
                    || failures.some(({status}) => status.reason === 'pd_metrics_unmapped'));
                const mapping = source.diagnostics?.pd_metric_mapping;
                const largeResponse = source.reason?.includes('response_too_large')
                    || failures.some(({status}) => status.reason?.includes('response_too_large'));
                const raftTooLarge = failures.some(({group, status}) => group === 'raft'
                    && status.reason?.includes('response_too_large')
                    && status.diagnostics?.request_path === '/metrics/raft');
                const DetailsContainer = recovered ? 'div' : 'details';
                const requestOwner = !source.diagnostics?.request_path && failures.length === 1
                    && (failures[0].status.diagnostics?.request_path
                        || Number.isSafeInteger(failures[0].status.diagnostics?.failed_graphs))
                    ? failures[0] : null;
                const requestDetails = source.diagnostics?.request_path ? source.diagnostics
                    : requestOwner?.status.diagnostics;
                const groups = source.diagnostics?.failed_metric_groups
                    ?? [...new Set(failures.map(({group}) => group))];
                const affected = source.diagnostics?.affected_node_count
                    ?? new Set(failures.map(({node}) => node.id)).size;
                return (
                    <div key={source.name}>
                        <h4>{displayNodeType(type)} <HealthStatus status={sourceHealthStatus(source)} /></h4>
                        <Alert showIcon type={recovered ? 'success' : 'warning'}
                            title={recovered ? t('operations.diagnostic_recovered')
                                : unmappedPd ? t(source.status === 'UP' ? 'operations.diagnostic_pd_online_unmapped'
                                    : 'operations.diagnostic_pd_unmapped')
                                : formatReason(source.reason, t) || t('operations.diagnostic_reason_unavailable')}
                            description={unmappedPd ? mapping && t('operations.diagnostic_pd_mapping_summary', {
                                matched: mapping.matched_nodes ?? 0, discovered: mapping.discovered_nodes ?? 0,
                                result: t(`operations.diagnostic_pd_mapping_${mapping.status}`),
                            }) : recovered ? t('operations.diagnostic_recovered_help')
                                : affected > 0 ? t('operations.diagnostic_impact_summary', {
                                    count: affected, groups: groups.map(group => t(`operations.metric_${group}`,
                                        {defaultValue: group})).join(', '),
                                }) : undefined} />
                        {!unmappedPd && <DiagnosticRequest diagnostics={requestDetails}
                            owner={requestOwner ? `${requestOwner.node.name} · ${t(
                                `operations.metric_${requestOwner.group}`, {defaultValue: requestOwner.group}
                            )}` : undefined} />}
                        {source.cluster_state === 'Cluster_Not_Ready' && <p className='operations-readiness-note'>
                            {t('operations.diagnostic_pd_not_ready')}
                        </p>}
                        <DetailsContainer className={recovered ? undefined : 'operations-diagnostic-details'}>
                        {!recovered && <>
                            <summary>{t(unmappedPd ? 'operations.diagnostic_pd_check_addresses'
                                : 'operations.diagnostic_check_details')}</summary>
                            <p>{t(unmappedPd ? 'operations.diagnostic_pd_mapping_action'
                                : largeResponse
                                    ? 'operations.diagnostic_large_response_action'
                                    : 'operations.diagnostic_check_source_action')}</p>
                        </>}
                        {!recovered && <RecoverySteps unmappedPd={unmappedPd}
                            largeResponse={largeResponse} raftTooLarge={raftTooLarge} />}
                        {source.diagnostics !== requestDetails && <DiagnosticRequest diagnostics={source.diagnostics} />}
                        {type === 'PD' && <PdEndpointMetrics sample={source.diagnostics?.pd_endpoint_metrics}
                            sourceStale={source.stale} />}
                        {unmappedPd && <PdMetricMapping mapping={mapping} nodes={nodes} />}
                        {source.cluster_state === 'Cluster_Not_Ready' && <p>
                            {t('operations.reason_cluster_not_ready')}
                        </p>}
                        {source.diagnostics?.affected_node_count > 0 && (
                            <p>{t(unmappedPd ? 'operations.diagnostic_pd_affected_endpoint'
                                : 'operations.diagnostic_affected_nodes')}: {source.diagnostics.affected_node_count}
                                {' · '}{t(unmappedPd ? 'operations.diagnostic_unattributed_groups'
                                    : 'operations.diagnostic_failed_groups')}: {
                                    source.diagnostics.failed_metric_groups?.map(group => t(`operations.metric_${group}`,
                                        {defaultValue: group})).join(', ')
                                        || t('operations.unavailable')}
                            </p>
                        )}
                        <Descriptions size='small' column={{xs: 1, sm: 2, lg: 3}} items={[
                            {key: 'health', label: t('operations.source_topology_status'),
                                children: source.status ?? t('operations.status_unknown')},
                            source.cluster_state && {key: 'cluster', label: t('operations.source_cluster_state'),
                                children: source.cluster_state},
                            source.data_state && {key: 'data', label: t('operations.source_data_state'),
                                children: source.data_state},
                            {key: 'collection', label: t('operations.source_collection_status'),
                                children: t(`operations.availability_${(source.availability ?? 'UNKNOWN').toLowerCase()}`,
                                    {defaultValue: source.availability ?? t('operations.unavailable')})},
                            {key: 'observed', label: t('operations.last_observed'), children: time(source.observed_at)},
                            {key: 'success', label: t(unmappedPd ? 'operations.diagnostic_topology_last_success'
                                : 'operations.last_success'), children: time(source.last_success_at)},
                            {key: 'fresh', label: t('operations.diagnostic_freshness'),
                                children: t(source.stale ? 'operations.stale'
                                    : unmappedPd ? 'operations.diagnostic_metrics_not_collected' : source.fresh
                                    ? 'operations.diagnostic_fresh' : 'operations.unavailable')},
                        ].filter(Boolean)} />
                        {failures.length > 0 && !(unmappedPd && mapping) ? (
                            <div>
                                <strong>{t(complete ? 'operations.diagnostic_affected_metrics_snapshot'
                                    : 'operations.diagnostic_affected_metrics')}</strong>
                                <ul>{failures.map(({node, group, status}) => (
                                    <li key={`${node.id}-${group}`}>
                                        {node.name} · {group}{!unmappedPd && `: ${formatReason(status.reason, t)
                                            || t('operations.unavailable')}`}
                                        {status.diagnostics !== requestDetails && (
                                            <DiagnosticRequest diagnostics={status.diagnostics} />
                                        )}
                                    </li>
                                ))}</ul>
                            </div>
                        ) : !recovered && !unmappedPd && <p>{t(complete ? 'operations.diagnostic_no_node_details_snapshot'
                            : 'operations.diagnostic_no_node_details')}</p>}
                        </DetailsContainer>
                    </div>
                );
            })}
        </section>
    );
};

export {DIAGNOSTICS_ID, SOURCE_TYPES};
export default SourceDiagnostics;
