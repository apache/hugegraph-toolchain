/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the
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

import {
    getGraphspacePath,
    getManageNavItems,
    getTaskGraphspaceOptions,
    isGraphCreateEnabled,
    isGraphDefaultMutationEnabled,
    isPdOnlyPath,
    shouldUseNonPdDefaultGraphspace,
} from './productMode';

describe('product mode helpers', () => {
    test('keeps source and task visible in non-PD mode', () => {
        expect(getManageNavItems(false).map(item => item.url)).toEqual([
            '/graphspace/DEFAULT',
            '/source',
            '/task',
        ]);
    });

    test('uses graphspace list in PD mode', () => {
        expect(getGraphspacePath(true)).toBe('/graphspace');
        expect(getGraphspacePath(false)).toBe('/graphspace/DEFAULT');
    });

    test('keeps Schema templates shared while guarding PD-only lifecycle paths', () => {
        expect(isPdOnlyPath('/graphspace')).toBe(true);
        expect(isPdOnlyPath('/graphspace/DEFAULT/schema')).toBe(false);
        expect(isPdOnlyPath('/account')).toBe(true);
        expect(isPdOnlyPath('/role/graphspace/DEFAULT/admin')).toBe(true);
        expect(isPdOnlyPath('/source')).toBe(false);
        expect(isPdOnlyPath('/task')).toBe(false);
    });

    test('routes non-PD graphspace traffic to DEFAULT', () => {
        expect(shouldUseNonPdDefaultGraphspace(false, 'DEFAULT')).toBe(false);
        expect(shouldUseNonPdDefaultGraphspace(false, 'demo')).toBe(true);
        expect(shouldUseNonPdDefaultGraphspace(true, 'demo')).toBe(false);
    });

    test('keeps graph create available while disabling default mutation in non-PD mode', () => {
        expect(isGraphCreateEnabled(false)).toBe(true);
        expect(isGraphCreateEnabled(true)).toBe(true);
        expect(isGraphDefaultMutationEnabled(false)).toBe(false);
        expect(isGraphDefaultMutationEnabled(true)).toBe(true);
    });

    test('locks task graphspace selection to DEFAULT in non-PD mode', () => {
        const graphspaces = [
            {name: 'demo', nickname: 'Demo'},
            {name: 'DEFAULT', nickname: 'Default Name'},
        ];

        expect(getTaskGraphspaceOptions(false, graphspaces)).toEqual([{
            label: 'DEFAULT',
            value: 'DEFAULT',
        }]);
        expect(getTaskGraphspaceOptions(true, graphspaces)).toEqual([
            {label: 'Demo', value: 'demo'},
            {label: 'Default Name', value: 'DEFAULT'},
        ]);
    });

    test('falls back to GraphSpace names when aliases are empty or echoed', () => {
        expect(getTaskGraphspaceOptions(true, [
            {name: 'empty', nickname: ''},
            {name: 'echoed', nickname: 'echoed'},
            {name: 'aliased', nickname: 'Aliased'},
        ])).toEqual([
            {label: 'empty', value: 'empty'},
            {label: 'echoed', value: 'echoed'},
            {label: 'Aliased', value: 'aliased'},
        ]);
    });
});
