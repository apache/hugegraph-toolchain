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

const TASK_LIMIT = 8;
const EMPTY_TASKS = [];
const tasksByScope = new Map();
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
    tasksByScope.set(key, [task, ...previous.filter(item => item.id !== taskId)].slice(0, TASK_LIMIT));
    notify(key);
};

export const clearOlapTasks = () => {
    tasksByScope.clear();
    listenersByScope.forEach((listeners, key) => {
        listeners.forEach(listener => listener());
        if (listeners.size === 0) listenersByScope.delete(key);
    });
};

export const clearOlapTasksForGraph = (graphSpace, graph) => {
    const key = scopeKey(graphSpace, graph);
    if (tasksByScope.delete(key)) notify(key);
};

export const useOlapTasks = (graphSpace, graph) => {
    const key = useMemo(() => scopeKey(graphSpace, graph), [graph, graphSpace]);
    const [tasks, setTasks] = useState(() => tasksByScope.get(key) || EMPTY_TASKS);
    useEffect(() => {
        const update = () => setTasks(tasksByScope.get(key) || EMPTY_TASKS);
        update();
        const listeners = listenersByScope.get(key) || new Set();
        listeners.add(update);
        listenersByScope.set(key, listeners);
        return () => {
            listeners.delete(update);
            if (listeners.size === 0) listenersByScope.delete(key);
        };
    }, [key]);
    return tasks;
};
