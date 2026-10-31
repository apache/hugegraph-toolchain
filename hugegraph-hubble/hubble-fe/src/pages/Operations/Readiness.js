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

import {Descriptions, Tag, Tooltip} from 'antd';
import {useTranslation} from 'react-i18next';
import {formatObservedAt} from './topology';

const readinessKey = readiness => readiness.stale ? 'stale'
    : readiness.reason === 'readiness_not_probed' ? 'not_probed'
        : readiness.status?.toLowerCase() ?? 'unknown';

const markNodeReadinessStale = node => node ? {
    ...node,
    ...(node.readiness ? {readiness: {...node.readiness, stale: true}} : {}),
    ...(node.process_lifecycle ? {process_lifecycle: {...node.process_lifecycle, stale: true}} : {}),
} : node;

const markNodeStale = node => node ? {
    ...markNodeReadinessStale(node),
    ...(node.metric_statuses ? {metric_statuses: Object.fromEntries(
        Object.entries(node.metric_statuses).map(([name, status]) => [name,
            status && {...status, fresh: false, stale: true}])
    )} : {}),
} : node;

const ProcessLifecyclePanel = ({lifecycle}) => {
    const {t, i18n} = useTranslation();
    if (!lifecycle) return null;
    const state = lifecycle.stale ? 'STALE' : lifecycle.state;
    const label = !lifecycle.stale && lifecycle.reason === 'unsupported_version' ? t('operations.lifecycle_unsupported')
        : t(`operations.lifecycle_${state?.toLowerCase() ?? 'unknown'}`,
            {defaultValue: t('operations.lifecycle_unknown')});
    return <section className='operations-surface operations-readiness'
        aria-label={t('operations.lifecycle_title')}>
        <header><h3>{t('operations.lifecycle_title')}</h3><Tag>{label}</Tag></header>
        <p>{t('operations.lifecycle_independent')}</p>
        {lifecycle.observed_at && <Descriptions size='small' column={1} items={[
            {key: 'observed', label: t('operations.last_observed'),
                children: formatObservedAt(lifecycle.observed_at, i18n.language, '—')},
        ]} />}
    </section>;
};

const readinessLabel = (readiness, t) => readiness ? t(
    `operations.readiness_${readinessKey(readiness)}`,
    {defaultValue: t('operations.readiness_unknown')}
) : null;

const ReadinessStatus = ({readiness, compact = false}) => {
    const {t} = useTranslation();
    if (!readiness) {
        return null;
    }
    const key = readinessKey(readiness);
    const text = readinessLabel(readiness, t);
    return (
        <Tooltip title={t('operations.readiness_independent')}>
            <span className={`operations-readiness-status is-${key}`}
                aria-label={`${t('operations.readiness_short')}: ${text}`}>
                {compact ? text : `${t('operations.readiness_short')}: ${text}`}
            </span>
        </Tooltip>
    );
};

const ReadinessPanel = ({readiness}) => {
    const {t, i18n} = useTranslation();
    if (!readiness) {
        return null;
    }
    const key = readinessKey(readiness);
    const reason = readiness.stale ? 'stale_readiness' : readiness.reason;
    const description = reason ? t(`operations.readiness_reason_${reason}`, {
        defaultValue: t('operations.readiness_probe_failed'),
    }) : t('operations.readiness_success');
    const action = reason ? t(`operations.readiness_action_${reason}`, {
        defaultValue: t('operations.readiness_action_default'),
    }) : null;
    const diagnostics = readiness.diagnostics ?? {};
    return (
        <section className='operations-surface operations-readiness'
            aria-label={t('operations.readiness_title')}>
            <header>
                <h3>{t('operations.readiness_title')}</h3>
                <Tag color={key === 'not_ready' ? 'gold' : key === 'ready' ? 'green' : undefined}>
                    {t(`operations.readiness_${key}`, {defaultValue: t('operations.readiness_unknown')})}
                </Tag>
            </header>
            <p>{description}</p>
            <Descriptions size='small' column={{xs: 1, sm: 2, lg: 3}} items={[
                readiness.state && {key: 'state', label: t('operations.readiness_state'),
                    children: <code>{readiness.state}</code>},
                diagnostics.request_path && {key: 'request', label: t('operations.readiness_request'),
                    children: <code>{diagnostics.request_path}</code>},
                diagnostics.http_status && {key: 'http', label: t('operations.diagnostic_http_status'),
                    children: diagnostics.http_status},
                readiness.observed_at && {key: 'time', label: t('operations.last_observed'),
                    children: formatObservedAt(readiness.observed_at, i18n.language, '—')},
            ].filter(Boolean)} />
            {action && <p className='operations-readiness-action'>{action}</p>}
            <small>{t('operations.readiness_independent')}</small>
        </section>
    );
};

export {ReadinessStatus, ReadinessPanel, ProcessLifecyclePanel, readinessLabel, markNodeReadinessStale, markNodeStale};
