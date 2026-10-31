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

import {fireEvent, render, screen, within} from '@testing-library/react';
import SourceDiagnostics from './SourceDiagnostics';
import i18n from '../../i18n';
import JSONbig from 'json-bigint';

beforeEach(() => {
    i18n.changeLanguage('en-US');
    window.matchMedia = () => ({matches: false, addListener() {}, removeListener() {}});
});

test('shows an unmatched PD endpoint sample without assigning it to a member', () => {
    const metrics = JSONbig.parse('{"process_cpu_usage":0.00044612345678912345,' +
        '"heap_used_bytes":1048576,"threads_live":8}');
    render(<SourceDiagnostics sourceName='pd' sources={{pd: {
        status: 'UP', availability: 'PARTIAL', reason: 'pd_metrics_unmapped',
        diagnostics: {affected_node_count: 1, failed_metric_groups: ['system'],
            pd_endpoint_metrics: {metrics, metric_status: {
            availability: 'AVAILABLE', fresh: true, stale: false, observed_at: 2000,
        }}},
    }}} nodes={[{id: 'pd-a', name: 'PD A', type: 'PD'}]} />);
    fireEvent.click(screen.getByText('Check addresses and how to fix'));
    expect(screen.getByText('Configured PD endpoint sample')).toBeVisible();
    expect(screen.getByText(/do not identify a node or represent a cluster total/)).toBeVisible();
    expect(screen.getByText('0.04%')).toBeVisible();
    expect(screen.getByText('1 MB')).toBeVisible();
    expect(screen.getByText(/PD endpoints without node attribution: 1/)).toBeVisible();
    expect(screen.getByText(/Unattributed metric groups: System/)).toBeVisible();
    expect(screen.queryByText(/Failed metric groups/)).not.toBeInTheDocument();
    expect(screen.queryByText(/PD A · system/)).not.toBeInTheDocument();
});

test.each([
    ['stale source', true, {availability: 'AVAILABLE', fresh: true}],
    ['stale sample', false, {availability: 'AVAILABLE', fresh: false, stale: true}],
    ['failed sample', false, {availability: 'UNAVAILABLE', fresh: false, reason: 'upstream_unavailable'}],
])('%s does not display old endpoint values as current', (_, stale, status) => {
    render(<SourceDiagnostics sourceName='pd' sources={{pd: {
        status: 'UP', availability: 'PARTIAL', reason: 'pd_metrics_unmapped', stale,
        diagnostics: {pd_endpoint_metrics: {metrics: {process_cpu_usage: 0.125}, metric_status: status}},
    }}} />);
    fireEvent.click(screen.getByText('Check addresses and how to fix'));
    expect(screen.getByText('Configured PD endpoint sample')).toBeVisible();
    expect(screen.queryByText('12.5%')).not.toBeInTheDocument();
});

test('keeps source diagnostics available without discovered nodes and reports bounded response evidence', () => {
    render(<SourceDiagnostics sourceName='stores' sources={{stores: {
        status: 'UP', availability: 'PARTIAL', reason: 'response_too_large',
        observed_at: 2000, last_success_at: 1000, fresh: false, stale: true,
        diagnostics: {request_path: '/v1/stores', max_response_bytes: 1048576,
            response_bytes: 1048577, response_size_exact: false},
    }}} />);
    const panel = screen.getByRole('region', {name: 'Source diagnostics'});
    expect(within(panel).getByText('/v1/stores')).toBeInTheDocument();
    expect(within(panel).getByText('At least 1 MB (1,048,577 B)')).toBeInTheDocument();
    expect(within(panel).getByText('1 MB (1,048,576 B)', {exact: true})).toBeInTheDocument();
    expect(within(panel).getByText('Partially available')).toBeInTheDocument();
    expect(within(panel).getByText('UP', {exact: true})).toBeInTheDocument();
    expect(within(panel).getByText('Last success')).toBeInTheDocument();
    expect(within(panel).getByText(/does not mean every node is healthy/)).toBeInTheDocument();
    expect(within(panel).getByText(/metrics or discovery response exceeded/)).toBeInTheDocument();
});

