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
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import LayoutAnt from './layout.ant';
import './i18n';

jest.mock('./components/Topbar/index.ant', () => () => <header>Topbar</header>);
jest.mock('./components/Sidebar/index.ant', () => () => <nav>Sidebar</nav>);

test('provides a localized skip link and semantic workspace title', () => {
    render(
        <MemoryRouter
            initialEntries={['/gremlin/DEFAULT/hugegraph']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Routes>
                <Route path="*" element={<LayoutAnt />}>
                    <Route path="*" element={<div>Query content</div>} />
                </Route>
            </Routes>
        </MemoryRouter>
    );

    expect(screen.getByRole('link', {name: '跳到主工作区'}))
        .toHaveAttribute('href', '#workbench-main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'workbench-main');
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('main')).toHaveClass('workbench-route-gremlin');
    expect(screen.getByRole('heading', {level: 1, name: '图查询'}))
        .toHaveClass('workbench-page-title');
});
