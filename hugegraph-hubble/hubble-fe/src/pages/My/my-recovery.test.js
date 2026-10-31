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

import {replaceBrowserLocation} from '../../utils/browserNavigation';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import My from './index';
import * as api from '../../api';
import * as user from '../../utils/user';
import {
    clearPersistedAlgorithmFormsForUser,
} from '../../modules/algorithm/algorithmsForm/algorithmFormPersistence';

let mockAuthContext = null;

jest.mock('../../utils/browserNavigation', () => ({replaceBrowserLocation: jest.fn()}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

jest.mock('../../auth/AuthContext', () => ({
    useAuthContext: () => ({context: mockAuthContext}),
}));

jest.mock('../../api', () => ({
    auth: {
        getPersonal: jest.fn(),
        status: jest.fn(),
        updatePwd: jest.fn(),
    },
}));

jest.mock('../../utils/user', () => ({
    clearLogin: jest.fn(),
    beginLogoutTransition: jest.fn(),
}));

jest.mock('../../modules/algorithm/algorithmsForm/algorithmFormPersistence', () => ({
    clearPersistedAlgorithmFormsForUser: jest.fn(),
}));

jest.mock('./SessionSettings', () => () => <div />);

jest.mock('./EditLayer', () => ({refresh}) => (
    <button type='button' onClick={refresh}>mock profile saved</button>
));

jest.mock('../../utils/rules', () => ({
    required: () => ({required: true}),
}));

beforeEach(() => {
    jest.clearAllMocks();
    mockAuthContext = {
        actions: {
            account: ['read', 'update', 'change_password'],
        },
    };
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
    sessionStorage.clear();
    window.history.replaceState(null, '', '/my');
    api.auth.status.mockResolvedValue({status: 200, data: {level: 'ADMIN'}});
});

test('keeps legacy profile read and password actions without edit', async () => {
    mockAuthContext = {
        actions: {account: ['read', 'change_password']},
    };
    api.auth.getPersonal.mockResolvedValue({
        status: 200,
        data: {user_name: 'alice'},
    });

    render(<My />);

    expect(await screen.findByRole('heading', {name: 'alice'}))
        .toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'common.action.edit'}))
        .not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'my.edit.title'}))
        .toBeInTheDocument();
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
            user_description: null,
            adminSpaces: [],
            user_create: null,
        },
    });

    render(<My />);

    expect(await screen.findByText('Administrator')).toBeInTheDocument();
    expect(screen.getAllByText('my.empty_value')).toHaveLength(2);
    expect(screen.getByText('my.level.ADMIN')).toBeInTheDocument();
});

test('keeps sentinel-like identity names and literal remarks visible', async () => {
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
    expect(screen.queryByText('my.empty_value')).not.toBeInTheDocument();
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
    expect(user.clearLogin).not.toHaveBeenCalled();
    expect(replaceBrowserLocation).not.toHaveBeenCalled();
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
    expect(user.clearLogin).not.toHaveBeenCalled();
    expect(replaceBrowserLocation).not.toHaveBeenCalled();
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
    expect(user.clearLogin).not.toHaveBeenCalled();
    expect(replaceBrowserLocation).not.toHaveBeenCalled();
});

test('clears local auth and redirects only after the password update succeeds', async () => {
    const request = deferred();
    api.auth.updatePwd.mockReturnValue(request.promise);
    sessionStorage.setItem('redirect', '/gremlin/DEFAULT/hugegraph');
    const confirm = await openPasswordForm();
    await fillValidPasswords();

    await userEvent.click(confirm);

    await waitFor(() => expect(api.auth.updatePwd).toHaveBeenCalledWith(
        'admin', 'old-pass', 'new-pass'
    ));
    await waitFor(() => expect(confirm).toHaveClass('ant-btn-loading'));

    request.resolve({status: 200});

    await waitFor(() => expect(user.clearLogin).toHaveBeenCalledTimes(1));
    expect(user.beginLogoutTransition).toHaveBeenCalledTimes(1);
    expect(clearPersistedAlgorithmFormsForUser).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('redirect')).toBeNull();
    expect(sessionStorage.getItem('hubble.login_notice')).toBeNull();
    expect(replaceBrowserLocation)
        .toHaveBeenCalledWith('/login?notice=credential-updated');
});


test('uses the current capability role when legacy status mislabels a space manager', async () => {
    mockAuthContext = {role: 'SPACEADMIN', actions: {account: ['read']}};
    api.auth.status.mockResolvedValue({status: 200, data: {level: 'USER'}});
    api.auth.getPersonal.mockResolvedValue({status: 200, data: {user_name: 'tester01'}});
    render(<My />);
    expect(await screen.findByText('my.level.SPACEADMIN')).toBeInTheDocument();
    expect(screen.queryByText('my.level.USER')).not.toBeInTheDocument();
});

test('does not reuse cached administrator profile data over current capability role', async () => {
    mockAuthContext = {role: 'USER', actions: {account: ['read']}};
    api.auth.status.mockResolvedValue({status: 200, data: {level: 'ADMIN'}});
    api.auth.getPersonal.mockResolvedValue({
        status: 200, data: {user_name: 'tester01', adminSpaces: ['old-space']},
    });
    render(<My />);
    expect(await screen.findByText('my.level.USER')).toBeInTheDocument();
    expect(screen.queryByText('my.level.ADMIN')).not.toBeInTheDocument();
});
