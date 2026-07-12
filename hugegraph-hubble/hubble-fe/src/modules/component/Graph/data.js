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

const topologySignature = data => {
    const nodes = (data?.nodes || []).map(node => String(node.id)).sort();
    const edges = (data?.edges || []).map(edge => [
        String(edge.id),
        String(edge.source),
        String(edge.target),
    ].join('\u0000')).sort();
    return JSON.stringify([nodes, edges]);
};

export const shouldRestartGraphLayout = (previousData, nextData) => {
    return topologySignature(previousData) !== topologySignature(nextData);
};

export const preserveNodePositions = (data, graphItems = []) => {
    const positions = new Map();
    graphItems.forEach(item => {
        const model = item?.getModel?.();
        if (model?.id !== undefined
            && Number.isFinite(model.x) && Number.isFinite(model.y)) {
            positions.set(String(model.id), {x: model.x, y: model.y});
        }
    });
    return {
        ...(data || {}),
        nodes: (data?.nodes || []).map(node => ({
            ...node,
            ...(positions.get(String(node.id)) || {}),
        })),
        edges: data?.edges || [],
    };
};
