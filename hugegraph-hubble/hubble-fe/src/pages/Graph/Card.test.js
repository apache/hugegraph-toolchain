/*
 *
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
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import GraphCard from './Card';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

jest.mock('../../components/GraphinView', () => () => <div>graph preview</div>);

jest.mock('../../utils/formatGraphInData', () => ({
    formatToGraphInData: () => ({nodes: [], edges: []}),
}));

jest.mock('../../utils/config', () => ({
    isPdEnabled: () => true,
}));

test('falls back to the graph id when a PD graph has no nickname', () => {
    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <GraphCard
                item={{
                    name: 'hugegraph',
                    nickname: null,
                    graphspace: 'DEFAULT',
                    graphspace_nickname: '默认图空间',
                    default: true,
                    storage: 0,
                    create_time: '2026-07-12',
                }}
                menus={[]}
            />
        </MemoryRouter>
    );

    expect(screen.getByTitle('默认图空间-hugegraph')).toBeInTheDocument();
    expect(screen.queryByTitle('默认图空间-null')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'graph.card.more_actions'}))
        .toBeInTheDocument();
});

test('uses a compact actionable state when the graph has no schema', () => {
    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <GraphCard
                item={{
                    name: 'hugegraph',
                    graphspace: 'DEFAULT',
                    graphspace_nickname: 'Default',
                    storage: 0,
                    create_time: '2026-07-12',
                    schemaview: {vertices: [], edges: []},
                }}
                menus={[]}
            />
        </MemoryRouter>
    );

    expect(screen.getByText('graph.card.empty_schema')).toBeInTheDocument();
    expect(screen.getByText(/graph\.card\.schema_types/)).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'graph.card.open_schema'}))
        .toBeInTheDocument();
    expect(screen.queryByText('graph preview')).not.toBeInTheDocument();
    expect(screen.getByText(/graph\.col\.create_time/).closest('[role="button"]'))
        .not.toBeInTheDocument();
});
