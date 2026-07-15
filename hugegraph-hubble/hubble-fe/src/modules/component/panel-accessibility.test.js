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
import StatisticPanel from './StatisticsPanel/Home';
import LayoutConfigPanel from './layoutConfigPanel/Home';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));
jest.mock('./StatisticsPanel/LabelStatistics', () => () => null);
jest.mock('./StatisticsPanel/GraphStatistics/Home', () => () => null);
jest.mock('./layoutConfigPanel/Force', () => () => null);
jest.mock('./layoutConfigPanel/Circular', () => () => null);
jest.mock('./layoutConfigPanel/Concentric', () => () => null);
jest.mock('./layoutConfigPanel/Dagre', () => () => null);
jest.mock('./layoutConfigPanel/Grid', () => () => null);
jest.mock('./layoutConfigPanel/Radial', () => () => null);

beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockReturnValue({
            matches: false,
            addListener: jest.fn(),
            removeListener: jest.fn(),
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            dispatchEvent: jest.fn(),
        }),
    });
});

test('names statistics and layout view controls', () => {
    render(
        <>
            <StatisticPanel open={false} />
            <LayoutConfigPanel open={false} layout={{}} data={{}} onChange={jest.fn()} />
        </>
    );

    expect(screen.getByRole('radiogroup', {
        name: 'analysis.canvas.statistics_panel.view_mode',
    })).toBeInTheDocument();
    expect(screen.getByRole('combobox', {
        name: 'analysis.canvas.layout_panel.layout_type',
    })).toBeInTheDocument();
});
