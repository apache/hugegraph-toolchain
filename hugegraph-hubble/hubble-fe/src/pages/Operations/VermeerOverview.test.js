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

import {render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter, useLocation, useNavigate} from 'react-router-dom';
import JSONbig from 'json-bigint';
import Overview from './Overview';
import {getOverview} from '../../api/operations';
import {getDashboard} from '../../api/auth';
import {formatProcessBytes, processMetric, vermeerNodeReady, vermeerResourceSummary} from './vermeer';
import i18n from '../../i18n';

jest.mock('../../api/operations');
jest.mock('../../api/auth');

const snapshot = (count = 1) => ({
    status: 'UP', main_cluster_status: 'UP', observed_at: 1000,
    nodes: [{id: 'server-1', name: 'Server 1', type: 'SERVER', status: 'UP'}],
    sources: {}, facts: {},
    vermeer: {
        configured: true, availability: 'AVAILABLE', status: 'UP', observed_at: 1000,
        registered_workers: count, ready_workers: count,
        master: {id: 'master-1', name: 'master-01', ready: true, version: '1.8.0'},
        workers: Array.from({length: count}, (_, index) => ({
            id: 'worker-' + (index + 1), name: 'worker-' + (index + 1), ready: true, version: '1.8.0',
            group: 'default', checks: {registered: true, connection_ready: true},
            metrics: {cpu_cores: 0.42, rss_bytes: 1288490188},
            metric_status: {availability: 'AVAILABLE'},
        })),
    },
});

const Navigation = () => {
    const location = useLocation();
    const navigate = useNavigate();
    return <>
        <output aria-label='Current URL'>{location.pathname + location.search}</output>
        <button onClick={() => navigate(-1)}>History back</button>
    </>;
};

const renderOverview = (url = '/operations/overview') => render(
    <MemoryRouter initialEntries={[url]}><Overview /><Navigation /></MemoryRouter>
);

beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {writable: true, value: query => ({
        matches: false, media: query, onchange: null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })});
});

beforeEach(() => {
    getDashboard.mockReturnValue(new Promise(() => {}));
    getOverview.mockResolvedValue(snapshot());
});

afterEach(() => {
    jest.clearAllMocks();
    i18n.changeLanguage('en-US');
});

test('keeps Vermeer collapsed until opened, then uses Master and Worker tiers', async () => {
    const {container} = renderOverview();
    const entry = await screen.findByRole('button', {name: 'View compute cluster'});
    expect(entry.closest('.operations-main-topology')).not.toBeNull();
    expect(entry.closest('.tier-store')).toBeNull();
    expect(container.querySelector('.operations-vermeer-topology')).toBeNull();
    expect(screen.queryByRole('button', {name: /master-01/})).not.toBeInTheDocument();

    await userEvent.click(entry);

    expect(screen.getByRole('heading', {level: 2, name: 'Vermeer Compute Cluster'})).toBeInTheDocument();
    const tiers = container.querySelectorAll('.operations-vermeer-tier');
    expect(tiers).toHaveLength(2);
    expect(within(tiers[0]).getByText('Master tier')).toBeInTheDocument();
    expect(within(tiers[1]).getByText('Worker tier')).toBeInTheDocument();
    expect(screen.getByText('Workers ready 1 / registered 1')).toBeInTheDocument();
    const facts = container.querySelector('.operations-vermeer-facts');
    expect(within(facts).getByRole('heading', {name: 'Compute cluster information'})).toBeInTheDocument();
    expect(within(facts).getByText('Registered Workers')).toBeInTheDocument();
    expect(within(facts).getByText('Ready / registered Workers')).toBeInTheDocument();
});

test('preserves the main view and query across service navigation and browser back', async () => {
    renderOverview('/operations/overview?view=nodes&source=attention');
    await userEvent.click(await screen.findByRole('button', {name: 'View compute cluster'}));
    expect(screen.getByLabelText('Current URL')).toHaveTextContent(
        '/operations/overview?view=nodes&source=attention&service=vermeer'
    );
    await userEvent.click(screen.getByRole('button', {name: 'Back to main cluster'}));
    expect(screen.getByLabelText('Current URL')).toHaveTextContent(
        '/operations/overview?view=nodes&source=attention'
    );
    await userEvent.click(screen.getByRole('button', {name: 'History back'}));
    expect(await screen.findByRole('heading', {level: 2, name: 'Vermeer Compute Cluster'}))
        .toBeInTheDocument();
});

