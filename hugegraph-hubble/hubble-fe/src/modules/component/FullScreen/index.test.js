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

import {fireEvent, render, screen} from '@testing-library/react';
import FullScreen from './index';
import {GraphContext} from '../Context';
import screenfull from 'screenfull';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => ({
        'analysis.canvas.toolbar.full_screen': 'Full screen',
        'analysis.canvas.toolbar.full_screen_shortcut': 'Full screen (F)',
    })[key] || key}),
}));
jest.mock('screenfull', () => ({
    isEnabled: true,
    isFullscreen: false,
    request: jest.fn(),
    exit: jest.fn(),
}));

it('uses F only while the graph surface is focused and exposes the shortcut', () => {
    const container = document.createElement('div');
    const input = document.createElement('input');
    container.append(input);
    document.body.append(container);
    const graph = {getContainer: () => container};

    render(
        <GraphContext.Provider value={{graph}}>
            <FullScreen onChange={jest.fn()} />
        </GraphContext.Provider>
    );
    expect(screen.getByRole('button', {name: 'Full screen (F)'})).toBeInTheDocument();

    fireEvent.keyDown(container, {key: 'f'});
    fireEvent.keyDown(input, {key: 'f'});

    expect(screenfull.request).toHaveBeenCalledTimes(1);
    expect(screenfull.request).toHaveBeenCalledWith(container);
    container.remove();
});
