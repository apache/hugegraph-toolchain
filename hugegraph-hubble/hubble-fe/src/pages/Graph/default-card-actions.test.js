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
