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

import {act, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {CloneLayer} from './EditLayer';
import * as api from '../../api';

jest.mock('react-i18next', () => ({useTranslation: () => ({t: key => key})}));
jest.mock('../../utils/rules', () => ({
    required: () => ({required: true}), isName: {}, isPropertyName: {},
}));
jest.mock('../../api', () => ({manage: {getGraph: jest.fn(), cloneGraph: jest.fn()}}));

beforeEach(() => {
    jest.clearAllMocks();
    window.matchMedia = jest.fn().mockReturnValue({matches: false,
        addListener: jest.fn(), removeListener: jest.fn()});
    api.manage.getGraph.mockResolvedValue({status: 200, data: {nickname: 'Original'}});
});

test('submits only schema cloning and leaves unsupported data cloning unavailable', async () => {
    api.manage.cloneGraph.mockResolvedValue({status: 200, data: {name: 'copy'}});
    const refresh = jest.fn();
    render(<CloneLayer open graphspace='DEFAULT' graph='source' onCancel={jest.fn()} refresh={refresh} />);
    expect(screen.getByText('graph.clone.schema_only')).toBeInTheDocument();
    expect(screen.queryByText('graph.clone.schema_data')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('graph.clone.name'), 'copy');
    const nickname = screen.getByLabelText('graph.clone.nickname_label');
    await userEvent.clear(nickname);
    await userEvent.type(nickname, 'Copy');
    await userEvent.click(screen.getByRole('button', {name: /ok/i}));
    await waitFor(() => expect(api.manage.cloneGraph).toHaveBeenCalledWith('DEFAULT', 'source', {
        graphspace: 'DEFAULT', name: 'copy', nickname: 'Copy', load_data: 0,
    }, {suppressBusinessErrorToast: true}));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
});

test('keeps the dialog open after an unsupported or failed server request', async () => {
    api.manage.cloneGraph.mockRejectedValue(new Error('404'));
    const onCancel = jest.fn();
    render(<CloneLayer open graphspace='DEFAULT' graph='source' onCancel={onCancel} refresh={jest.fn()} />);
    await userEvent.type(screen.getByLabelText('graph.clone.name'), 'copy');
    const nickname = screen.getByLabelText('graph.clone.nickname_label');
    await userEvent.clear(nickname);
    await userEvent.type(nickname, 'Copy');
    await userEvent.click(screen.getByRole('button', {name: /ok/i}));
    await waitFor(() => expect(api.manage.cloneGraph).toHaveBeenCalled());
    expect(onCancel).not.toHaveBeenCalled();
    expect(await screen.findByText('graph.clone.failed')).toBeInTheDocument();
});

test('displays a server rejection instead of suggesting an existing graph is a partial clone', async () => {
    api.manage.cloneGraph.mockResolvedValue({status: 400, message: "The graph 'copy' has existed"});
    render(<CloneLayer open graphspace='DEFAULT' graph='source' onCancel={jest.fn()} refresh={jest.fn()} />);
    await userEvent.type(screen.getByLabelText('graph.clone.name'), 'copy');
    await waitFor(() => expect(screen.getByLabelText('graph.clone.nickname_label')).toHaveValue('graph.clone.nickname'));
    await userEvent.click(screen.getByRole('button', {name: /ok/i}));
    expect(await screen.findByText("The graph 'copy' has existed")).toBeInTheDocument();
});

test('a previous clone response cannot close or refresh a reopened dialog', async () => {
    let resolveClone;
    api.manage.cloneGraph.mockReturnValue(new Promise(resolve => { resolveClone = resolve; }));
    const onCancel = jest.fn();
    const refresh = jest.fn();
    const view = render(<CloneLayer open graphspace='DEFAULT' graph='source' onCancel={onCancel} refresh={refresh} />);
    await userEvent.type(screen.getByLabelText('graph.clone.name'), 'copy');
    await waitFor(() => expect(screen.getByLabelText('graph.clone.nickname_label')).toHaveValue('graph.clone.nickname'));
    await userEvent.click(screen.getByRole('button', {name: /ok/i}));
    await waitFor(() => expect(api.manage.cloneGraph).toHaveBeenCalled());
    view.rerender(<CloneLayer open={false} graphspace='DEFAULT' graph='source' onCancel={onCancel} refresh={refresh} />);
    view.rerender(<CloneLayer open graphspace='DEFAULT' graph='other' onCancel={onCancel} refresh={refresh} />);
    await userEvent.type(screen.getByLabelText('graph.clone.name'), 'next');
    await act(async () => resolveClone({status: 200, data: {name: 'copy'}}));
    expect(onCancel).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('graph.clone.name')).toHaveValue('next');
});
