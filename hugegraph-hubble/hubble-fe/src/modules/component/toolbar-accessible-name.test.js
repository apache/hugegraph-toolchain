/*
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
import ClearGraph from './ClearGraph';
import FitCenter from './FitCenter';
import FixNode from './FixNode';
import FullScreen from './FullScreen';
import RedoUndo from './RedoUndo';
import RefreshGraph from './RefreshGraph';
import ZeroDegreeNodeSearch from './ZeroDegreeNode';
import ZoomGraph from './ZoomGraph';
import {GraphContext} from './Context';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));
jest.mock('../../utils/graph', () => ({}));
jest.mock('screenfull', () => ({
    isEnabled: false,
    isFullscreen: false,
}));

const graph = {
    on: jest.fn(),
    off: jest.fn(),
};

test('gives every graph toolbar icon button its localized tooltip name', () => {
    render(
        <GraphContext.Provider value={{graph}}>
            <FitCenter />
            <ZoomGraph />
            <RedoUndo onChange={jest.fn()} />
            <FullScreen onChange={jest.fn()} />
            <RefreshGraph />
            <FixNode />
            <ClearGraph enable onChange={jest.fn()} />
            <ZeroDegreeNodeSearch />
        </GraphContext.Provider>
    );

    [
        'fit_center',
        'zoom_out',
        'zoom_in',
        'undo',
        'redo',
        'full_screen_shortcut',
        'refresh_layout',
        'fix_node',
        'clear_canvas',
        'isolated_nodes',
    ].forEach(action => {
        expect(screen.getByRole('button', {
            name: `analysis.canvas.toolbar.${action}`,
        })).toBeInTheDocument();
    });
});