test('shows per-node failed metric requests while keeping successful groups out of the failure list', () => {
    render(<SourceDiagnostics sourceName='stores' sources={{stores: {
        status: 'UP', availability: 'PARTIAL', reason: 'store_metrics_partial',
        diagnostics: {affected_node_count: 25, failed_metric_groups: ['backend']},
    }}} nodes={[{id: 'store-1', type: 'STORE', name: 'Store A', metric_statuses: {
        system: {availability: 'AVAILABLE'},
        backend: {availability: 'UNAVAILABLE', reason: 'response_too_large',
            diagnostics: {request_path: '/metrics/backend', http_status: 503}},
    }}]} />);
    expect(screen.getByText(/Store A · backend/)).toBeInTheDocument();
    expect(screen.getByText('/metrics/backend')).toBeInTheDocument();
    expect(screen.getByText('503')).toBeInTheDocument();
    expect(screen.getByText(/Affected nodes across this snapshot.*25/)).toBeInTheDocument();
    expect(screen.queryByText(/Store A · system/)).not.toBeInTheDocument();
});

test('reports recovery when a previously selected failed source is healthy again', () => {
    render(<SourceDiagnostics sourceName='stores' sources={{stores: {
        status: 'UP', availability: 'AVAILABLE', fresh: true,
    }}} />);
    expect(screen.getByText('Source collection has recovered')).toBeInTheDocument();
    expect(screen.queryByText('No source error details were reported')).not.toBeInTheDocument();
});

test('does not synthesize a selected source without a received snapshot', () => {
    render(<SourceDiagnostics sourceName='stores' sources={{}} />);
    expect(screen.queryByRole('region', {name: 'Source diagnostics'})).not.toBeInTheDocument();
});

test.each([true, false])('describes missing node details at the correct scope (complete=%s)', complete => {
    render(<SourceDiagnostics sourceName='stores' complete={complete} sources={{stores: {
        status: 'UNKNOWN', availability: 'MALFORMED', reason: 'malformed_response',
    }}} />);

    expect(screen.getByText(complete ? /No per-node failure details were reported in this snapshot/
        : /No per-node failure details were reported on this page/)).toBeInTheDocument();
});

test.each([
    ['UP', 'PARTIAL', true],
    ['DOWN', 'UNSUPPORTED', true],
    ['DEGRADED', 'UNSUPPORTED', true],
    ['UP', 'UNSUPPORTED', false],
])(
    'shows unsupported request details when source topology requires attention (%s/%s)',
    (status, availability, showDetails) => {
        render(<SourceDiagnostics sourceName='stores' sources={{stores: {
            status, availability, reason: 'unsupported_version',
        }}} nodes={[{id: 'store-1', type: 'STORE', name: 'Store A', metric_statuses: {
            system: {availability: 'AVAILABLE'},
            raft: {availability: 'UNSUPPORTED', reason: 'unsupported_version',
                diagnostics: {request_path: '/metrics/raft', http_status: 404}},
        }}]} />);

        if (showDetails) {
            expect(screen.getByText(/Store A · raft/)).toBeInTheDocument();
            expect(screen.getByText('/metrics/raft')).toBeInTheDocument();
            expect(screen.getByText('404')).toBeInTheDocument();
            expect(screen.queryByText(/No per-node failure details/)).not.toBeInTheDocument();
        }
        else {
            expect(screen.queryByText('/metrics/raft')).not.toBeInTheDocument();
        }
    }
);

