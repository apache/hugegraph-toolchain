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

import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {EditPropertyLayer} from './EditLayer';
import * as api from '../../../api';

jest.mock('react-i18next', () => ({
    initReactI18next: {type: '3rdParty', init: jest.fn()},
    useTranslation: () => ({t: key => key}),
}));

jest.mock('../../../api', () => ({
    manage: {addMetaProperty: jest.fn()},
}));

beforeEach(() => {
    jest.clearAllMocks();
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    }));
});

test('lays out the short property form with a full-width name and paired selects', () => {
    render(
        <EditPropertyLayer
            visible
            onCancle={jest.fn()}
            graphspace='DEFAULT'
            graph='hugegraph'
            refresh={jest.fn()}
        />
    );

    const form = document.querySelector('.property-create-form');
    expect(form).toHaveClass('ant-form-vertical');
    expect(form.querySelector('.property-create-form__name input'))
        .toHaveAttribute('placeholder', 'schema.property.form.name_placeholder');
    expect(form.querySelectorAll('.property-create-form__select-row .ant-form-item'))
        .toHaveLength(2);
    expect(screen.getByLabelText(
        'schema.property.form.name: schema.property.form.name_help'
    )).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'schema.property.create'}))
        .toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'common.action.cancel'}))
        .toBeInTheDocument();
});

test('ends submit feedback and keeps the modal open when creation rejects', async () => {
    api.manage.addMetaProperty.mockRejectedValue({
        config: {suppressBusinessErrorToast: true},
        response: {
            status: 409,
            data: {status: 409, message: 'Property already exists'},
        },
    });
    const onCancle = jest.fn();

    render(
        <EditPropertyLayer
            visible
            onCancle={onCancle}
            graphspace='DEFAULT'
            graph='hugegraph'
            refresh={jest.fn()}
        />
    );

    await userEvent.type(
        screen.getByPlaceholderText('schema.property.form.name_placeholder'),
        'name'
    );
    fireEvent.click(screen.getByRole('button', {name: 'schema.property.create'}));

    await waitFor(() => expect(api.manage.addMetaProperty).toHaveBeenCalledWith(
        'DEFAULT',
        'hugegraph',
        {name: 'name', data_type: 'TEXT', cardinality: 'SINGLE'},
        {suppressBusinessErrorToast: true}
    ));
    await waitFor(() => expect(screen.getByRole('button', {
        name: 'schema.property.create',
    })).not.toHaveClass('ant-btn-loading'));
    expect(await screen.findByText('Property already exists')).toBeInTheDocument();
    expect(screen.getAllByText('Property already exists')).toHaveLength(1);
    expect(onCancle).not.toHaveBeenCalled();
});

test('keeps required-field validation inline without starting a request', async () => {
    render(
        <EditPropertyLayer
            visible
            onCancle={jest.fn()}
            graphspace='DEFAULT'
            graph='hugegraph'
            refresh={jest.fn()}
        />
    );

    fireEvent.click(screen.getByRole('button', {name: 'schema.property.create'}));

    await waitFor(() => expect(document.querySelector(
        '.property-create-form .ant-form-item-explain-error'
    )).toBeInTheDocument());
    expect(api.manage.addMetaProperty).not.toHaveBeenCalled();
});
