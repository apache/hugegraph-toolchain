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
import GraphAnalysisContext from '../../../../Context';
import {GRAPH_LOAD_STATUS, GRAPH_STATUS} from '../../../../../utils/constants';
import * as api from '../../../../../api';
import KoutVermeer, {isValidKoutMaxSteps} from '.';
import JaccardVermeer from '../JaccardVermeer';

jest.mock('../../AlgorithmPanel', () => ({title, children}) => <div>{title}{children}</div>);
jest.mock('../../AlgorithmNameHeader', () => ({name, handleRunning, isDisabled}) =>
    <button onClick={handleRunning} disabled={isDisabled}>{name}</button>);
jest.mock('../../../../../api', () => ({analysis: {runOlapVermeer: jest.fn()}}));
jest.mock('react-i18next', () => ({...jest.requireActual('react-i18next'),
    useTranslation: () => ({t: key => key})}));

beforeAll(() => {
    window.matchMedia = () => ({matches: false, addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}});
});
beforeEach(() => jest.clearAllMocks());
const renderForm = (Component, name, context = GRAPH_LOAD_STATUS.LOADED) => {
    const completed = jest.fn();
    render(<GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'test', graphStatus: context}}>
        <Component name={name} handleFormSubmit={() => completed} updateCurrentAlgorithm={jest.fn()} />
    </GraphAnalysisContext.Provider>);
    return completed;
};

test('K-out submits the configured source, direction, and bounded steps', async () => {
    api.analysis.runOlapVermeer.mockResolvedValue({status: 200, data: {task_id: -7}});
    const completed = renderForm(KoutVermeer, 'K-out (Vermeer)');
    fireEvent.click(screen.getByRole('button', {name: 'K-out (Vermeer)'}));
    await waitFor(() => expect(api.analysis.runOlapVermeer).toHaveBeenCalledWith('DEFAULT', 'test', {
        'compute.algorithm': 'kout', 'kout.source': '1', 'kout.direction': 'both',
        'compute.max_step': 10, 'compute.parallel': 1,
    }));
    await waitFor(() => expect(completed).toHaveBeenCalledWith(GRAPH_STATUS.SUCCESS, -7, undefined));
});

test('K-out reports a rejected request as failed', async () => {
    api.analysis.runOlapVermeer.mockRejectedValue(new Error('vermeer offline'));
    const completed = renderForm(KoutVermeer, 'K-out (Vermeer)');
    fireEvent.click(screen.getByRole('button', {name: 'K-out (Vermeer)'}));
    await waitFor(() => expect(completed).toHaveBeenCalledWith(
        GRAPH_STATUS.FAILED, '', 'vermeer offline'));
});

test('Jaccard requires a source before it can submit', async () => {
    api.analysis.runOlapVermeer.mockResolvedValue({status: 200, data: {task_id: -8}});
    renderForm(JaccardVermeer, 'Jaccard (Vermeer)');
    expect(screen.getByRole('button', {name: 'Jaccard (Vermeer)'})).toBeDisabled();
    fireEvent.change(screen.getByLabelText('jaccard.source'), {target: {value: '1:marko'}});
    await waitFor(() => expect(screen.getByRole('button', {name: 'Jaccard (Vermeer)'})).toBeEnabled(), {timeout: 5000});
    fireEvent.click(screen.getByRole('button', {name: 'Jaccard (Vermeer)'}));
    await waitFor(() => expect(api.analysis.runOlapVermeer).toHaveBeenCalledWith('DEFAULT', 'test', {
        'compute.algorithm': 'jaccard', 'jaccard.source': '1:marko', 'compute.parallel': 1, 'compute.max_step': 10,
    }));
});

test('K-out max steps prevent uint8 overflow', () => {
    expect(isValidKoutMaxSteps(254)).toBe(true);
    expect(isValidKoutMaxSteps(255)).toBe(false);
    expect(isValidKoutMaxSteps(0)).toBe(false);
    expect(isValidKoutMaxSteps(1.5)).toBe(false);
});
