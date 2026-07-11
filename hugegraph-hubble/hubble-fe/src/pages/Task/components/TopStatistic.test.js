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
import TopStatistic from './TopStatistic';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

beforeAll(() => {
    window.matchMedia = window.matchMedia || (() => ({
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

it('renders unknown import metrics as dashes rather than false zeros', () => {
    const {rerender} = render(<TopStatistic data={{}} available={false} />);

    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getAllByText('--')).toHaveLength(8);

    rerender(<TopStatistic data={{}} available />);
    expect(screen.getAllByText('0')).toHaveLength(8);
});
