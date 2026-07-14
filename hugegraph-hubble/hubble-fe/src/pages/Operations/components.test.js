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

import {render, screen, within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {ClusterTopology, SourceStrip} from './components';
import i18n from '../../i18n';

afterEach(() => i18n.changeLanguage('en-US'));

test('localizes the topology accessible name', async () => {
    await i18n.changeLanguage('zh-CN');

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <ClusterTopology nodes={[]} />
        </MemoryRouter>
    );

    expect(screen.getByLabelText('Server、PD 与 Store 服务拓扑')).toBeInTheDocument();
    expect(screen.queryByLabelText('Server PD Store topology')).not.toBeInTheDocument();
});

test('localizes the standalone deployment reason code', async () => {
    await i18n.changeLanguage('zh-CN');

    render(
        <SourceStrip
            sources={{
                pd: {
                    status: 'UNKNOWN',
                    availability: 'UNSUPPORTED',
                    reason: 'deployment_mode_unsupported',
                },
            }}
        />
    );

    expect(screen.getByText(/当前部署模式不支持/)).toBeInTheDocument();
    expect(screen.queryByText(/deployment mode unsupported/)).not.toBeInTheDocument();
});

test('uses semantic tier icons and keeps the PD leader on the visual axis', () => {
    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <ClusterTopology nodes={[
                {id: 'server-1', name: 'server-1', type: 'SERVER', status: 'UP'},
                {id: 'pd-2', name: 'pd-2', type: 'PD', status: 'UP', role: 'FOLLOWER'},
                {id: 'pd-1', name: 'pd-1', type: 'PD', status: 'UP', role: 'LEADER'},
                {id: 'store-1', name: 'store-1', type: 'STORE', status: 'UP'},
            ]}
            />
        </MemoryRouter>
    );

    expect(screen.getByLabelText('SERVER icon')).toBeInTheDocument();
    expect(screen.getAllByLabelText('PD icon')).toHaveLength(2);
    expect(screen.getByLabelText('STORE icon')).toBeInTheDocument();
    expect(screen.getByText('pd-1').closest('a')).toHaveClass('is-axis-node');
    expect(screen.getByText('pd-2').closest('a')).not.toHaveClass('is-axis-node');
    expect(screen.getByRole('link', {name: 'Server tier'})).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Store tier'})).toBeInTheDocument();
    expect(screen.queryByRole('link', {name: 'SERVER tier'})).not.toBeInTheDocument();
});

test('shows stale metrics beside an up topology status', () => {
    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <ClusterTopology nodes={[{
                id: 'store-stale',
                name: 'store-stale',
                type: 'STORE',
                status: 'UP',
                metric_statuses: {system: {availability: 'UNAVAILABLE', stale: true}},
            }]}
            />
        </MemoryRouter>
    );

    const card = screen.getByText('store-stale').closest('a');
    expect(within(card).getByText('UP')).toBeInTheDocument();
    expect(within(card).getByText('Stale')).toBeInTheDocument();
});
