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
import userEvent from '@testing-library/user-event';
import {Modal} from 'antd';
import {beginPendingOlapTask, clearOlapTasks, finishPendingOlapTask, getLatestOlapTask, recordOlapTask}
    from '../../modules/algorithm/olapTaskRegistry';
import GraphSpace from './index';
import * as api from '../../api';
import * as user from '../../utils/user';

let mockAuthContext;

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: (key, options) => key === 'graphspace.unit.inherited'
        ? `Inherited (${options.value})` : key}),
}));

jest.mock('../../api', () => ({
    manage: {
        getGraphSpaceList: jest.fn(),
        delGraphSpace: jest.fn(),
        initBuiltin: jest.fn(),
    },
}));

jest.mock('../../utils/user', () => ({getUser: jest.fn()}));
jest.mock('../../auth/AuthContext', () => ({
    useAuthContext: () => mockAuthContext,
}));

jest.mock('react-router-dom', () => ({
    Link: ({children}) => <span>{children}</span>,
}));

jest.mock('./Card', () => ({item, canUpdate, canDelete, deleteGraphspace}) => (
    <div>{item.nickname}:{canUpdate && canDelete ? 'manage' : 'view'}
        {canDelete && <button onClick={() => deleteGraphspace(item.name)}>delete {item.name}</button>}
    </div>
));
jest.mock('./EditLayer', () => ({EditLayer: ({visible}) => (
    visible ? <div>graphspace create layer</div> : null
)}));

beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    clearOlapTasks();
    user.getUser.mockReturnValue({is_superadmin: true, adminSpaces: []});
    mockAuthContext = {
        context: {
            actions: {graphspaces: ['create', 'read', 'update', 'delete']},
        },
    };
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

test('keeps a failed GraphSpace request distinct from a valid empty list', async () => {
    api.manage.getGraphSpaceList
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValueOnce({
            status: 200,
            data: {records: [{name: 'space-a', nickname: 'Space A'}], total: 1},
        });

    render(<GraphSpace />);

    expect(screen.getByTestId('graphspace-page-title')).toBeInTheDocument();
    expect(await screen.findByText('graphspace.load.unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Space A')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'graphspace.create'}))
        .not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', {name: 'graphspace.load.retry'}));

    expect(await screen.findByText('Space A:manage')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', {name: 'graphspace.view_mode'}))
        .toBeInTheDocument();
    expect(screen.queryByText('graphspace.load.unavailable')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'graphspace.create'})).toBeEnabled();
});

test('moves only the view switch to the topbar and keeps filters in the page', async () => {
    api.manage.getGraphSpaceList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'space-a', nickname: 'Space A'}], total: 1},
    });
    const topbarHost = document.createElement('div');
    topbarHost.id = 'hubble-topbar-page-context';
    document.body.appendChild(topbarHost);

    render(<GraphSpace />);

    expect(await within(topbarHost).findByRole('radiogroup', {
        name: 'graphspace.view_mode',
    })).toBeInTheDocument();
    expect(within(topbarHost).queryByPlaceholderText('graphspace.search_placeholder'))
        .not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('graphspace.search_placeholder'))
        .toBeInTheDocument();

    topbarHost.remove();
});

test('keeps public spaces readable without exposing GraphSpace mutations', async () => {
    user.getUser.mockReturnValue({is_superadmin: true, adminSpaces: ['public']});
    mockAuthContext = {
        context: {actions: {graphspaces: ['read']}},
    };
    api.manage.getGraphSpaceList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'public', nickname: 'Public'}], total: 1},
    });

    render(<GraphSpace />);

    expect(await screen.findByText('Public:view')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'graphspace.create'}))
        .not.toBeInTheDocument();
});

test('places the only create entry after loaded cards and supports the keyboard', async () => {
    api.manage.getGraphSpaceList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'space-a', nickname: 'Space A'}], total: 1},
    });

    render(<GraphSpace />);

    const graphspace = await screen.findByText('Space A:manage');
    const create = screen.getByRole('button', {name: 'graphspace.create'});
    expect(graphspace.compareDocumentPosition(create)
        & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText('graphspace.create')).toHaveLength(1);

    fireEvent.keyDown(create, {key: 'Enter'});
    expect(screen.getByText('graphspace create layer')).toBeInTheDocument();
});

test('keeps a filtered empty result distinct from the create card', async () => {
    api.manage.getGraphSpaceList
        .mockResolvedValueOnce({
            status: 200,
            data: {records: [{name: 'space-a', nickname: 'Space A'}], total: 1},
        })
        .mockResolvedValueOnce({status: 200, data: {records: [], total: 0}});

    render(<GraphSpace />);
    await screen.findByText('Space A:manage');
    const search = screen.getByPlaceholderText('graphspace.search_placeholder');
    await userEvent.type(search, 'missing{enter}');

    expect(await screen.findByText('graphspace.no_matches')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'graphspace.create'})).toBeEnabled();
});

