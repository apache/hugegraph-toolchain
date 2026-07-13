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

import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {Input} from 'antd';
import fs from 'fs';
import path from 'path';
import GraphAnalysisContext from '../../../Context';
import {
    AlgorithmPersistenceContext,
    algorithmFormStorageKey,
    clearPersistedAlgorithmForms,
    clearPersistedAlgorithmFormsForUser,
} from '../algorithmFormPersistence';
import Form, {inferExampleValue} from './index';
import {formatPropertiesValue, groupPropertyValidator} from '../utils';
import MaxDepthItem from '../MaxDepthItem';
import OlapComputerItem from '../Olap/OlapComputerItem';

jest.mock('react-i18next', () => ({
    initReactI18next: {type: '3rdParty', init: jest.fn()},
    useTranslation: () => ({
        t: (key, values) => {
            return key === 'analysis.algorithm.parameter_example'
                ? `For example: ${values.value}`
                : key;
        },
    }),
}));

const formTree = (graph = 'hugegraph', algorithm = 'K-out') => (
    <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph}}>
        <AlgorithmPersistenceContext.Provider value={algorithm}>
            <Form>
                <Form.Item name='source'>
                    <Input aria-label='source' />
                </Form.Item>
            </Form>
        </AlgorithmPersistenceContext.Provider>
    </GraphAnalysisContext.Provider>
);

const renderForm = (graph = 'hugegraph', algorithm = 'K-out') => render(
    formTree(graph, algorithm)
);
const validField = () => Promise.resolve();

beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem('user', 'alice');
});

