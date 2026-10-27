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
    analysis.getOlapMode('DEFAULT', 'g', config);

    expect(request.get).toHaveBeenNthCalledWith(1, '/graphspaces/list', config);
    expect(request.get).toHaveBeenNthCalledWith(
        2, '/graphspaces/DEFAULT/graphs/g/graph_read_mode', config
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
    expect(params).not.toHaveProperty('preview');
    expect(request.post).toHaveBeenNthCalledWith(
        2,
        '/graphspaces/DEFAULT/graphs/g/cypher/async-task',
        params,
        {suppressBusinessErrorToast: true}
    );
});

test.each([
    ['getExecutionTask', 'gremlin-query'],
    ['getCypherTask', 'cypher'],
])('forwards %s cancellation options separately from the read-only task body', (method, endpoint) => {
    const config = {signal: new AbortController().signal, timeout: 30000};
    const body = {content: 'query', text: 'Find people', read_only: true};
    analysis[method]('DEFAULT', 'g', body, config);
    expect(request.post).toHaveBeenCalledWith(`/graphspaces/DEFAULT/graphs/g/${endpoint}/async-task`, body,
        {...config, suppressBusinessErrorToast: true});
});


test('forwards cancellation and generation timeout without changing execution request bodies', () => {
    const controller = new AbortController();
    const config = {signal: controller.signal};
    const modelRequest = {question: 'Find people', model: 'test', api_key: 'private', base_url: 'http://test/v1'};
    analysis.generateText2Gql('DEFAULT', 'g', modelRequest, config);
    analysis.getExecutionQuery('DEFAULT', 'g', {content: 'g.V()', text: 'Find people'}, config);
    expect(request.post).toHaveBeenNthCalledWith(1,
        '/graphspaces/DEFAULT/graphs/g/text2gql', modelRequest,
        {...config, timeout: 65000, suppressBusinessErrorToast: true});
    expect(request.post).toHaveBeenNthCalledWith(2,
        '/graphspaces/DEFAULT/graphs/g/gremlin-query', {content: 'g.V()', text: 'Find people', preview: true},
        {...config, suppressBusinessErrorToast: true});
});


test.each([
    ['gremlin', 'gremlin-query', 'g.V().limit(3)'],
    ['cypher', 'cypher', 'MATCH (n) RETURN n LIMIT 3'],
])('executes generated %s using POST with the question in its body', (language, endpoint, content) => {
    const config = {signal: new AbortController().signal};
    const body = {content, text: 'Find people', read_only: true};
    analysis.executeText2Gql('DEFAULT', 'g', language, body, config);
    expect(request.post).toHaveBeenCalledWith(`/graphspaces/DEFAULT/graphs/g/${endpoint}`,
        {...body, preview: true},
        {...config, suppressBusinessErrorToast: true});
    expect(request.get).not.toHaveBeenCalled();
});

test('opts manual synchronous Gremlin and Cypher reads into preview without changing async bodies', () => {
    analysis.getExecutionQuery('DEFAULT', 'g', 'g.V()');
    expect(request.post).toHaveBeenCalledWith('/graphspaces/DEFAULT/graphs/g/gremlin-query',
        {content: 'g.V()', preview: true}, {suppressBusinessErrorToast: true});
    const params = {content: 'MATCH (n) RETURN n LIMIT 10000'};
    analysis.getCypherExecutionQuery('DEFAULT', 'g', params);
    expect(request.get).toHaveBeenCalledWith('/graphspaces/DEFAULT/graphs/g/cypher', {
        params: {...params, preview: true}, suppressBusinessErrorToast: true,
    });
    analysis.getCypherTask('DEFAULT', 'g', params);
    expect(request.post).toHaveBeenLastCalledWith('/graphspaces/DEFAULT/graphs/g/cypher/async-task',
        params, {suppressBusinessErrorToast: true});
    expect(params).not.toHaveProperty('preview');
});

test('lets deferred statistics own business error feedback', () => {
    const config = {suppressBusinessErrorToast: true};
    analysis.getGraphData('DEFAULT', 'g', config);
    expect(request.get).toHaveBeenCalledWith('/graphspaces/DEFAULT/graphs/g/gremlin-query', config);
});

test('discovers submitted tasks through metadata-only IDs lookup with inline error ownership', () => {
    analysis.fetchManageTaskById('memory', 'soc_graph', '80001');
    expect(request.get).toHaveBeenCalledWith('/graphspaces/memory/graphs/soc_graph/async-tasks/ids', {
        params: {ids: '80001'}, suppressBusinessErrorToast: true,
    });
});


test('lets paged Vermeer result errors use the inline recovery state', () => {
    analysis.fetchVermeerTaskValues('DEFAULT', 'g', -9, 1000);
    expect(request.get).toHaveBeenCalledWith('/graphspaces/DEFAULT/graphs/g/async-tasks/-9/values', {
        params: {cursor: 1000, limit: 1000}, suppressBusinessErrorToast: true,
    });
});
