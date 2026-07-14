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

import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import Datasource from './index';
import * as api from '../../api';

jest.mock('../../api', () => ({
    manage: {
        getDatasourceList: jest.fn(),
        delDatasource: jest.fn(),
        delBatchDatasource: jest.fn(),
    },
}));
jest.mock('./EditLayer', () => () => null);
jest.mock('../../components/DataPreparationNav', () => () => null);
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => ({
        'datasource.title': 'Data sources',
        'datasource.load_failed': 'Could not load data sources.',
        'datasource.retry': 'Retry data sources',
        'datasource.create': 'Add data source',
        'datasource.delete': 'Delete data source',
        'datasource.search_placeholder': 'Search',
        'datasource.selected_count': '0 selected',
        'datasource.empty_title': 'No data sources yet',
        'datasource.empty_description': 'Add a source before creating an import task.',
        'datasource.supported_types': 'Supported sources:',
        'datasource.form.loader_docs': 'Read the Loader documentation',
        'task.source.file': 'File',
        'datasource.col.name': 'Name',
        'datasource.col.type': 'Type',
        'datasource.col.creator': 'Creator',
        'datasource.col.create_time': 'Created',
        'datasource.col.operation': 'Actions',
    })[key] || key}),
}));

beforeAll(() => {
    window.matchMedia = window.matchMedia || (() => ({
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

it('distinguishes a failed data-source list from an empty list and retries', async () => {
    api.manage.getDatasourceList
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({status: 200, data: {records: [], total: 0}});

    render(<Datasource />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not load data sources.'
    );
    fireEvent.click(screen.getByRole('button', {name: 'Retry data sources'}));

    await waitFor(() => expect(api.manage.getDatasourceList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(await screen.findByText('No data sources yet')).toBeInTheDocument();
});

it('explains the empty state and disables bulk deletion without a selection', async () => {
    api.manage.getDatasourceList.mockResolvedValue({
        status: 200,
        data: {records: [], total: 0},
    });

    render(<Datasource />);

    expect(await screen.findByText('No data sources yet')).toBeInTheDocument();
    expect(screen.getByText('Add a source before creating an import task.'))
        .toBeInTheDocument();
    expect(screen.getByText('Supported sources:')).toBeInTheDocument();
    for (const sourceType of ['HDFS', 'File', 'Kafka', 'JDBC']) {
        expect(screen.getByText(sourceType)).toBeInTheDocument();
    }
    for (const link of screen.getAllByRole('link', {
        name: 'Read the Loader documentation',
    })) {
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(screen.getByRole('button', {name: 'Delete data source'})).toBeDisabled();
    expect(screen.getAllByRole('button', {name: 'Add data source'}).length)
        .toBeGreaterThan(1);
});
