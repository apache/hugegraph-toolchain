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

import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import QueryResult from './index';
import {
    getGraphViewLimitStatus,
    getJsonViewContent,
    getQueryResultStandbyMessage,
} from './utils';
import JSONbig from 'json-bigint';
import enAnalysis from '../../../../i18n/resources/en-US/modules/analysis.json';
import zhAnalysis from '../../../../i18n/resources/zh-CN/modules/analysis.json';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, options) => {
            const text = {
                'analysis.query_result.graph': 'Graph',
                'analysis.query_result.table': 'Table',
                'analysis.query_result.graph_limit_title': 'Graph limit',
                'analysis.query_result.graph_limit_description':
                    `${options?.nodes}/${options?.nodeLimit}`,
                'analysis.query_result.non_graph_title': 'Query result preview',
                'analysis.query_result.non_graph_description':
                    'This result cannot be rendered as a graph; a JSON preview is shown.',
                'analysis.query_result.view_full_json': 'View raw JSON',
                'analysis.query_result.empty_success':
                    'Query succeeded, result is empty',
            };
            return text[key] || key;
        },
    }),
}));
jest.mock('../GraphResult/Home', () => () => <div>graph canvas</div>);
jest.mock('../TableView', () => () => <div>table result</div>);
jest.mock('../JsonView', () => () => <div>json result</div>);

it('projects BigInt, production BigNumber, and null-prototype values safely', () => {
    const bigNumber = JSONbig.parse('{"id":9007199254740993}').id;
    const nullPrototype = Object.create(null);
    nullPrototype.name = 'alice';
    const data = [{native: 9007199254740993n, parsed: bigNumber}, nullPrototype];
    const projected = getJsonViewContent({data});

    expect(projected).not.toBe(data);
    expect(projected[0]).toEqual({
        native: '9007199254740993',
        parsed: '9007199254740993',
    });
    expect(Object.getPrototypeOf(projected[1])).toBe(Object.prototype);
    expect(projected[1]).toEqual({name: 'alice'});
    expect(getJsonViewContent()).toEqual([]);
    expect(getJsonViewContent({data: false})).toEqual({value: false});
});

describe('graph view limits', () => {
    it.each([
        [300, 300, false],
        [301, 0, true],
        [0, 301, true],
    ])('evaluates %i nodes and %i edges', (nodeCount, edgeCount, exceeded) => {
        expect(getGraphViewLimitStatus({
            vertices: new Array(nodeCount),
            edges: new Array(edgeCount),
        })).toEqual({nodeCount, edgeCount, exceeded});
    });

    it('handles a missing graph result without collapsing', () => {
        expect(getGraphViewLimitStatus()).toEqual({
            nodeCount: 0,
            edgeCount: 0,
            exceeded: false,
        });
    });

    it('switches an existing result view to Table when a new result exceeds the limit', () => {
        const result = nodeCount => ({
            graph_view: {vertices: new Array(nodeCount), edges: []},
            json_view: {data: []},
            table_view: {header: [], rows: []},
        });
        const view = render(<QueryResult queryResult={result(300)} />);
        expect(screen.getByRole('tab', {name: 'Graph'})).toHaveAttribute(
            'aria-selected', 'true'
        );

        view.rerender(<QueryResult queryResult={result(301)} />);

        expect(screen.getByRole('tab', {name: 'Table'})).toHaveAttribute(
            'aria-selected', 'true'
        );
    });
});

it('labels the structured result tab as JSON', () => {
    render(<QueryResult queryResult={{}} />);

    expect(screen.getByRole('tab', {name: 'JSON'})).toBeInTheDocument();
    expect(screen.queryByRole('tab', {name: 'Json'})).not.toBeInTheDocument();
});

it('uses a distinct prompt before the first query across result views', () => {
    const t = jest.fn(key => key);

    expect(getQueryResultStandbyMessage(t, true))
        .toBe('analysis.query_result.not_started');
    expect(getQueryResultStandbyMessage(t, false))
        .toBe('analysis.query_result.task_not_started');
    expect(t).not.toHaveBeenCalledWith('analysis.query_result.no_data');
});

it('previews a small scalar result instead of calling it an empty graph', () => {
    render(<QueryResult
        queryStatus='success'
        isQueryMode
        queryResult={{
            graph_view: {vertices: [], edges: []},
            table_view: {header: ['count'], rows: [{count: 42}]},
            json_view: {data: 42},
        }}
    />);

    expect(screen.getByText('Query result preview')).toBeInTheDocument();
    expect(screen.getByText(/42/)).toBeInTheDocument();
    expect(screen.queryByText('analysis.query_result.no_graph_result'))
        .not.toBeInTheDocument();
});

it('labels a completely empty successful result precisely', () => {
    render(<QueryResult
        queryStatus='success'
        isQueryMode
        queryResult={{
            graph_view: {vertices: [], edges: []},
            table_view: {header: [], rows: []},
            json_view: {data: []},
        }}
    />);

    expect(screen.getByText('Query succeeded, result is empty')).toBeInTheDocument();
    expect(zhAnalysis.analysis.query_result.empty_success).toBe('查询成功，结果为空');
    expect(enAnalysis.analysis.query_result.empty_success)
        .toBe('Query succeeded, result is empty');
});

it('keeps a non-empty JSON-only result in the JSON preview path', () => {
    render(<QueryResult
        queryStatus='success'
        isQueryMode
        queryResult={{
            graph_view: {vertices: [], edges: []},
            table_view: {header: [], rows: []},
            json_view: {data: {count: 42}},
        }}
    />);

    expect(screen.getByText('Query result preview')).toBeInTheDocument();
    expect(screen.getByText(/"count": 42/)).toBeInTheDocument();
    expect(screen.queryByText('Query succeeded, result is empty'))
        .not.toBeInTheDocument();
});

it('offers a direct JSON path when a non-graph preview is truncated', () => {
    render(<QueryResult
        queryStatus='success'
        isQueryMode
        queryResult={{
            graph_view: {vertices: [], edges: []},
            table_view: {
                header: ['name'],
                rows: Array.from({length: 8}, (_, index) => ({name: `node-${index}`})),
            },
            json_view: {data: Array.from({length: 8}, (_, index) => ({name: `node-${index}`}))},
        }}
    />);

    expect(screen.getByText(/node-0/)).toBeInTheDocument();
    expect(screen.queryByText(/node-7/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'View raw JSON'}));
    expect(screen.getByText('json result')).toBeInTheDocument();
});

it('marks circular display values without throwing', () => {
    const circular = {name: 'loop'};
    circular.self = circular;

    expect(getJsonViewContent({data: circular})).toEqual({
        name: 'loop',
        self: '[Circular]',
    });
});

it('keeps __proto__ as display data without changing the projected prototype', () => {
    const source = Object.create(null);
    Object.defineProperty(source, '__proto__', {
        enumerable: true,
        value: 'safe',
    });
    const projected = getJsonViewContent({data: source});

    expect(Object.getPrototypeOf(projected)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(projected, '__proto__')).toBe(true);
    expect(Reflect.get(projected, '__proto__')).toBe('safe');
    expect(Object.prototype.safe).toBeUndefined();
});

it('does not collapse objects that only mimic a BigNumber constructor name', () => {
    const mimic = {
        constructor: {name: 'BigNumber'},
        toString: () => '[misleading value]',
        value: 7,
    };

    expect(getJsonViewContent({data: mimic})).toEqual({
        constructor: {name: 'BigNumber'},
        toString: mimic.toString,
        value: 7,
    });
});
