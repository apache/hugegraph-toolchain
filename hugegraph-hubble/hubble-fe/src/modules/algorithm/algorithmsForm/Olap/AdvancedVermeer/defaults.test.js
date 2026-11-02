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
import AdvancedVermeer from '.';
import GraphAnalysisContext from '../../../../Context';
import * as api from '../../../../../api';
import {GRAPH_LOAD_STATUS} from '../../../../../utils/constants';

jest.mock('antd', () => ({...jest.requireActual('antd'), Select: ({value, onChange, options, ...props}) =>
    <select {...props} value={value} onChange={event => onChange(event.target.value)}>
        {options.map(option => <option key={option.value} value={option.value}>{option.value}</option>)}
    </select>}));
jest.mock('../../AlgorithmPanel', () => ({title, children}) => <div>{title}{children}</div>);
jest.mock('../../AlgorithmNameHeader', () => ({handleRunning}) => <button onClick={handleRunning}>Run</button>);
jest.mock('../../../../../api', () => ({analysis: {runOlapVermeer: jest.fn()}}));
jest.mock('react-i18next', () => ({...jest.requireActual('react-i18next'),
    useTranslation: () => ({t: key => key})}));

window.matchMedia = () => ({matches: false, addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}});

test('cycle submits bounded limit mode by default', async () => {
    window.localStorage.clear();
    api.analysis.runOlapVermeer.mockResolvedValue({status: 200, data: {task_id: -7}});
    render(<GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'isolated',
        graphStatus: GRAPH_LOAD_STATUS.LOADED}}>
        <AdvancedVermeer kind='cycle_detection' handleFormSubmit={() => jest.fn()}
            updateCurrentAlgorithm={jest.fn()} />
    </GraphAnalysisContext.Provider>);
    fireEvent.click(screen.getByRole('button', {name: 'Run'}));
    await waitFor(() => expect(api.analysis.runOlapVermeer).toHaveBeenCalledWith(
        'DEFAULT', 'isolated', expect.objectContaining({'compute.algorithm': 'cycle_detection',
            'cycle.mode': 'limit', 'cycle.max_cycles': 10, 'cycle.max_length': 5})));
});

test.each(['all', 'boolean'])('%s ignores an invalid per-vertex limit after switching', async mode => {
    window.localStorage.clear();
    api.analysis.runOlapVermeer.mockClear().mockResolvedValue({status: 200, data: {task_id: -8}});
    render(<GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'isolated',
        graphStatus: GRAPH_LOAD_STATUS.LOADED}}>
        <AdvancedVermeer kind='cycle_detection' handleFormSubmit={() => jest.fn()}
            updateCurrentAlgorithm={jest.fn()} />
    </GraphAnalysisContext.Provider>);
    fireEvent.change(screen.getByLabelText('cycle.max_cycles'), {target: {value: '0'}});
    fireEvent.change(screen.getByRole('combobox'), {target: {value: mode}});
    if (mode === 'all') {
        expect(await screen.findByText('analysis.algorithm.olap.vermeer_advanced.all_warning')).toBeVisible();
    }
    await waitFor(() => expect(screen.queryByLabelText('cycle.max_cycles')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', {name: 'Run'}));
    await waitFor(() => expect(api.analysis.runOlapVermeer).toHaveBeenCalled());
    const params = api.analysis.runOlapVermeer.mock.calls[0][2];
    expect(params['cycle.mode']).toBe(mode);
    expect(params).not.toHaveProperty('cycle.max_cycles');
});