test('uses one list-mode create button and keeps page size at eleven', async () => {
    api.manage.getGraphSpaceList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'space-a', nickname: 'Space A'}], total: 1},
    });

    render(<GraphSpace />);
    await screen.findByText('Space A:manage');
    fireEvent.click(screen.getByLabelText('common.label.list_mode'));

    const header = within(screen.getByTestId('graphspace-page-title').closest('header'));
    expect(await header.findByRole('button', {name: 'graphspace.create'})).toBeEnabled();
    expect(screen.getAllByText('graphspace.create')).toHaveLength(1);
    await waitFor(() => expect(api.manage.getGraphSpaceList).toHaveBeenLastCalledWith(
        expect.objectContaining({page_size: 11}),
        expect.anything()
    ));
});

test('hides the list-mode create button for ordinary users and load failures', async () => {
    user.getUser.mockReturnValue({is_superadmin: false, adminSpaces: []});
    mockAuthContext = {
        context: {actions: {graphspaces: ['read']}},
    };
    api.manage.getGraphSpaceList.mockRejectedValue(new Error('down'));

    render(<GraphSpace />);
    fireEvent.click(screen.getByLabelText('common.label.list_mode'));

    expect(await screen.findByText('graphspace.load.unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'graphspace.create'}))
        .not.toBeInTheDocument();
});

test('does not let a space admin mutate GraphSpace objects from cached scopes', async () => {
    user.getUser.mockReturnValue({
        is_superadmin: true,
        adminSpaces: ['space-a'],
    });
    mockAuthContext = {
        context: {
            actions: {
                graphspaces: ['read'],
                members: ['read', 'add', 'remove'],
            },
            scopes: {admin_graphspaces: ['space-a']},
        },
    };
    api.manage.getGraphSpaceList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'space-a', nickname: 'Space A'}], total: 1},
    });

    render(<GraphSpace />);

    expect(await screen.findByText('Space A:view')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'graphspace.create'}))
        .not.toBeInTheDocument();
});

test('keeps the eleven-card image page size fixed without a size selector', async () => {
    api.manage.getGraphSpaceList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'space-a', nickname: 'Space A'}], total: 100},
    });

    render(<GraphSpace />);
    await screen.findByText('Space A:manage');

    expect(document.querySelector('.ant-pagination-options-size-changer')).toBeNull();
    expect(api.manage.getGraphSpaceList).toHaveBeenLastCalledWith(
        expect.objectContaining({page_size: 11}),
        expect.anything()
    );
});

test('list view labels raw zero compute as inheritance of current graph-service limits', async () => {
    api.manage.getGraphSpaceList.mockResolvedValue({status: 200, data: {records: [{
        name: 'inherited', cpu_limit: 4, memory_limit: 8,
        compute_cpu_limit: 0, compute_memory_limit: 0,
    }], total: 1}});
    render(<GraphSpace />);
    fireEvent.click(screen.getByLabelText('common.label.list_mode'));
    expect(await screen.findByText(/Inherited \(4graphspace.unit.cpu\)/)).toBeInTheDocument();
    expect(screen.getByText(/Inherited \(8graphspace.unit.memory\)/)).toBeInTheDocument();
});

test('searching from a later page returns to the first page of matches', async () => {
    api.manage.getGraphSpaceList
        .mockResolvedValueOnce({status: 200, data: {records: [{name: 'first', nickname: 'First'}], total: 12}})
        .mockResolvedValueOnce({status: 200, data: {records: [{name: 'last', nickname: 'Last'}], total: 12}})
        .mockResolvedValueOnce({status: 200, data: {records: [{name: 'first', nickname: 'First'}], total: 1}});
    render(<GraphSpace />);
    await screen.findByText('First:manage');
    fireEvent.click(screen.getByTitle('2'));
    await screen.findByText('Last:manage');
    await userEvent.type(screen.getByPlaceholderText('graphspace.search_placeholder'), 'First{enter}');
    await screen.findByText('First:manage');
    expect(api.manage.getGraphSpaceList).toHaveBeenLastCalledWith(
        expect.objectContaining({query: 'First', page_no: 1}), expect.anything()
    );
});

test('recovers a page removed by a concurrent deletion', async () => {
    api.manage.getGraphSpaceList
        .mockResolvedValueOnce({status: 200, data: {records: [{name: 'first', nickname: 'First'}], total: 12}})
        .mockResolvedValueOnce({status: 200, data: {records: [], total: 11}})
        .mockResolvedValueOnce({status: 200, data: {records: [{name: 'first', nickname: 'Recovered'}], total: 11}});
    render(<GraphSpace />);
    await screen.findByText('First:manage');
    fireEvent.click(screen.getByTitle('2'));
    await screen.findByText('Recovered:manage');
    expect(api.manage.getGraphSpaceList).toHaveBeenLastCalledWith(
        expect.objectContaining({page_no: 1}), expect.anything()
    );
    expect(screen.queryByText('graphspace.empty')).not.toBeInTheDocument();
});

