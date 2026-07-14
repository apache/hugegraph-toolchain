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

const hasStaleMetrics = node => Object.values(node?.metric_statuses ?? {})
    .some(status => status?.stale || status?.availability === 'UNAVAILABLE'
        || status?.availability === 'MALFORMED');

const selectAttentionNodes = (nodes = [], limit = 5) => {
    if (!Array.isArray(nodes)) {
        return [];
    }
    return nodes.filter(node => node.status !== 'UP' || hasStaleMetrics(node))
        .sort((left, right) => {
            const status = (STATUS_PRIORITY[left.status] ?? 4)
                - (STATUS_PRIORITY[right.status] ?? 4);
            return status || String(left.id).localeCompare(String(right.id));
        })
        .slice(0, limit);
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
    catch (error) {
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
    selectTierNodes,
    selectAttentionNodes,
    hasStaleMetrics,
    formatMetricValue,
    formatObservedAge,
    formatObservedAt,
};