test.each([false, true])('excludes intentionally uncollected PD followers (stale=%s)', stale => {
    render(<SourceDiagnostics sourceName='pd' sources={{pd: {
        status: 'UP', availability: 'PARTIAL', reason: 'upstream_rejected',
    }}} nodes={[
        {id: 'leader', type: 'PD', name: 'PD leader', metric_statuses: {system: {
            availability: 'UNAVAILABLE', reason: 'upstream_rejected',
            diagnostics: {request_path: '/actuator/prometheus', http_status: 503},
        }}},
        {id: 'follower', type: 'PD', name: 'PD follower', metric_statuses: {system: {
            availability: 'UNSUPPORTED', reason: 'metrics_not_collected', stale,
        }}},
    ]} />);
    expect(screen.getByText(/PD leader · system/)).toBeInTheDocument();
    expect(screen.getByText('/actuator/prometheus')).toBeInTheDocument();
    expect(screen.getByText('503')).toBeInTheDocument();
    expect(screen.queryByText(/PD follower/)).not.toBeInTheDocument();
});

test.each([false, true])('keeps an unmapped PD scrape source-wide instead of failing every member (stale=%s)', stale => {
    render(<SourceDiagnostics sourceName='pd' sources={{pd: {
        status: 'UP', availability: 'PARTIAL', reason: 'pd_metrics_unmapped',
        diagnostics: {affected_node_count: 1, failed_metric_groups: ['system']},
    }}} nodes={[1, 2, 3].map(id => ({id: `pd-${id}`, type: 'PD', name: `PD ${id}`, metric_statuses: {
        system: {availability: 'UNSUPPORTED', reason: 'metrics_not_collected', stale},
    }}))} />);

    fireEvent.click(screen.getByText('Check addresses and how to fix'));
    expect(screen.getByText(/PD endpoints without node attribution: 1/)).toBeVisible();
    expect(screen.getByText(/Hubble collects system metrics from only the one matched PD member/)).toBeVisible();
    expect(screen.queryByText(/Affected nodes across this snapshot/)).not.toBeInTheDocument();
    for (const id of [1, 2, 3]) {
        expect(screen.queryByText(new RegExp(`PD ${id} · system`))).not.toBeInTheDocument();
    }
});

test.each(['UNAVAILABLE', 'UNSUPPORTED'])(
    'explains unmapped PD metrics and shows discovered node details (%s)', availability => {
        render(<SourceDiagnostics sourceName='pd' complete sources={{pd: {
            status: 'UP', availability: 'PARTIAL', reason: 'pd_metrics_unmapped',
            observed_at: 2000, last_success_at: 2000, fresh: false, stale: false,
        }}} nodes={[1, 2, 3].map(id => ({id: `pd-${id}`, type: 'PD', name: `PD ${id}`, metric_statuses: {
            system: {availability, reason: 'pd_metrics_unmapped'},
        }}))} />);

        expect(screen.getByText('PD nodes are online; system metrics could not be attributed'))
            .toBeInTheDocument();
        expect(screen.getByText(/PD topology was discovered.*restUrl in the PD member list/)).not.toBeVisible();
        fireEvent.click(screen.getByText('Check addresses and how to fix'));
        expect(screen.getByText(/PD topology was discovered.*restUrl in the PD member list/)).toBeInTheDocument();
        expect(screen.getByText('Last topology success')).toBeInTheDocument();
        expect(screen.getByText('Node system metrics not collected')).toBeInTheDocument();
        for (const id of [1, 2, 3]) {
            expect(screen.getByText(new RegExp(`PD ${id} · system`))).toBeVisible();
        }
        expect(screen.queryByText(/No per-node failure details/)).not.toBeInTheDocument();
    }
);

