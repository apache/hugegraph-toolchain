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

import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {message} from 'antd';
import {MemoryRouter, useLocation, useNavigate} from 'react-router-dom';
import Nodes from './Nodes';
import {getNodes} from '../../api/operations';
import '../../i18n';

jest.mock('../../api/operations');

beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));
    window.matchMedia = () => ({
        matches: false,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
    });
});

test('limits standalone node details to Server nodes and filters', async () => {
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: false}));
    getNodes.mockResolvedValue({
        items: [
            {id: 'server-1', name: 'Server A', type: 'SERVER', status: 'UP'},
            {id: 'pd-1', name: 'PD A', type: 'PD', status: 'UP'},
            {id: 'store-1', name: 'Store A', type: 'STORE', status: 'UP'},
        ],
        total: 3,
        observed_at: 1000,
        stale: false,
    });

    render(
        <MemoryRouter
            initialEntries={['/operations/nodes?type=STORE']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Nodes />
        </MemoryRouter>
    );

    expect(await screen.findByRole('heading', {name: 'Node details'})).toBeInTheDocument();
    await waitFor(() => expect(getNodes).toHaveBeenCalledWith(
        expect.objectContaining({type: 'SERVER'})
    ));
    fireEvent.mouseDown(screen.getByRole('combobox', {name: /node type/i}));
    expect(screen.getByRole('option', {name: 'Server'})).toBeInTheDocument();
    expect(screen.queryByRole('option', {name: 'PD'})).not.toBeInTheDocument();
    expect(screen.queryByRole('option', {name: 'Store'})).not.toBeInTheDocument();
    expect(screen.getByRole('link', {name: /Server A/})).toBeInTheDocument();
    expect(screen.queryByRole('link', {name: /PD A/})).not.toBeInTheDocument();
    expect(screen.queryByRole('link', {name: /Store A/})).not.toBeInTheDocument();
});

afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
});

const HistoryControls = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const showSecondQuery = () => navigate('/operations/nodes?query=second');
    return (
        <>
            <button type='button' onClick={showSecondQuery}>
                history query
            </button>
            <output aria-label='current query'>{location.search}</output>
        </>
    );
};

