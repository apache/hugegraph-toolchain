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
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */
import {act, render, screen, waitFor, fireEvent, within} from '@testing-library/react';
import OlapPreview, {buildConnectedSample} from './index';
import * as api from '../../../../api';
import {clearOlapTasks, recordOlapTask} from '../../olapTaskRegistry';

jest.mock('react-i18next', () => ({useTranslation: () => ({t: key => key})}));
jest.mock('../../../../api', () => ({analysis: {
    fetchManageTaskById: jest.fn(), fetchVermeerTaskValues: jest.fn(), fetchAsyncTaskResult: jest.fn(),
    fetchOlapPreviewEdges: jest.fn(),
}}));
jest.mock('react-router-dom', () => ({Link: ({children, to}) => <a href={to}>{children}</a>}));
const mockController = {setLayout: jest.fn().mockResolvedValue(undefined)};
jest.mock('../../../../visualization/react', () => ({GraphCanvas: ({data, onReady}) => {
    const React = require('react');
    React.useEffect(() => { onReady?.(mockController); return () => onReady?.(null); }, [onReady]);
    return <div>{data.nodes.map(node => <div key={node.id}>{node.style.labelText}</div>)}
        <span>edges: {data.edges.length}</span></div>;
}}));

beforeEach(() => {
    clearOlapTasks();
    jest.resetAllMocks();
    mockController.setLayout.mockResolvedValue(undefined);
    api.analysis.fetchManageTaskById.mockResolvedValue({status: 200, data: [{id: -7, task_status: 'success'}]});
});

const page = (vertices, cursor, hasMore, edges = [], edgesStatus = 'available') => ({status: 200, data: {
    vertices, cursor, has_more: hasMore, edges, edges_status: edgesStatus, truncated: false,
}});

test('loads a compact bounded sample and requests more only on demand', async () => {
    api.analysis.fetchOlapPreviewEdges.mockResolvedValueOnce(page([{ID: 'a', Value: '0.2'}], 1, true))
        .mockResolvedValueOnce(page([{ID: 'b', Value: '2'}], 2, false));
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    expect(await screen.findByText('a 0.2')).toBeInTheDocument();
    expect(api.analysis.fetchOlapPreviewEdges).toHaveBeenCalledWith('s', 'g', -7, 0, 12);
    fireEvent.click(screen.getByText('analysis.algorithm.preview_more'));
    expect(await screen.findByText('b 2')).toBeInTheDocument();
    expect(api.analysis.fetchOlapPreviewEdges).toHaveBeenLastCalledWith('s', 'g', -7, 1, 12);
});

test('displays friendly task numbers while retaining signed IDs for requests and navigation', async () => {
    recordOlapTask({graphSpace: 's', graph: 'g', id: -7, algorithm: 'PageRank'});
    recordOlapTask({graphSpace: 's', graph: 'g', id: -8, algorithm: 'Triangle Count'});
    api.analysis.fetchManageTaskById.mockImplementation(async (space, graph, id) => ({
        status: 200, data: [{id, task_status: 'success'}],
    }));
    api.analysis.fetchOlapPreviewEdges.mockResolvedValue(page([{ID: 'a', Value: 1}], 1, false));
    const onSelectTask = jest.fn();
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} onSelectTask={onSelectTask} />);
    expect(await screen.findByText('PageRank · 7')).toBeInTheDocument();
    expect(screen.getByText('analysis.algorithm.preview_task_detail').closest('a')).toHaveAttribute(
        'href', '/asyncTasks/s/g?taskId=-7&submitted=1'
    );
    fireEvent.mouseDown(screen.getByRole('combobox'));
    expect((await screen.findAllByRole('option')).map(option => option.textContent)).toEqual([
        'Triangle Count · 8', 'PageRank · 7',
    ]);
    fireEvent.click(screen.getByRole('option', {name: 'Triangle Count · 8'}));
    expect(onSelectTask).toHaveBeenCalledWith(-8);
    await waitFor(() => expect(api.analysis.fetchOlapPreviewEdges).toHaveBeenCalledWith('s', 'g', -8, 0, 12));
    expect(screen.getByText('analysis.algorithm.preview_task_detail').closest('a')).toHaveAttribute(
        'href', '/asyncTasks/s/g?taskId=-8&submitted=1'
    );
});

