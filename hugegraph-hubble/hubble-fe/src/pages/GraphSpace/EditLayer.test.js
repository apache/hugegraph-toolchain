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

import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {message} from 'antd';
import {EditLayer} from './EditLayer';
import * as api from '../../api';
import {isAuthEnabled} from '../../utils/config';

jest.mock('react-i18next', () => {
    const t = (key, options) => key === 'graphspace.unit.inherited'
        ? `Inherited (${options.value})` : key;
    return {
        initReactI18next: {type: '3rdParty', init: jest.fn()},
        useTranslation: () => ({t}),
    };
});

jest.mock('../../api', () => ({
    auth: {getUserList: jest.fn()},
    manage: {
        addGraphSpace: jest.fn(),
        getGraphSpace: jest.fn(),
        updateGraphSpace: jest.fn(),
    },
}));

jest.mock('../../utils/config', () => ({
    isAuthEnabled: jest.fn(),
}));

beforeEach(() => {
    jest.clearAllMocks();
    isAuthEnabled.mockReturnValue(true);
    api.auth.getUserList.mockReturnValue(new Promise(() => {}));
    api.manage.addGraphSpace.mockResolvedValue({status: 200});
    api.manage.updateGraphSpace.mockResolvedValue({status: 200});
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

test('ignores an older detail response after switching GraphSpaces', async () => {
    let resolveOld;
    api.manage.getGraphSpace
        .mockReturnValueOnce(new Promise(resolve => {resolveOld = resolve;}))
        .mockResolvedValueOnce({status: 200, data: {
            name: 'current', nickname: 'Current', auth: false, storage_limit: 10,
        }});
    const callbacks = {onCancel: jest.fn(), refresh: jest.fn()};
    const {rerender} = render(<EditLayer visible detail={{name: 'old'}} {...callbacks} />);
    expect(screen.getByRole('button', {name: 'common.action.save'})).toBeDisabled();
    expect(screen.getByPlaceholderText('graphspace.form.name_placeholder')).toBeDisabled();

    rerender(<EditLayer visible detail={{name: 'current'}} {...callbacks} />);
    await waitFor(() => expect(document.querySelector('#control-hooks_storage_limit')).toHaveValue('10'));
    fireEvent.change(document.querySelector('#control-hooks_storage_limit'), {target: {value: '20'}});
    await act(async () => resolveOld({status: 200, data: {
        name: 'old', nickname: 'Old', auth: true, storage_limit: 917,
    }}));
    expect(document.querySelector('#control-hooks_storage_limit')).toHaveValue('20');
    expect(screen.getByPlaceholderText('graphspace.form.id_placeholder')).toHaveValue('current');
    fireEvent.click(screen.getByRole('button', {name: 'common.action.save'}));
    await waitFor(() => expect(api.manage.updateGraphSpace).toHaveBeenCalledWith(
        'current', expect.objectContaining({storage_limit: 20, auth: false}), expect.anything()
    ));
});

test('ignores a closed editor response when creating a new GraphSpace', async () => {
    let resolveOld;
    api.manage.getGraphSpace.mockReturnValueOnce(new Promise(resolve => {resolveOld = resolve;}));
    const callbacks = {onCancel: jest.fn(), refresh: jest.fn()};
    const {rerender} = render(<EditLayer visible detail={{name: 'old'}} {...callbacks} />);
    rerender(<EditLayer visible={false} detail={{name: 'old'}} {...callbacks} />);
    rerender(<EditLayer visible detail={{}} {...callbacks} />);
    fireEvent.change(screen.getByPlaceholderText('graphspace.form.id_placeholder'), {
        target: {value: 'new_space'},
    });
    await act(async () => resolveOld({status: 200, data: {
        name: 'old', auth: true, storage_limit: 917,
    }}));
    expect(screen.getByPlaceholderText('graphspace.form.id_placeholder')).toHaveValue('new_space');
    expect(document.querySelector('#control-hooks_storage_limit')).toHaveValue('256');
});

test('submits once while keeping the resource form mounted and retryable after failure', async () => {
    let finish;
    api.manage.addGraphSpace.mockReturnValueOnce(new Promise(resolve => {finish = resolve;}));
    render(<EditLayer visible detail={{}} onCancel={jest.fn()} refresh={jest.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('graphspace.form.id_placeholder'), {
        target: {value: 'once'},
    });
    fireEvent.click(screen.getByText('graphspace.form.advanced_title'));
    const advanced = document.querySelector('details');
    const quota = document.querySelector('#control-hooks_storage_limit');
    fireEvent.change(quota, {target: {value: '25'}});
    // Resolve the known label within this dialog without computing accessible
    // names for every help control in the large Ant Design form.
    const dialog = screen.getByRole('dialog');
    const create = within(dialog).getByText('common.action.create').closest('button');
    expect(create).toHaveAccessibleName('common.action.create');
    expect(create).toBeEnabled();
    fireEvent.click(create);
    fireEvent.click(create);
    await waitFor(() => expect(api.manage.addGraphSpace).toHaveBeenCalledTimes(1));
    expect(quota).toBeInTheDocument();
    expect(quota).toBeDisabled();
    expect(advanced).toHaveAttribute('open');
    const cancel = within(dialog).getByText(/^(Cancel|common\.action\.cancel)$/).closest('button');
    expect(cancel).toHaveAccessibleName(/^(Cancel|common\.action\.cancel)$/);
    expect(cancel).toBeDisabled();
    await act(async () => finish({status: 503}));
    expect(quota).toBeInTheDocument();
    expect(quota).toBeEnabled();
    expect(quota).toHaveValue('25');
    expect(advanced).toHaveAttribute('open');
});

test('an old save completion does not close a newly opened editor', async () => {
    let finish;
    api.manage.addGraphSpace.mockReturnValueOnce(new Promise(resolve => {finish = resolve;}));
    api.manage.getGraphSpace.mockResolvedValueOnce({status: 200, data: {
        name: 'current', nickname: 'Current', auth: false, storage_limit: 10,
    }});
    const onCancel = jest.fn();
    const refresh = jest.fn();
    const {rerender} = render(<EditLayer visible detail={{}} onCancel={onCancel} refresh={refresh} />);
    fireEvent.change(screen.getByPlaceholderText('graphspace.form.id_placeholder'), {
        target: {value: 'first'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'common.action.create'}));
    await waitFor(() => expect(api.manage.addGraphSpace).toHaveBeenCalledTimes(1));
    rerender(<EditLayer visible detail={{name: 'current'}} onCancel={onCancel} refresh={refresh} />);
    await waitFor(() => expect(document.querySelector('#control-hooks_storage_limit')).toHaveValue('10'));
    await act(async () => finish({status: 200}));
    expect(onCancel).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('graphspace.form.id_placeholder')).toHaveValue('current');
});

test.each(['response', 'transport'])('refreshes partially applied %s failures without losing the form', async failure => {
    api.manage.getGraphSpace.mockResolvedValue({status: 200, data: {
        name: 'partial', nickname: 'Partial', auth: false, storage_limit: 10,
    }});
    let storedQuota = 10;
    api.manage.updateGraphSpace.mockImplementationOnce(async (_, values) => {
        storedQuota = values.storage_limit;
        if (failure === 'transport') throw new Error('Admin update failed');
        return {status: 503};
    });
    const onCancel = jest.fn();
    const refresh = jest.fn(() => expect(storedQuota).toBe(25));
    // Static toast portals are covered by the browser fixture. Keep this test
    // focused on the editor's actual async save/refresh and retry lifecycle.
    const feedback = [
        jest.spyOn(message, 'error').mockImplementation(() => {}),
        jest.spyOn(message, 'success').mockImplementation(() => {}),
    ];
    try {
        await act(async () => {
            render(<EditLayer visible detail={{name: 'partial'}} onCancel={onCancel} refresh={refresh} />);
        });
        const quota = document.querySelector('#control-hooks_storage_limit');
        const alias = screen.getByPlaceholderText('graphspace.form.name_placeholder');
        const save = screen.getByText('common.action.save').closest('button');
        expect(quota).toHaveValue('10');
        await act(async () => {
            fireEvent.change(quota, {target: {value: '25'}});
            fireEvent.change(alias, {target: {value: 'RetryAlias'}});
        });
        await act(async () => {fireEvent.click(save);});
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(onCancel).not.toHaveBeenCalled();
        expect(quota).toBeEnabled();
        expect(quota).toHaveValue('25');
        expect(alias).toHaveValue('RetryAlias');
        await act(async () => {fireEvent.click(save);});
        expect(api.manage.updateGraphSpace).toHaveBeenCalledTimes(2);
        expect(api.manage.updateGraphSpace.mock.calls[1][1]).toMatchObject({storage_limit: 25, nickname: 'RetryAlias'});
        expect(onCancel).toHaveBeenCalledTimes(1);
    } finally {
        feedback.forEach(spy => spy.mockRestore());
    }
});

test('uses the shared keyboard-focusable help affordance for every field label', () => {
    render(
        <EditLayer visible detail={{}} onCancel={jest.fn()} refresh={jest.fn()} />
    );

    const nameHelp = screen.getByRole('img', {name: /graphspace\.form\.id_help/});
    expect(nameHelp).toHaveAttribute('tabindex', '0');
    expect(nameHelp).toHaveAttribute('role', 'img');
});

test('reserves enough label width for long localized labels', () => {
    render(
        <EditLayer visible detail={{}} onCancel={jest.fn()} refresh={jest.fn()} />
    );

    const form = document.querySelector('.graphspace-edit-form');
    const labelColumn = form.querySelector('.ant-form-item-label');
    const controlColumn = form.querySelector('.ant-form-item-control');

    expect(labelColumn).toHaveStyle({flex: '0 0 200px'});
    expect(controlColumn).toHaveStyle({flex: '1 1 0'});
});

test('does not expose per-GraphSpace authentication controls', () => {
    render(
        <EditLayer visible detail={{}} onCancel={jest.fn()} refresh={jest.fn()} />
    );

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('graphspace.form.auth')).not.toBeInTheDocument();
});

test('creates a GraphSpace with visible resource defaults', async () => {
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
        auth: true,
        description: '',
    });
    expect(values).toMatchObject({
        max_graph_number: 100,
        cpu_limit: 128,
        memory_limit: 128,
        compute_cpu_limit: 128,
        compute_memory_limit: 128,
        storage_limit: 256,
    });
});

