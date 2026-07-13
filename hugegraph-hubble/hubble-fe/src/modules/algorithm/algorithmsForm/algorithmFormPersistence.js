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

export const AlgorithmPersistenceContext = React.createContext('unknown');

const STORAGE_VERSION = 'v1';

const currentUserName = () => {
    try {
        return window.localStorage.getItem('user') || 'anonymous';
    }
    catch {
        return 'anonymous';
    }
};

const userStoragePrefix = userName => (
    `hubble.algorithm.${STORAGE_VERSION}.`
    + `${encodeURIComponent(userName || 'anonymous')}.`
);

const storagePrefix = (graphSpace, graph, userName = currentUserName()) => (
    `${userStoragePrefix(userName)}`
    + `${encodeURIComponent(graphSpace || 'DEFAULT')}.`
    + `${encodeURIComponent(graph || 'unknown')}.`
);

export const algorithmFormStorageKey = (
    graphSpace,
    graph,
    algorithmName,
    userName = currentUserName()
) => (
    `${storagePrefix(graphSpace, graph, userName)}`
    + `${encodeURIComponent(algorithmName || 'unknown')}`
);

export const clearPersistedAlgorithmForms = (graphSpace, graph) => {
    const prefix = storagePrefix(graphSpace, graph);
    try {
        Object.keys(window.localStorage)
            .filter(key => key.startsWith(prefix))
            .forEach(key => window.localStorage.removeItem(key));
    }
    catch {
        // Reset the mounted forms even when browser storage is unavailable.
    }
};

export const clearPersistedAlgorithmFormsForUser = (
    userName = currentUserName()
) => {
    const prefix = userStoragePrefix(userName);
    try {
        Object.keys(window.localStorage)
            .filter(key => key.startsWith(prefix))
            .forEach(key => window.localStorage.removeItem(key));
    }
    catch {
        // Logout must succeed even when browser storage is unavailable.
    }
};
