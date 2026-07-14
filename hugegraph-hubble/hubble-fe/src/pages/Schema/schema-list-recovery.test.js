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
import Schema from './index';
import * as api from '../../api';

let mockGraphspace = 'SPACE';
const mockTranslate = (key, values) => ({
    'schema_template.title': `${values?.name || 'unknown'} - Schema templates`,
    'schema_template.create': 'Create template',
    'schema_template.search_placeholder': 'Search',
    'schema_template.load_failed': 'Could not load schema templates.',
    'schema_template.retry': 'Retry schema templates',
    'schema_template.graphspace_failed': 'Could not load graph-space details.',
    'schema_template.retry_graphspace': 'Retry graph-space details',
    'schema_template.column.name': 'Name',
    'schema_template.column.created_at': 'Created',
    'schema_template.column.updated_at': 'Updated',
    'schema_template.column.creator': 'Creator',
    'schema_template.column.operation': 'Actions',
    'schema_template.builtin_section.title': 'Built-in starting points',
    'schema_template.builtin_section.unsaved': 'Not saved',
    'schema_template.builtin_section.use': 'Use starting point',
    'schema_template.builtin_section.use_named': `Use ${values?.name}`,
    'schema_template.builtin_section.remove': 'Hide this starting point',
    'schema_template.builtin_section.remove_named': `Hide ${values?.name}`,
    'schema_template.builtin_section.restore': 'Restore built-in starting points',
    'schema_template.user_section.title': 'Saved user templates',
    'schema_template.row.expand': `Expand ${values?.name}`,
    'schema_template.docs.intro': 'Need help designing a schema?',
    'schema_template.docs.link': 'Read the Schema design documentation',
    'schema_template.action.edit': 'Edit',
    'schema_template.action.edit_named': `Edit ${values?.name}`,
    'schema_template.action.delete': 'Delete',
    'schema_template.action.delete_named': `Delete ${values?.name}`,
    'schema_template.no_matches': 'No matching templates',
    'schema_template.clear_search': 'Clear search',
    'schema_template.empty': 'No templates yet',
    'graphspace.default_name': 'Default GraphSpace',
}[key] || key);

jest.mock('../../api', () => ({
    manage: {
        getGraphSpace: jest.fn(),
        getSchemaList: jest.fn(),
        addSchema: jest.fn(),
        updateSchema: jest.fn(),
        delSchema: jest.fn(),
    },
}));
jest.mock('./EditLayer', () => ({visible, mode, detail}) => (
    visible ? (
        <div data-testid='schema-edit-layer'>
            {mode}:{detail?.name}:{detail?.schema}
        </div>
    ) : null
));
jest.mock('../../components/CodeEditor', () => props => (
    <div role='region' aria-label={props.ariaLabel} data-readonly={props.readOnly}>
        {props.value}
    </div>
));
jest.mock('../../components/DataPreparationNav', () => () => null);
jest.mock('react-router-dom', () => ({
    useNavigate: () => jest.fn(),
    useParams: () => ({graphspace: mockGraphspace}),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: mockTranslate}),
}));

const waitForLoadingToFinish = () => waitFor(() => {
    expect(document.querySelector('.ant-spin-spinning')).not.toBeInTheDocument();
});

