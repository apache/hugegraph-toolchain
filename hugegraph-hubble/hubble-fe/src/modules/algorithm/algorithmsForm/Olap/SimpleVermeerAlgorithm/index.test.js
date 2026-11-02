/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0 (the
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
import SimpleVermeerAlgorithm from '.';
import GraphAnalysisContext from '../../../../Context';
import * as api from '../../../../../api';
import {GRAPH_LOAD_STATUS, GRAPH_STATUS} from '../../../../../utils/constants';

jest.mock('../../PersistentForm', () => {
    const Form = ({children, onFinish}) => <form aria-label='algorithm' onSubmit={event => {
        event.preventDefault();
        onFinish({'compute.parallel': 1, 'compute.max_step': 200});
    }}>{children}</form>;
    Form.Item = ({children}) => <div>{children}</div>;
    Form.useForm = () => [{submit: jest.fn(), validateFields: jest.fn(() => Promise.resolve())}];
    return Form;
});
jest.mock('../../AlgorithmPanel', () => ({title, children}) => <div>{title}{children}</div>);
jest.mock('../../AlgorithmNameHeader', () => ({name}) => <div>{name}</div>);
jest.mock('../../../../../api', () => ({analysis: {runOlapVermeer: jest.fn()}}));
jest.mock('react-i18next', () => ({...jest.requireActual('react-i18next'),
    useTranslation: () => ({t: key => key})}));

beforeEach(() => jest.clearAllMocks());

const renderAlgorithm = kind => {
    const complete = jest.fn();
    render(<GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'isolated',
        graphStatus: GRAPH_LOAD_STATUS.LOADED}}>
        <SimpleVermeerAlgorithm kind={kind} handleFormSubmit={() => complete}
            updateCurrentAlgorithm={jest.fn()} />
    </GraphAnalysisContext.Provider>);
    return complete;
};

test.each(['scc', 'clustering_coefficient'])('submits %s to Vermeer and returns its task ID', async kind => {
    api.analysis.runOlapVermeer.mockResolvedValue({status: 200, data: {task_id: -7}});
    const complete = renderAlgorithm(kind);
    fireEvent.submit(screen.getByRole('form', {name: 'algorithm'}));
    await waitFor(() => expect(api.analysis.runOlapVermeer).toHaveBeenCalledWith(
        'DEFAULT', 'isolated', expect.objectContaining({'compute.algorithm': kind})));
    await waitFor(() => expect(complete).toHaveBeenCalledWith(GRAPH_STATUS.SUCCESS, -7, undefined));
});

test.each(['scc', 'clustering_coefficient'])('reports a rejected %s request as failed', async kind => {
    api.analysis.runOlapVermeer.mockRejectedValue(new Error('vermeer offline'));
    const complete = renderAlgorithm(kind);
    fireEvent.submit(screen.getByRole('form', {name: 'algorithm'}));
    await waitFor(() => expect(complete).toHaveBeenCalledWith(
        GRAPH_STATUS.FAILED, '', 'vermeer offline'));
});
