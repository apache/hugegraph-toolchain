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
import {EditLayer} from './EditLayer';
import * as api from '../../api';

jest.mock('react-i18next', () => ({
    initReactI18next: {type: '3rdParty', init: jest.fn()},
    useTranslation: () => ({t: key => key}),
}));

jest.mock('../../api', () => ({
    auth: {getUserList: jest.fn()},
    manage: {
        addGraphSpace: jest.fn(),
        getGraphSpace: jest.fn(),
        updateGraphSpace: jest.fn(),
    },
}));

beforeEach(() => {
    jest.clearAllMocks();
    api.auth.getUserList.mockReturnValue(new Promise(() => {}));
    api.manage.addGraphSpace.mockResolvedValue({status: 200});
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

test('creates a GraphSpace with only ID and display name', async () => {
    render(
        <EditLayer
            visible
            detail={{}}
            onCancel={jest.fn()}
            refresh={jest.fn()}
        />
    );
    await waitFor(() => expect(api.auth.getUserList).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText('graphspace.form.id_placeholder'), {
        target: {value: 'demo_space'},
    });
    fireEvent.change(screen.getByPlaceholderText('graphspace.form.name_placeholder'), {
        target: {value: 'DemoSpaceDisplayName'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'common.action.create'}));

    await waitFor(() => expect(api.manage.addGraphSpace).toHaveBeenCalled());
    const values = api.manage.addGraphSpace.mock.calls[0][0];
    expect(values).toMatchObject({
        name: 'demo_space',
        nickname: 'DemoSpaceDisplayName',
        auth: false,
        description: '',
    });
    expect(values.cpu_limit).toBeUndefined();
    expect(values.memory_limit).toBeUndefined();
    expect(values.storage_limit).toBeUndefined();
});

test('keeps validation failures inline without calling the API', async () => {
    render(
        <EditLayer
            visible
            detail={{}}
            onCancel={jest.fn()}
            refresh={jest.fn()}
        />
    );
    await waitFor(() => expect(api.auth.getUserList).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText('graphspace.form.id_placeholder'), {
        target: {value: 'Invalid ID'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'common.action.create'}));

    expect(await screen.findByText('graphspace.form.id_rule')).toBeInTheDocument();
    expect(api.manage.addGraphSpace).not.toHaveBeenCalled();
});

test('resource fields are optional and expose examples and field help', async () => {
    render(
        <EditLayer
            visible
            detail={{}}
            onCancel={jest.fn()}
            refresh={jest.fn()}
        />
    );
    await waitFor(() => expect(api.auth.getUserList).toHaveBeenCalled());

    const advanced = document.querySelector('details');
    expect(advanced).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('graphspace.form.advanced_title'));
    expect(advanced).toHaveAttribute('open');

    expect(screen.getAllByPlaceholderText('graphspace.form.cpu_placeholder')).toHaveLength(2);
    expect(screen.getAllByPlaceholderText('graphspace.form.memory_placeholder')).toHaveLength(2);
    expect(screen.getByPlaceholderText('graphspace.form.max_graph_placeholder'))
        .toBeInTheDocument();
    expect(screen.getByLabelText('graphspace.form.id_help')).toBeInTheDocument();
    expect(screen.getByLabelText('graphspace.form.graph_cpu_help')).toBeInTheDocument();
    expect(screen.getByLabelText('graphspace.form.oltp_namespace_help')).toBeInTheDocument();

    fireEvent.change(screen.getAllByPlaceholderText('graphspace.form.cpu_placeholder')[0], {
        target: {value: '4'},
    });
    fireEvent.click(screen.getByText('graphspace.form.advanced_title'));
    expect(advanced).not.toHaveAttribute('open');

    fireEvent.change(screen.getByPlaceholderText('graphspace.form.id_placeholder'), {
        target: {value: 'advanced_space'},
    });
    fireEvent.change(screen.getByPlaceholderText('graphspace.form.name_placeholder'), {
        target: {value: 'AdvancedSpace'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'common.action.create'}));
    await waitFor(() => expect(api.manage.addGraphSpace).toHaveBeenCalled());
    expect(api.manage.addGraphSpace.mock.calls[0][0].cpu_limit).toBe(4);
});
