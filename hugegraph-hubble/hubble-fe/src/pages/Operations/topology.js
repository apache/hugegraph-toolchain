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

const STATUS_PRIORITY = {
    DOWN: 0,
    DEGRADED: 1,
    UNKNOWN: 2,
    UP: 3,
};

const markSourcesStale = sources => sources && Object.fromEntries(Object.entries(sources)
    .map(([name, source]) => [name, source && {...source, fresh: false, stale: true}]));

const hasStaleMetrics = node => Object.values(node?.metric_statuses ?? {})
    .some(status => status?.stale === true);

const hasMetricIssues = node => Object.values(node?.metric_statuses ?? {})
    .some(status => ['UNAVAILABLE', 'MALFORMED'].includes(status?.availability));

const metricIssueReason = node => Object.values(node?.metric_statuses ?? {})
    .find(status => ['UNAVAILABLE', 'MALFORMED'].includes(
        status?.availability
    ))?.reason ?? null;

const storeLeaderCount = node => {
    if (node?.type !== 'STORE') {
        return null;
    }
    const value = Number(node?.metrics?.backend?.leaders);
    return Number.isFinite(value) && value >= 0 ? value : null;
};

const selectAttentionNodes = (nodes = [], limit = 5) => {
    if (!Array.isArray(nodes)) {
        return [];
    }
    return nodes.filter(node => node.status !== 'UP' || hasStaleMetrics(node)
        || hasMetricIssues(node) || !node.readiness?.stale && node.readiness?.status === 'NOT_READY')
        .sort((left, right) => {
            const status = (STATUS_PRIORITY[left.status] ?? 4)
                - (STATUS_PRIORITY[right.status] ?? 4);
            return status || String(left.id).localeCompare(String(right.id));
        })
        .slice(0, limit);
};

const selectAttentionSources = (sources = {}) => {
    if (!sources || typeof sources !== 'object') {
        return [];
    }
    return Object.entries(sources)
        .filter(([, source]) => {
            if (!source || source.availability === 'UNSUPPORTED'
                && !['DOWN', 'DEGRADED'].includes(source.status)) {
                return false;
            }
            return source.status && source.status !== 'UP'
                || source.availability && source.availability !== 'AVAILABLE'
                || source.stale === true;
        })
        .map(([name, source]) => ({name, ...source}));
};

const selectTierNodes = (nodes = [], type, limit = 3) => {
    const tier = nodes
        .filter(node => node.type === type)
        .sort((left, right) => {
            const status = (STATUS_PRIORITY[left.status] ?? 4)
                - (STATUS_PRIORITY[right.status] ?? 4);
            return status || String(left.id).localeCompare(String(right.id));
        });
    const leader = type === 'PD'
        ? tier.find(node => node.role === 'LEADER')
        : null;
    const visible = tier
        .filter(node => node !== leader)
        .slice(0, Math.max(0, limit - (leader ? 1 : 0)));

    if (leader && limit > 0) {
        visible.splice(Math.floor((visible.length + 1) / 2), 0, leader);
    }

    return {
        visible,
        overflow: Math.max(0, tier.length - visible.length),
    };
};

const formatMetricValue = (value, unit = '', unavailable = 'Unavailable') => {
    if (value === null || value === undefined
        || (typeof value === 'number' && !Number.isFinite(value))) {
        return unavailable;
    }

    return `${value}${unit ? ` ${unit}` : ''}`;
};

const isBigNumber = value => value !== null
    && typeof value === 'object'
    && typeof value.constructor?.isBigNumber === 'function'
    && value.constructor.isBigNumber(value)
    && typeof value.comparedTo === 'function'
    && typeof value.dividedBy === 'function'
    && typeof value.times === 'function'
    && typeof value.toNumber === 'function';

const formatBytes = value => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const big = isBigNumber(value);
    let size = big ? value : Number(value);
    const invalid = big ? size.comparedTo(0) < 0
        : !Number.isFinite(size) || size < 0;
    if (invalid) {
        return null;
    }
    let unit = 0;
    while ((big ? size.comparedTo(1024) >= 0 : size >= 1024)
           && unit < units.length - 1) {
        size = big ? size.dividedBy(1024) : size / 1024;
        unit += 1;
    }
    const display = big ? size.toNumber() : size;
    return `${new Intl.NumberFormat(undefined, {maximumFractionDigits: 1})
        .format(display)} ${units[unit]}`;
};

const ratioPercent = (used, total) => {
    const usedBig = isBigNumber(used);
    const totalBig = isBigNumber(total);
    if (!usedBig && (!Number.isFinite(used) || used < 0)
        || !totalBig && (!Number.isFinite(total) || total <= 0)) {
        return null;
    }
    if (!usedBig && !totalBig) {
        return Math.round(used / total * 100);
    }
    const BigNumber = (usedBig ? used : total).constructor;
    const safeUsed = usedBig ? used : new BigNumber(String(used));
    const safeTotal = totalBig ? total : new BigNumber(String(total));
    if (safeUsed.comparedTo(0) < 0 || safeTotal.comparedTo(0) <= 0) {
        return null;
    }
    return Math.round(safeUsed.dividedBy(safeTotal).times(100).toNumber());
};

const formatObservedAt = (value, locale, unavailable) => {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return unavailable;
    }
    const observed = new Date(timestamp);
    if (Number.isNaN(observed.getTime())) {
        return unavailable;
    }
    try {
        return new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeStyle: 'medium',
        }).format(observed);
    }
    catch {
        return unavailable;
    }
};

const formatObservedAge = (value, locale, unavailable, now = Date.now()) => {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(now)) {
        return unavailable;
    }
    const elapsed = Math.max(0, now - timestamp);
    const seconds = Math.round(elapsed / 1000);
    const amount = seconds < 60 ? seconds : Math.round(seconds / 60);
    const unit = seconds < 60 ? (locale?.startsWith('zh') ? '秒' : 's')
        : (locale?.startsWith('zh') ? '分钟' : 'm');
    return locale?.startsWith('zh') ? `${amount} ${unit}前` : `${amount}${unit} ago`;
};

export {
    markSourcesStale,
    selectTierNodes,
    selectAttentionNodes,
    selectAttentionSources,
    hasStaleMetrics,
    hasMetricIssues,
    metricIssueReason,
    formatBytes,
    ratioPercent,
    formatMetricValue,
    formatObservedAge,
    formatObservedAt,
    storeLeaderCount,
};
