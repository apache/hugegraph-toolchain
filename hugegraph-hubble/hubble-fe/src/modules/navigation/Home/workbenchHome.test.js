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

import {getPreparationSchemaPath, getWorkbenchJourneys} from './workbenchHome';

beforeEach(() => localStorage.clear());

test.each([
    [true, '/graphspace'],
    [false, '/graphspace/DEFAULT'],
])('keeps the understand-graph entry mode-aware', (pdEnabled, expected) => {
    const journeys = getWorkbenchJourneys(pdEnabled);

    expect(journeys[0]).toMatchObject({
        key: 'understand',
        primaryPath: expected,
    });
});

test('maps every existing high-frequency entry into a task journey', () => {
    const paths = getWorkbenchJourneys(true).flatMap(journey => [
        journey.primaryPath,
        ...journey.secondaryPaths,
    ]);

    expect(paths).toEqual(expect.arrayContaining([
        '/graphspace',
        '/source',
        '/task',
        '/gremlin',
        '/algorithms',
        '/asyncTasks',
    ]));
});

test('orders import before query on the home page', () => {
    expect(getWorkbenchJourneys(true).map(journey => journey.key)).toEqual([
        'understand',
        'prepare',
        'query',
    ]);
});

test.each([
    [true, {graphspace: 'space a', graph: 'g'}, '/graphspace/space%20a/schema'],
    [false, {graphspace: 'DEFAULT', graph: 'graph a'},
        '/graphspace/DEFAULT/schema'],
])('starts data preparation from mode-aware Schema', (pdEnabled, context, expected) => {
    localStorage.setItem('hubble_workbench_graph_context', JSON.stringify(context));

    expect(getPreparationSchemaPath(pdEnabled)).toBe(expected);
    expect(getWorkbenchJourneys(pdEnabled).find(journey => (
        journey.key === 'prepare'
    ))).toMatchObject({
        key: 'prepare',
        primaryPath: expected,
        secondaryPaths: ['/source', '/task'],
    });
});
