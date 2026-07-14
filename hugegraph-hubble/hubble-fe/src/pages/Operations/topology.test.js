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
    selectTierNodes,
    selectAttentionNodes,
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

test('never renders unknown values as zero or NaN', () => {
    expect(formatMetricValue(null)).toBe('Unavailable');
    expect(formatMetricValue(undefined)).toBe('Unavailable');
    expect(formatMetricValue(Number.NaN)).toBe('Unavailable');
    expect(formatMetricValue(0)).toBe('0');
    expect(formatMetricValue(null, '', '不可用')).toBe('不可用');
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
