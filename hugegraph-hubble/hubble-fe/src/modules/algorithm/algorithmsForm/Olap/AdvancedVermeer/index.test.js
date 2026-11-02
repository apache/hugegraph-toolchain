/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
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
import AdvancedVermeer, {validFilterPair} from '.';
import GraphAnalysisContext from '../../../../Context';
import * as api from '../../../../../api';
import {GRAPH_LOAD_STATUS, GRAPH_STATUS} from '../../../../../utils/constants';

const mockFields = {};
jest.mock('../../PersistentForm', () => {
    const Form = ({children, onFinish}) => <form aria-label='algorithm' onSubmit={event => {
        event.preventDefault();
        onFinish(mockFields);
    }}>{children}</form>;
    Form.Item = ({children, label, initialValue}) => <div>{label}:{String(initialValue)}{children}</div>;
    Form.useWatch = () => 'limit';
    Form.useForm = () => [{submit: jest.fn(), validateFields: jest.fn(() => Promise.resolve()),
        getFieldValue: jest.fn(() => 0)}];
    return Form;
});
jest.mock('../../AlgorithmPanel', () => ({title, children}) => <div>{title}{children}</div>);
jest.mock('../../AlgorithmNameHeader', () => ({name}) => <div>{name}</div>);
jest.mock('../../../../../api', () => ({analysis: {runOlapVermeer: jest.fn()}}));
jest.mock('react-i18next', () => ({...jest.requireActual('react-i18next'),
    useTranslation: () => ({t: key => key})}));

beforeEach(() => { jest.clearAllMocks(); Object.keys(mockFields).forEach(key => delete mockFields[key]); });

test.each(['cycle_detection', 'louvain', 'louvain_weighted'])(
    'submits %s with its own exact parameter keys', async kind => {
        Object.assign(mockFields, kind === 'cycle_detection'
            ? {'cycle.mode': 'limit', 'cycle.max_cycles': 10}
            : {'louvain.step': 10, 'louvain.resolution': 1});
        api.analysis.runOlapVermeer.mockResolvedValue({status: 200, data: {task_id: -7}});
        const complete = jest.fn();
        render(<GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'isolated',
            graphStatus: GRAPH_LOAD_STATUS.LOADED}}>
            <AdvancedVermeer kind={kind} handleFormSubmit={() => complete} updateCurrentAlgorithm={jest.fn()} />
        </GraphAnalysisContext.Provider>);
        fireEvent.submit(screen.getByRole('form', {name: 'algorithm'}));
        await waitFor(() => expect(api.analysis.runOlapVermeer).toHaveBeenCalledWith(
            'DEFAULT', 'isolated', expect.objectContaining({'compute.algorithm': kind, ...mockFields})));
        await waitFor(() => expect(complete).toHaveBeenCalledWith(GRAPH_STATUS.SUCCESS, -7, undefined));
    }
);

test('filter expression and loaded property list must be supplied together', () => {
    expect(validFilterPair('', '[]')).toBe(true);
    expect(validFilterPair('age > 1', '["age"]')).toBe(true);
    expect(validFilterPair('age > 1', '[]')).toBe(false);
    expect(validFilterPair('', '["age"]')).toBe(false);
    expect(validFilterPair('x', '[1]')).toBe(false);
    expect(validFilterPair('x', 'not-json')).toBe(false);
});
