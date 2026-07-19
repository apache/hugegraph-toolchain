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
import * as manage from './manage';

jest.mock('./request', () => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
}));

beforeEach(() => {
    jest.clearAllMocks();
});

test('updates a graph with PUT JSON on the canonical route', () => {
    const config = {suppressBusinessErrorToast: true};
    manage.updateGraph('DEFAULT', 'g', {nickname: 'nick'}, config);
    expect(request.put).toHaveBeenCalledWith(
        '/graphspaces/DEFAULT/graphs/g',
        {nickname: 'nick'},
        config
    );
});

test('creates a property with request error ownership controls', () => {
    const config = {suppressBusinessErrorToast: true};
    manage.addMetaProperty('DEFAULT', 'g', {name: 'created_at'}, config);

    expect(request.post).toHaveBeenCalledWith(
        '/graphspaces/DEFAULT/graphs/g/schema/propertykeys',
        {name: 'created_at'},
        config
    );
});

test('applies Groovy Schema to an existing graph with page-owned errors', () => {
    const config = {suppressBusinessErrorToast: true};
    const data = {'schema-groovy': 'graph.schema().propertyKey("name").create()'};

    manage.addGraphSchema('DEFAULT', 'g', data, config);

    expect(request.post).toHaveBeenCalledWith(
        '/graphspaces/DEFAULT/graphs/g/schema/groovy',
        data,
        config
    );
});

test('clears graph data with POST on the canonical route', () => {
    manage.clearGraph('DEFAULT', 'g');

    expect(request.post).toHaveBeenCalledWith(
        '/graphspaces/DEFAULT/graphs/g/clear'
    );
    expect(request.get).not.toHaveBeenCalled();
    expect(manage.clearGraphData).toBeUndefined();
});

test('loads the non-destructive sample through the target graph route', () => {
    const config = {suppressBusinessErrorToast: true};
    manage.loadSampleGraph('DEFAULT', 'g', 'loader', config);

    expect(request.post).toHaveBeenCalledWith(
        '/graphspaces/DEFAULT/graphs/g/sample',
        undefined,
        {...config, params: {dataset: 'loader'}}
    );
});

test('keeps task-run error ownership controls out of query parameters', () => {
    manage.getJobsList(
        {taskid: '42'},
        {suppressBusinessErrorToast: true}
    );

    expect(request.get).toHaveBeenCalledWith(
        '/ingest/jobs/list',
        {
            params: {taskid: '42'},
            suppressBusinessErrorToast: true,
        }
    );
});

test('reads the default graph from the canonical route', () => {
    manage.getDefaultGraph('DEFAULT');
    expect(request.get).toHaveBeenCalledWith(
        'graphspaces/DEFAULT/graphs/default'
    );
});

test('forwards default-graph error ownership controls', () => {
    const config = {suppressBusinessErrorToast: true};

    manage.getDefaultGraph('DEFAULT', config);
    expect(request.get).toHaveBeenCalledWith(
        'graphspaces/DEFAULT/graphs/default',
        config
    );

    manage.setDefaultGraph('DEFAULT', 'g', config);
    expect(request.post).toHaveBeenCalledWith(
        'graphspaces/DEFAULT/graphs/g/default',
        undefined,
        config
    );
});

test('keeps graph-list request controls out of query parameters', () => {
    manage.getGraphList(
        'DEFAULT',
        {page_no: 1, page_size: 10},
        {suppressBusinessErrorToast: true}
    );

    expect(request.get).toHaveBeenCalledWith(
        '/graphspaces/DEFAULT/graphs',
        {
            params: {page_no: 1, page_size: 10},
            suppressBusinessErrorToast: true,
        }
    );
});

test('does not expose default GraphSpace mutation facades', () => {
    expect(manage.setDefaultGraphSpace).toBeUndefined();
    expect(manage.getDefaultGraphSpace).toBeUndefined();
});

test.each([
    ['checkMetaProperty', 'post',
        '/graphspaces/DEFAULT/graphs/g/schema/propertykeys/check_using'],
    ['checkMetaVertex', 'post',
        '/graphspaces/DEFAULT/graphs/g/schema/vertexlabels/check_using'],
])('%s forwards request controls outside the request body', (method, verb, route) => {
    manage[method]('DEFAULT', 'g', {names: ['name']}, {
        suppressBusinessErrorToast: true,
    });

    expect(request[verb]).toHaveBeenCalledWith(
        route,
        {names: ['name']},
        {suppressBusinessErrorToast: true}
    );
});

test.each([
    ['addGraphSpace', [{name: 'SPACE'}], 'post', '/graphspaces'],
    ['updateGraphSpace', ['SPACE', {nickname: 'Space'}], 'put', '/graphspaces/SPACE'],
    ['delGraphSpace', ['SPACE'], 'delete', '/graphspaces/SPACE'],
    ['initBuiltin', [{init_space: true}], 'post', '/graphspaces/builtin'],
    ['addSchema', ['SPACE', {name: 'schema'}], 'post',
        '/graphspaces/SPACE/schematemplates'],
    ['updateSchema', ['SPACE', 'schema', {schema: 'g'}], 'put',
        'graphspaces/SPACE/schematemplates/schema'],
    ['delSchema', ['SPACE', 'schema'], 'delete',
        'graphspaces/SPACE/schematemplates/schema'],
])('%s forwards page-owned error controls', (method, args, verb, route) => {
    const config = {suppressBusinessErrorToast: true};
    manage[method](...args, config);

    const expected = verb === 'delete'
        ? [route, undefined, config]
        : [route, args.at(-1), config];
    expect(request[verb]).toHaveBeenCalledWith(...expected);
});

test.each([
    ['delMetaProperty', '/schema/propertykeys'],
    ['delMetaVertex', '/schema/vertexlabels'],
    ['delMetaEdge', '/schema/edgelabels'],
])('%s forwards request controls to the delete request', (method, suffix) => {
    manage[method]('DEFAULT', 'g', {names: ['name']}, {
        suppressBusinessErrorToast: true,
    });

    expect(request.delete).toHaveBeenCalledWith(
        `/graphspaces/DEFAULT/graphs/g${suffix}?names=name&skip_using=false`,
        undefined,
        {suppressBusinessErrorToast: true}
    );
});
