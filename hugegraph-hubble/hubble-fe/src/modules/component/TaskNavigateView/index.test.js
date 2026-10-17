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

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter, Route, Routes, useParams} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import enAnalysis from '../../../i18n/resources/en-US/modules/analysis.json';
import zhAnalysis from '../../../i18n/resources/zh-CN/modules/analysis.json';
import TaskNavigateView from './index';

jest.mock('react-i18next', () => ({useTranslation: jest.fn()}));

const translate = resource => key => key.split('.').reduce((value, name) => value[name], resource);
const TaskPage = () => <h1>Task {useParams().taskId}</h1>;
const showTask = props => render(
    <MemoryRouter initialEntries={['/query']} future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
        <Routes>
            <Route path='/query' element={<TaskNavigateView taskId='1234567890' {...props} />} />
            <Route path='/asyncTasks/:taskId' element={<TaskPage />} />
        </Routes>
    </MemoryRouter>
);

beforeEach(() => {
    useTranslation.mockReturnValue({t: translate(enAnalysis)});
});

it.each([['en-US', enAnalysis], ['zh-CN', zhAnalysis]])(
    'offers task progress navigation with a localized submission status (%s)', (locale, resource) => {
        useTranslation.mockReturnValue({t: translate(resource)});
        const labels = resource.analysis.canvas.task_navigation;
        showTask();
        expect(screen.getByRole('status')).toHaveTextContent(labels.title);
        expect(screen.getByRole('status')).toHaveTextContent(labels.description);
        expect(screen.getByText(labels.task_id)).toBeInTheDocument();
        expect(screen.getByText('1234567890')).toBeInTheDocument();
        userEvent.click(screen.getByRole('button', {name: labels.view}));
        expect(screen.getByRole('heading', {name: 'Task 1234567890'})).toBeInTheDocument();
    }
);

it('preserves the actual submission feedback without replacing the stable success title', () => {
    showTask({message: 'PageRank task accepted by the server'});
    expect(screen.getByRole('heading', {name: 'Task submitted'})).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('PageRank task accepted by the server');
});

it.each(['Submitted successfully', 'Task submitted'])(
    'avoids repeating generic submission feedback (%s)', message => {
        showTask({message});
        expect(screen.getByRole('heading', {name: 'Task submitted'})).toBeInTheDocument();
        expect(screen.getAllByText('Task submitted')).toHaveLength(1);
        if (message !== 'Task submitted') {
            expect(screen.queryByText(message)).not.toBeInTheDocument();
        }
    }
);
