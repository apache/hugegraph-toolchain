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

import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter, useLocation, useNavigate} from 'react-router-dom';
import Nodes from './Nodes';
import {getNodes} from '../../api/operations';
import '../../i18n';

jest.mock('../../api/operations');

beforeEach(() => {
    window.matchMedia = () => ({
        matches: false,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
    });
});

afterEach(() => jest.clearAllMocks());

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
    expect(screen.getByText('Browse, filter and inspect every discovered service node.'))
        .toBeInTheDocument();
    expect(screen.getByText('1 node')).toBeInTheDocument();
    expect(screen.getByLabelText('SERVER icon')).toBeInTheDocument();

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
