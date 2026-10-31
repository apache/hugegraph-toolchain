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
jest.mock('../analysis/Home', () => ({toolbarExtra}) => <div>analysis module{toolbarExtra}</div>);
jest.mock('../algorithm/Home', () => function MockAlgorithmHome({onEngineChange}) {
    const {useContext} = require('react');
    const Context = require('../Context').default;
    const {isVermeer, vermeerError, retryVermeer} = useContext(Context);
    return <div>algorithm module<span>{isVermeer ? 'Vermeer enabled' : 'Vermeer disabled'}</span>
        {vermeerError && <button onClick={retryVermeer}>analysis.topbar.retry_vermeer</button>}
        <button onClick={() => onEngineChange('olap')}>choose OLAP</button>
        <button onClick={() => onEngineChange('oltp')}>choose OLTP</button></div>;
});
jest.mock('../asyncTasks/Home', () => function MockAsyncTaskHome() {
    const {useContext} = require('react');
    const Context = require('../Context').default;
    const {vermeerReady, retryVermeer} = useContext(Context);
    return <div>async module<span>{vermeerReady ? 'engine known' : 'engine pending'}</span>
        <button onClick={retryVermeer}>retry engine</button></div>;
});
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
        {props.showGraphLoad && <span>graph load entry</span>}
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

it('opens the OLAP loading entry when the navigation requests graph compute', async () => {
    render(<GraphAnalysisHome moduleName='algorithms' initialAlgorithmEngine='olap' />);
    expect(screen.getByText('graph load entry')).toBeVisible();
    fireEvent.click(screen.getByRole('button', {name: 'choose OLTP'}));
    expect(screen.queryByText('graph load entry')).not.toBeInTheDocument();
    await act(async () => Promise.resolve());
});

it('keeps the algorithm page mounted while Vermeer is pending, unavailable and recovering', async () => {
    const pending = deferred();
    const retry = deferred();
    api.auth.getVermeer
        .mockReturnValueOnce(pending.promise)
        .mockRejectedValueOnce(new Error('offline'))
        .mockReturnValueOnce(retry.promise);

    render(<GraphAnalysisHome moduleName='algorithms' />);
    const algorithm = screen.getByText('algorithm module');
    expect(algorithm).toBeVisible();

    await act(async () => pending.resolve({status: 503}));
    await screen.findByRole('button', {name: 'analysis.topbar.retry_vermeer'});
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('algorithm module')).toBe(algorithm);
    fireEvent.click(screen.getByRole('button', {
        name: 'analysis.topbar.retry_vermeer',
    }));
    await screen.findByRole('button', {name: 'analysis.topbar.retry_vermeer'});
    expect(screen.getByText('algorithm module')).toBe(algorithm);
    expect(screen.getByText('Vermeer disabled')).toBeVisible();
    fireEvent.click(screen.getByRole('button', {
        name: 'analysis.topbar.retry_vermeer',
    }));
    expect(screen.getByText('algorithm module')).toBe(algorithm);

    await act(async () => retry.resolve({status: 200, data: {enable: true}}));
    expect(screen.getByText('Vermeer enabled')).toBeVisible();
    expect(screen.getByText('algorithm module')).toBe(algorithm);
});

it('keeps task discovery available while engine-dependent filters await capability discovery', async () => {
    const capability = deferred();
    api.auth.getVermeer.mockReturnValue(capability.promise);

    render(<GraphAnalysisHome moduleName='asyncTasks' />);
    expect(screen.getByText('async module')).toBeVisible();
    expect(screen.getByText('engine pending')).toBeVisible();

    await act(async () => capability.resolve({status: 200, data: {enable: true}}));
    expect(screen.getByText('async module')).toBeVisible();
    expect(screen.getByText('engine known')).toBeVisible();
});

it.each([{}, {enable: null}, {enable: 'false'}, {enable: false, error: true}])(
    'does not confirm malformed or failed engine discovery: %j', async data => {
        api.auth.getVermeer.mockResolvedValue({status: 200, data});
        render(<GraphAnalysisHome moduleName='asyncTasks' />);
        await screen.findByRole('button', {name: 'analysis.topbar.retry_vermeer'});
        expect(screen.getByText('engine pending')).toBeVisible();
        expect(screen.queryByText('engine known')).not.toBeInTheDocument();
    }
);

it('does not offer a confirmed fallback while a worker is awaiting automatic rediscovery', async () => {
    jest.useFakeTimers();
    try {
        api.auth.getVermeer
            .mockResolvedValueOnce({status: 200, data: {enable: false, retryable: true}})
            .mockResolvedValueOnce({status: 200, data: {enable: true}});
        render(<GraphAnalysisHome moduleName='asyncTasks' />);
        await act(async () => Promise.resolve());
        expect(screen.getByText('engine pending')).toBeVisible();
        await act(async () => jest.advanceTimersByTimeAsync(5000));
        expect(screen.getByText('engine known')).toBeVisible();
        expect(api.auth.getVermeer).toHaveBeenCalledTimes(2);
    }
    finally {
        jest.useRealTimers();
    }
});

it('withdraws a confirmed fallback while a manual discovery request is pending', async () => {
    const retry = deferred();
    api.auth.getVermeer
        .mockResolvedValueOnce({status: 200, data: {enable: false}})
        .mockReturnValueOnce(retry.promise);
    render(<GraphAnalysisHome moduleName='asyncTasks' />);
    expect(await screen.findByText('engine known')).toBeVisible();
    fireEvent.click(screen.getByRole('button', {name: 'retry engine'}));
    expect(screen.getByText('engine pending')).toBeVisible();
    await act(async () => retry.resolve({status: 200, data: {enable: true}}));
    expect(screen.getByText('engine known')).toBeVisible();
});

