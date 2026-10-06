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

import {Form} from 'antd';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import FieldForm from './index';
import * as api from '../../../api';

jest.mock('../../../api', () => ({manage: {getDatasourceSchema: jest.fn()}}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, options) => (key === 'task.edit.delete_field'
            ? `Delete field ${options.field}` : key),
    }),
    initReactI18next: {type: '3rdParty', init: jest.fn()},
}));

beforeEach(() => {
    jest.clearAllMocks();
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
    api.manage.getDatasourceSchema.mockResolvedValue({
        status: 200,
        data: ['name'],
    });
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

it('focuses a visible error until at least one source field is selected', async () => {
    const onFormFinish = jest.fn();
    render(
        <Form.Provider onFormFinish={onFormFinish}>
            <FieldForm visible prev={jest.fn()} datasourceID='9' />
        </Form.Provider>
    );

    expect(await screen.findByText('name')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'common.action.next'}));

    const errorMessage = await screen.findByText('task.edit.select_source_fields');
    const error = errorMessage.closest('[role="alert"]');
    await waitFor(() => expect(error.parentElement).toHaveFocus());
    expect(onFormFinish).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tree')
        .querySelector('.ant-tree-checkbox'));
    const move = document.querySelector('.ant-transfer-operation button');
    fireEvent.click(move);

    await waitFor(() => expect(
        screen.queryByText('task.edit.select_source_fields')
    ).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', {name: 'common.action.next'}));
    await waitFor(() => expect(onFormFinish).toHaveBeenCalledWith(
        'field_form',
        expect.objectContaining({
            values: expect.objectContaining({target_keys: ['name']}),
        })
    ));
});

it('clears the selection error before entering with a different data source', async () => {
    api.manage.getDatasourceSchema.mockImplementation(id => Promise.resolve({
        status: 200,
        data: [id === 'A' ? 'old_name' : 'new_name'],
    }));
    const onFormFinish = jest.fn();
    let fieldForm;
    const onFormChange = jest.fn((name, {forms}) => {
        if (name === 'field_form') {
            fieldForm = forms.field_form;
        }
    });
    const view = datasourceID => (
        <Form.Provider onFormFinish={onFormFinish} onFormChange={onFormChange}>
            <FieldForm visible prev={jest.fn()} datasourceID={datasourceID} />
        </Form.Provider>
    );
    const {rerender} = render(view('A'));

    expect(await screen.findByText('old_name')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'common.action.next'}));
    const oldError = await screen.findByText('task.edit.select_source_fields');
    await waitFor(() => expect(
        oldError.closest('[role="alert"]').parentElement
    ).toHaveFocus());
    expect(fieldForm.getFieldError('target_keys')).toEqual(['task.edit.select_source_fields']);

    rerender(
        <Form.Provider onFormFinish={onFormFinish} onFormChange={onFormChange}>
            <FieldForm visible={false} prev={jest.fn()} datasourceID='A' />
        </Form.Provider>
    );
    rerender(view('B'));

    expect(await screen.findByText('new_name')).toBeInTheDocument();
    await waitFor(() => expect(
        screen.queryByText('task.edit.select_source_fields')
    ).not.toBeInTheDocument());
    expect(fieldForm.getFieldError('target_keys')).toEqual([]);
    expect(document.querySelector('.ant-transfer')).not.toHaveClass(
        'ant-transfer-status-error'
    );
    expect(document.activeElement).not.toBe(oldError.parentElement);
    expect(onFormFinish).not.toHaveBeenCalled();
});
