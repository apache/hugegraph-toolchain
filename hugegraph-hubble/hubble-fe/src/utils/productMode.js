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

import {getResourceDisplayName} from './displayName';

const DEFAULT_GRAPHSPACE = 'DEFAULT';

const getGraphspacePath = pdEnabled => (
    pdEnabled ? '/graphspace' : `/graphspace/${DEFAULT_GRAPHSPACE}`
);

const getManageNavItems = pdEnabled => [
    {
        key: 'graphspace',
        url: getGraphspacePath(pdEnabled),
    },
    {
        key: 'source',
        url: '/source',
    },
    {
        key: 'task',
        url: '/task',
    },
];

const isPdOnlyPath = pathname => {
    return pathname === '/graphspace'
        || pathname.startsWith('/account')
        || pathname.startsWith('/resource')
        || pathname.startsWith('/role')
        || pathname.startsWith('/super');
};

const shouldUseNonPdDefaultGraphspace = (pdEnabled, graphspace) => {
    return !pdEnabled && graphspace !== DEFAULT_GRAPHSPACE;
};

const getTaskGraphspaceOptions = (pdEnabled, graphspaces = []) => {
    if (!pdEnabled) {
        return [{
            label: DEFAULT_GRAPHSPACE,
            value: DEFAULT_GRAPHSPACE,
        }];
    }

    return graphspaces.map(item => ({
        label: getResourceDisplayName(item.name, item.nickname),
        value: item.name,
    }));
};

const isGraphCreateEnabled = () => true;

const isGraphDefaultMutationEnabled = pdEnabled => pdEnabled;

export {
    DEFAULT_GRAPHSPACE,
    getGraphspacePath,
    getManageNavItems,
    getTaskGraphspaceOptions,
    isGraphCreateEnabled,
    isGraphDefaultMutationEnabled,
    isPdOnlyPath,
    shouldUseNonPdDefaultGraphspace,
};