test('localizes PD endpoint identity guidance without claiming a discovery failure', () => {
    i18n.changeLanguage('zh-CN');
    render(<SourceDiagnostics sourceName='pd' sources={{pd: {
        status: 'UP', availability: 'PARTIAL', reason: 'pd_metrics_unmapped',
    }}} nodes={[{id: 'pd-1', type: 'PD', name: 'PD 1', metric_statuses: {
        system: {availability: 'UNAVAILABLE', reason: 'pd_metrics_unmapped'},
    }}]} />);

    expect(screen.getByText('PD 节点在线，系统指标尚未匹配到节点')).toBeVisible();
    fireEvent.click(screen.getByText('检查地址与修复方法'));
    expect(screen.getByText(/已发现 PD 拓扑.*restUrl/)).toBeInTheDocument();
    expect(screen.getByText('最近拓扑采集成功')).toBeInTheDocument();
    expect(screen.queryByText(/来源可能在发现节点前/)).not.toBeInTheDocument();
});

test('shows the actual PD endpoint comparison and independent cluster readiness', () => {
    render(<SourceDiagnostics sourceName='pd' sources={{pd: {
        status: 'UP', availability: 'PARTIAL', reason: 'pd_metrics_unmapped',
        cluster_state: 'Cluster_Not_Ready', data_state: 'PState_Normal',
        diagnostics: {pd_metric_mapping: {
            configured_origin: 'http://pd-service:8620', status: 'no_match',
            matched_nodes: 0, discovered_nodes: 3, omitted_members: 1,
            members: [
                {node_id: 'pd-1', origin: 'http://pd-node:8620', endpoint_valid: true,
                    origin_matches: false, base_path_matches: true},
                {node_id: 'pd-2', origin: 'http://pd-service:8620', endpoint_valid: true,
                    origin_matches: true, base_path_matches: false},
            ],
        }},
    }}} nodes={[{id: 'pd-1', name: 'PD leader', type: 'PD'}]} />);

    expect(screen.getByText('No matching node · 0 of 3 discovered nodes match the configured address')).toBeVisible();
    expect(screen.getByText('Cluster readiness: PD still reports Cluster_Not_Ready')).toBeVisible();
    const addressTable = screen.getByText('http://pd-node:8620').closest('table');
    expect(addressTable).not.toBeVisible();
    fireEvent.click(screen.getByText('Check addresses and how to fix'));
    expect(addressTable).toBeVisible();
    expect(screen.getByText('No matching node', {exact: true})).toBeVisible();
    expect(screen.getByText('0 / 3')).toBeInTheDocument();
    expect(screen.getByText('http://pd-node:8620')).toBeInTheDocument();
    expect(screen.getAllByText('http://pd-service:8620')).toHaveLength(2);
    expect(screen.getByText('PD leader')).toBeInTheDocument();
    expect(screen.getAllByText('Differs')).toHaveLength(2);
    expect(screen.getAllByText('Matches')).toHaveLength(2);
    expect(screen.getByText('1 more members are omitted from this comparison')).toBeInTheDocument();
    expect(screen.getByText('Cluster_Not_Ready', {exact: true})).toBeInTheDocument();
    expect(screen.getByText('PState_Normal', {exact: true})).toBeInTheDocument();
    expect(screen.getByText(/PD reports Cluster_Not_Ready.*initial-store-count/)).toBeInTheDocument();
});

test('does not call PD nodes online when topology is degraded', () => {
    render(<SourceDiagnostics sourceName='pd' sources={{pd: {
        status: 'DEGRADED', availability: 'PARTIAL', reason: 'pd_metrics_unmapped',
    }}} />);
    expect(screen.getByText('PD system metrics could not be attributed to a node')).toBeVisible();
    expect(screen.queryByText('PD nodes are online; system metrics could not be attributed'))
        .not.toBeInTheDocument();
});

test.each([false, true])('excludes unavailable topology placeholders from Store failures (stale=%s)', stale => {
    render(<SourceDiagnostics sourceName='stores' sources={{stores: {
        status: 'UP', availability: 'PARTIAL', reason: 'unsupported_version',
    }}} nodes={[
        {id: 'failed', type: 'STORE', name: 'Store failed', metric_statuses: {raft: {
            availability: 'UNSUPPORTED', reason: 'unsupported_version',
            diagnostics: {request_path: '/metrics/raft', http_status: 404},
        }}},
        {id: 'healthy', type: 'STORE', name: 'Store healthy', metric_statuses: {backend: {
            availability: 'UNSUPPORTED', reason: 'topology_fields_unavailable', stale,
        }}},
    ]} />);
    expect(screen.getByText(/Store failed · raft/)).toBeInTheDocument();
    expect(screen.getByText('/metrics/raft')).toBeInTheDocument();
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.queryByText(/Store healthy/)).not.toBeInTheDocument();
});

