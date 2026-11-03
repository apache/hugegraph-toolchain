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
import {algorithmFormStorageKey} from '../../algorithmFormPersistence';

jest.mock('antd', () => ({...jest.requireActual('antd'), Select: ({value, onChange, options, ...props}) =>
    <select {...props} value={value} onChange={event => onChange(event.target.value)}>
        {options.map(option => <option key={option.value} value={option.value}>{option.value}</option>)}
    </select>}));
jest.mock('../../AlgorithmPanel', () => ({title, children}) => <div>{title}{children}</div>);
jest.mock('../../AlgorithmNameHeader', () => ({handleRunning, isDisabled}) =>
    <button disabled={isDisabled} onClick={handleRunning}>Run</button>);
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

test('saved property settings must be cleared before a weighted task can run', async () => {
    window.localStorage.clear();
    window.localStorage.setItem(algorithmFormStorageKey('DEFAULT', 'isolated', 'unknown'),
        JSON.stringify({'louvain.edge_weight_property': 'weight'}));
    api.analysis.runOlapVermeer.mockClear().mockResolvedValue({status: 200, data: {task_id: -7}});
    render(<GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'isolated',
        graphStatus: GRAPH_LOAD_STATUS.LOADED}}>
        <AdvancedVermeer kind='louvain_weighted' handleFormSubmit={() => jest.fn()}
            updateCurrentAlgorithm={jest.fn()} />
    </GraphAnalysisContext.Provider>);
    expect(screen.getByText('analysis.algorithm.olap.vermeer_advanced.properties_unavailable')).toBeVisible();
    const input = screen.getByLabelText('louvain.edge_weight_property');
    await waitFor(() => expect(input).toHaveValue('weight'));
    fireEvent.click(screen.getByRole('button', {name: 'Run'}));
    await waitFor(() => expect(screen.getAllByText('analysis.algorithm.olap.vermeer_advanced.properties_unavailable'))
        .toHaveLength(2));
    expect(api.analysis.runOlapVermeer).not.toHaveBeenCalled();
    fireEvent.change(input, {target: {value: ''}});
    await waitFor(() => expect(screen.getAllByText('analysis.algorithm.olap.vermeer_advanced.properties_unavailable'))
        .toHaveLength(1));
    await waitFor(() => expect(screen.getByRole('button', {name: 'Run'})).toBeEnabled());
    fireEvent.click(screen.getByRole('button', {name: 'Run'}));
    await waitFor(() => expect(api.analysis.runOlapVermeer).toHaveBeenCalled());
});

test('saved cycle filters can be cleared and are never sent', async () => {
    window.localStorage.clear();
    window.localStorage.setItem(algorithmFormStorageKey('DEFAULT', 'isolated', 'unknown'), JSON.stringify({
        'filter.vertex_expr': 'age > 1', 'filter.vertex_properties': '["age"]',
    }));
    api.analysis.runOlapVermeer.mockClear().mockResolvedValue({status: 200, data: {task_id: -8}});
    render(<GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'isolated',
        graphStatus: GRAPH_LOAD_STATUS.LOADED}}>
        <AdvancedVermeer kind='cycle_detection' handleFormSubmit={() => jest.fn()}
            updateCurrentAlgorithm={jest.fn()} />
    </GraphAnalysisContext.Provider>);
    const expr = screen.getByLabelText('filter.vertex_expr');
    const properties = screen.getByLabelText('filter.vertex_properties');
    await waitFor(() => expect(expr).toHaveValue('age > 1'));
    fireEvent.click(screen.getByRole('button', {name: 'Run'}));
    await waitFor(() => expect(screen.getByRole('button', {name: 'Run'})).toBeDisabled());
    expect(api.analysis.runOlapVermeer).not.toHaveBeenCalled();
    fireEvent.change(expr, {target: {value: ''}});
    fireEvent.change(properties, {target: {value: '[]'}});
    await waitFor(() => expect(screen.getByRole('button', {name: 'Run'})).toBeEnabled());
    fireEvent.click(screen.getByRole('button', {name: 'Run'}));
    await waitFor(() => expect(api.analysis.runOlapVermeer).toHaveBeenCalled());
    const params = api.analysis.runOlapVermeer.mock.calls[0][2];
    expect(params).not.toHaveProperty('filter.vertex_expr');
    expect(params['filter.vertex_properties']).toBe('[]');
});

test.each([['louvain', 1], ['louvain_weighted', 2]])(
    '%s rejects an intermediate-output step limit', async (kind, value) => {
        window.localStorage.clear();
        api.analysis.runOlapVermeer.mockClear();
        render(<GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'isolated',
            graphStatus: GRAPH_LOAD_STATUS.LOADED}}>
            <AdvancedVermeer kind={kind} handleFormSubmit={() => jest.fn()}
                updateCurrentAlgorithm={jest.fn()} />
        </GraphAnalysisContext.Provider>);
        fireEvent.change(screen.getByLabelText('compute.max_step'), {target: {value: String(value)}});
        fireEvent.click(screen.getByRole('button', {name: 'Run'}));
        await waitFor(() => expect(screen.getByRole('button', {name: 'Run'})).toBeDisabled());
        expect(api.analysis.runOlapVermeer).not.toHaveBeenCalled();
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
    await waitFor(() => expect(screen.getByRole('button', {name: 'Run'})).toBeDisabled());
    fireEvent.change(screen.getByRole('combobox'), {target: {value: mode}});
    if (mode === 'all') {
        expect(await screen.findByText('analysis.algorithm.olap.vermeer_advanced.all_warning')).toBeVisible();
    }
    await waitFor(() => expect(screen.queryByLabelText('cycle.max_cycles')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', {name: 'Run'})).toBeEnabled());
    fireEvent.click(screen.getByRole('button', {name: 'Run'}));
    await waitFor(() => expect(api.analysis.runOlapVermeer).toHaveBeenCalled());
    const params = api.analysis.runOlapVermeer.mock.calls[0][2];
    expect(params['cycle.mode']).toBe(mode);
    expect(params).not.toHaveProperty('cycle.max_cycles');
});
