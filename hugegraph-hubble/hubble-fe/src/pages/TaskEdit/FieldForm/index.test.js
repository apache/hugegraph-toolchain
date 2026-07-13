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
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {fireEvent, render, screen} from '@testing-library/react';
import FieldForm from './index';

jest.mock('../../../api', () => ({manage: {getDatasourceSchema: jest.fn()}}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, options) => (key === 'task.edit.delete_field'
            ? `Delete field ${options.field}` : key),
    }),
    initReactI18next: {type: '3rdParty', init: jest.fn()},
}));

beforeEach(() => {
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

it('exposes custom source-field deletion as a named keyboard-focusable button', () => {
    render(<FieldForm visible prev={jest.fn()} datasourceID='' />);

    fireEvent.change(screen.getByPlaceholderText('task.edit.add_field_placeholder'), {
        target: {value: 'customer_id'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'task.edit.add_field'}));

    const remove = screen.getByRole('button', {name: 'Delete field customer_id'});
    expect(remove).toHaveAttribute('type', 'button');
    expect(remove).toHaveAttribute('title', 'Delete field customer_id');
});