test('table view distinguishes a filtered empty result from no GraphSpaces', async () => {
    api.manage.getGraphSpaceList.mockResolvedValue({status: 200, data: {records: [], total: 0}});
    render(<GraphSpace />);
    fireEvent.click(screen.getByLabelText('common.label.list_mode'));
    await screen.findByText('graphspace.empty');
    await userEvent.type(screen.getByPlaceholderText('graphspace.search_placeholder'), 'missing{enter}');
    expect(await screen.findByText('graphspace.no_matches')).toBeInTheDocument();
    expect(screen.queryByText('graphspace.empty')).not.toBeInTheDocument();
});

test('shows empty descriptions and omits empty namespace separators in list view', async () => {
    api.manage.getGraphSpaceList.mockResolvedValue({
        status: 200,
        data: {records: [{
            name: 'space-a', description: null, cpu_limit: 8, memory_limit: 16,
            compute_cpu_limit: 0, compute_memory_limit: 0, oltp_namespace: null,
            olap_namespace: '',
        }], total: 1},
    });
    render(<GraphSpace />);
    await userEvent.click(screen.getByText('common.label.list_mode'));
    const row = (await screen.findByText('space-a')).closest('tr');
    expect(within(row).getByText('--')).toBeInTheDocument();
    expect(row).toHaveTextContent('8graphspace.unit.cpu / 16graphspace.unit.memory');
    expect(row.textContent).not.toContain(' /  /');
});


test('invalidates all tasks and pending requests for a deleted GraphSpace only', async () => {
    api.manage.getGraphSpaceList.mockResolvedValue({status: 200, data: {records: [
        {name: 'space-a', nickname: 'Space A'}, {name: 'space-b', nickname: 'Space B'},
    ], total: 2}});
    api.manage.delGraphSpace.mockResolvedValue({status: 200});
    recordOlapTask({graphSpace: 'space-a', graph: 'g1', algorithm: 'pagerank', id: -1});
    recordOlapTask({graphSpace: 'space-a', graph: 'g2', algorithm: 'pagerank', id: -2});
    recordOlapTask({graphSpace: 'space-b', graph: 'g1', algorithm: 'pagerank', id: -3});
    const oldRequest = beginPendingOlapTask('space-a', 'g1', 'pagerank');
    const otherRequest = beginPendingOlapTask('space-b', 'g1', 'pagerank');
    let onOk;
    jest.spyOn(Modal, 'confirm').mockImplementation(options => {
        onOk = options.onOk;
        return {update: jest.fn()};
    });
    render(<GraphSpace />);
    await userEvent.click(await screen.findByRole('button', {name: 'delete space-a'}, {timeout: 10000}));
    onOk(jest.fn());
    await waitFor(() => expect(api.manage.delGraphSpace).toHaveBeenCalledWith('space-a', expect.anything()));
    await waitFor(() => expect(getLatestOlapTask('space-a', 'g1', 'pagerank')).toBeUndefined());
    expect(getLatestOlapTask('space-a', 'g2', 'pagerank')).toBeUndefined();
    expect(getLatestOlapTask('space-b', 'g1', 'pagerank').id).toBe(-3);
    // A late response from the old space must neither repopulate the same-name
    // replacement nor cancel a submission made after that replacement was created.
    const replacementRequest = beginPendingOlapTask('space-a', 'g1', 'pagerank');
    expect(finishPendingOlapTask(oldRequest, null,
        {graphSpace: 'space-a', graph: 'g1', algorithm: 'pagerank', id: -4})).toBe(false);
    expect(getLatestOlapTask('space-a', 'g1', 'pagerank')).toBeUndefined();
    expect(finishPendingOlapTask(replacementRequest, null,
        {graphSpace: 'space-a', graph: 'g1', algorithm: 'pagerank', id: -6})).toBe(true);
    expect(getLatestOlapTask('space-a', 'g1', 'pagerank').id).toBe(-6);
    expect(finishPendingOlapTask(otherRequest, null,
        {graphSpace: 'space-b', graph: 'g1', algorithm: 'pagerank', id: -5})).toBe(true);
    expect(getLatestOlapTask('space-b', 'g1', 'pagerank').id).toBe(-5);
});

test('keeps cached tasks when GraphSpace deletion fails', async () => {
    api.manage.getGraphSpaceList.mockResolvedValue({status: 200, data: {records: [
        {name: 'space-a', nickname: 'Space A'},
    ], total: 1}});
    api.manage.delGraphSpace.mockResolvedValue({status: 500});
    recordOlapTask({graphSpace: 'space-a', graph: 'g1', algorithm: 'pagerank', id: -1});
    let onOk;
    jest.spyOn(Modal, 'confirm').mockImplementation(options => {
        onOk = options.onOk;
        return {update: jest.fn()};
    });
    render(<GraphSpace />);
    await userEvent.click(await screen.findByRole('button', {name: 'delete space-a'}, {timeout: 10000}));
    onOk(jest.fn());
    await waitFor(() => expect(api.manage.delGraphSpace).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('common.msg.operation_failed')).toBeInTheDocument());
    expect(getLatestOlapTask('space-a', 'g1', 'pagerank').id).toBe(-1);
});