test('changing the compute view does not alter the main-cluster view on return', async () => {
    renderOverview('/operations/overview?source=attention');
    await userEvent.click(await screen.findByRole('button', {name: 'View compute cluster'}));
    await userEvent.click(screen.getByRole('radio', {name: 'Node list'}).closest('label'));
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('compute_view=nodes');
    await userEvent.click(screen.getByRole('button', {name: 'Back to main cluster'}));
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('/operations/overview?source=attention');
    expect(screen.getByRole('radio', {name: 'Topology'})).toBeChecked();
    expect(screen.getByLabelText('Current URL')).not.toHaveTextContent('compute_view');
});

test('opens node details and a full view without losing the compute context', async () => {
    renderOverview('/operations/overview?service=vermeer');
    await screen.findByRole('heading', {level: 2, name: 'Vermeer Compute Cluster'});
    await userEvent.click(screen.getByRole('button', {name: 'worker-1'}));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Master reverse connection')).toBeInTheDocument();
    expect(within(dialog).getByText('RSS memory: 1.2 GiB')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', {name: 'View full node details'}));
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('detail=full');
    expect(screen.getByRole('heading', {name: 'worker-1'})).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Back to compute cluster'}));
    expect(screen.getByText('Workers ready 1 / registered 1')).toBeInTheDocument();
});

test('same raw Master and Worker IDs select the clicked role without sharing row keys', async () => {
    const data = snapshot();
    data.vermeer.master = {...data.vermeer.master, id: 'master', name: 'master-shared',
        checks: {http_ready: true, initialized: true, service_online: true}};
    data.vermeer.workers[0] = {...data.vermeer.workers[0], id: 'master', name: 'worker-shared',
        group: 'worker-group'};
    getOverview.mockResolvedValue(data);
    const {container} = renderOverview('/operations/overview?service=vermeer');
    await userEvent.click(await screen.findByRole('button', {name: 'worker-shared'}));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('worker-group')).toBeInTheDocument();
    expect(within(dialog).getByText('Registered with Master')).toBeInTheDocument();
    expect(within(dialog).queryByText('Master initialization')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('node=worker%3Amaster');
    expect(container.querySelector('[data-row-key="master:master"]')).not.toBeNull();
    expect(container.querySelector('[data-row-key="worker:master"]')).not.toBeNull();
});

test('an ambiguous raw node ID does not silently open Master details', async () => {
    const data = snapshot();
    data.vermeer.master.id = 'master';
    data.vermeer.workers[0].id = 'master';
    getOverview.mockResolvedValue(data);
    renderOverview('/operations/overview?service=vermeer&node=master');
    await screen.findByRole('heading', {level: 2, name: 'Vermeer Compute Cluster'});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('never presents old readiness as current when the snapshot becomes stale', async () => {
    const data = snapshot();
    data.vermeer = {...data.vermeer, status: 'UNKNOWN', availability: 'UNAVAILABLE', stale: true,
        ready_workers: null, reason: 'vermeer_cluster_unavailable'};
    getOverview.mockResolvedValue(data);
    renderOverview('/operations/overview?service=vermeer');
    await screen.findByRole('heading', {level: 2, name: 'Vermeer Compute Cluster'});
    expect(screen.getAllByText('Readiness unconfirmed').length).toBeGreaterThan(1);
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();
    expect(screen.getByText('Workers ready — / registered 1')).toBeInTheDocument();
});

test('shows all same-tier Workers without promoting them to additional hierarchy levels', async () => {
    getOverview.mockResolvedValue(snapshot(9));
    const {container} = renderOverview('/operations/overview?service=vermeer');
    await screen.findByText('Workers ready 9 / registered 9');
    const workers = container.querySelector('.operations-vermeer-branch[data-role="WORKER"]');
    expect(within(workers).getAllByRole('button')).toHaveLength(9);
    expect(container.querySelectorAll('.operations-vermeer-tier')).toHaveLength(2);
});

test('unknown topology does not claim zero nodes or no registered Workers', async () => {
    const data = snapshot();
    data.vermeer = {...data.vermeer, status: 'UNKNOWN', availability: 'UNAVAILABLE',
        reason: 'vermeer_credentials_unavailable', registered_workers: null, ready_workers: null,
        master: null, workers: []};
    getOverview.mockResolvedValue(data);
    const {container} = renderOverview('/operations/overview?service=vermeer');
    await screen.findByRole('heading', {level: 2, name: 'Vermeer Compute Cluster'});
    const computeHealth = container.querySelector('.operations-vermeer-cluster-heading');
    expect(computeHealth.querySelector('.status-unknown')).not.toBeNull();
    expect(computeHealth.querySelector('.status-up')).toBeNull();
    const tiers = container.querySelectorAll('.operations-vermeer-tier');
    for (const tier of tiers) {
        expect(within(tier).queryByText(/^0 nodes?$/)).not.toBeInTheDocument();
        expect(within(tier).getByText('Count unavailable')).toBeInTheDocument();
    }
    expect(within(tiers[1]).queryByText('No registered Workers')).not.toBeInTheDocument();
    expect(within(tiers[1]).getByText('Worker information unavailable')).toBeInTheDocument();
    const listHeading = container.querySelector('.operations-vermeer-node-list h3');
    expect(listHeading).not.toHaveTextContent('Node list (0)');
    expect(listHeading).toHaveTextContent('Count unavailable');
});

test('a confirmed empty Worker registry still shows a real zero and registration empty state', async () => {
    const data = snapshot(0);
    data.status = 'DEGRADED';
    data.reason = 'vermeer_attention';
    data.vermeer.status = 'DEGRADED';
    data.vermeer.reason = 'no_workers';
    getOverview.mockResolvedValue(data);
    const {container} = renderOverview('/operations/overview?service=vermeer');
    await screen.findByRole('heading', {level: 2, name: 'Vermeer Compute Cluster'});
    const tiers = container.querySelectorAll('.operations-vermeer-tier');
    expect(within(tiers[1]).getByText('0 nodes')).toBeInTheDocument();
    expect(within(tiers[1]).getByText('No registered Workers')).toBeInTheDocument();
    expect(container.querySelector('.operations-vermeer-node-list h3')).toHaveTextContent('Node list (1)');
});

test.each([0, 2])('stale snapshots retain known historical counts for %s Workers', async count => {
    const data = snapshot(count);
    data.vermeer = {...data.vermeer, availability: 'UNAVAILABLE', status: 'UNKNOWN', stale: true,
        last_success_at: 1000, ready_workers: null};
    getOverview.mockResolvedValue(data);
    const {container} = renderOverview('/operations/overview?service=vermeer');
    await screen.findByRole('heading', {level: 2, name: 'Vermeer Compute Cluster'});
    const tiers = container.querySelectorAll('.operations-vermeer-tier');
    expect(within(tiers[0]).getByText('1 node · Historical snapshot')).toBeInTheDocument();
    expect(within(tiers[1]).getByText(count + ' nodes · Historical snapshot')).toBeInTheDocument();
    expect(container.querySelector('.operations-vermeer-node-list h3'))
        .toHaveTextContent('Node list (' + (count + 1) + ') · Historical snapshot');
    if (count === 0) {
        expect(within(tiers[1]).getByText('No registered Workers')).toBeInTheDocument();
    }
});

test('explains Master readiness with its own checks rather than Worker channels', async () => {
    const data = snapshot();
    data.vermeer.master.checks = {http_ready: true, initialized: true, service_online: true};
    getOverview.mockResolvedValue(data);
    renderOverview('/operations/overview?service=vermeer&node=master-1');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('HTTP service responding')).toBeInTheDocument();
    expect(within(dialog).getByText('Master initialization')).toBeInTheDocument();
    expect(within(dialog).queryByText('Graph loading channel')).not.toBeInTheDocument();
});

test('an undeployed optional compute service stays out of the main overview', async () => {
    const data = snapshot();
    data.vermeer = {configured: false, availability: 'UNSUPPORTED', status: 'UNKNOWN', workers: []};
    getOverview.mockResolvedValue(data);
    const {container} = renderOverview();
    await screen.findByRole('heading', {level: 2, name: 'Cluster Overview'});
    expect(screen.queryByRole('button', {name: 'View compute cluster'})).not.toBeInTheDocument();
    expect(screen.queryByText('Not deployed')).not.toBeInTheDocument();
    expect(container.querySelector('.operations-main-topology.has-vermeer')).toBeNull();
    expect(screen.queryByText('Compute service needs attention')).not.toBeInTheDocument();
});

test('the header distinguishes simultaneous main-cluster and compute attention', async () => {
    const data = snapshot();
    data.status = 'DEGRADED';
    data.main_cluster_status = 'DEGRADED';
    data.main_cluster_reason = 'cluster_not_ready';
    data.vermeer.status = 'DEGRADED';
    data.vermeer.ready_workers = 0;
    getOverview.mockResolvedValue(data);
    renderOverview();
    const health = await screen.findByLabelText('Deployment service health');
    expect(within(health).getByText(/Main cluster/)).toBeInTheDocument();
    expect(within(health).getByText('Attention')).toBeInTheDocument();
    expect(within(health).getByText('Compute service needs attention')).toBeInTheDocument();
});

test('compute failure does not relabel an independently healthy main cluster', async () => {
    const data = snapshot();
    data.status = 'DEGRADED';
    data.vermeer.status = 'DEGRADED';
    data.vermeer.ready_workers = 0;
    getOverview.mockResolvedValue(data);
    renderOverview();
    const health = await screen.findByLabelText('Deployment service health');
    expect(within(health).getByText('UP')).toBeInTheDocument();
    expect(within(health).getByText('Compute service needs attention')).toBeInTheDocument();
});

test('removes compute node information when an authorized refresh becomes forbidden', async () => {
    renderOverview('/operations/overview?service=vermeer');
    await screen.findByRole('heading', {level: 2, name: 'Vermeer Compute Cluster'});
    getOverview.mockRejectedValueOnce(Object.assign(new Error('forbidden'), {status: 403}));
    await userEvent.click(screen.getByRole('button', {name: 'Refresh'}));
    await waitFor(() => expect(screen.queryByText('master-01')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', {name: /worker-1/})).not.toBeInTheDocument();
});

test('a failed overview refresh marks retained compute readiness and resources as stale', async () => {
    const {container} = renderOverview('/operations/overview?service=vermeer');
    await screen.findByRole('heading', {level: 2, name: 'Vermeer Compute Cluster'});
    getOverview.mockRejectedValueOnce(new Error('network unavailable'));
    await userEvent.click(screen.getByRole('button', {name: 'Refresh'}));
    await within(container.querySelector('.operations-overall-status'))
        .findByText('Cluster refresh failed. The last observed compute snapshot is retained.');
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();
    expect(screen.getByText('Workers ready — / registered 1')).toBeInTheDocument();
    expect(screen.queryByText('CPU 0.42 cores · RSS 1.2 GiB')).not.toBeInTheDocument();
});

test('does not treat an unsupported readiness API as healthy or render missing metrics as zero', async () => {
    const data = snapshot();
    data.vermeer.availability = 'UNSUPPORTED';
    data.vermeer.reason = 'vermeer_cluster_api_unsupported';
    data.vermeer.workers[0].metric_status.availability = 'UNAVAILABLE';
    getOverview.mockResolvedValue(data);
    const {container} = renderOverview('/operations/overview?service=vermeer');
    await screen.findByRole('heading', {level: 2, name: 'Vermeer Compute Cluster'});
    expect(within(container.querySelector('.operations-overall-status'))
        .getByText('This Vermeer version does not support the cluster health API.'))
        .toBeInTheDocument();
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();
    expect(screen.queryByText('Process CPU: 0 cores')).not.toBeInTheDocument();
});

test('resource collection failure explains missing metrics without changing Worker readiness', async () => {
    const data = snapshot();
    data.vermeer.workers[0].metric_status = {availability: 'UNAVAILABLE', reason: 'metrics_timeout'};
    getOverview.mockResolvedValue(data);
    renderOverview('/operations/overview?service=vermeer&node=worker-1');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Process resource collection timed out.')).toBeInTheDocument();
    expect(within(dialog).queryByText('Not ready')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Process CPU: Unavailable')).toBeInTheDocument();
});

test.each([
    ['RSS-only', {rss_bytes: 1288490188}, 'RSS memory: 1.2 GiB', 'Process CPU: Unavailable'],
    ['CPU-only', {cpu_cores: 0.42}, 'Process CPU: 0.42 cores', 'RSS memory: Unavailable'],
])('fresh %s partial resources remain visible in node details', async (_, metrics, present, missing) => {
    const data = snapshot();
    data.vermeer.workers[0].metric_status = {availability: 'PARTIAL', fresh: true, stale: false};
    data.vermeer.workers[0].metrics = metrics;
    getOverview.mockResolvedValue(data);
    renderOverview('/operations/overview?service=vermeer&node=worker-1');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(present)).toBeInTheDocument();
    expect(within(dialog).getByText(missing)).toBeInTheDocument();
    expect(within(dialog).queryByText('Not ready')).not.toBeInTheDocument();
});

test.each([
    ['en-US', 'Process metrics are warming up. Wait at least one second, then refresh to collect the second sample.'],
    ['zh-CN', '进程指标正在预热。请至少等待 1 秒后刷新，取得第二次采样后即可查看资源数据'],
])('resource warm-up has actionable %s guidance', async (locale, message) => {
    await i18n.changeLanguage(locale);
    const data = snapshot();
    data.vermeer.workers[0].metric_status = {availability: 'UNAVAILABLE', reason: 'metrics_warming_up'};
    data.vermeer.workers[0].metrics = {};
    getOverview.mockResolvedValue(data);
    renderOverview('/operations/overview?service=vermeer&node=worker-1');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(message)).toBeInTheDocument();
});

test('expired resource snapshots are not displayed as current process measurements', async () => {
    const data = snapshot();
    data.vermeer.workers[0].metric_status = {availability: 'AVAILABLE', stale: true, fresh: false};
    getOverview.mockResolvedValue(data);
    renderOverview('/operations/overview?service=vermeer&node=worker-1');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Process CPU: Unavailable')).toBeInTheDocument();
    expect(within(dialog).queryByText('Process CPU: 0.42 cores')).not.toBeInTheDocument();
    expect(within(dialog).getByText(/stale/i)).toBeInTheDocument();
    expect(within(dialog).queryByText('Not ready')).not.toBeInTheDocument();
});

test('resource summary counts only fresh process samples and states coverage per metric', () => {
    const data = snapshot();
    const nodes = [
        {...data.vermeer.master, metrics: {cpu_cores: 0.12, rss_bytes: 1024},
            metric_status: {availability: 'AVAILABLE'}},
        {...data.vermeer.workers[0], metrics: {cpu_cores: 0.42, rss_bytes: 2048}},
    ];
    expect(vermeerResourceSummary(nodes, data.vermeer)).toEqual({
        cpu: {value: 0.54, collected: 2}, rss: {value: 3072, collected: 2}, total: 2,
    });
    nodes[0].metric_status.stale = true;
    expect(vermeerResourceSummary(nodes, data.vermeer)).toEqual({
        cpu: {value: 0.42, collected: 1}, rss: {value: 2048, collected: 1}, total: 2,
    });
    expect(vermeerResourceSummary(nodes, {...data.vermeer, stale: true})).toEqual({
        cpu: {value: null, collected: 0}, rss: {value: null, collected: 0}, total: 2,
    });
});

test('production json-bigint decimals count as fresh CPU samples without changing zero', async () => {
    const data = snapshot(2);
    const parsed = JSONbig.parse('{"cpu_cores":0.00044612345678912345,"rss_bytes":1288490188}');
    expect(typeof parsed.cpu_cores).toBe('object');
    data.vermeer.master = {...data.vermeer.master, metrics: {cpu_cores: 0, rss_bytes: 1024},
        metric_status: {availability: 'AVAILABLE', fresh: true}};
    data.vermeer.workers[0].metrics = parsed;
    data.vermeer.workers[1].metrics = {cpu_cores: 0, rss_bytes: 2048};
    const summary = vermeerResourceSummary([data.vermeer.master, ...data.vermeer.workers], data.vermeer);
    expect(summary.cpu.collected).toBe(3);
    expect(summary.cpu.value).toBeCloseTo(Number('0.00044612345678912345'));
    getOverview.mockResolvedValue(data);
    renderOverview('/operations/overview?service=vermeer&node=worker-1');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Process CPU: 0.0004 cores')).toBeInTheDocument();
    expect(within(dialog).queryByText('Process CPU: Unavailable')).not.toBeInTheDocument();
});

test.each([null, '0.5', {}, -1, Infinity, NaN])('invalid CPU value %p is unavailable', value => {
    const data = snapshot();
    const node = {...data.vermeer.workers[0], metrics: {cpu_cores: value}};
    expect(vermeerResourceSummary([node], data.vermeer).cpu).toEqual({value: null, collected: 0});
});

test('BigNumber metrics still obey availability, freshness and finite nonnegative bounds', () => {
    const data = snapshot();
    const big = JSONbig.parse('{"small":0.00044612345678912345,"negative":-0.00044612345678912345}');
    const node = {...data.vermeer.workers[0], metrics: {cpu_cores: big.small},
        metric_status: {availability: 'AVAILABLE', stale: true}};
    expect(vermeerResourceSummary([node], data.vermeer).cpu).toEqual({value: null, collected: 0});
    node.metric_status = {availability: 'UNAVAILABLE'};
    expect(vermeerResourceSummary([node], data.vermeer).cpu).toEqual({value: null, collected: 0});
    node.metric_status = {availability: 'AVAILABLE'};
    node.metrics.cpu_cores = big.negative;
    expect(vermeerResourceSummary([node], data.vermeer).cpu).toEqual({value: null, collected: 0});
});

test.each([
    ['RSS-only', {rss_bytes: 2048}, {cpu: {value: 0.12, collected: 1}, rss: {value: 3072, collected: 2}}],
    ['CPU-only', {cpu_cores: 0.42}, {cpu: {value: 0.54, collected: 2}, rss: {value: 1024, collected: 1}}],
])('%s partial samples contribute only to their valid metric and coverage', (_, metrics, expected) => {
    const data = snapshot();
    const nodes = [
        {...data.vermeer.master, metrics: {cpu_cores: 0.12, rss_bytes: 1024},
            metric_status: {availability: 'AVAILABLE', fresh: true}},
        {...data.vermeer.workers[0], metrics,
            metric_status: {availability: 'PARTIAL', fresh: true, stale: false}},
    ];
    expect(vermeerResourceSummary(nodes, data.vermeer)).toEqual({...expected, total: 2});
});

test.each([
    ['stale partial', {availability: 'PARTIAL', stale: true}],
    ['non-fresh partial', {availability: 'PARTIAL', fresh: false}],
])('%s samples never contribute values or collection coverage', (_, metricStatus) => {
    const data = snapshot();
    const worker = {...data.vermeer.workers[0], metrics: {cpu_cores: 0.42, rss_bytes: 2048},
        metric_status: metricStatus};
    expect(vermeerResourceSummary([worker], data.vermeer)).toEqual({
        cpu: {value: null, collected: 0}, rss: {value: null, collected: 0}, total: 1,
    });
});

test('resource formatting rejects unknown and non-finite values without confusing zero with missing', () => {
    expect(processMetric(null, 'en-US')).toBeNull();
    expect(processMetric(Infinity, 'en-US')).toBeNull();
    expect(processMetric(0, 'en-US')).toBe('0');
    expect(formatProcessBytes(1288490188, 'en-US')).toBe('1.2 GiB');
    expect(vermeerNodeReady({ready: true}, {configured: true, stale: true, availability: 'AVAILABLE'}))
        .toBeNull();
});
