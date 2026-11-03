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
import DepthSlpaVermeer from '.';
import GraphAnalysisContext from '../../../../Context';
import * as api from '../../../../../api';
import {GRAPH_LOAD_STATUS} from '../../../../../utils/constants';

jest.mock('../../AlgorithmPanel', () => ({title, children}) => <div>{title}{children}</div>);
jest.mock('../../AlgorithmNameHeader', () => ({handleRunning, isDisabled}) =>
    <button disabled={isDisabled} onClick={handleRunning}>Run</button>);
jest.mock('../../../../../api', () => ({analysis: {runOlapVermeer: jest.fn()}}));
jest.mock('react-i18next', () => ({...jest.requireActual('react-i18next'),
    useTranslation: () => ({t: key => key})}));

window.matchMedia = () => ({matches: false, addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}});

test('SLPA rejects zero but accepts -1 and positive label counts', async () => {
    window.localStorage.clear();
    api.analysis.runOlapVermeer.mockResolvedValue({status: 200, data: {task_id: -7}});
    render(<GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'isolated',
        graphStatus: GRAPH_LOAD_STATUS.LOADED}}>
        <DepthSlpaVermeer kind='slpa' handleFormSubmit={() => jest.fn()}
            updateCurrentAlgorithm={jest.fn()} />
    </GraphAnalysisContext.Provider>);
    const input = screen.getByLabelText('slpa.k');
    fireEvent.change(input, {target: {value: '0'}});
    fireEvent.click(screen.getByRole('button', {name: 'Run'}));
    await waitFor(() => expect(screen.getByText('analysis.algorithm.olap.slpa_vermeer.k_invalid')).toBeVisible());
    expect(api.analysis.runOlapVermeer).not.toHaveBeenCalled();
    fireEvent.change(input, {target: {value: '-1'}});
    await waitFor(() => expect(screen.getByRole('button', {name: 'Run'})).toBeEnabled());
    fireEvent.click(screen.getByRole('button', {name: 'Run'}));
    await waitFor(() => expect(api.analysis.runOlapVermeer).toHaveBeenCalledWith(
        'DEFAULT', 'isolated', expect.objectContaining({'slpa.k': -1})));
});
