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

import {render, screen} from '@testing-library/react';
import GraphSpaceCard from './Card';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

jest.mock('react-router-dom', () => {
    const router = jest.requireActual('react-router-dom');
    const React = require('react');

    return {
        ...router,
        Link: ({children, to}) => React.createElement('a', {href: to}, children),
        useNavigate: () => jest.fn(),
    };
});

jest.mock('antd', () => {
    const antd = jest.requireActual('antd');
    const React = require('react');

    return {
        ...antd,
        Menu: ({items}) => React.createElement(
            React.Fragment,
            null,
            items.map(({key, label}) => React.createElement(
                React.Fragment,
                {key},
                label
            ))
        ),
        Dropdown: {
            ...antd.Dropdown,
            Button: ({children, menu}) => React.createElement(
                React.Fragment,
                null,
                children,
                menu.items.map(({key, label}) => React.createElement(
                    React.Fragment,
                    {key},
                    label
                ))
            ),
        },
    };
});

beforeEach(() => {
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
});

test('does not expose a default GraphSpace mutation action', () => {
    const handleSetDefault = jest.fn();
    const item = {
        name: 'DEFAULT',
        nickname: 'Default',
        create_time: '2026-07-10',
        default: false,
        auth: false,
        max_graph_number: 10,
        cpu_limit: 2,
        memory_limit: 4,
        storage_limit: 100,
        storage_used: 1,
        storage_percent: 0.01,
        statistic: {vertex: 0, edge: 0, date: '2026-07-10'},
    };

    render(
        <GraphSpaceCard
            item={item}
            editGraphspace={jest.fn()}
            deleteGraphspace={jest.fn()}
            handleSetDefault={handleSetDefault}
            handleInit={jest.fn()}
        />
    );

    expect(screen.queryByText('common.action.set_default')).not.toBeInTheDocument();
    expect(handleSetDefault).not.toHaveBeenCalled();
    expect(screen.getByText('graphspace.default_name')).toBeInTheDocument();
    expect(screen.queryByText('Default')).not.toBeInTheDocument();
    expect(screen.getByText('graphspace.card.daily_snapshot')).toBeInTheDocument();
    expect(screen.getByLabelText('graphspace.card.statistic_help')).toBeInTheDocument();
});

test('ships a localized default GraphSpace name in both languages', () => {
    const zh = require('../../i18n/resources/zh-CN/modules/pages.json');
    const en = require('../../i18n/resources/en-US/modules/pages.json');

    expect(zh.graphspace.default_name).toBe('默认图空间');
    expect(en.graphspace.default_name).toBe('Default GraphSpace');
});

test('falls back to the daily-update label when statistics are unavailable', () => {
    const item = {
        name: 'empty',
        nickname: 'Empty',
        create_time: '2026-07-10',
        auth: false,
        max_graph_number: 10,
        cpu_limit: 2,
        memory_limit: 4,
        storage_limit: 100,
        storage_used: 0,
        storage_percent: 0,
    };

    render(
        <GraphSpaceCard
            item={item}
            editGraphspace={jest.fn()}
            deleteGraphspace={jest.fn()}
            handleInit={jest.fn()}
        />
    );

    expect(screen.getByText('graphspace.card.vertex: -')).toBeInTheDocument();
    expect(screen.getByText('graphspace.card.edge: -')).toBeInTheDocument();
    expect(screen.getByText('graphspace.card.daily_update')).toBeInTheDocument();
});

test('treats a backend nickname echo as an unset alias', () => {
    const item = {
        name: 'space', nickname: 'space', create_time: '2026-07-10', auth: false,
        max_graph_number: 10, cpu_limit: 2, memory_limit: 4,
        storage_limit: 100, storage_used: 0, storage_percent: 0,
    };
    render(
        <GraphSpaceCard
            item={item}
            editGraphspace={jest.fn()}
            deleteGraphspace={jest.fn()}
            handleInit={jest.fn()}
        />
    );

    expect(screen.getByTitle('space')).toBeInTheDocument();
});

test('keeps public GraphSpace navigation but hides mutation actions for viewers', () => {
    const item = {
        name: 'public', nickname: 'Public', create_time: '2026-07-10',
        auth: false, max_graph_number: 10, cpu_limit: 2, memory_limit: 4,
        storage_limit: 100, storage_used: 1, storage_percent: 0.01,
        statistic: {vertex: 0, edge: 0},
    };

    render(
        <GraphSpaceCard
            item={item}
            canUpdate={false}
            canDelete={false}
            editGraphspace={jest.fn()}
            deleteGraphspace={jest.fn()}
            handleInit={jest.fn()}
        />
    );

    expect(screen.getAllByText('graphspace.card.enter').length).toBeGreaterThan(0);
    expect(screen.getByText('common.action.schema_manage')).toBeInTheDocument();
    expect(screen.queryByText('common.action.edit')).not.toBeInTheDocument();
    expect(screen.queryByText('common.action.delete')).not.toBeInTheDocument();
});

test('keeps GraphSpace update and delete actions independently gated', () => {
    const item = {
        name: 'managed', nickname: 'Managed', create_time: '2026-07-10',
        auth: false, max_graph_number: 10, cpu_limit: 2, memory_limit: 4,
        storage_limit: 100, storage_used: 1, storage_percent: 0.01,
        statistic: {vertex: 0, edge: 0},
    };

    render(
        <GraphSpaceCard
            item={item}
            canUpdate
            canDelete={false}
            editGraphspace={jest.fn()}
            deleteGraphspace={jest.fn()}
            handleInit={jest.fn()}
        />
    );

    expect(screen.getByText('common.action.edit')).toBeInTheDocument();
    expect(screen.queryByText('common.action.delete')).not.toBeInTheDocument();
});
