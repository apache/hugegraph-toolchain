/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

import {fireEvent, render, screen} from '@testing-library/react';

import ScheduleForm from './index';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
    initReactI18next: {
        type: '3rdParty',
        init: jest.fn(),
    },
}));

beforeEach(() => {
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    }));
});

test('shows load type for a scheduled JDBC import', () => {
    render(
        <ScheduleForm
            visible
            prev={jest.fn()}
            loading={false}
            datasource={{datasource_config: {type: 'JDBC'}}}
        />
    );

    fireEvent.click(screen.getByLabelText('task.edit.schedule_cron'));

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('task.edit.load_full')).toBeInTheDocument();
    expect(screen.getByRole('img', {
        name: 'task.edit.load_type: task.edit.load_type_help',
    })).toBeInTheDocument();
    expect(screen.queryByText('task.edit.load_type_help')).not.toBeInTheDocument();
    expect(screen.getByRole('img', {
        name: 'task.edit.cron_expression: task.edit.cron_extra',
    })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('task.edit.cron_placeholder')).toBeInTheDocument();
});

test('keeps Run Once as the default for a file import', () => {
    render(
        <ScheduleForm
            visible
            prev={jest.fn()}
            loading={false}
            datasource={{datasource_config: {type: 'FILE'}}}
        />
    );

    expect(screen.getByLabelText('task.edit.schedule_once')).toBeChecked();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});