test('shows stale observation metadata and exposes real detail links', async () => {
    getNodes.mockResolvedValue({
        items: [
            {id: 'server-safe', name: 'Server A', type: 'SERVER', status: 'UP'},
        ],
        total: 1,
        observed_at: 1000,
        stale: true,
    });

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <Nodes />
        </MemoryRouter>
    );

    expect(await screen.findByRole('link', {name: /Server A/})).toHaveAttribute(
        'href', '/operations/nodes/server-safe'
    );
    expect(screen.getByText(/Stale/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Observed/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('combobox', {name: /node type/i})).toBeInTheDocument();
    expect(screen.getByRole('textbox', {name: /search node/i})).toBeInTheDocument();
    expect(screen.getByText('Browse, filter and inspect every discovered service node'))
        .toBeInTheDocument();
    expect(screen.getByText('1 node')).toBeInTheDocument();
    expect(screen.getByLabelText('SERVER icon')).toBeInTheDocument();
    expect(screen.getByText('Node ID: server-safe')).toBeInTheDocument();
    expect(screen.getByRole('cell', {name: 'Server'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Refresh'})).toHaveClass(
        'operations-refresh-button', 'ant-btn-text', 'ant-btn-circle'
    );
    expect(screen.getByRole('button', {name: 'Refresh'})).toHaveTextContent('');

    fireEvent.click(screen.getByRole('columnheader', {name: 'Type'}));
    await waitFor(() => expect(getNodes).toHaveBeenLastCalledWith(
        expect.objectContaining({sort: 'type', order: 'asc'})
    ));
    await waitFor(() => expect(screen.getByRole('button', {name: /Refresh/}))
        .not.toHaveClass('ant-btn-loading'));
});

test('keeps the search input synchronized with URL history and clear actions', async () => {
    getNodes.mockResolvedValue({items: [], total: 0, observed_at: 1000, stale: false});

    render(
        <MemoryRouter
            initialEntries={['/operations/nodes?query=first']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <HistoryControls />
            <Nodes />
        </MemoryRouter>
    );
    const search = await screen.findByRole('textbox', {name: /search node/i});
    expect(search).toHaveValue('first');

    fireEvent.click(screen.getByRole('button', {name: 'history query'}));
    await waitFor(() => expect(search).toHaveValue('second'));

    fireEvent.change(search, {target: {value: 'third'}});
    fireEvent.keyDown(search, {key: 'Enter', code: 'Enter'});
    await waitFor(() => expect(screen.getByLabelText('current query'))
        .toHaveTextContent('query=third'));

    fireEvent.change(search, {target: {value: ''}});
    await waitFor(() => expect(screen.getByLabelText('current query'))
        .not.toHaveTextContent('query='));
    await waitFor(() => expect(getNodes).toHaveBeenLastCalledWith(
        expect.objectContaining({query: undefined})
    ));
    await waitFor(() => expect(screen.getByRole('button', {name: /Refresh/}))
        .not.toHaveClass('ant-btn-loading'));
});

test('renders a bounded empty table for a valid zero-node response', async () => {
    getNodes.mockResolvedValue({items: [], total: 0, observed_at: 1000, stale: false});

    const {container} = render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <Nodes />
        </MemoryRouter>
    );

    expect(await screen.findByText('0 nodes')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', {name: /Refresh/}))
        .not.toHaveClass('ant-btn-loading'));
    expect(container.querySelector('.ant-empty')).toBeInTheDocument();
    expect(screen.queryByRole('link', {name: /view node details/i}))
        .not.toBeInTheDocument();
});

test('clears an earlier privileged snapshot when a refresh is forbidden', async () => {
    getNodes
        .mockResolvedValueOnce({
            items: [{id: 'admin-node', name: 'Admin node', type: 'SERVER', status: 'UP'}],
            total: 1,
            observed_at: 1000,
            stale: false,
        })
        .mockRejectedValueOnce(Object.assign(new Error('forbidden'), {status: 403}));

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <Nodes />
        </MemoryRouter>
    );
    expect(await screen.findByRole('link', {name: /Admin node/})).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', {name: /Refresh/}))
        .not.toHaveClass('ant-btn-loading'));

    fireEvent.click(screen.getByRole('button', {name: /Refresh/}));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByRole('link', {name: /Admin node/})).not.toBeInTheDocument();
    expect(screen.getByText('0 nodes')).toBeInTheDocument();
});

test('does not restore an older node list after a newer request is forbidden', async () => {
    let resolveOlder;
    getNodes
        .mockReturnValueOnce(new Promise(resolve => {
            resolveOlder = resolve;
        }))
        .mockRejectedValueOnce(Object.assign(new Error('forbidden'), {status: 403}));

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <HistoryControls />
            <Nodes />
        </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', {name: 'history query'}));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    await act(async () => resolveOlder({
        items: [{id: 'stale-admin-node', name: 'Stale admin node', type: 'SERVER'}],
        total: 1,
        observed_at: 1000,
        stale: false,
    }));

    expect(screen.queryByRole('link', {name: /Stale admin node/})).not.toBeInTheDocument();
    expect(screen.getByText('0 nodes')).toBeInTheDocument();
});

test('merges role into node identity and keeps the full ID explainable and copyable', async () => {
    jest.spyOn(message, 'success').mockImplementation(() => {});
    const writeText = jest.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {writeText},
    });
    getNodes.mockResolvedValue({
        items: [{
            id: 'store-c410c1adb107-full-id',
            name: 'store-c410c1',
            type: 'STORE',
            role: 'LEADER',
            status: 'UP',
        }],
        total: 1,
        observed_at: 1000,
        stale: false,
    });

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <Nodes />
        </MemoryRouter>
    );

    const identity = (await screen.findByText('store-c410c1'))
        .closest('.operations-node-identity-cell');
    expect(identity).toHaveAccessibleName(
        /service-reported node name.*store-c410c1adb107-full-id/i
    );
    expect(identity).toHaveTextContent('LEADER');
    expect(within(identity).getByLabelText('Leader role')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', {name: 'Role'})).not.toBeInTheDocument();

    fireEvent.click(within(identity).getByRole('button', {name: 'Copy full node ID'}));
    expect(writeText).toHaveBeenCalledWith('store-c410c1adb107-full-id');
});
