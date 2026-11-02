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

import JSONbig from 'json-bigint';
import {
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
} from './topology';

const node = (id, type, status = 'UP', role = null) => ({
    id,
    type,
    status,
    role,
    name: id,
});

test.each([3, 30, 300])(
    'keeps the same bounded topology for %s nodes',
    count => {
        const nodes = ['SERVER', 'PD', 'STORE'].flatMap(type => (
            Array.from({length: count}, (_, index) => (
                node(`${type}-${String(index).padStart(12, '0')}`, type)
            ))
        ));

        ['SERVER', 'PD', 'STORE'].forEach(type => {
            const tier = selectTierNodes(nodes, type);
            expect(tier.visible).toHaveLength(Math.min(3, count));
            expect(tier.overflow).toBe(Math.max(0, count - 3));
        });
    }
);

test('puts the PD leader on the center axis and keeps failures visible', () => {
    const nodes = [
        node('pd-000000000001', 'PD', 'UP', 'FOLLOWER'),
        node('pd-000000000002', 'PD', 'DOWN', 'FOLLOWER'),
        node('pd-000000000003', 'PD', 'UP', 'LEADER'),
        node('pd-000000000004', 'PD', 'DEGRADED', 'FOLLOWER'),
    ];

    const tier = selectTierNodes(nodes, 'PD');

    expect(tier.visible[1].role).toBe('LEADER');
    expect(tier.visible.some(item => item.status === 'DOWN')).toBe(true);
    expect(tier.overflow).toBe(1);
});

test('moves the center axis when the PD leader changes', () => {
    const first = [
        node('pd-1', 'PD', 'UP', 'LEADER'),
        node('pd-2', 'PD', 'UP', 'FOLLOWER'),
        node('pd-3', 'PD', 'UP', 'FOLLOWER'),
    ];
    const second = first.map(item => ({
        ...item,
        role: item.id === 'pd-2' ? 'LEADER' : 'FOLLOWER',
    }));

    expect(selectTierNodes(first, 'PD').visible[1].id).toBe('pd-1');
    expect(selectTierNodes(second, 'PD').visible[1].id).toBe('pd-2');
});

test('treats stale metric snapshots as attention even while topology is up', () => {
    const staleStore = {
        ...node('store-1', 'STORE'),
        metric_statuses: {system: {availability: 'UNAVAILABLE', stale: true}},
    };

    expect(selectAttentionNodes([staleStore])).toEqual([staleStore]);
});

test('keeps metric availability separate from snapshot freshness', () => {
    const unavailableStore = {
        ...node('store-1', 'STORE'),
        metric_statuses: {
            system: {availability: 'UNAVAILABLE', stale: false},
        },
    };

    expect(hasStaleMetrics(unavailableStore)).toBe(false);
    expect(hasMetricIssues(unavailableStore)).toBe(true);
    expect(metricIssueReason(unavailableStore)).toBe(null);
    expect(selectAttentionNodes([unavailableStore])).toEqual([unavailableStore]);
});

test('exposes an unavailable metric recovery reason without marking it stale', () => {
    const unavailableStore = {
        ...node('store-1', 'STORE'),
        metric_statuses: {
            system: {
                availability: 'UNAVAILABLE',
                stale: false,
                reason: 'metrics_target_untrusted',
            },
        },
    };

    expect(metricIssueReason(unavailableStore)).toBe(
        'metrics_target_untrusted'
    );
    expect(hasStaleMetrics(unavailableStore)).toBe(false);
});

test.each(['UP', 'UNKNOWN', 'DOWN', 'DEGRADED'].flatMap(status => (
    [false, true].map(stale => [status, stale])
)))('preserves confirmed %s topology with unsupported collection (stale=%s)', (status, stale) => {
    const source = {status, availability: 'UNSUPPORTED', stale};
    expect(selectAttentionSources({stores: source})).toEqual(
        ['DOWN', 'DEGRADED'].includes(status) ? [{name: 'stores', ...source}] : []
    );
});

test('keeps source-level attention separate from unsupported node metrics', () => {
    const sources = {
        server: {status: 'UP', availability: 'AVAILABLE'},
        pd: {
            status: 'DEGRADED',
            availability: 'AVAILABLE',
            reason: 'cluster_not_ready',
        },
        stores: {status: 'UP', availability: 'AVAILABLE'},
        optional: {status: 'UNKNOWN', availability: 'UNSUPPORTED'},
    };

    expect(selectAttentionSources(sources)).toEqual([{
        name: 'pd',
        status: 'DEGRADED',
        availability: 'AVAILABLE',
        reason: 'cluster_not_ready',
    }]);
    expect(selectAttentionNodes([{
        ...node('pd-follower', 'PD'),
        metric_statuses: {
            system: {
                availability: 'UNSUPPORTED',
                reason: 'metrics_not_collected',
            },
        },
    }])).toEqual([]);
});

test('never renders unknown values as zero or NaN', () => {
    expect(formatMetricValue(null)).toBe('Unavailable');
    expect(formatMetricValue(undefined)).toBe('Unavailable');
    expect(formatMetricValue(Number.NaN)).toBe('Unavailable');
    expect(formatMetricValue(0)).toBe('0');
    expect(formatMetricValue(null, '', '不可用')).toBe('不可用');
});

test('formats byte facts without inventing values', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1000)).toBe('1 KB');
    expect(formatBytes(18715231 * 1024)).toBe('19.2 GB');
    expect(formatBytes(null)).toBe(null);
    expect(formatBytes(-1)).toBe(null);
    const facts = JSONbig.parse(
        '{"used":9007199254740993,"total":18014398509481986}'
    );
    expect(formatBytes(facts.used)).toBe('9 PB');
    expect(ratioPercent(facts.used, facts.total)).toBe(50);
});

test('safely formats malformed observed timestamps', () => {
    expect(formatObservedAt('invalid', 'en-US', 'Unavailable')).toBe('Unavailable');
    expect(formatObservedAt(0, 'en-US', 'Unavailable')).toBe('Unavailable');
    expect(formatObservedAt(1000, 'en-US', 'Unavailable')).not.toBe('Unavailable');
});

test('formats a stable localized relative observation age', () => {
    const now = 1_720_947_156_000;

    expect(formatObservedAge(now - 18_000, 'en-US', 'Unavailable', now))
        .toBe('18s ago');
    expect(formatObservedAge(now - 90_000, 'en-US', 'Unavailable', now))
        .toBe('2m ago');
    expect(formatObservedAge('invalid', 'en-US', 'Unavailable', now))
        .toBe('Unavailable');
});


test('does not offer node diagnostics for cluster statistics failures', () => {
    expect(selectAttentionSources({
        pd_cluster_stats: {status: 'UNKNOWN', availability: 'UNAVAILABLE'},
        pd: {status: 'DOWN', availability: 'UNAVAILABLE'},
    })).toEqual([{name: 'pd', status: 'DOWN', availability: 'UNAVAILABLE'}]);
});
