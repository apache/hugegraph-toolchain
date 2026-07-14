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
import EditLayer from './EditLayer';
import * as api from '../../api';

jest.mock('../../api', () => ({
    auth: {
        addUser: jest.fn(),
        updateUser: jest.fn(),
        updateAdminspace: jest.fn(),
        getUserInfo: jest.fn(),
    },
    manage: {
        getGraphSpaceList: jest.fn(),
    },
}));

jest.mock('../../utils/rules', () => ({
    isName: {},
    isAccountName: {},
    required: () => ({required: true}),
}));

const mockTranslate = key => key;

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: mockTranslate}),
}));

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return {promise, resolve, reject};
};

const props = {
    visible: true,
    onCancel: jest.fn(),
    refresh: jest.fn(),
};

beforeEach(() => {
    jest.clearAllMocks();
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
    api.manage.getGraphSpaceList.mockResolvedValue({status: 200, data: {records: []}});
    api.auth.getUserInfo.mockResolvedValue({
        status: 200,
        data: {user_name: 'alice', adminSpaces: []},
    });
});

test('ignores a second account mutation while the first submit is pending', async () => {
    const detailRequest = deferred();
    const mutation = deferred();
    api.auth.getUserInfo.mockReturnValue(detailRequest.promise);
    api.auth.updateAdminspace.mockReturnValue(mutation.promise);
    render(<EditLayer {...props} data={{id: 'A'}} op='auth' />);

    const submit = document.querySelector('.ant-modal-footer .ant-btn-primary');
    fireEvent.click(submit);
    expect(api.auth.updateAdminspace).not.toHaveBeenCalled();

    await act(async () => detailRequest.resolve({
        status: 200,
        data: {user_name: 'alice', adminSpaces: []},
    }));
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(api.auth.updateAdminspace).toHaveBeenCalledTimes(1));
    await act(async () => mutation.resolve({status: 200}));
});

test('keeps a late account detail response from replacing the current user', async () => {
    const requestA = deferred();
    const requestB = deferred();
    api.auth.getUserInfo.mockImplementation(id => (
        id === 'A' ? requestA.promise : requestB.promise
    ));
    const view = render(<EditLayer {...props} data={{id: 'A'}} op='detail' />);

    view.rerender(<EditLayer {...props} data={{id: 'B'}} op='detail' />);
    await act(async () => requestB.resolve({
        status: 200,
        data: {user_name: 'bob', user_nickname: 'Bob'},
    }));
    expect(await screen.findByText('bob')).toBeInTheDocument();

    await act(async () => requestA.resolve({
        status: 200,
        data: {user_name: 'alice', user_nickname: 'Alice'},
    }));
    expect(screen.queryByText('alice')).not.toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
});

test('clears the previous account when the next detail request fails', async () => {
    const requestB = deferred();
    api.auth.getUserInfo.mockImplementation(id => (
        id === 'A' ? Promise.resolve({
            status: 200,
            data: {user_name: 'alice', user_nickname: 'Alice'},
        }) : requestB.promise
    ));
    const view = render(<EditLayer {...props} data={{id: 'A'}} op='detail' />);
    expect(await screen.findByText('alice')).toBeInTheDocument();

    view.rerender(<EditLayer {...props} data={{id: 'B'}} op='detail' />);
    await waitFor(() => expect(api.auth.getUserInfo).toHaveBeenCalledTimes(2));
    await act(async () => requestB.reject(new Error('offline')));
    await waitFor(() => expect(screen.queryByText('alice')).not.toBeInTheDocument());
});

test('loads graphspaces into the visible create account form', async () => {
    const graphspaces = deferred();
    api.manage.getGraphSpaceList.mockReturnValue(graphspaces.promise);
    render(<EditLayer {...props} data={{}} op='create' />);

    await act(async () => graphspaces.resolve({
        status: 200,
        data: {records: [{name: 'analytics'}]},
    }));
    fireEvent.mouseDown(screen.getByRole('combobox'));

    expect(await screen.findByRole('option', {name: 'analytics'})).toBeInTheDocument();
});

test('requires an explicit password when creating an account', async () => {
    render(<EditLayer {...props} data={{}} op='create' />);
    await act(async () => undefined);

    expect(screen.getByPlaceholderText(
        'account.form.default_password_placeholder'
    )).toBeRequired();
});

test('shows the derived space administrator level in account details', async () => {
    api.auth.getUserInfo.mockResolvedValue({
        status: 200,
        data: {
            user_name: 'space-admin',
            is_superadmin: false,
            adminSpaces: [{name: 'SPACE'}],
        },
    });

    render(<EditLayer {...props} data={{id: 'space-admin'}} op='detail' />);

    expect(await screen.findByText('account.level.SPACEADMIN')).toBeInTheDocument();
});
