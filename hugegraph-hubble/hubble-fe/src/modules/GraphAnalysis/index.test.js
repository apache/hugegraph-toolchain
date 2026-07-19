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

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import GraphAnalysisHome from './index';
import * as api from '../../api';

jest.mock('../../api', () => ({
    analysis: {
        getOlapMode: jest.fn(),
        switchOlapMode: jest.fn(),
    },
    auth: {
        getVermeer: jest.fn(),
    },
}));
jest.mock('../analysis/Home', () => () => <div>analysis module</div>);
jest.mock('../algorithm/Home', () => () => <div>algorithm module</div>);
jest.mock('../asyncTasks/Home', () => () => <div>async module</div>);
jest.mock('../component/TopBar', () => props => (
    <div>
        <button onClick={() => props.onGraphInfoChange('DEFAULT', {name: 'g'})}>
            select graph
        </button>
        <button onClick={() => props.onGraphInfoChange('A', {name: 'graph-a'})}>
            select A
        </button>
        <button onClick={() => props.onGraphInfoChange('B', {name: 'graph-b'})}>
            select B
        </button>
        <button onClick={() => props.onOlapModeChange(true)}>toggle olap</button>
        <span>{props.isOlapModeLoading ? 'olap loading' : 'olap idle'}</span>
        <span>{props.isOlapModeEnable ? 'olap on' : 'olap off'}</span>
    </div>
));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

beforeEach(() => {
    jest.clearAllMocks();
    api.auth.getVermeer.mockResolvedValue({status: 200, data: {enable: false}});
    api.analysis.getOlapMode.mockResolvedValue({status: 200, data: {status: '1'}});
    api.analysis.switchOlapMode.mockResolvedValue({status: 200});
});

const deferred = () => {
    let resolve;
    const promise = new Promise(done => {
        resolve = done;
    });
    return {promise, resolve};
};

it('recovers an optional Vermeer capability request without blocking the route', async () => {
    api.auth.getVermeer
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({status: 200, data: {enable: false}});

    render(<GraphAnalysisHome moduleName='gremlin' />);

    expect(screen.getByText('analysis module')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', {
        name: 'analysis.topbar.retry_vermeer',
    }));

    await waitFor(() => expect(api.auth.getVermeer).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(
        'analysis.topbar.get_vermeer_failed'
    )).not.toBeInTheDocument());
});

it('does not choose an algorithm execution path until Vermeer is known', async () => {
    api.auth.getVermeer
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({status: 200, data: {enable: false}});

    render(<GraphAnalysisHome moduleName='algorithms' />);

    await screen.findByRole('button', {name: 'analysis.topbar.retry_vermeer'});
    expect(screen.queryByText('algorithm module')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {
        name: 'analysis.topbar.retry_vermeer',
    }));

    expect(await screen.findByText('algorithm module')).toBeInTheDocument();
});

it('shows the algorithm usage guide beside only the algorithm page title', async () => {
    const algorithm = render(<GraphAnalysisHome moduleName='algorithms' />);
    expect(await screen.findByText('analysis.algorithm.guide')).toBeInTheDocument();
    await screen.findByText('algorithm module');
    algorithm.unmount();

    render(<GraphAnalysisHome moduleName='gremlin' />);
    expect(screen.queryByText('analysis.algorithm.guide')).not.toBeInTheDocument();
    await act(async () => Promise.resolve());
});

it('settles a rejected OLAP status request and retries in place', async () => {
    api.analysis.getOlapMode
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({status: 200, data: {status: '0'}});

    render(<GraphAnalysisHome moduleName='gremlin' />);
    fireEvent.click(screen.getByRole('button', {name: 'select graph'}));

    const retry = await screen.findByRole('button', {
        name: 'analysis.topbar.retry_olap',
    });
    expect(screen.getByText('olap idle')).toBeInTheDocument();
    fireEvent.click(retry);

    await waitFor(() => expect(api.analysis.getOlapMode).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('olap on')).toBeInTheDocument());
});

it('settles a rejected OLAP switch and preserves the previous mode', async () => {
    api.analysis.switchOlapMode.mockRejectedValueOnce(new Error('offline'));

    render(<GraphAnalysisHome moduleName='gremlin' />);
    fireEvent.click(screen.getByRole('button', {name: 'toggle olap'}));

    await screen.findByRole('button', {name: 'analysis.topbar.retry_olap'});
    expect(screen.getByText('olap idle')).toBeInTheDocument();
    expect(screen.getByText('olap off')).toBeInTheDocument();
});

it('ignores a late OLAP response after the selected graph changes', async () => {
    const oldMode = deferred();
    const newMode = deferred();
    api.analysis.getOlapMode.mockImplementation((graphSpace, graph) => (
        graph === 'graph-a' ? oldMode.promise : newMode.promise
    ));

    render(<GraphAnalysisHome moduleName='gremlin' />);
    fireEvent.click(screen.getByRole('button', {name: 'select A'}));
    fireEvent.click(screen.getByRole('button', {name: 'select B'}));

    await act(async () => newMode.resolve({status: 200, data: {status: '0'}}));
    await waitFor(() => expect(screen.getByText('olap on')).toBeInTheDocument());

    await act(async () => oldMode.resolve({status: 200, data: {status: '1'}}));
    expect(screen.getByText('olap on')).toBeInTheDocument();
    expect(screen.getByText('olap idle')).toBeInTheDocument();
});
