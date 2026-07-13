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

import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import VertexForm from './Vertex';
import EdgeForm from './Edge';
import {completeRowsRule, duplicateSourceRule} from './mappingRules';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
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

it('accepts complete property/value rows and rejects duplicate source fields', async () => {
    const t = key => key;

    await expect(completeRowsRule(t, ['key', 'val'], 'property').validator(null, [
        {key: 'person_name', val: 'name'},
    ])).resolves.toBeUndefined();
    await expect(completeRowsRule(t, ['key', 'origin', 'replace'], 'value')
        .validator(null, [
            {key: 'status', origin: 'A', replace: 'active'},
        ])).resolves.toBeUndefined();
    await expect(duplicateSourceRule(t).validator(null, [
        {key: 'person_name', val: 'name'},
        {key: 'person_name', val: 'display_name'},
    ])).rejects.toThrow('task.edit.duplicate_property');
});

it('does not submit a vertex drawer with a half-filled property mapping row', async () => {
    const onCancel = jest.fn();
    render(
        <VertexForm
            open
            onCancel={onCancel}
            sourceField={[]}
            targetField={['person_name']}
            vertexList={[]}
            index={-1}
        />
    );

    fireEvent.click(screen.getAllByRole('button', {name: '+common.action.add'})[0]);
    fireEvent.click(screen.getByRole('button', {name: 'common.action.confirm'}));

    expect(await screen.findByText('task.edit.incomplete_property_mapping'))
        .toBeInTheDocument();
    await waitFor(() => expect(onCancel).not.toHaveBeenCalled());
});

it('does not submit an edge drawer with a half-filled value mapping row', async () => {
    const onCancel = jest.fn();
    render(
        <EdgeForm
            open
            onCancel={onCancel}
            sourceField={[]}
            targetField={['status']}
            edgeList={[]}
            index={-1}
        />
    );

    fireEvent.click(screen.getAllByRole('button', {name: '+common.action.add'})[1]);
    fireEvent.click(screen.getByRole('button', {name: 'common.action.confirm'}));

    expect(await screen.findByText('task.edit.incomplete_value_mapping'))
        .toBeInTheDocument();
    await waitFor(() => expect(onCancel).not.toHaveBeenCalled());
});
