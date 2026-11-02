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
jest.mock('../../../component/TaskNavigateView', () => () => <div>task link</div>);
jest.mock('../../../../visualization/react', () => ({GraphCanvas: ({data}) => <div>{data.nodes.map(node =>
    <div key={node.id}>{node.style.labelText}</div>)}<span>edges: {data.edges.length}</span></div>}));

beforeEach(() => {
    jest.resetAllMocks();
    api.analysis.fetchOlapPreviewEdges.mockResolvedValue({status: 200, data: {edges: [], truncated: false, sample_ids: []}});
});

test('loads a bounded sample and requests more only on demand', async () => {
    api.analysis.fetchManageTaskById.mockResolvedValue({status: 200, data: [{id: -7, task_status: 'success'}]});
    api.analysis.fetchVermeerTaskValues.mockResolvedValueOnce({status: 200, data: {
        vertices: [{ID: 'a', Value: '0.2'}], cursor: 1, has_more: true,
    }}).mockResolvedValueOnce({status: 200, data: {vertices: [{ID: 'b', Value: '2'}], has_more: false}});
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    expect(await screen.findByText('a: 0.2')).toBeInTheDocument();
    expect(api.analysis.fetchVermeerTaskValues).toHaveBeenCalledWith('s', 'g', -7, 0, 30);
    fireEvent.click(screen.getByText('analysis.algorithm.preview_more'));
    expect(await screen.findByText('b: 2')).toBeInTheDocument();
    expect(api.analysis.fetchVermeerTaskValues).toHaveBeenLastCalledWith('s', 'g', -7, 1, 30);
    expect(screen.getByText('analysis.algorithm.preview_no_edges')).toBeInTheDocument();
});

test('does not display a delayed result after unmount', async () => {
    let finish;
    api.analysis.fetchManageTaskById.mockResolvedValue({status: 200, data: [{id: -7, task_status: 'success'}]});
    api.analysis.fetchVermeerTaskValues.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    await waitFor(() => expect(finish).toBeDefined());
    view.unmount();
    finish({status: 200, data: {vertices: [{ID: 'stale', Value: 1}]}});
    expect(screen.queryByText('stale')).not.toBeInTheDocument();
});

test('distinguishes expired results from failed computation', async () => {
    api.analysis.fetchManageTaskById.mockResolvedValue({status: 200, data: [{id: -7, task_status: 'success'}]});
    api.analysis.fetchVermeerTaskValues.mockResolvedValue({status: 400});
    api.analysis.fetchAsyncTaskResult.mockResolvedValue({status: 200, data: {
        task_status: 'success', task_type: 'vermeer-task:compute', task_result: null,
    }});
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    expect(await screen.findByText('analysis.algorithm.preview_expired')).toBeInTheDocument();
    expect(screen.queryByText('analysis.algorithm.preview_failed')).not.toBeInTheDocument();
});

test('preserves prior sample and retries a failed next page', async () => {
    api.analysis.fetchManageTaskById.mockResolvedValue({status: 200, data: [{id: -7, task_status: 'success'}]});
    api.analysis.fetchVermeerTaskValues.mockResolvedValueOnce({status: 200, data: {
        vertices: [{ID: 'a', Value: '0.2'}], cursor: 1, has_more: true,
    }}).mockResolvedValueOnce({status: 503}).mockResolvedValueOnce({status: 200, data: {
        vertices: [{ID: 'b', Value: '3'}], cursor: 2, has_more: false,
    }});
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    await screen.findByText('a: 0.2');
    fireEvent.click(screen.getByText('analysis.algorithm.preview_more'));
    await screen.findByText('analysis.algorithm.preview_error');
    expect(screen.getByText('a: 0.2')).toBeInTheDocument();
    fireEvent.click(screen.getByText('analysis.async_task.retry_result'));
    expect(await screen.findByText('b: 3')).toBeInTheDocument();
    expect(screen.getByText('a: 0.2')).toBeInTheDocument();
});




test('renders real snapshot relationships and gives their provenance', async () => {
    api.analysis.fetchManageTaskById.mockResolvedValue({status: 200, data: [{id: -7, task_status: 'success'}]});
    api.analysis.fetchVermeerTaskValues.mockResolvedValue({status: 200, data: {
        vertices: [{ID: 'a', Value: 1}, {ID: 'b', Value: 2}], cursor: 2, has_more: false,
    }});
    api.analysis.fetchOlapPreviewEdges.mockResolvedValue({status: 200, data: {
        edges: [{source: 'a', target: 'b'}], sample_ids: ['a', 'b'], scanned: 1, truncated: false,
    }});
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    expect(await screen.findByText('edges: 1')).toBeInTheDocument();
    expect(api.analysis.fetchOlapPreviewEdges).toHaveBeenCalledWith('s', 'g', -7, 0, 30);
    expect(screen.getByText('analysis.algorithm.preview_edges_partial')).toBeInTheDocument();
});


test('rejects edges when the independently sampled result page changed', async () => {
    api.analysis.fetchManageTaskById.mockResolvedValue({status: 200, data: [{id: -7, task_status: 'success'}]});
    api.analysis.fetchVermeerTaskValues.mockResolvedValue({status: 200, data: {
        vertices: [{ID: 'a', Value: 1}, {ID: 'b', Value: 2}], cursor: 2, has_more: false,
    }});
    api.analysis.fetchOlapPreviewEdges.mockResolvedValue({status: 200, data: {
        edges: [{source: 'a', target: 'b'}], sample_ids: ['b', 'a'], truncated: false,
    }});
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    expect(await screen.findByText('analysis.algorithm.preview_edges_unavailable')).toBeInTheDocument();
    expect(screen.getByText('edges: 0')).toBeInTheDocument();
});

test('keeps earlier missing edge pages visible after a later page succeeds', async () => {
    api.analysis.fetchManageTaskById.mockResolvedValue({status: 200, data: [{id: -7, task_status: 'success'}]});
    api.analysis.fetchVermeerTaskValues.mockResolvedValueOnce({status: 200, data: {
        vertices: [{ID: 'a', Value: 1}], cursor: 1, has_more: true,
    }}).mockResolvedValueOnce({status: 200, data: {
        vertices: [{ID: 'b', Value: 2}], cursor: 2, has_more: false,
    }});
    api.analysis.fetchOlapPreviewEdges.mockResolvedValueOnce({status: 503}).mockResolvedValueOnce({
        status: 200, data: {edges: [], sample_ids: ['b'], truncated: false},
    });
    render(<OlapPreview graphSpace='s' graph='g' taskId={-7} />);
    await screen.findByText('analysis.algorithm.preview_edges_unavailable');
    fireEvent.click(screen.getByText('analysis.algorithm.preview_more'));
    expect(await screen.findByText('analysis.algorithm.preview_edges_partial')).toBeInTheDocument();
    expect(screen.getByText('analysis.algorithm.preview_edges_missing')).toBeInTheDocument();
});
