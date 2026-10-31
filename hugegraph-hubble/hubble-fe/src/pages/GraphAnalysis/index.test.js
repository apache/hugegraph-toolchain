/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import GraphAnalysis from './index';

jest.mock('../../modules/GraphAnalysis', () => ({moduleName, initialAlgorithmEngine}) => (
    <div>{moduleName}:{initialAlgorithmEngine}</div>
));

test.each([
    ['/algorithms/space/g?engine=olap', 'olap'],
    ['/algorithms/space/g?engine=unknown', 'oltp'],
    ['/algorithms/space/g', 'oltp'],
])('selects an explicit compute tab for %s', (path, expected) => {
    render(<MemoryRouter initialEntries={[path]}><GraphAnalysis moduleName='algorithms' /></MemoryRouter>);
    expect(screen.getByText(`algorithms:${expected}`)).toBeVisible();
});
