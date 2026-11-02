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

import {render, screen} from '@testing-library/react';
import {ReadinessPanel, ReadinessStatus} from './Readiness';
import {selectAttentionNodes} from './topology';
import i18n from '../../i18n';

beforeEach(() => {
    i18n.changeLanguage('en-US');
    window.matchMedia = () => ({matches: false, addListener: () => {},
        removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}});
});

test('shows a concrete PD failure and repair guidance without an alert banner', () => {
    render(<ReadinessPanel readiness={{status: 'NOT_READY', state: 'STATE_ERROR',
        reason: 'pd_raft_error', observed_at: 1000,
        diagnostics: {request_path: '/v1/ready', http_status: 503}}} />);
    expect(screen.getByRole('region', {name: 'Service readiness'})).toBeVisible();
    expect(screen.getByText('STATE_ERROR')).toBeVisible();
    expect(screen.getByText('/v1/ready')).toBeVisible();
    expect(screen.getByText('503')).toBeVisible();
    expect(screen.getByText(/Correct the underlying failure before restarting/)).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('does not call an earlier successful probe ready after a failed refresh', () => {
    render(<ReadinessPanel readiness={{status: 'READY', stale: true, observed_at: 1000}} />);
    expect(screen.getByText('Refresh needed')).toBeVisible();
    expect(screen.queryByText('Ready', {exact: true})).not.toBeInTheDocument();
    expect(screen.getByText(/earlier readiness observation/)).toBeVisible();
});

test('labels members not probed without treating them as an outage', () => {
    const readiness = {status: 'UNKNOWN', reason: 'readiness_not_probed'};
    render(<ReadinessStatus readiness={readiness} />);
    expect(screen.getByText('Service: Not probed')).toBeVisible();
    const online = {id: 'pd-1', status: 'UP', readiness};
    expect(selectAttentionNodes([online])).toEqual([]);
    expect(selectAttentionNodes([{...online,
        readiness: {status: 'NOT_READY', state: 'STATE_FOLLOWER'}}])).toHaveLength(1);
    expect(online.status).toBe('UP');
});

test('leaves standalone nodes without a probe uncluttered', () => {
    const {container} = render(<ReadinessStatus />);
    expect(container).toBeEmptyDOMElement();
});

test('explains direct peer readiness mapping without suggesting a Service address change', () => {
    render(<ReadinessPanel readiness={{status: 'UNKNOWN', reason: 'readiness_peer_unmapped'}} />);
    expect(screen.getByText(/did not match a trusted direct address/)).toBeVisible();
    expect(screen.getByText(/member REST host matches pd.peers/)).toBeVisible();
});
