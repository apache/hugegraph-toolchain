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

import {fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import Graph from './index';
import * as api from '../../api';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

jest.mock('react-router-dom', () => {
    const router = jest.requireActual('react-router-dom');

    return {
        ...router,
        Link: ({children, to}) => <a href={to}>{children}</a>,
        useNavigate: () => jest.fn(),
        useParams: () => ({graphspace: 'space'}),
    };
});

jest.mock('../../api', () => ({
    manage: {
        getGraphSpace: jest.fn(),
        getGraphList: jest.fn(),
        clearGraph: jest.fn(),
    },
}));

jest.mock('./EditLayer', () => ({
    EditLayer: () => null,
    ViewLayer: () => null,
    CloneLayer: () => null,
}));

jest.mock('./Card', () => ({menus}) => (
    <div data-testid='graph-card-menu'>
        {menus.map(item => (
            <div
                key={item.key}
                role='menuitem'
                aria-disabled={item.disabled || undefined}
                onClick={item.onClick}
            >
                {item.label}
            </div>
        ))}
    </div>
));

jest.mock('./ClearGraphConfirmModal', () => ({open, onConfirm}) => (
    open ? (
        <button data-testid='clear-confirm-modal' onClick={onConfirm}>
            confirm clear
        </button>
    ) : null
));

const installMatchMedia = () => {
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    }));
};

beforeAll(installMatchMedia);

beforeEach(() => {
    jest.clearAllMocks();
    installMatchMedia();
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));
    api.manage.getGraphSpace.mockResolvedValue({
        status: 200,
        data: {name: 'space', nickname: 'Space'},
    });
    api.manage.getGraphList.mockResolvedValue({
        status: 200,
        data: {
            records: [{
                name: 'default-graph',
                nickname: 'Default graph',
                graphspace: 'space',
                default: true,
            }],
            total: 1,
        },
    });
});

test('disables every clear action for the default graph card', async () => {
    render(<Graph />);

    const menu = await screen.findByTestId('graph-card-menu');
    expect(screen.getByRole('radiogroup', {name: 'graph.view_mode'}))
        .toBeInTheDocument();
    const clearSchemaData = screen.getByText('graph.menu.clear_graph');
    const setDefault = screen.getByText('graph.menu.set_default');

    expect(menu).toContainElement(clearSchemaData);
    expect(clearSchemaData.tagName).toBe('SPAN');
    expect(setDefault.tagName).toBe('SPAN');

    fireEvent.click(clearSchemaData);

    await waitFor(() => {
        expect(screen.queryByTestId('clear-confirm-modal')).not.toBeInTheDocument();
    });
    expect(api.manage.clearGraph).not.toHaveBeenCalled();
});

test('offers one conservative graph clear action and calls its canonical API', async () => {
    api.manage.getGraphList.mockResolvedValue({
        status: 200,
        data: {
            records: [{
                name: 'graph-a',
                nickname: 'Graph A',
                graphspace: 'space',
                default: false,
            }],
            total: 1,
        },
    });
    api.manage.clearGraph.mockResolvedValue({status: 200});
    render(<Graph />);

    const menu = await screen.findByTestId('graph-card-menu');
    const clearActions = screen.getAllByText('graph.menu.clear_graph');
    expect(menu).toContainElement(clearActions[0]);
    expect(clearActions).toHaveLength(1);

    fireEvent.click(clearActions[0]);
    fireEvent.click(await screen.findByTestId('clear-confirm-modal'));

    await waitFor(() => expect(api.manage.clearGraph)
        .toHaveBeenCalledWith('space', 'graph-a'));
});

test('shows clone as unavailable instead of exposing a failing action', async () => {
    render(<Graph />);

    const menu = await screen.findByTestId('graph-card-menu');
    const cloneItem = within(menu).getByRole('menuitem', {
        name: /graph.menu.clone: graph.clone.unavailable/,
    });
    const clone = within(cloneItem).getByText('graph.menu.clone');
    expect(cloneItem).toHaveAttribute('aria-disabled', 'true');
    expect(clone.closest('a')).toBeNull();
});

test('keeps exactly the five requested graph card actions', async () => {
    render(<Graph />);

    const menu = await screen.findByTestId('graph-card-menu');
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(5);
    expect(within(menu).getByText('graph.menu.clear_graph')).toBeInTheDocument();
    expect(within(menu).getByText('graph.menu.set_default')).toBeInTheDocument();
    expect(within(menu).getByText('common.action.edit')).toBeInTheDocument();
    expect(within(menu).getByText('common.action.delete')).toBeInTheDocument();
    expect(within(menu).getByText('graph.menu.clone')).toBeInTheDocument();
});

test('places the new-graph card after existing graphs', async () => {
    render(<Graph />);

    const graphCard = await screen.findByTestId('graph-card-menu');
    const create = screen.getByRole('button', {name: 'graph.create'});

    expect(graphCard.compareDocumentPosition(create)
        & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('retries a failed graph list without losing the current graphspace', async () => {
    api.manage.getGraphList
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValueOnce({
            status: 200,
            data: {
                records: [{
                    name: 'recovered-graph',
                    nickname: 'Recovered graph',
                    graphspace: 'space',
                    default: false,
                }],
                total: 1,
            },
        });

    render(<Graph />);

    expect(await screen.findByText('graph.unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'common.action.retry'}));

    expect(await screen.findByTestId('graph-card-menu')).toBeInTheDocument();
    expect(api.manage.getGraphList).toHaveBeenLastCalledWith(
        'space',
        expect.objectContaining({page_no: 1}),
        {suppressBusinessErrorToast: true}
    );
});

test('explains an empty GraphSpace and distinguishes filtered results', async () => {
    api.manage.getGraphList.mockResolvedValue({
        status: 200,
        data: {records: [], total: 0},
    });
    render(<Graph />);

    expect(await screen.findByText('graph.empty.description')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'graph.empty.create'})).toBeInTheDocument();
    expect(screen.getByText('graph.empty.demo_prerequisite')).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'graph.empty.view_demo'}))
        .toHaveAttribute('href', '/task');

    const search = screen.getByPlaceholderText('graph.search_placeholder');
    fireEvent.change(search, {target: {value: 'missing'}});
    fireEvent.click(screen.getByRole('button', {name: 'search'}));

    expect(await screen.findByText('graph.empty.filtered_description')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'graph.empty.clear_filters'}));
    expect(search).toHaveValue('');
});

test('falls back to the real GraphSpace name in list mode when alias is empty', async () => {
    api.manage.getGraphList.mockResolvedValue({
        status: 200,
        data: {
            records: [{
                name: 'graph-a',
                nickname: 'Graph A',
                graphspace: 'space-name',
                graphspace_nickname: '',
            }],
            total: 1,
        },
    });
    render(<Graph />);
    await screen.findByTestId('graph-card-menu');

    fireEvent.click(screen.getByLabelText('common.label.list_mode'));

    expect(await screen.findByText('space-name')).toBeInTheDocument();
});

test('keeps the eleven-card image page size fixed without a size selector', async () => {
    api.manage.getGraphList.mockResolvedValue({
        status: 200,
        data: {
            records: [{
                name: 'graph-a',
                nickname: 'Graph A',
                graphspace: 'space',
            }],
            total: 100,
        },
    });
    render(<Graph />);

    await screen.findByTestId('graph-card-menu');
    expect(document.querySelector('.ant-pagination-options-size-changer')).toBeNull();
    expect(api.manage.getGraphList).toHaveBeenLastCalledWith(
        'space',
        expect.objectContaining({page_size: 11}),
        expect.anything()
    );
});