test('localizes the collection status and response size lower bound in Chinese', () => {
    i18n.changeLanguage('zh-CN');
    render(<SourceDiagnostics sourceName='stores' sources={{stores: {
        status: 'UP', availability: 'PARTIAL', reason: 'response_too_large',
        diagnostics: {response_bytes: 1048577, response_size_exact: false},
    }}} />);
    expect(screen.getByText('部分可用', {exact: true})).toBeInTheDocument();
    expect(screen.getByText('至少 1 MB (1,048,577 B)')).toBeInTheDocument();
});

test('keeps the failed request visible while disclosing supporting collection details on demand', () => {
    i18n.changeLanguage('zh-CN');
    render(<SourceDiagnostics sourceName='stores' sources={{stores: {
        status: 'UP', availability: 'PARTIAL', reason: 'upstream_rejected',
    }}} nodes={[{id: 'store-1', type: 'STORE', name: 'Store 1', metric_statuses: {
        system: {availability: 'UNAVAILABLE', reason: 'upstream_rejected',
            diagnostics: {request_path: '/metrics/system', http_status: 503}},
    }}]} />);
    expect(screen.getAllByText('指标接口返回错误响应').filter(element => {
        return !element.closest('details');
    })).toHaveLength(1);
    expect(screen.getByText('影响 1 个节点 · 指标：系统')).toBeVisible();
    expect(screen.getByText('/metrics/system')).toBeVisible();
    expect(screen.getByText('Store 1 · 系统', {exact: true})).toBeVisible();
    const nodeDetails = screen.getByText(/Store 1 · system/);
    expect(nodeDetails).not.toBeVisible();
    fireEvent.click(screen.getByText('采集详情与修复方法'));
    expect(nodeDetails).toBeVisible();
});

test('shows the current failed-graph count before expanding Server diagnostics', () => {
    render(<SourceDiagnostics sourceName='server' sources={{server: {
        status: 'UP', availability: 'PARTIAL', reason: 'backend_metrics_failed',
    }}} nodes={[{id: 'server-1', type: 'SERVER', name: 'Server 1', metric_statuses: {
        backend: {availability: 'UNAVAILABLE', reason: 'backend_metrics_failed', diagnostics: {failed_graphs: 2}},
    }}]} />);
    expect(screen.getByText('Graphs with failed backend metrics')).toBeVisible();
    expect(screen.getByText('2', {exact: true})).toBeVisible();
    expect(screen.getByText('Server 1 · Backend', {exact: true})).toBeVisible();
    expect(screen.getByText(/Server 1 · backend/)).not.toBeVisible();
});

test('keeps multiple Server failed-graph counts attached to their owning nodes', () => {
    render(<SourceDiagnostics sourceName='server' sources={{server: {
        status: 'UP', availability: 'PARTIAL', reason: 'backend_metrics_failed',
    }}} nodes={[['server-1', 'Server A', 2], ['server-2', 'Server B', 7]].map(([id, name, count]) => ({
        id, name, type: 'SERVER', metric_statuses: {backend: {
            availability: 'UNAVAILABLE', reason: 'backend_metrics_failed', diagnostics: {failed_graphs: count},
        }},
    }))} />);

    expect(screen.getByText('2', {exact: true})).not.toBeVisible();
    expect(screen.getByText('7', {exact: true})).not.toBeVisible();
    fireEvent.click(screen.getByText('Collection details and how to fix'));
    for (const [name, count] of [['Server A', '2'], ['Server B', '7']]) {
        const row = screen.getByText(new RegExp(`${name} · backend`)).closest('li');
        expect(within(row).getByText(count, {exact: true})).toBeVisible();
    }
});

