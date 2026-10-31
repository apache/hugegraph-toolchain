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

const vermeerAvailable = cluster => cluster?.configured === true
    && cluster?.availability === 'AVAILABLE' && !cluster?.stale;

const vermeerObservedAt = cluster => vermeerAvailable(cluster)
    ? cluster.observed_at ?? cluster.last_success_at ?? null
    : cluster?.last_success_at ?? null;

const vermeerNodeReady = (node, cluster) => {
    if (!vermeerAvailable(cluster) || typeof node?.ready !== 'boolean') {
        return null;
    }
    return node.ready;
};

const vermeerHealth = cluster => {
    if (!cluster?.configured || !vermeerAvailable(cluster)) {
        return 'UNKNOWN';
    }
    return ['UP', 'DEGRADED', 'DOWN'].includes(cluster.status)
        ? cluster.status : 'UNKNOWN';
};

const vermeerNodes = cluster => {
    const workers = Array.isArray(cluster?.workers) ? cluster.workers : [];
    const ordered = workers.map(node => ({...node, role: 'WORKER'}))
        .sort((left, right) => {
            const rank = node => node.ready === false ? 0 : node.ready === true ? 2 : 1;
            return rank(left) - rank(right)
                || String(left.name ?? left.id).localeCompare(String(right.name ?? right.id));
        });
    return cluster?.master
        ? [{...cluster.master, role: 'MASTER'}, ...ordered] : ordered;
};

const vermeerNodeId = node => node.role.toLowerCase() + ':' + (node.id ?? node.name);

const vermeerSelectedNode = (nodes, selectedId) => {
    if (!selectedId) {
        return null;
    }
    const selected = nodes.find(node => vermeerNodeId(node) === selectedId);
    if (selected) {
        return selected;
    }
    // Accept earlier links only when their raw ID identifies exactly one role.
    const previousMatches = nodes.filter(node => (node.id ?? node.name) === selectedId);
    return previousMatches.length === 1 ? previousMatches[0] : null;
};

// JSON responses use json-bigint, which returns BigNumber for fractional
// values that cannot round-trip through a JavaScript number. These process
// metrics are approximate display values, not identifiers or counters.
const metricNumber = value => {
    const bigNumber = value !== null && typeof value === 'object'
        && typeof value.constructor?.isBigNumber === 'function'
        && value.constructor.isBigNumber(value) && typeof value.toNumber === 'function';
    const number = bigNumber ? value.toNumber() : value;
    return typeof number === 'number' && Number.isFinite(number) && number >= 0 ? number : null;
};

const processMetric = (value, locale) => (
    typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? new Intl.NumberFormat(locale, {maximumFractionDigits: 4}).format(value) : null
);

const vermeerResourceValues = (node, cluster) => {
    const stale = Boolean(cluster?.stale || node.stale || node.metric_status?.stale
        || node.metric_status?.fresh === false);
    const available = vermeerAvailable(cluster)
        && ['AVAILABLE', 'PARTIAL'].includes(node.metric_status?.availability) && !stale;
    const metric = value => available ? metricNumber(value) : null;
    return {cpu: metric(node.metrics?.cpu_cores), rss: metric(node.metrics?.rss_bytes), stale};
};

const vermeerResourceSummary = (nodes, cluster) => {
    const values = nodes.map(node => vermeerResourceValues(node, cluster));
    const sum = key => {
        const collected = values.map(value => value[key]).filter(value => value !== null);
        const value = collected.reduce((total, current) => total + current, 0);
        return {value: collected.length && Number.isFinite(value) ? value : null,
            collected: collected.length};
    };
    return {cpu: sum('cpu'), rss: sum('rss'), total: nodes.length};
};

const formatProcessBytes = (bytes, locale) => {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
        return null;
    }
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return new Intl.NumberFormat(locale, {maximumFractionDigits: 1}).format(value) + ' ' + units[unit];
};

export {
    formatProcessBytes,
    metricNumber,
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
};
