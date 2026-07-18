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

import request from './request';
import * as analysis from './analysis';

jest.mock('./request', () => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

test('forwards inline error ownership for graph context reads', () => {
    const config = {suppressBusinessErrorToast: true};

    analysis.getGraphSpaceList(config);
    analysis.getGraphList('DEFAULT', config);
    analysis.getOlapMode('DEFAULT', 'g', config);

    expect(request.get).toHaveBeenNthCalledWith(1, '/graphspaces/list', config);
    expect(request.get).toHaveBeenNthCalledWith(
        2, '/graphspaces/DEFAULT/graphs/list', config
    );
    expect(request.get).toHaveBeenNthCalledWith(
        3, '/graphspaces/DEFAULT/graphs/g/graph_read_mode', config
    );
});

test('keeps OLAP and Vermeer configs outside mutation bodies', () => {
    const config = {suppressBusinessErrorToast: true};

    analysis.switchOlapMode('DEFAULT', 'g', 0, config);
    analysis.loadVermeerTask({graphspace: 'DEFAULT', graph: 'g'}, config);

    expect(request.put).toHaveBeenCalledWith(
        '/graphspaces/DEFAULT/graphs/g/graph_read_mode', 0, config
    );
    expect(request.post).toHaveBeenCalledWith(
        '/vermeer/task', {graphspace: 'DEFAULT', graph: 'g'}, config
    );
});

test('lets the async query page own business error feedback', () => {
    const params = {content: 'g.V()'};

    analysis.getExecutionTask('DEFAULT', 'g', params);
    analysis.getCypherTask('DEFAULT', 'g', params);

    expect(request.post).toHaveBeenNthCalledWith(
        1,
        '/graphspaces/DEFAULT/graphs/g/gremlin-query/async-task',
        params,
        {suppressBusinessErrorToast: true}
    );
    expect(request.post).toHaveBeenNthCalledWith(
        2,
        '/graphspaces/DEFAULT/graphs/g/cypher/async-task',
        params,
        {suppressBusinessErrorToast: true}
    );
});
