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
import {render, screen, waitFor, fireEvent} from '@testing-library/react';
import OlapPreview from './index';
import * as api from '../../../../api';

jest.mock('react-i18next', () => ({useTranslation: () => ({t: key => key})}));
jest.mock('../../../../api', () => ({analysis: {
    fetchManageTaskById: jest.fn(), fetchVermeerTaskValues: jest.fn(), fetchAsyncTaskResult: jest.fn(),
    fetchOlapPreviewEdges: jest.fn(),
}}));
jest.mock('react-router-dom', () => ({Link: ({children}) => <span>{children}</span>}));
jest.mock('../../../../visualization/react', () => ({GraphCanvas: ({data}) => <div>{data.nodes.map(node =>
    <div key={node.id}>{node.style.labelText}</div>)}<span>edges: {data.edges.length}</span></div>}));

beforeEach(() => {
    jest.resetAllMocks();
    api.analysis.fetchManageTaskById.mockResolvedValue({status: 200, data: [{id: -7, task_status: 'success'}]});
});

const page = (vertices, cursor, hasMore, edges = [], edgesStatus = 'available') => ({status: 200, data: {
    vertices, cursor, has_more: hasMore, edges, edges_status: edgesStatus, truncated: false,
}});

test('loads a bounded sample and requests more only on demand', async () => {
    api.analysis.fetchOlapPreviewEdges.mockResolvedValueOnce(page([{ID: 'a', Value: '0.2'}], 1, true))
        .mockResolvedValueOnce(page([{ID: 'b', Value: '2'}], 2, false));
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    expect(await screen.findByText('a 0.2')).toBeInTheDocument();
    expect(api.analysis.fetchOlapPreviewEdges).toHaveBeenCalledWith('s', 'g', -7, 0, 30);
    fireEvent.click(screen.getByText('analysis.algorithm.preview_more'));
    expect(await screen.findByText('b 2')).toBeInTheDocument();
    expect(api.analysis.fetchOlapPreviewEdges).toHaveBeenLastCalledWith('s', 'g', -7, 1, 30);
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

test('renders only returned snapshot relationships within the sample', async () => {
    api.analysis.fetchOlapPreviewEdges.mockResolvedValue(page([{ID: 'a', Value: 1}, {ID: 'b', Value: 2}],
        2, false, [{source: 'a', target: 'b'}]));
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    expect(await screen.findByText('edges: 1')).toBeInTheDocument();
    expect(screen.getByText('analysis.algorithm.preview_edges_partial')).toBeInTheDocument();
});

test('preserves nodes and prior missing-edge notice when a later page succeeds', async () => {
    api.analysis.fetchOlapPreviewEdges.mockResolvedValueOnce(page([{ID: 'a', Value: 1}], 1, true, [], 'unavailable'))
        .mockResolvedValueOnce(page([{ID: 'b', Value: 2}], 2, false));
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    await screen.findByText('analysis.algorithm.preview_edges_unavailable');
    fireEvent.click(screen.getByText('analysis.algorithm.preview_more'));
    expect(await screen.findByText('analysis.algorithm.preview_edges_partial')).toBeInTheDocument();
    expect(screen.getByText('analysis.algorithm.preview_edges_missing')).toBeInTheDocument();
});

test('does not draw endpoints outside the returned page', async () => {
    api.analysis.fetchOlapPreviewEdges.mockResolvedValue(page([{ID: 'a', Value: 1}], 1, false,
        [{source: 'a', target: 'outside'}]));
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    expect(await screen.findByText('analysis.algorithm.preview_edges_unavailable')).toBeInTheDocument();
    expect(screen.getByText('edges: 0')).toBeInTheDocument();
});


test('distinguishes confirmed expired results from computation failure', async () => {
    api.analysis.fetchOlapPreviewEdges.mockResolvedValue({status: 200, data: {result_status: 'expired'}});
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    expect(await screen.findByText('analysis.algorithm.preview_expired')).toBeInTheDocument();
    expect(screen.queryByText('analysis.algorithm.preview_failed')).not.toBeInTheDocument();
});