beforeAll(() => {
    window.matchMedia = window.matchMedia || (() => ({
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

test('persists and restores parameters per graph and algorithm', async () => {
    const first = renderForm();
    const source = screen.getByLabelText('source');
    expect(source).toHaveAttribute('placeholder', 'For example: 1:marko');

    fireEvent.change(source, {target: {value: '1:alice'}});
    expect(JSON.parse(window.localStorage.getItem(
        algorithmFormStorageKey('DEFAULT', 'hugegraph', 'K-out')
    ))).toEqual({source: '1:alice'});
    first.unmount();

    renderForm();
    await waitFor(() => expect(screen.getByLabelText('source')).toHaveValue('1:alice'));
});

const algorithmSourceFiles = directory => fs.readdirSync(directory, {withFileTypes: true})
    .flatMap(entry => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            return algorithmSourceFiles(entryPath);
        }
        return entry.name === 'index.js' ? [entryPath] : [];
    });

const literalFieldName = block => {
    const match = block.match(
        /name\s*=\s*(?:['"]([^'"]+)['"]|\{\s*\[(?:[\s\S]*,\s*)?['"]([^'"]+)['"]\s*\]\s*\})/
    );
    const name = match?.[1] || match?.[2];
    return name?.split('.').pop();
};

test('derives every uncovered named parameter from the real algorithm source tree', () => {
    const algorithmRoot = path.resolve(__dirname, '..');
    const missingExamples = [];
    const directAntFormImports = [];

    algorithmSourceFiles(algorithmRoot).forEach(file => {
        if (file === path.resolve(__dirname, 'index.js')) {
            return;
        }
        const source = fs.readFileSync(file, 'utf8');
        if (/import\s*\{[^}]*\bForm\b[^}]*\}\s*from\s*['"]antd['"]/.test(source)) {
            directAntFormImports.push(path.relative(algorithmRoot, file));
        }

        const itemBlocks = source.match(/<Form\.Item\b[\s\S]*?<\/Form\.Item>/g) || [];
        itemBlocks.forEach(block => {
            const fieldName = literalFieldName(block);
            if (!fieldName || /\binitialValue\s*=/.test(block)
                || /\bplaceholder\s*=/.test(block)) {
                return;
            }
            const example = inferExampleValue(fieldName);
            if (!example || /^example_/.test(example)) {
                missingExamples.push(
                    `${path.relative(algorithmRoot, file)}:${fieldName}`
                );
            }
        });
    });

    expect(directAntFormImports).toEqual([]);
    expect(missingExamples).toEqual([]);
});

test('uses examples accepted by the existing list and property converters', () => {
    expect(inferExampleValue('sources').split(','))
        .toEqual(['1:marko', '2:vadas']);
    expect(inferExampleValue('vertex_list').split(','))
        .toEqual(['1:marko', '2:vadas', '4:josh', '6:peter']);
    expect(formatPropertiesValue(inferExampleValue('properties')))
        .toEqual({weight: 0.1});
    expect(inferExampleValue('weight_by')).toBe('weight');
    expect(inferExampleValue('default_weight')).toBe('1.0');
});

test('keeps group_property compatible with its real numeric control and validator', async () => {
    const fusiformSource = fs.readFileSync(
        path.resolve(__dirname, '../Oltp/FusiformSimilarity/index.js'),
        'utf8'
    );
    const groupPropertyPattern = new RegExp(
        '<Form\\.Item(?:(?!<\\/Form\\.Item>)[\\s\\S])*?'
        + 'name=[\'\"]group_property[\'\"]'
        + '(?:(?!<\\/Form\\.Item>)[\\s\\S])*?<\\/Form\\.Item>'
    );
    const groupPropertyItem = fusiformSource.match(groupPropertyPattern)?.[0];
    const example = inferExampleValue('group_property');
    const numericExample = Number(example);

    expect(groupPropertyItem).toContain('<InputNumber />');
    expect(Number.isInteger(numericExample)).toBe(true);
    await expect(groupPropertyValidator(null, numericExample)).resolves.toBeUndefined();
});

test('renders examples through real shared and OLAP resource field components', () => {
    render(
        <GraphAnalysisContext.Provider
            value={{graphSpace: 'DEFAULT', graph: 'hugegraph', isVermeer: false}}
        >
            <AlgorithmPersistenceContext.Provider value='resource-example-test'>
                <Form>
                    <MaxDepthItem validator={validField} />
                    <OlapComputerItem />
                </Form>
            </AlgorithmPersistenceContext.Provider>
        </GraphAnalysisContext.Provider>
    );

    expect(screen.getByLabelText('max_depth'))
        .toHaveAttribute('placeholder', 'For example: 10');
    expect(screen.getByLabelText('k8s.computer_cpu'))
        .toHaveAttribute('placeholder', 'For example: 2');
    expect(screen.getByLabelText('k8s.worker_request_memory'))
        .toHaveAttribute('placeholder', 'For example: 1Gi');
});

test('resets an existing form when the next graph has no saved draft', async () => {
    const view = renderForm();
    fireEvent.change(screen.getByLabelText('source'), {target: {value: '1:alice'}});

    view.rerender(formTree('empty-graph'));

    await waitFor(() => expect(screen.getByLabelText('source')).toHaveValue(''));
});

test('isolates storage keys by login user and schema version', () => {
    const alice = algorithmFormStorageKey('DEFAULT', 'hugegraph', 'K-out', 'alice');
    const bob = algorithmFormStorageKey('DEFAULT', 'hugegraph', 'K-out', 'bob');

    expect(alice).not.toBe(bob);
    expect(alice).toContain('hubble.algorithm.v1.alice.');
});

test('logout cleanup removes only the current user algorithm drafts', () => {
    const alice = algorithmFormStorageKey('DEFAULT', 'hugegraph', 'K-out', 'alice');
    const bob = algorithmFormStorageKey('DEFAULT', 'hugegraph', 'K-out', 'bob');
    window.localStorage.setItem(alice, '{"source":"1:alice"}');
    window.localStorage.setItem(bob, '{"source":"1:bob"}');

    clearPersistedAlgorithmFormsForUser('alice');

    expect(window.localStorage.getItem(alice)).toBeNull();
    expect(window.localStorage.getItem(bob)).not.toBeNull();
});

test('ignores malformed drafts and unavailable browser storage', async () => {
    const key = algorithmFormStorageKey('DEFAULT', 'hugegraph', 'K-out');
    window.localStorage.setItem(key, '{bad json');
    const setItem = jest.spyOn(Storage.prototype, 'setItem')
        .mockImplementationOnce(() => {
            throw new DOMException('quota exceeded', 'QuotaExceededError');
        });

    renderForm();
    await waitFor(() => expect(screen.getByLabelText('source')).toHaveValue(''));
    expect(() => fireEvent.change(
        screen.getByLabelText('source'), {target: {value: '1:alice'}}
    )).not.toThrow();

    setItem.mockRestore();
});

test('isolates drafts and reset only clears the current graph', () => {
    const current = algorithmFormStorageKey('DEFAULT', 'hugegraph', 'K-out');
    const other = algorithmFormStorageKey('DEFAULT', 'other', 'K-out');
    window.localStorage.setItem(current, '{"source":"1:alice"}');
    window.localStorage.setItem(other, '{"source":"1:bob"}');

    clearPersistedAlgorithmForms('DEFAULT', 'hugegraph');

    expect(window.localStorage.getItem(current)).toBeNull();
    expect(window.localStorage.getItem(other)).not.toBeNull();
});
