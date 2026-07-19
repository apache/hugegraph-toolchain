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

import {fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import Meta from './index';
import * as api from '../../api';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

jest.mock('react-router-dom', () => ({
    Link: ({children}) => <span>{children}</span>,
    useNavigate: () => jest.fn(),
    useParams: () => ({graphspace: 'space-a', graph: 'graph-a'}),
}));

jest.mock('../../api', () => ({
    manage: {
        getGraph: jest.fn(),
        getGraphSpace: jest.fn(),
    },
}));

jest.mock('./ListView', () => () => <div>schema list</div>);
jest.mock('./ImageView', () => () => <div>schema image</div>);

beforeEach(() => {
    jest.clearAllMocks();
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

test('shows persistent source-specific recovery instead of spinning forever', async () => {
    api.manage.getGraph.mockRejectedValueOnce(new Error('graph down')).mockResolvedValueOnce({
        status: 200,
        data: {nickname: 'Graph A'},
    });
    api.manage.getGraphSpace.mockRejectedValueOnce(new Error('space down')).mockResolvedValueOnce({
        status: 200,
        data: {nickname: 'Space A'},
    });

    render(<Meta />);

    expect(await screen.findByText('schema.identity.graph_unavailable')).toBeInTheDocument();
    expect(screen.getByText('schema.identity.graphspace_unavailable')).toBeInTheDocument();
    expect(screen.queryByText('schema list')).not.toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'schema.identity.back_to_graph'}))
        .toHaveAttribute('href', '/graphspace/space-a/graph/graph-a/detail');

    fireEvent.click(screen.getByRole('button', {name: 'schema.identity.retry'}));

    await waitFor(() => expect(screen.getByText('schema.title'))
        .toBeInTheDocument());
    expect(screen.getByText('schema image')).toBeInTheDocument();
});

test('defaults to image mode and preserves manual list switching', async () => {
    api.manage.getGraph.mockResolvedValue({
        status: 200,
        data: {nickname: 'Graph A'},
    });
    api.manage.getGraphSpace.mockResolvedValue({
        status: 200,
        data: {nickname: 'Space A'},
    });

    render(<Meta />);

    expect(await screen.findByText('schema image')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', {name: 'schema.view_mode'}))
        .toBeInTheDocument();
    expect(screen.queryByText('schema list')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('common.label.list_mode'));

    expect(screen.getByText('schema list')).toBeInTheDocument();
    expect(screen.queryByText('schema image')).not.toBeInTheDocument();
});

test('moves the view switch to the topbar and keeps graph identity out of the body title',
    async () => {
        api.manage.getGraph.mockResolvedValue({
            status: 200,
            data: {nickname: 'Graph A'},
        });
        api.manage.getGraphSpace.mockResolvedValue({
            status: 200,
            data: {nickname: 'Space A'},
        });
        const topbarHost = document.createElement('div');
        topbarHost.id = 'hubble-topbar-page-context';
        document.body.appendChild(topbarHost);

        render(<Meta />);

        expect(await within(topbarHost).findByRole('radiogroup', {
            name: 'schema.view_mode',
        })).toBeInTheDocument();
        expect(screen.getByText('schema.title')).toBeInTheDocument();
        expect(screen.queryByText('Space A - Graph A - schema.title'))
            .not.toBeInTheDocument();

        topbarHost.remove();
    });

test('falls back to path names when aliases are empty or echoed', async () => {
    api.manage.getGraph.mockResolvedValue({
        status: 200,
        data: {name: 'graph-a', nickname: ''},
    });
    api.manage.getGraphSpace.mockResolvedValue({
        status: 200,
        data: {name: 'space-a', nickname: 'space-a'},
    });

    render(<Meta />);

    await screen.findByText('schema image');
    await waitFor(() => expect(screen.getByText('schema.title'))
        .toBeInTheDocument());
});
