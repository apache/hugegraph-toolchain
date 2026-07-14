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

import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import My from './index';
import * as api from '../../api';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

jest.mock('../../api', () => ({
    auth: {
        getPersonal: jest.fn(),
        status: jest.fn(),
        updatePwd: jest.fn(),
    },
}));

jest.mock('./EditLayer', () => ({refresh}) => (
    <button type='button' onClick={refresh}>mock profile saved</button>
));

jest.mock('../../utils/rules', () => ({
    required: () => ({required: true}),
}));

beforeEach(() => {
    jest.clearAllMocks();
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
    api.auth.status.mockResolvedValue({status: 200, data: {level: 'ADMIN'}});
});

const deferred = () => {
    let resolve;
    const promise = new Promise(resolvePromise => {
        resolve = resolvePromise;
    });
    return {promise, resolve};
};

const openPasswordForm = async () => {
    api.auth.getPersonal.mockResolvedValue({
        status: 200,
        data: {user_name: 'admin', user_nickname: 'Administrator'},
    });

    render(<My />);
    const changePassword = await screen.findByRole('button', {name: 'my.edit.title'});
    await waitFor(() => expect(changePassword).toBeEnabled());
    await userEvent.click(changePassword);
    const confirm = screen.getByRole('button', {name: 'common.action.confirm'});
    expect(confirm.closest('.ant-col')).toHaveClass('ant-col-offset-7');
    return confirm;
};

const fillValidPasswords = async () => {
    await userEvent.type(screen.getByPlaceholderText('my.edit.old_password_placeholder'), 'old-pass');
    await userEvent.type(screen.getByPlaceholderText('my.edit.new_password_placeholder'), 'new-pass');
    await userEvent.type(screen.getByPlaceholderText('my.edit.confirm_password_placeholder'), 'new-pass');
};

test('shows a persistent profile error and retries without stale identity', async () => {
    api.auth.getPersonal
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValueOnce({
            status: 200,
            data: {user_name: 'admin', user_nickname: 'Administrator'},
        });

    render(<My />);

    expect(screen.getByTestId('profile-surface')).toBeInTheDocument();

    expect(await screen.findByText('my.load.unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Administrator')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', {name: 'my.load.retry'}));

    expect(await screen.findByText('Administrator')).toBeInTheDocument();
    expect(screen.queryByText('my.load.unavailable')).not.toBeInTheDocument();
});

test('renders localized placeholders for empty profile fields', async () => {
    api.auth.getPersonal.mockResolvedValue({
        status: 200,
        data: {
            user_name: 'admin',
            user_nickname: 'Administrator',
            user_description: 'None',
            adminSpaces: [],
            user_create: null,
        },
    });

    render(<My />);

    expect(await screen.findByText('Administrator')).toBeInTheDocument();
    expect(screen.getAllByText('my.empty_value')).toHaveLength(2);
    expect(screen.getByText('my.level.ADMIN')).toBeInTheDocument();
});

test('keeps sentinel-like identity names visible while normalizing an optional remark', async () => {
    api.auth.getPersonal.mockResolvedValue({
        status: 200,
        data: {
            user_name: 'None',
            user_description: 'None',
            user_create: '2026-07-14',
        },
    });

    render(<My />);

    expect(await screen.findByRole('heading', {name: 'None'})).toBeInTheDocument();
    expect(screen.getAllByText('None').length).toBeGreaterThan(1);
    expect(screen.getByText('my.empty_value')).toBeInTheDocument();
});

test('shows the authoritative capability level instead of an empty role placeholder', async () => {
    api.auth.getPersonal.mockResolvedValue({
        status: 200,
        data: {
            user_name: 'admin',
            user_nickname: 'admin',
            adminSpaces: [],
        },
    });

    render(<My />);

    expect(await screen.findByText('my.level.ADMIN')).toBeInTheDocument();
    expect(api.auth.status).toHaveBeenCalledTimes(1);
});

test('shows the authoritative space administrator capability level', async () => {
    api.auth.status.mockResolvedValue({status: 200, data: {level: 'SPACEADMIN'}});
    api.auth.getPersonal.mockResolvedValue({
        status: 200,
        data: {
            user_name: 'space-admin',
            user_nickname: 'Space administrator',
            adminSpaces: [{name: 'SPACE'}],
        },
    });

    render(<My />);

    expect(await screen.findByText('my.level.SPACEADMIN')).toBeInTheDocument();
});

test('ignores an old profile response after a newer refresh', async () => {
    const oldRequest = deferred();
    api.auth.getPersonal
        .mockReturnValueOnce(oldRequest.promise)
        .mockResolvedValueOnce({
            status: 200,
            data: {user_name: 'admin', user_nickname: 'New profile'},
        });

    render(<My />);

    expect(screen.getByRole('button', {name: 'common.action.edit'})).toBeDisabled();
    await userEvent.click(screen.getByRole('button', {name: 'mock profile saved'}));
    expect(await screen.findByText('New profile')).toBeInTheDocument();

    oldRequest.resolve({
        status: 200,
        data: {user_name: 'admin', user_nickname: 'Old profile'},
    });

    expect(await screen.findByText('New profile')).toBeInTheDocument();
    expect(screen.queryByText('Old profile')).not.toBeInTheDocument();
});

test('stops password submit loading when form validation rejects', async () => {
    const confirm = await openPasswordForm();

    await userEvent.click(confirm);

    await waitFor(() => expect(document.querySelector('.ant-form-item-has-error')).not.toBeNull());
    await waitFor(() => expect(confirm).not.toHaveClass('ant-btn-loading'));
    expect(api.auth.updatePwd).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('my.edit.new_password_placeholder')).toBeInTheDocument();
});

test('stops password submit loading when the request rejects', async () => {
    api.auth.updatePwd.mockRejectedValue(new Error('down'));
    const confirm = await openPasswordForm();
    await fillValidPasswords();

    await userEvent.click(confirm);

    await waitFor(() => expect(api.auth.updatePwd).toHaveBeenCalledWith(
        'admin', 'old-pass', 'new-pass'
    ));
    await waitFor(() => expect(confirm).not.toHaveClass('ant-btn-loading'));
    expect(screen.getByPlaceholderText('my.edit.new_password_placeholder')).toBeInTheDocument();
});

test('stops password submit loading and preserves the form on a non-200 response', async () => {
    api.auth.updatePwd.mockResolvedValue({status: 400, message: 'invalid old password'});
    const confirm = await openPasswordForm();
    await fillValidPasswords();

    await userEvent.click(confirm);

    await waitFor(() => expect(api.auth.updatePwd).toHaveBeenCalledWith(
        'admin', 'old-pass', 'new-pass'
    ));
    await waitFor(() => expect(confirm).not.toHaveClass('ant-btn-loading'));
    expect(screen.getByPlaceholderText('my.edit.old_password_placeholder')).toHaveValue('old-pass');
});

test('keeps loading during a password request and closes the form only on success', async () => {
    const request = deferred();
    api.auth.updatePwd.mockReturnValue(request.promise);
    const confirm = await openPasswordForm();
    await fillValidPasswords();

    await userEvent.click(confirm);

    await waitFor(() => expect(api.auth.updatePwd).toHaveBeenCalledWith(
        'admin', 'old-pass', 'new-pass'
    ));
    await waitFor(() => expect(confirm).toHaveClass('ant-btn-loading'));

    request.resolve({status: 200});

    await waitFor(() => expect(
        screen.queryByPlaceholderText('my.edit.new_password_placeholder')
    ).not.toBeInTheDocument());
    expect(screen.getByRole('heading', {name: 'Administrator'})).toBeInTheDocument();
});