test('keeps multiple Store request paths and HTTP statuses attached to their metric groups', () => {
    render(<SourceDiagnostics sourceName='stores' sources={{stores: {
        status: 'UP', availability: 'PARTIAL', reason: 'store_metrics_partial',
    }}} nodes={[
        {id: 'store-1', name: 'Store A', type: 'STORE', metric_statuses: {system: {
            availability: 'UNAVAILABLE', reason: 'upstream_rejected',
            diagnostics: {request_path: '/metrics/system', http_status: 503},
        }}},
        {id: 'store-2', name: 'Store B', type: 'STORE', metric_statuses: {raft: {
            availability: 'UNAVAILABLE', reason: 'upstream_rejected',
            diagnostics: {request_path: '/metrics/raft', http_status: 502},
        }}},
    ]} />);

    expect(screen.getByText('/metrics/system')).not.toBeVisible();
    expect(screen.getByText('/metrics/raft')).not.toBeVisible();
    fireEvent.click(screen.getByText('Collection details and how to fix'));
    const first = screen.getByText(/Store A · system/).closest('li');
    const second = screen.getByText(/Store B · raft/).closest('li');
    expect(within(first).getByText('/metrics/system')).toBeVisible();
    expect(within(first).getByText('503', {exact: true})).toBeVisible();
    expect(within(first).queryByText('/metrics/raft')).not.toBeInTheDocument();
    expect(within(second).getByText('/metrics/raft')).toBeVisible();
    expect(within(second).getByText('502', {exact: true})).toBeVisible();
    expect(within(second).queryByText('/metrics/system')).not.toBeInTheDocument();
});


test('explains the collection setting and compact Raft remedy for a partial Store failure', () => {
    i18n.changeLanguage('zh-CN');
    render(<SourceDiagnostics sourceName='stores' sources={{stores: {
        status: 'UP', availability: 'PARTIAL', reason: 'store_metrics_partial',
    }}} nodes={[{id: 'store-1', type: 'STORE', name: 'Store 1', metric_statuses: {
        raft: {availability: 'UNAVAILABLE', reason: 'response_too_large',
            diagnostics: {request_path: '/metrics/raft', max_response_bytes: 1048576,
                response_bytes: 1052672, response_size_exact: false}},
    }}]} />);
    expect(screen.getByText('至少 1 MB (1,052,672 B)')).toBeVisible();
    expect(screen.getByText(/不是完整响应大小/)).not.toBeVisible();
    fireEvent.click(screen.getByText('采集详情与修复方法'));
    expect(screen.getByText(/operations.max_response_bytes 限制每次上游响应/)).toBeVisible();
    expect(screen.getByText(/不是完整响应大小/)).toBeVisible();
    expect(screen.getByText(/Store 升级至提供.*metrics\/raft\/summary/)).toBeVisible();
    expect(screen.getByText(/此上限对每次采集请求都生效/)).toBeVisible();
});

test('does not suggest an older Raft payload remedy for an unrelated oversized request', () => {
    render(<SourceDiagnostics sourceName='stores' sources={{stores: {
        status: 'UP', availability: 'PARTIAL', reason: 'response_too_large',
        diagnostics: {request_path: '/v1/stores', max_response_bytes: 1048576},
    }}} />);
    fireEvent.click(screen.getByText('Collection details and how to fix'));
    expect(screen.getByText(/operations.max_response_bytes.*limits each upstream response/)).toBeVisible();
    expect(screen.queryByText(/older \/metrics\/raft endpoint/)).not.toBeInTheDocument();
    expect(screen.getByText(/Inspect the full response size from the same endpoint/)).toBeVisible();
    expect(screen.queryByText(/For an older Store|partition count/)).not.toBeInTheDocument();
});
