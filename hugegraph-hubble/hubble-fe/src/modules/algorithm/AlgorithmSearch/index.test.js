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

import {act, fireEvent, render, screen} from '@testing-library/react';
import AlgorithmSearch from './index';

jest.mock('react-i18next', () => ({useTranslation: () => ({t: key => key})}));

test('blocks input until the scope is ready, then applies the search', () => {
    jest.useFakeTimers();
    const search = jest.fn();
    const view = render(<AlgorithmSearch disabled onSearch={search} />);
    const input = screen.getByRole('textbox', {name: ''});
    expect(input).toBeDisabled();
    view.rerender(<AlgorithmSearch disabled={false} onSearch={search} />);
    expect(input).toBeEnabled();
    fireEvent.change(input, {target: {value: 'Find Shortest Path'}});
    act(() => jest.advanceTimersByTime(200));
    expect(search).toHaveBeenCalledWith('Find Shortest Path');
    view.unmount();
    jest.useRealTimers();
});
