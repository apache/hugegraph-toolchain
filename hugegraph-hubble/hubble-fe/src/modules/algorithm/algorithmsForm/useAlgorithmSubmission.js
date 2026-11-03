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

import {useCallback} from 'react';
import {GRAPH_STATUS} from '../../../utils/constants';
import {beginPendingOlapTask, finishPendingOlapTask, isPendingOlapTaskValid} from '../olapTaskRegistry';

// Async callers retain the completion returned for their own execution.
export default function useAlgorithmSubmission(beginSubmission, graphSpace, graph,
                                               algorithm, trackOlapTask = false) {
    return useCallback((status, ...args) => {
        const complete = beginSubmission(algorithm);
        const started = complete?.(status, ...args);
        if (!trackOlapTask) return complete;
        const token = started ? beginPendingOlapTask(graphSpace, graph, algorithm) : null;
        return (finalStatus, ...finalArgs) => {
            // A graph, space or identity may have been deleted while the view
            // is still mounted. Never apply a completion from an invalid token.
            const valid = isPendingOlapTaskValid(token);
            const accepted = valid ? complete?.(finalStatus, ...finalArgs) : false;
            const failure = !accepted && finalStatus === GRAPH_STATUS.FAILED
                ? {message: finalArgs[1]} : null;
            const task = finalStatus === GRAPH_STATUS.SUCCESS
                ? {graphSpace, graph, algorithm, id: finalArgs[0]} : null;
            if (token && finalStatus !== GRAPH_STATUS.LOADING) finishPendingOlapTask(token, failure, task);
            return accepted;
        };
    }, [algorithm, beginSubmission, graph, graphSpace, trackOlapTask]);
}
