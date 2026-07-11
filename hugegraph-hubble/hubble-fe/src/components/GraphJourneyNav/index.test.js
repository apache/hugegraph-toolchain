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
import GraphJourneyNav from './index';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => ({
        'graph.detail.journey': 'Graph understanding navigation',
        'graph.detail.overview': 'Overview',
        'graph.detail.schema': 'Schema',
    })[key] || key}),
}));

test.each([
    ['overview', 'Overview', 'Schema'],
    ['schema', 'Schema', 'Overview'],
])('marks only %s as the current graph journey tab', (active, current, inactive) => {
    render(
        <MemoryRouter future={{
            v7_relativeSplatPath: true,
            v7_startTransition: true,
        }}
        >
            <GraphJourneyNav
                graphspace='DEFAULT'
                graph='hugegraph'
                active={active}
            />
        </MemoryRouter>
    );

    expect(screen.getByRole('navigation', {
        name: 'Graph understanding navigation',
    })).toBeInTheDocument();
    expect(screen.getByRole('link', {name: current}))
        .toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', {name: inactive}))
        .not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', {name: 'Overview'}))
        .toHaveAttribute('href', '/graphspace/DEFAULT/graph/hugegraph/detail');
    expect(screen.getByRole('link', {name: 'Schema'}))
        .toHaveAttribute('href', '/graphspace/DEFAULT/graph/hugegraph/meta');
});
