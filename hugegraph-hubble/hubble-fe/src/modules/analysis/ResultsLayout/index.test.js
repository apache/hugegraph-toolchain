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

import React from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';
import ResultsLayout from './index';

jest.mock('react-i18next', () => ({useTranslation: () => ({t: key => key})}));

const originalHeight = window.innerHeight;

beforeEach(() => {
    window.innerHeight = 800;
});

afterEach(() => {
    window.innerHeight = originalHeight;
    jest.restoreAllMocks();
});

const renderStatefulResult = height => <div data-height={height}><input aria-label='result state' /></div>;
const renderHeight = height => <output>{height}</output>;

it('resizes the graph without constraining or remounting the records below it', () => {
    const view = render(
        <ResultsLayout
            renderResult={renderStatefulResult}
            history={<input aria-label='history state' />}
        />
    );
    const result = screen.getByRole('textbox', {name: 'result state'});
    const history = screen.getByRole('textbox', {name: 'history state'});
    fireEvent.change(result, {target: {value: 'selected graph'}});
    fireEvent.change(history, {target: {value: 'search'}});
    const divider = screen.getByRole('separator');
    const before = Number(divider.getAttribute('aria-valuenow'));
    expect(before).toBe(402);
    fireEvent.keyDown(divider, {key: 'ArrowDown'});
    const after = Number(divider.getAttribute('aria-valuenow'));
    expect(after).toBeGreaterThan(before);
    expect(view.container.firstChild.style.gridTemplateRows).toBe(`${after}px 14px auto`);
    expect(screen.getByRole('textbox', {name: 'result state'})).toBe(result);
    expect(result).toHaveValue('selected graph');
    expect(history).toHaveValue('search');

    fireEvent.keyDown(divider, {key: 'End'});
    expect(divider).toHaveAttribute('aria-valuenow', '800');
    fireEvent.keyDown(divider, {key: 'Home'});
    expect(divider).toHaveAttribute('aria-valuenow', '240');
    view.unmount();
});

it('clamps the graph when the viewport shrinks while records remain in document flow', () => {
    render(<ResultsLayout renderResult={renderHeight} history={<div>history</div>} />);
    const divider = screen.getByRole('separator');
    fireEvent.keyDown(divider, {key: 'End'});
    window.innerHeight = 400;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(divider).toHaveAttribute('aria-valuenow', '400');
    expect(divider).toHaveAttribute('aria-valuemax', '400');
});
