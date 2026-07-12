/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

import {formatToGraphInData} from './formatGraphInData';

jest.mock('@antv/graphin', () => ({
    Utils: {processEdges: edges => edges},
}));
jest.mock('./graph', () => ({}));
jest.mock('./constants', () => ({iconsMap: {}}));

const schema = {
    vertices: [{
        id: 'person',
        label: 'person',
        properties: {},
        '~style': {color: '#1769e0'},
    }],
    edges: [{
        id: 'person-knows-person',
        source: 'person',
        target: 'person',
        label: 'knows',
        properties: {},
        '~style': {color: '#0eb880', with_arrow: true},
    }],
};

test('keeps labels for full schema views by default', () => {
    const result = formatToGraphInData(schema);

    expect(result.nodes[0].style.label.value).toBe('person');
    expect(result.edges[0].style.label.value).toBe('knows');
});

test('hides labels for compact graph-card previews', () => {
    const result = formatToGraphInData(schema, false);

    expect(result.nodes[0].style.label.value).toBe('');
    expect(result.edges[0].style.label.value).toBe('');
});