beforeAll(() => {
    window.matchMedia = window.matchMedia || (() => ({
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

afterEach(() => {
    window.history.replaceState({}, '', '/');
    mockGraphspace = 'SPACE';
    jest.clearAllMocks();
    window.localStorage.clear();
});

it('keeps unsaved built-in starting points separate from saved user templates', async () => {
    api.manage.getGraphSpace.mockResolvedValue({status: 200, data: {nickname: 'Space'}});
    api.manage.getSchemaList.mockResolvedValue({
        status: 200,
        data: {records: [], total: 0},
    });

    render(<Schema />);

    expect(await screen.findByText('Built-in starting points')).toBeInTheDocument();
    await waitForLoadingToFinish();
    expect(screen.getAllByText('Not saved').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Saved user templates')).toBeInTheDocument();
    expect(api.manage.addSchema).not.toHaveBeenCalled();
    expect(api.manage.updateSchema).not.toHaveBeenCalled();
    expect(api.manage.delSchema).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', {name: /^Use /})[0]);
    expect(screen.getByTestId('schema-edit-layer')).toHaveTextContent(
        'create:people_network:schema.propertyKey'
    );
    expect(api.manage.addSchema).not.toHaveBeenCalled();
    expect(api.manage.updateSchema).not.toHaveBeenCalled();
    expect(api.manage.delSchema).not.toHaveBeenCalled();
});

it('hides built-in starting points locally and offers an explicit restore action', async () => {
    api.manage.getGraphSpace.mockResolvedValue({status: 200, data: {nickname: 'Space'}});
    api.manage.getSchemaList.mockResolvedValue({
        status: 200,
        data: {records: [], total: 0},
    });

    const {unmount} = render(<Schema />);
    expect(await screen.findAllByText('Not saved')).toHaveLength(2);
    await waitForLoadingToFinish();

    fireEvent.click(screen.getAllByRole('button', {name: /^Hide /})[0]);
    expect(screen.getAllByText('Not saved')).toHaveLength(1);
    expect(screen.getByRole('button', {name: 'Restore built-in starting points'}))
        .toBeInTheDocument();
    expect(api.manage.addSchema).not.toHaveBeenCalled();
    expect(api.manage.updateSchema).not.toHaveBeenCalled();
    expect(api.manage.delSchema).not.toHaveBeenCalled();

    unmount();
    render(<Schema />);
    expect(await screen.findAllByText('Not saved')).toHaveLength(1);
    await waitForLoadingToFinish();

    fireEvent.click(screen.getByRole('button', {name: 'Restore built-in starting points'}));
    expect(screen.getAllByText('Not saved')).toHaveLength(2);
    expect(api.manage.addSchema).not.toHaveBeenCalled();
    expect(api.manage.updateSchema).not.toHaveBeenCalled();
    expect(api.manage.delSchema).not.toHaveBeenCalled();
});

it('expands a saved template row into a wide read-only Groovy code block', async () => {
    api.manage.getGraphSpace.mockResolvedValue({status: 200, data: {nickname: 'Space'}});
    api.manage.getSchemaList.mockResolvedValue({
        status: 200,
        data: {records: [{
            name: 'custom_schema',
            schema: 'schema.propertyKey("name").asText().create()',
        }], total: 1},
    });

    render(<Schema />);
    const rowName = await screen.findByText('custom_schema');
    await waitForLoadingToFinish();
    expect(screen.queryByRole('button', {name: 'View'})).not.toBeInTheDocument();

    fireEvent.click(rowName);
    const code = screen.getByRole('region', {name: 'Expand custom_schema'});
    expect(code).toHaveAttribute('data-readonly', 'true');
    expect(code).toHaveTextContent('schema.propertyKey');
});

it('links to the Schema design documentation below the template list', async () => {
    api.manage.getGraphSpace.mockResolvedValue({status: 200, data: {nickname: 'Space'}});
    api.manage.getSchemaList.mockResolvedValue({
        status: 200,
        data: {records: [], total: 0},
    });

    render(<Schema />);

    const link = await screen.findByRole('link', {
        name: 'Read the Schema design documentation',
    });
    await waitForLoadingToFinish();
    expect(link).toHaveAttribute(
        'href',
        'https://hugegraph.apache.org/docs/guides/desgin-concept/'
    );
});

it('opens create mode when reached from the new-graph shortcut', async () => {
    window.history.replaceState({}, '', '/graphspace/SPACE/schema?create=true');
    api.manage.getGraphSpace.mockResolvedValue({status: 200, data: {nickname: 'Space'}});
    api.manage.getSchemaList.mockResolvedValue({
        status: 200,
        data: {records: [], total: 0},
    });

    render(<Schema />);

    expect(await screen.findByTestId('schema-edit-layer')).toHaveTextContent('create');
    await waitForLoadingToFinish();
});

it('uses the GraphSpace name when its alias is empty', async () => {
    api.manage.getGraphSpace.mockResolvedValue({
        status: 200,
        data: {name: 'SPACE', nickname: ''},
    });
    api.manage.getSchemaList.mockResolvedValue({
        status: 200,
        data: {records: [], total: 0},
    });

    render(<Schema />);

    expect(await screen.findByText('SPACE - Schema templates')).toBeInTheDocument();
    await waitForLoadingToFinish();
});

it('localizes the default GraphSpace instead of exposing its stored nickname', async () => {
    mockGraphspace = 'DEFAULT';
    api.manage.getGraphSpace.mockResolvedValue({
        status: 200,
        data: {name: 'DEFAULT', nickname: '默认图空间'},
    });
    api.manage.getSchemaList.mockResolvedValue({
        status: 200,
        data: {records: [], total: 0},
    });

    render(<Schema />);

    expect(await screen.findByText('Default GraphSpace - Schema templates'))
        .toBeInTheDocument();
    expect(screen.queryByText('默认图空间 - Schema templates'))
        .not.toBeInTheDocument();
    await waitForLoadingToFinish();
});

it('does not present a failed schema-template request as an empty list', async () => {
    api.manage.getGraphSpace.mockResolvedValue({status: 200, data: {nickname: 'Space'}});
    api.manage.getSchemaList
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({status: 200, data: {records: [], total: 0}});

    render(<Schema />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not load schema templates.'
    );
    await waitForLoadingToFinish();
    fireEvent.click(screen.getByRole('button', {name: 'Retry schema templates'}));

    await waitFor(() => expect(api.manage.getSchemaList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    await waitForLoadingToFinish();
});

it('distinguishes search no-results and clears the search', async () => {
    api.manage.getGraphSpace.mockResolvedValue({status: 200, data: {nickname: 'Space'}});
    api.manage.getSchemaList.mockResolvedValue({
        status: 200,
        data: {records: [], total: 0},
    });
    render(<Schema />);
    await screen.findByText('No templates yet');

    fireEvent.change(screen.getByPlaceholderText('Search'), {
        target: {value: 'missing'},
    });
    fireEvent.keyDown(screen.getByPlaceholderText('Search'), {
        key: 'Enter', code: 'Enter', charCode: 13,
    });

    expect(await screen.findByText('No matching templates')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Clear search'}));
    expect(await screen.findByText('No templates yet')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search')).toHaveValue('');
    await waitForLoadingToFinish();
});

it('ignores graph-space detail returned after the route has changed', async () => {
    let resolveA;
    let resolveB;
    api.manage.getGraphSpace.mockImplementation(graphspace => new Promise(resolve => {
        if (graphspace === 'SPACE_A') {
            resolveA = resolve;
        }
        else {
            resolveB = resolve;
        }
    }));
    api.manage.getSchemaList.mockResolvedValue({
        status: 200,
        data: {records: [], total: 0},
    });
    mockGraphspace = 'SPACE_A';
    const {rerender} = render(<Schema />);

    mockGraphspace = 'SPACE_B';
    rerender(<Schema />);
    await act(async () => {
        resolveB({status: 200, data: {nickname: 'Space B'}});
        await Promise.resolve();
    });
    expect(screen.getByText('Space B - Schema templates')).toBeInTheDocument();

    await act(async () => {
        resolveA({status: 200, data: {nickname: 'Space A'}});
        await Promise.resolve();
    });
    expect(screen.queryByText('Space A - Schema templates')).not.toBeInTheDocument();
    expect(screen.getByText('Space B - Schema templates')).toBeInTheDocument();
    await waitForLoadingToFinish();
});

it('hides graph-space A identity and rows while graph-space B is pending', async () => {
    let resolveGraphspaceB;
    let resolveListB;
    api.manage.getGraphSpace.mockImplementation(graphspace => {
        return graphspace === 'SPACE_A'
            ? Promise.resolve({status: 200, data: {nickname: 'Space A'}})
            : new Promise(resolve => {
                resolveGraphspaceB = resolve;
            });
    });
    api.manage.getSchemaList.mockImplementation(graphspace => {
        return graphspace === 'SPACE_A' ? Promise.resolve({
            status: 200,
            data: {records: [{name: 'Schema A', key: 'Schema A'}], total: 1},
        })
            : new Promise(resolve => {
                resolveListB = resolve;
            });
    });
    mockGraphspace = 'SPACE_A';
    const {rerender} = render(<Schema />);
    expect(await screen.findByText('Schema A')).toBeInTheDocument();
    expect(screen.getByText('Space A - Schema templates')).toBeInTheDocument();

    mockGraphspace = 'SPACE_B';
    rerender(<Schema />);
    expect(screen.queryByText('Schema A')).not.toBeInTheDocument();
    expect(screen.queryByText('Space A - Schema templates')).not.toBeInTheDocument();
    expect(screen.getByText('SPACE_B - Schema templates')).toBeInTheDocument();

    await act(async () => {
        resolveGraphspaceB({status: 200, data: {nickname: 'Space B'}});
        resolveListB({status: 200, data: {records: [], total: 0}});
        await Promise.resolve();
    });
    await waitForLoadingToFinish();
});