test('explains that a running task continues after leaving', async () => {
    api.analysis.fetchManageTaskById.mockResolvedValue({status: 200, data: [{id: -7, task_status: 'running'}]});
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    expect(await screen.findByText('analysis.algorithm.preview_async_hint')).toBeInTheDocument();
    expect(screen.getByText('analysis.algorithm.preview_task_detail')).toBeInTheDocument();
});

test('labels a restored result with the option to run again', async () => {
    api.analysis.fetchOlapPreviewEdges.mockResolvedValue(page([{ID: 'a', Value: 1}], 1, false));
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} restoredOlapTask />);
    expect(await screen.findByText('analysis.algorithm.preview_restored_hint')).toBeInTheDocument();
});

test('hides the restored hint when the user selects a different task', async () => {
    recordOlapTask({graphSpace: 's', graph: 'g', id: -8, algorithm: 'PageRank'});
    recordOlapTask({graphSpace: 's', graph: 'g', id: -7, algorithm: 'PageRank'});
    api.analysis.fetchManageTaskById.mockResolvedValue({status: 200, data: [
        {id: -7, task_status: 'success'}, {id: -8, task_status: 'success'},
    ]});
    api.analysis.fetchOlapPreviewEdges.mockResolvedValue(page([{ID: 'a', Value: 1}], 1, false));
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} restoredOlapTask />);
    expect(await screen.findByText('analysis.algorithm.preview_restored_hint')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', {name: 'PageRank · 8'}));
    await waitFor(() => expect(api.analysis.fetchOlapPreviewEdges).toHaveBeenCalledWith('s', 'g', -8, 0, 12));
    expect(screen.queryByText('analysis.algorithm.preview_restored_hint')).not.toBeInTheDocument();
});

test('does not display a delayed result after unmount', async () => {
    let finish;
    api.analysis.fetchOlapPreviewEdges.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    await waitFor(() => expect(finish).toBeDefined());
    view.unmount();
    finish(page([{ID: 'stale', Value: 1}], 1, false));
    expect(screen.queryByText('stale')).not.toBeInTheDocument();
});

test('does not mistake an unreadable result for a failed computation', async () => {
    api.analysis.fetchOlapPreviewEdges.mockResolvedValue({status: 400});
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    expect(await screen.findByText('analysis.algorithm.preview_error')).toBeInTheDocument();
    expect(screen.queryByText('analysis.algorithm.preview_failed')).not.toBeInTheDocument();
});

test('preserves prior sample and retries a failed next page', async () => {
    api.analysis.fetchOlapPreviewEdges.mockResolvedValueOnce(page([{ID: 'a', Value: '0.2'}], 1, true))
        .mockResolvedValueOnce({status: 503})
        .mockResolvedValueOnce(page([{ID: 'b', Value: '3'}], 2, false));
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    await screen.findByText('a 0.2');
    fireEvent.click(screen.getByText('analysis.algorithm.preview_more'));
    await screen.findByText('analysis.algorithm.preview_error');
    expect(screen.getByText('a 0.2')).toBeInTheDocument();
    fireEvent.click(screen.getByText('analysis.async_task.retry_result'));
    expect(await screen.findByText('b 3')).toBeInTheDocument();
});

