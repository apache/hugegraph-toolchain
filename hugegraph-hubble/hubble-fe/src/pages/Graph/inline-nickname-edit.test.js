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

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import Graph from './index';
import * as api from '../../api';

let mockAuthContext;

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

jest.mock('react-router-dom', () => ({
    Link: ({children, to}) => <a href={to}>{children}</a>,
    useNavigate: () => jest.fn(),
    useParams: () => ({graphspace: 'space'}),
}));

jest.mock('../../auth/AuthContext', () => ({
    useAuthContext: () => mockAuthContext,
}));

jest.mock('../../api', () => ({
    manage: {
        getGraphSpace: jest.fn(),
        getGraphList: jest.fn(),
        getGraph: jest.fn(),
        updateGraph: jest.fn(),
    },
}));

jest.mock('./EditLayer', () => ({EditLayer: () => null, ViewLayer: () => null}));
jest.mock('./Card', () => () => <div>graph card</div>);
jest.mock('./ClearGraphConfirmModal', () => () => null);

const installMatchMedia = () => {
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    }));
};

beforeAll(installMatchMedia);

beforeEach(() => {
    jest.clearAllMocks();
    installMatchMedia();
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));
    mockAuthContext = {
        context: {
            mode: 'PD',
            role: 'SPACEADMIN',
            scopes: {all_graphspaces: false, admin_graphspaces: ['space']},
        },
    };
    api.manage.getGraphSpace.mockResolvedValue({
        status: 200,
        data: {name: 'space', nickname: 'Space'},
    });
    api.manage.getGraphList.mockResolvedValue({
        status: 200,
        data: {
            records: [{
                name: 'movie_graph',
                nickname: 'Movie graph',
                graphspace: 'space',
            }],
            total: 1,
        },
    });
});

const openListMode = async () => {
    await screen.findByText('graph card');
    await waitFor(() => expect(document.querySelector('.ant-spin-spinning')).toBeNull());
    await act(async () => {
        fireEvent.click(screen.getByLabelText('common.label.list_mode'));
        await Promise.resolve();
        await api.manage.getGraphList.mock.results[1]?.value;
        await Promise.resolve();
    });
};

const renderGraph = async () => {
    await act(async () => {
        render(<Graph />);
        await Promise.resolve();
        await Promise.all([
            api.manage.getGraphSpace.mock.results[0]?.value,
            api.manage.getGraphList.mock.results[0]?.value,
        ].filter(Boolean));
        await Promise.resolve();
    });
};

test('updates only nickname through the existing PUT contract and uses its server value', async () => {
    api.manage.updateGraph.mockResolvedValue({status: 200});
    api.manage.getGraph.mockResolvedValue({
        status: 200,
        data: {name: 'movie_graph', nickname: 'Movies from server'},
    });
    await renderGraph();
    await openListMode();

    fireEvent.click(screen.getByRole('button', {
        name: 'common.action.edit graph.form.nickname',
    }));
    const input = screen.getByRole('textbox', {name: 'graph.form.nickname'});
    fireEvent.change(input, {target: {value: 'Movies'}});
    fireEvent.keyDown(input, {key: 'Enter'});

    await waitFor(() => expect(api.manage.updateGraph).toHaveBeenCalledWith(
        'space',
        'movie_graph',
        {nickname: 'Movies'},
        {suppressBusinessErrorToast: true}
    ));
    await waitFor(() => expect(api.manage.getGraph).toHaveBeenCalledWith(
        'space',
        'movie_graph',
        {suppressBusinessErrorToast: true}
    ));
    expect(await screen.findByText('Movies from server')).toBeInTheDocument();
    expect(screen.getByText('movie_graph')).toBeInTheDocument();
});

test('does not expose inline editing outside the server-authorized GraphSpace scope', async () => {
    mockAuthContext = {
        context: {
            mode: 'PD',
            role: 'USER',
            scopes: {all_graphspaces: false, admin_graphspaces: []},
        },
    };
    await renderGraph();
    await openListMode();

    expect(screen.getByText('Movie graph')).toBeInTheDocument();
    expect(screen.queryByRole('button', {
        name: 'common.action.edit graph.form.nickname',
    })).not.toBeInTheDocument();
});

test('keeps a rejected PUT draft visible with an inline error', async () => {
    api.manage.updateGraph.mockRejectedValue({
        config: {suppressBusinessErrorToast: true},
        response: {
            status: 409,
            data: {status: 409, message: 'Nickname already exists'},
        },
    });
    await renderGraph();
    await openListMode();

    fireEvent.click(screen.getByRole('button', {
        name: 'common.action.edit graph.form.nickname',
    }));
    const input = screen.getByRole('textbox', {name: 'graph.form.nickname'});
    fireEvent.change(input, {target: {value: 'Keep draft'}});
    fireEvent.click(screen.getByRole('button', {name: 'common.action.save'}));

    expect(await screen.findByRole('alert')).toHaveTextContent('Nickname already exists');
    expect(screen.getByRole('textbox', {name: 'graph.form.nickname'}))
        .toHaveValue('Keep draft');
    expect(screen.getAllByText('Nickname already exists')).toHaveLength(1);
    expect(screen.getByRole('button', {name: 'common.action.save'})).toBeEnabled();
    expect(api.manage.updateGraph).toHaveBeenCalledWith(
        'space',
        'movie_graph',
        {nickname: 'Keep draft'},
        {suppressBusinessErrorToast: true}
    );
});
