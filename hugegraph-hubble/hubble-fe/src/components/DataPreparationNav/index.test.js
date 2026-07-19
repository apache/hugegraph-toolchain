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
import {MemoryRouter} from 'react-router-dom';
import DataPreparationNav from './index';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => ({
        'data_preparation.journey': 'Data preparation journey',
        'data_preparation.schema': 'Schema templates',
        'data_preparation.graph_schema': 'Graph Schema',
        'data_preparation.datasource': 'Data sources',
        'data_preparation.import': 'Import tasks',
        'data_preparation.choose_graphspace': 'Choose a graph space first',
        'data_preparation.choose_graph': 'Choose a graph first',
    })[key]}),
}));

it('keeps the graph space in the Schema step and marks one current link', () => {
    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <DataPreparationNav active='schema' graphspace='SPACE A' />
        </MemoryRouter>
    );

    expect(screen.getByRole('navigation', {name: 'Data preparation journey'}))
        .toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Schema templates'}))
        .toHaveAttribute('href', '/graphspace/SPACE%20A/schema');
    expect(screen.getByRole('link', {name: 'Schema templates'}))
        .toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', {name: 'Data sources'}))
        .not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', {name: 'Import tasks'}))
        .not.toHaveAttribute('aria-current');
});

it('uses graph-space selection as the honest Schema fallback', () => {
    localStorage.clear();
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));
    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <DataPreparationNav active='datasource' />
        </MemoryRouter>
    );

    expect(screen.getByRole('link', {name: 'Schema templates'}))
        .toHaveAttribute('href', '/graphspace');
    expect(screen.getByRole('link', {name: 'Schema templates'}))
        .toHaveAttribute('title', 'Choose a graph space first');
    expect(screen.getByRole('link', {name: 'Data sources'}))
        .toHaveAttribute('aria-current', 'page');
});

it('never reuses a stale PD graph space in non-PD mode', () => {
    localStorage.setItem('hubble_workbench_graph_context', JSON.stringify({
        graphspace: 'OLD_PD_SPACE',
        graph: 'old_graph',
    }));
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: false}));

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <DataPreparationNav active='task' />
        </MemoryRouter>
    );

    expect(screen.getByRole('link', {name: 'Schema templates'}))
        .toHaveAttribute('href', '/graphspace/DEFAULT/schema');
    expect(screen.getByRole('link', {name: 'Schema templates'}))
        .not.toHaveAttribute('title');
});

it('keeps the Schema template route available to non-PD users', () => {
    localStorage.setItem('hubble_workbench_graph_context', JSON.stringify({
        graphspace: 'DEFAULT',
        graph: 'hugegraph',
    }));
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: false}));

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <DataPreparationNav active='task' />
        </MemoryRouter>
    );

    expect(screen.getByRole('link', {name: 'Schema templates'}))
        .toHaveAttribute('href', '/graphspace/DEFAULT/schema');
});