it('leaves algorithm guidance to the canvas instead of repeating it in the page header', async () => {
    const algorithm = render(<GraphAnalysisHome moduleName='algorithms' />);
    await screen.findByText('algorithm module');
    expect(screen.queryByText('analysis.algorithm.guide')).not.toBeInTheDocument();
    algorithm.unmount();

    render(<GraphAnalysisHome moduleName='gremlin' />);
    expect(screen.queryByText('analysis.algorithm.guide')).not.toBeInTheDocument();
    expect(screen.queryByText('analysis.query.name')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'toggle olap'})).toBeInTheDocument();
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


it('discovers a Worker that starts after mount without reloading the page', async () => {
    jest.useFakeTimers();
    try {
        api.auth.getVermeer
            .mockResolvedValueOnce({status: 200, data: {enable: false, retryable: true}})
            .mockResolvedValue({status: 200, data: {enable: true, retryable: false}});
        const view = render(<GraphAnalysisHome moduleName='algorithms' />);
        await act(async () => {});
        expect(screen.getByText('Vermeer disabled')).toBeInTheDocument();
        await act(async () => jest.advanceTimersByTime(5000));
        expect(screen.getByText('Vermeer enabled')).toBeInTheDocument();
        const count = api.auth.getVermeer.mock.calls.length;
        await act(async () => jest.advanceTimersByTime(15000));
        expect(api.auth.getVermeer).toHaveBeenCalledTimes(count);
        view.unmount();
    }
    finally {
        jest.useRealTimers();
    }
});

it('cancels transient discovery on unmount and does not poll disabled capability', async () => {
    jest.useFakeTimers();
    try {
        api.auth.getVermeer.mockResolvedValue({status: 200, data: {enable: false, retryable: true}});
        const waiting = render(<GraphAnalysisHome moduleName='gremlin' />);
        await act(async () => {});
        waiting.unmount();
        await act(async () => jest.advanceTimersByTime(10000));
        expect(api.auth.getVermeer).toHaveBeenCalledTimes(1);
        api.auth.getVermeer.mockResolvedValue({status: 200, data: {enable: false, retryable: false}});
        const disabled = render(<GraphAnalysisHome moduleName='gremlin' />);
        await act(async () => {});
        await act(async () => jest.advanceTimersByTime(10000));
        expect(api.auth.getVermeer).toHaveBeenCalledTimes(2);
        disabled.unmount();
    }
    finally {
        jest.useRealTimers();
    }
});

it('keeps Server algorithms available and manually retries a non-retryable Vermeer configuration error', async () => {
    jest.useFakeTimers();
    api.auth.getVermeer
        .mockResolvedValueOnce({status: 200, data: {enable: false, retryable: false, error: true}})
        .mockResolvedValue({status: 200, data: {enable: true, retryable: false, error: false}});
    const view = render(<GraphAnalysisHome moduleName='algorithms' />);
    try {
        await act(async () => {});
        expect(screen.getByText('algorithm module')).toBeVisible();
        expect(screen.getByText('Vermeer disabled')).toBeVisible();
        expect(screen.queryByText('analysis.topbar.get_vermeer_failed')).not.toBeInTheDocument();
        const retry = screen.getByRole('button', {name: 'analysis.topbar.retry_vermeer'});
        await act(async () => jest.advanceTimersByTime(15000));
        expect(api.auth.getVermeer).toHaveBeenCalledTimes(1);
        fireEvent.click(retry);
        await act(async () => {});
        expect(api.auth.getVermeer).toHaveBeenCalledTimes(2);
        expect(screen.getByText('algorithm module')).toBeVisible();
        expect(screen.getByText('Vermeer enabled')).toBeVisible();
        expect(screen.queryByText('analysis.topbar.get_vermeer_failed')).not.toBeInTheDocument();
        await act(async () => jest.advanceTimersByTime(15000));
        expect(api.auth.getVermeer).toHaveBeenCalledTimes(2);
    }
    finally {
        view.unmount();
        jest.useRealTimers();
    }
});

it('keeps Server tasks visible after a known Vermeer configuration error', async () => {
    api.auth.getVermeer.mockResolvedValue({
        status: 200, data: {enable: false, retryable: false, error: true},
    });
    render(<GraphAnalysisHome moduleName='asyncTasks' />);
    await act(async () => {});
    expect(screen.getByText('async module')).toBeVisible();
    expect(screen.getByText('analysis.topbar.get_vermeer_failed')).toBeVisible();
    expect(screen.getByRole('button', {name: 'analysis.topbar.retry_vermeer'})).toBeEnabled();
});

it('shows submitted-task feedback while optional Vermeer discovery is still pending', async () => {
    const discovery = deferred();
    api.auth.getVermeer.mockReturnValue(discovery.promise);
    render(<GraphAnalysisHome moduleName='asyncTasks' />);
    expect(screen.getByText('async module')).toBeVisible();
    await act(async () => discovery.resolve({status: 200, data: {enable: false}}));
    expect(screen.getByText('async module')).toBeVisible();
});


it('places the only graph-loading entry on the OLAP algorithm tab', async () => {
    render(<GraphAnalysisHome moduleName='algorithms' />);
    await screen.findByText('algorithm module');
    expect(screen.queryByText('graph load entry')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'choose OLAP'}));
    expect(screen.getByText('graph load entry')).toBeVisible();
    fireEvent.click(screen.getByRole('button', {name: 'choose OLTP'}));
    expect(screen.queryByText('graph load entry')).not.toBeInTheDocument();
});