test('renders a concurrent submission warning without hiding the retained preview', async () => {
    api.analysis.fetchOlapPreviewEdges.mockResolvedValue(page([{ID: 'a', Value: 1}], 1, false));
    const view = render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    expect(await screen.findByText('a 1')).toBeInTheDocument();
    view.rerender(<OlapPreview graphSpace='s' graph='g' taskId={-7} warning='worker failed' />);
    expect(screen.getByText('worker failed')).toBeInTheDocument();
    expect(screen.getByText('a 1')).toBeInTheDocument();
    view.rerender(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    expect(screen.queryByText('worker failed')).not.toBeInTheDocument();
});

test('renders only returned snapshot relationships and a connected sample path', async () => {
    api.analysis.fetchOlapPreviewEdges.mockResolvedValue(page([{ID: 'a', Value: 1}, {ID: 'b', Value: 2}],
        2, false, [{source: 'a', target: 'b'}]));
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    expect(await screen.findByText('edges: 1')).toBeInTheDocument();
    const path = screen.getByRole('region', {
        name: 'analysis.algorithm.preview_graph · analysis.algorithm.preview_edges_partial',
    });
    expect(within(path).getByText('analysis.algorithm.preview_graph')).toBeInTheDocument();
    expect(within(path).getByText('analysis.algorithm.preview_edges_partial')).toBeInTheDocument();
    expect(within(path).queryByText('analysis.algorithm.preview_no_edges')).not.toBeInTheDocument();
    expect(screen.getByTitle('a · 1')).toBeInTheDocument();
    expect(screen.getByTitle('b · 2')).toBeInTheDocument();
});

test('builds a deterministic bounded path and does not invent one without edges', () => {
    const vertices = ['a', 'b', 'c', 'd'].map(ID => ({ID, Value: ID}));
    expect(buildConnectedSample(vertices, [
        {source: 'a', target: 'b'}, {source: 'a', target: 'c'}, {source: 'b', target: 'd'},
    ]).map(item => item.ID)).toEqual(['a', 'b', 'd']);
    expect(buildConnectedSample(vertices, [])).toEqual([]);
});

test('does not show a connected sample when relationships are marked unavailable', async () => {
    api.analysis.fetchOlapPreviewEdges.mockResolvedValue(page(
        [{ID: 'a', Value: 1}, {ID: 'b', Value: 2}], 2, false,
        [{source: 'a', target: 'b'}], 'unavailable'
    ));
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    expect(await screen.findByText('a 1')).toBeInTheDocument();
    expect(screen.getByText('b 2')).toBeInTheDocument();
    expect(screen.getByText('edges: 0')).toBeInTheDocument();
    expect(screen.queryByTitle('a · 1')).not.toBeInTheDocument();
    expect(screen.queryByTitle('b · 2')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', {
        name: 'analysis.algorithm.preview_graph · analysis.algorithm.preview_edges_partial',
    })).not.toBeInTheDocument();
});

test('preserves nodes and prior missing-edge notice when a later page succeeds', async () => {
    api.analysis.fetchOlapPreviewEdges.mockResolvedValueOnce(page([{ID: 'a', Value: 1}], 1, true, [], 'unavailable'))
        .mockResolvedValueOnce(page([{ID: 'b', Value: 2}], 2, false));
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    await screen.findByText('analysis.algorithm.preview_edges_missing');
    fireEvent.click(screen.getByText('analysis.algorithm.preview_more'));
    expect(await screen.findByText('analysis.algorithm.preview_edges_partial')).toBeInTheDocument();
    expect(screen.getByText('analysis.algorithm.preview_edges_missing')).toBeInTheDocument();
});

test('does not draw endpoints outside the returned page', async () => {
    api.analysis.fetchOlapPreviewEdges.mockResolvedValue(page([{ID: 'a', Value: 1}], 1, false,
        [{source: 'a', target: 'outside'}]));
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    expect(await screen.findByText('analysis.algorithm.preview_edges_missing')).toBeInTheDocument();
    expect(screen.getByText('edges: 0')).toBeInTheDocument();
});


test('distinguishes confirmed expired results from computation failure', async () => {
    api.analysis.fetchOlapPreviewEdges.mockResolvedValue({status: 200, data: {result_status: 'expired'}});
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    expect(await screen.findByText('analysis.algorithm.preview_expired')).toBeInTheDocument();
    expect(screen.queryByText('analysis.algorithm.preview_failed')).not.toBeInTheDocument();
});


