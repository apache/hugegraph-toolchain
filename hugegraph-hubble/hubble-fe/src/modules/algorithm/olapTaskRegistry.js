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

import {useEffect, useMemo, useState} from 'react';
import {USER_CHANGE_EVENT} from '../../utils/user';

const TASK_LIMIT = 8;
const EMPTY_TASKS = [];
const tasksByScope = new Map();
const latestByAlgorithm = new Map();
const pendingByScope = new Map();
const failuresByScope = new Map();
const scopeVersions = new Map();
let identityVersion = 0;
const listenersByScope = new Map();
const scopeKey = (graphSpace, graph) => JSON.stringify([graphSpace, graph]);

const notify = key => {
    listenersByScope.get(key)?.forEach(listener => listener());
};

export const recordOlapTask = ({graphSpace, graph, id, algorithm}) => {
    const taskId = Number(id);
    if (!graphSpace || !graph || !Number.isSafeInteger(taskId) || taskId >= 0) return;
    const key = scopeKey(graphSpace, graph);
    const previous = tasksByScope.get(key) || EMPTY_TASKS;
    const task = {id: taskId, algorithm: algorithm || ''};
    const byAlgorithm = latestByAlgorithm.get(key) || new Map();
    if (task.algorithm) byAlgorithm.set(task.algorithm, task);
    latestByAlgorithm.set(key, byAlgorithm);
    tasksByScope.set(key, [task, ...previous.filter(item => item.id !== taskId)].slice(0, TASK_LIMIT));
    notify(key);
};

export const clearOlapTasks = () => {
    identityVersion += 1;
    tasksByScope.clear();
    latestByAlgorithm.clear();
    pendingByScope.clear();
    failuresByScope.clear();
    listenersByScope.forEach((listeners, key) => {
        listeners.forEach(listener => listener());
        if (listeners.size === 0) listenersByScope.delete(key);
    });
};

export const clearOlapTasksForGraph = (graphSpace, graph) => {
    const key = scopeKey(graphSpace, graph);
    scopeVersions.set(key, (scopeVersions.get(key) || 0) + 1);
    tasksByScope.delete(key);
    latestByAlgorithm.delete(key);
    pendingByScope.delete(key);
    failuresByScope.delete(key);
    notify(key);
};

// A deleted GraphSpace invalidates every graph in it, including requests that
// are still in flight. Keep other spaces and their pending submissions intact.
export const clearOlapTasksForGraphSpace = graphSpace => {
    const keys = new Set([...tasksByScope.keys(), ...latestByAlgorithm.keys(), ...pendingByScope.keys(),
        ...failuresByScope.keys(), ...scopeVersions.keys(), ...listenersByScope.keys()]);
    for (const key of keys) {
        const [space, graph] = JSON.parse(key);
        if (space === graphSpace) clearOlapTasksForGraph(space, graph);
    }
};

export const getLatestOlapTask = (graphSpace, graph, algorithm) =>
    latestByAlgorithm.get(scopeKey(graphSpace, graph))?.get(algorithm);

// Identity events must invalidate pending work even while the algorithm page is unmounted.
if (typeof window !== 'undefined') window.addEventListener(USER_CHANGE_EVENT, clearOlapTasks);

export const beginPendingOlapTask = (graphSpace, graph, algorithm) => {
    const key = scopeKey(graphSpace, graph);
    const token = {key, algorithm, identityVersion, scopeVersion: scopeVersions.get(key) || 0};
    const failures = failuresByScope.get(key);
    failures?.delete(algorithm);
    if (failures?.size === 0) failuresByScope.delete(key);
    const pending = pendingByScope.get(key) || [];
    pendingByScope.set(key, [...pending, token]);
    notify(key);
    return token;
};

export const isPendingOlapTaskValid = token => Boolean(token) &&
    (pendingByScope.get(token.key) || []).includes(token) &&
    token.identityVersion === identityVersion &&
    token.scopeVersion === (scopeVersions.get(token.key) || 0);

export const finishPendingOlapTask = (token, failure, task) => {
    const valid = isPendingOlapTaskValid(token);
    if (valid && failure) {
        const failures = failuresByScope.get(token.key) || new Map();
        failures.delete(token.algorithm);
        failures.set(token.algorithm, failure);
        failuresByScope.set(token.key, failures);
    }
    // Publish a successful task before removing its pending marker, so subscribers
    // never see a settled request with neither a result nor a failure.
    if (valid && task) recordOlapTask(task);
    const pending = (pendingByScope.get(token.key) || []).filter(item => item !== token);
    if (pending.length) pendingByScope.set(token.key, pending);
    else pendingByScope.delete(token.key);
    notify(token.key);
    return valid;
};

export const consumeOlapFailure = (graphSpace, graph, algorithm) => {
    const key = scopeKey(graphSpace, graph);
    const failures = failuresByScope.get(key);
    if (!failures?.size) return undefined;
    const selected = algorithm ?? [...failures.keys()].at(-1);
    const failure = failures.get(selected);
    failures.delete(selected);
    if (!failures.size) failuresByScope.delete(key);
    return failure ? {...failure, algorithm: selected} : undefined;
};

export const usePendingOlapTasks = (graphSpace, graph) => {
    const key = useMemo(() => scopeKey(graphSpace, graph), [graph, graphSpace]);
    const [snapshot, setSnapshot] = useState(() => ({key, tasks: pendingByScope.get(key) || EMPTY_TASKS}));
    useEffect(() => {
        const update = () => setSnapshot({key, tasks: pendingByScope.get(key) || EMPTY_TASKS});
        update();
        const listeners = listenersByScope.get(key) || new Set();
        listeners.add(update);
        listenersByScope.set(key, listeners);
        return () => {
            listeners.delete(update);
            if (listeners.size === 0) listenersByScope.delete(key);
        };
    }, [key]);
    return snapshot.key === key ? snapshot.tasks : EMPTY_TASKS;
};

export const useOlapTasks = (graphSpace, graph) => {
    const key = useMemo(() => scopeKey(graphSpace, graph), [graph, graphSpace]);
    const [snapshot, setSnapshot] = useState(() => ({key, tasks: tasksByScope.get(key) || EMPTY_TASKS}));
    useEffect(() => {
        const update = () => setSnapshot({key, tasks: tasksByScope.get(key) || EMPTY_TASKS});
        update();
        const listeners = listenersByScope.get(key) || new Set();
        listeners.add(update);
        listenersByScope.set(key, listeners);
        return () => {
            listeners.delete(update);
            if (listeners.size === 0) listenersByScope.delete(key);
        };
    }, [key]);
    return snapshot.key === key ? snapshot.tasks : EMPTY_TASKS;
};