test('creates an anonymous-mode GraphSpace with authentication disabled', async () => {
    isAuthEnabled.mockReturnValue(false);
    render(
        <EditLayer visible detail={{}} onCancel={jest.fn()} refresh={jest.fn()} />
    );
    fireEvent.change(screen.getByPlaceholderText('graphspace.form.id_placeholder'), {
        target: {value: 'anonymous_space'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'common.action.create'}));

    await waitFor(() => expect(api.manage.addGraphSpace).toHaveBeenCalled());
    expect(api.manage.addGraphSpace.mock.calls[0][0].auth).toBe(false);
});

test('preserves existing GraphSpace authentication while editing', async () => {
    api.manage.getGraphSpace.mockResolvedValue({
        status: 200,
        data: {
            name: 'legacy_space',
            nickname: 'LegacySpace',
            auth: false,
        },
    });
    render(
        <EditLayer
            visible
            detail={{name: 'legacy_space'}}
            onCancel={jest.fn()}
            refresh={jest.fn()}
        />
    );

    await waitFor(() => expect(
        screen.getByPlaceholderText('graphspace.form.id_placeholder')
    ).toHaveValue('legacy_space'));
    fireEvent.click(screen.getByRole('button', {name: 'common.action.save'}));

    await waitFor(() => expect(api.manage.updateGraphSpace).toHaveBeenCalled());
    expect(api.manage.updateGraphSpace.mock.calls[0][1].auth).toBe(false);
});