test('refits only on a changed host size and cancels pending work on unmount', async () => {
    let emit;
    const disconnect = jest.fn();
    const oldObserver = global.ResizeObserver;
    global.ResizeObserver = class {
        constructor(callback) { emit = callback; }
        observe() {}
        disconnect() { disconnect(); }
    };
    api.analysis.fetchOlapPreviewEdges.mockResolvedValue(page([{ID: 'a', Value: 1}], 1, false));
    const view = render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    await screen.findByText('a 1');
    await waitFor(() => expect(emit).toBeDefined());
    jest.useFakeTimers();
    try {
        act(() => { emit([{contentRect: {width: 900, height: 300}}]); jest.advanceTimersByTime(150); });
        expect(mockController.setLayout).toHaveBeenCalledTimes(1);
        act(() => { emit([{contentRect: {width: 900, height: 300}}]); jest.advanceTimersByTime(150); });
        expect(mockController.setLayout).toHaveBeenCalledTimes(1);
        act(() => { emit([{contentRect: {width: 500, height: 300}}]); });
        view.unmount();
        act(() => { jest.advanceTimersByTime(150); });
        expect(mockController.setLayout).toHaveBeenCalledTimes(1);
        expect(disconnect).toHaveBeenCalled();
    } finally {
        jest.useRealTimers();
        global.ResizeObserver = oldObserver;
    }
});

test('keeps edge provenance when a later page cannot load edges', async () => {
    api.analysis.fetchOlapPreviewEdges.mockResolvedValueOnce(page(
        [{ID: 'a', Value: 1}, {ID: 'b', Value: 2}], 2, true, [{source: 'a', target: 'b'}]))
        .mockResolvedValueOnce(page([{ID: 'c', Value: 3}], 3, false, [], 'unavailable'));
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    await screen.findByText('edges: 1');
    fireEvent.click(screen.getByText('analysis.algorithm.preview_more'));
    await screen.findByText('c 3');
    expect(screen.getAllByText('analysis.algorithm.preview_edges_partial')).not.toHaveLength(0);
    expect(screen.getByText('analysis.algorithm.preview_edges_missing')).toBeInTheDocument();
});

test('prevents concurrent requests for the same next page', async () => {
    let finish;
    api.analysis.fetchOlapPreviewEdges.mockResolvedValueOnce(page([{ID: 'a', Value: 1}], 1, true))
        .mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    await screen.findByText('a 1');
    const button = screen.getByText('analysis.algorithm.preview_more');
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(finish).toBeDefined());
    expect(api.analysis.fetchOlapPreviewEdges).toHaveBeenCalledTimes(2);
    await act(async () => finish(page([{ID: 'b', Value: 2}], 2, false)));
    expect(await screen.findByText('b 2')).toBeInTheDocument();
});

test('clears a page error when a retry returns unavailable values', async () => {
    api.analysis.fetchOlapPreviewEdges.mockResolvedValueOnce(page([{ID: 'a', Value: 1}], 1, true))
        .mockResolvedValueOnce({status: 503})
        .mockResolvedValueOnce({status: 200, data: {result_status: 'expired'}});
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    await screen.findByText('a 1');
    fireEvent.click(screen.getByText('analysis.algorithm.preview_more'));
    await screen.findByText('analysis.algorithm.preview_error');
    fireEvent.click(screen.getByText('analysis.async_task.retry_result'));
    await screen.findByText('analysis.algorithm.preview_expired');
    expect(screen.queryByText('analysis.algorithm.preview_error')).not.toBeInTheDocument();
});

test('distinguishes a result that is too large to preview', async () => {
    api.analysis.fetchOlapPreviewEdges.mockResolvedValue({status: 200, data: {result_status: 'too_large'}});
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    expect(await screen.findByText('analysis.algorithm.preview_too_large')).toBeInTheDocument();
    expect(screen.queryByText('analysis.algorithm.preview_error')).not.toBeInTheDocument();
});
