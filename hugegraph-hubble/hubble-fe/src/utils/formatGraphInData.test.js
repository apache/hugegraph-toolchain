/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
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