test('creates without an alias and never copies the GraphSpace name into nickname', async () => {
    render(
        <EditLayer visible detail={{}} onCancel={jest.fn()} refresh={jest.fn()} />
    );
    fireEvent.change(screen.getByPlaceholderText('graphspace.form.id_placeholder'), {
        target: {value: 'demo_space'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'common.action.create'}));

    await waitFor(() => expect(api.manage.addGraphSpace).toHaveBeenCalled());
    expect(api.manage.addGraphSpace.mock.calls[0][0].nickname).not.toBe('demo_space');
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

test('keeps the path name immutable while allowing display-name edits', async () => {
    api.manage.getGraphSpace.mockResolvedValue({
        status: 200,
        data: {name: 'demo_space', nickname: 'demo_space'},
    });
    render(
        <EditLayer
            visible
            detail={{name: 'demo_space'}}
            onCancel={jest.fn()}
            refresh={jest.fn()}
        />
    );

    const pathName = screen.getByPlaceholderText('graphspace.form.id_placeholder');
    const displayName = screen.getByPlaceholderText('graphspace.form.name_placeholder');
    await waitFor(() => expect(pathName).toHaveValue('demo_space'));
    expect(pathName).toBeDisabled();
    expect(displayName).toBeEnabled();
    expect(displayName).toHaveValue('');
});

test('preserves a real GraphSpace alias while editing', async () => {
    api.manage.getGraphSpace.mockResolvedValue({
        status: 200,
        data: {name: 'demo_space', nickname: 'Demo Space'},
    });
    render(
        <EditLayer
            visible
            detail={{name: 'demo_space'}}
            onCancel={jest.fn()}
            refresh={jest.fn()}
        />
    );
    await waitFor(() => expect(
        screen.getByPlaceholderText('graphspace.form.name_placeholder')
    ).toHaveValue('Demo Space'));
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
    expect(screen.getByRole('img', {name: /graphspace\.form\.id_help/}))
        .toBeInTheDocument();
    expect(screen.getByRole('img', {name: /graphspace\.form\.graph_cpu_help/}))
        .toBeInTheDocument();
    expect(screen.getByRole('img', {name: /graphspace\.form\.oltp_namespace_help/}))
        .toBeInTheDocument();

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

test('editing CPU keeps raw zero compute limits and updates inherited effective values', async () => {
    api.manage.getGraphSpace.mockResolvedValue({status: 200, data: {
        name: 'inherited', auth: false, cpu_limit: 4, memory_limit: 8,
        compute_cpu_limit: 0, compute_memory_limit: 0,
    }});
    render(<EditLayer visible detail={{name: 'inherited'}} onCancel={jest.fn()} refresh={jest.fn()} />);
    await waitFor(() => expect(document.querySelector('#control-hooks_compute_cpu_limit')).toHaveValue('0'));
    expect(document.querySelector('#control-hooks_compute_memory_limit')).toHaveValue('0');
    expect(await screen.findByText('Inherited (4graphspace.unit.cpu)')).toBeInTheDocument();
    fireEvent.change(document.querySelector('#control-hooks_cpu_limit'), {target: {value: '16'}});
    expect(await screen.findByText('Inherited (16graphspace.unit.cpu)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'common.action.save'}));
    await waitFor(() => expect(api.manage.updateGraphSpace).toHaveBeenCalled());
    expect(api.manage.updateGraphSpace.mock.calls[0][1]).toMatchObject({
        cpu_limit: 16, memory_limit: 8, compute_cpu_limit: 0, compute_memory_limit: 0,
    });
});

test('creation can explicitly select zero compute inheritance without changing form defaults', async () => {
    render(<EditLayer visible detail={{}} onCancel={jest.fn()} refresh={jest.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('graphspace.form.id_placeholder'), {
        target: {value: 'inherit_new'},
    });
    fireEvent.change(document.querySelector('#control-hooks_compute_cpu_limit'), {target: {value: '0'}});
    fireEvent.change(document.querySelector('#control-hooks_compute_memory_limit'), {target: {value: '0'}});
    fireEvent.click(screen.getByRole('button', {name: 'common.action.create'}));
    await waitFor(() => expect(api.manage.addGraphSpace).toHaveBeenCalled());
    expect(api.manage.addGraphSpace.mock.calls[0][0]).toMatchObject({
        cpu_limit: 128, memory_limit: 128, compute_cpu_limit: 0, compute_memory_limit: 0,
    });
});

test('clearing positive compute fields shows inheritance before submitting null', async () => {
    api.manage.getGraphSpace.mockResolvedValue({status: 200, data: {
        name: 'cleared', auth: false, cpu_limit: 4, memory_limit: 8,
        compute_cpu_limit: 6, compute_memory_limit: 7,
    }});
    render(<EditLayer visible detail={{name: 'cleared'}} onCancel={jest.fn()} refresh={jest.fn()} />);
    const cpu = document.querySelector('#control-hooks_compute_cpu_limit');
    const memory = document.querySelector('#control-hooks_compute_memory_limit');
    await waitFor(() => expect(cpu).toHaveValue('6'));
    expect(screen.queryByText('Inherited (4graphspace.unit.cpu)')).not.toBeInTheDocument();
    fireEvent.change(cpu, {target: {value: ''}});
    fireEvent.change(memory, {target: {value: ''}});
    expect(await screen.findByText('Inherited (4graphspace.unit.cpu)')).toBeInTheDocument();
    expect(await screen.findByText('Inherited (8graphspace.unit.memory)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'common.action.save'}));
    await waitFor(() => expect(api.manage.updateGraphSpace).toHaveBeenCalled());
    expect(api.manage.updateGraphSpace.mock.calls[0][1]).toMatchObject({
        compute_cpu_limit: null, compute_memory_limit: null,
    });
});

test('both locales explain clearing and the paired Server requirement', () => {
    for (const locale of ['en-US', 'zh-CN']) {
        const pages = require(`../../i18n/resources/${locale}/modules/pages.json`);
        expect(pages.graphspace.form.compute_inheritance_help).toContain('apache/hugegraph#3391');
    }
});

test('preserves an existing storage quota when saving a space opened with the new defaults', async () => {
    api.manage.getGraphSpace.mockResolvedValue({
        status: 200,
        data: {name: 'existing_space', auth: true, storage_limit: 10240},
    });
    render(<EditLayer visible detail={{name: 'existing_space'}}
        onCancel={jest.fn()} refresh={jest.fn()} />);

    await waitFor(() => expect(document.querySelector('#control-hooks_storage_limit'))
        .toHaveValue('10240'));
    fireEvent.click(screen.getByRole('button', {name: 'common.action.save'}));

    await waitFor(() => expect(api.manage.updateGraphSpace).toHaveBeenCalledWith(
        'existing_space', expect.objectContaining({storage_limit: 10240}), expect.anything()
    ));
});

test('clearing an existing storage quota sends null for backend preserve semantics', async () => {
    api.manage.getGraphSpace.mockResolvedValue({status: 200,
        data: {name: 'existing_space', auth: true, storage_limit: 10240}});
    render(<EditLayer visible detail={{name: 'existing_space'}}
        onCancel={jest.fn()} refresh={jest.fn()} />);
    const quota = document.querySelector('#control-hooks_storage_limit');
    await waitFor(() => expect(quota).toHaveValue('10240'));
    fireEvent.change(quota, {target: {value: ''}});
    fireEvent.blur(quota);
    fireEvent.click(screen.getByRole('button', {name: 'common.action.save'}));
    await waitFor(() => expect(api.manage.updateGraphSpace).toHaveBeenCalledWith(
        'existing_space', expect.objectContaining({storage_limit: null}), expect.anything()
    ));
});
