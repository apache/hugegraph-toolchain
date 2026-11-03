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

import {renderHook} from '@testing-library/react';
import useAlgorithmSubmission from './useAlgorithmSubmission';
import {GRAPH_STATUS} from '../../../utils/constants';
import {finishPendingOlapTask} from '../olapTaskRegistry';

jest.mock('../olapTaskRegistry', () => ({
    beginPendingOlapTask: jest.fn(() => ({})), finishPendingOlapTask: jest.fn(() => true),
    isPendingOlapTaskValid: jest.fn(() => true)}));

beforeEach(() => jest.clearAllMocks());

it('keeps each form completion through loading and terminal callbacks', () => {
    const first = jest.fn();
    const second = jest.fn();
    const begin = jest.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const formA = renderHook(() => useAlgorithmSubmission(begin));
    const formB = renderHook(() => useAlgorithmSubmission(begin));
    const completeA = formA.result.current(GRAPH_STATUS.LOADING);
    const completeB = formB.result.current(GRAPH_STATUS.LOADING);
    completeB(GRAPH_STATUS.SUCCESS, {vertices: [{id: 'b'}]}, '', {layout: 'radial'});
    completeA(GRAPH_STATUS.FAILED, {}, 'old failure');
    expect(begin).toHaveBeenCalledTimes(2);
    expect(first.mock.calls).toEqual([[GRAPH_STATUS.LOADING], [GRAPH_STATUS.FAILED, {}, 'old failure']]);
    expect(second.mock.calls).toEqual([
        [GRAPH_STATUS.LOADING],
        [GRAPH_STATUS.SUCCESS, {vertices: [{id: 'b'}]}, '', {layout: 'radial'}],
    ]);
    formB.result.current(GRAPH_STATUS.LOADING);
    expect(begin).toHaveBeenCalledTimes(3);
});


test.each([GRAPH_STATUS.SUCCESS, GRAPH_STATUS.FAILED])(
    'returns a separate completion for overlapping submissions on one mounted hook (%s)',
    lateStatus => {
        const first = jest.fn();
        const second = jest.fn();
        const begin = jest.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
        const form = renderHook(() => useAlgorithmSubmission(begin));
        const completeA = form.result.current(GRAPH_STATUS.LOADING);
        const completeB = form.result.current(GRAPH_STATUS.LOADING);

        expect(completeA).toEqual(expect.any(Function));
        expect(completeB).toEqual(expect.any(Function));
        completeB(GRAPH_STATUS.SUCCESS, {vertices: [{id: 'b'}]}, 'new result');
        completeA(lateStatus, {vertices: [{id: 'a'}]}, 'old result');

        expect(begin).toHaveBeenCalledTimes(2);
        expect(first.mock.calls).toEqual([
            [GRAPH_STATUS.LOADING],
            [lateStatus, {vertices: [{id: 'a'}]}, 'old result'],
        ]);
        expect(second.mock.calls).toEqual([
            [GRAPH_STATUS.LOADING],
            [GRAPH_STATUS.SUCCESS, {vertices: [{id: 'b'}]}, 'new result'],
        ]);
    }
);

test('retains a valid task when its original view no longer accepts completion', () => {
    const complete = jest.fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
    const beginSubmission = jest.fn(() => complete);
    const {result} = renderHook(() => useAlgorithmSubmission(
        beginSubmission, 'DEFAULT', 'hugegraph', 'PageRank', true
    ));
    const finish = result.current(GRAPH_STATUS.LOADING);
    finish(GRAPH_STATUS.SUCCESS, -7);
    expect(complete).toHaveBeenNthCalledWith(1, GRAPH_STATUS.LOADING);
    expect(complete).toHaveBeenNthCalledWith(2, GRAPH_STATUS.SUCCESS, -7);
    expect(finishPendingOlapTask).toHaveBeenCalledWith(expect.anything(), null, {
        graphSpace: 'DEFAULT', graph: 'hugegraph', algorithm: 'PageRank', id: -7,
    });
});

test('records an accepted successful task with its original graph scope', () => {
    const complete = jest.fn(() => true);
    const beginSubmission = jest.fn(() => complete);
    const {result} = renderHook(() => useAlgorithmSubmission(
        beginSubmission, 'DEFAULT', 'hugegraph', 'Degree Centrality', true
    ));
    const finish = result.current(GRAPH_STATUS.LOADING);
    expect(beginSubmission).toHaveBeenCalledWith('Degree Centrality');
    finish(GRAPH_STATUS.SUCCESS, -8);
    expect(finishPendingOlapTask).toHaveBeenCalledWith(expect.anything(), null, {
        graphSpace: 'DEFAULT',
        graph: 'hugegraph',
        algorithm: 'Degree Centrality',
        id: -8,
    });
});

test('does not register failures even when their completion is accepted', () => {
    const complete = jest.fn(() => true);
    const {result} = renderHook(() => useAlgorithmSubmission(
        () => complete, 'DEFAULT', 'hugegraph', 'PageRank', true
    ));
    const finish = result.current(GRAPH_STATUS.LOADING);
    finish(GRAPH_STATUS.FAILED, '', 'worker failed');
    expect(finishPendingOlapTask).toHaveBeenCalledWith(expect.anything(), null, null);
});


test('does not settle a pending submission for a nonterminal loading callback', () => {
    const complete = jest.fn(() => true);
    const {result} = renderHook(() => useAlgorithmSubmission(
        () => complete, 'DEFAULT', 'hugegraph', 'PageRank', true
    ));
    const finish = result.current(GRAPH_STATUS.LOADING);
    finish(GRAPH_STATUS.LOADING);
    expect(finishPendingOlapTask).not.toHaveBeenCalled();
    finish(GRAPH_STATUS.SUCCESS, -8);
    expect(finishPendingOlapTask).toHaveBeenCalledTimes(1);
});
