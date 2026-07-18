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

export const shouldRestartGraphLayout = (
    previousData,
    nextData,
    previousRevision,
    nextRevision
) => {
    return previousRevision !== nextRevision
        || topologySignature(previousData) !== topologySignature(nextData);
};

export const shouldKeepGraphCanvas = (isQueryMode, queryStatus, data) => {
    const itemCount = (data?.nodes?.length || 0) + (data?.edges?.length || 0);
    return isQueryMode && queryStatus === 'loading' && itemCount > 0;
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

export const disableChangeDataRelayout = layout => (
    layout ? {...layout, relayoutAtChangeData: false} : layout
);

export const ensureChangeDataRelayoutDisabled = graph => {
    const currentLayout = graph.get?.('layout');
    if (currentLayout && currentLayout.relayoutAtChangeData !== false) {
        graph.set?.('layout', disableChangeDataRelayout(currentLayout));
    }
};

export const applyGraphDataUpdate = ({
    graph,
    previousData,
    nextData,
    layout,
    previousRevision,
    nextRevision,
}) => {
    const restartLayout = shouldRestartGraphLayout(
        previousData,
        nextData,
        previousRevision,
        nextRevision
    );
    const renderedData = restartLayout ? nextData
        : preserveNodePositions(nextData, graph.getNodes?.());
    // Layout panels can replace cfg.layout. Reassert the G6 changeData
    // invariant without running a layout before updating the result data.
    ensureChangeDataRelayoutDisabled(graph);
    graph.changeData(renderedData, false);
    if (layout && restartLayout) {
        const currentLayout = graph.get?.('layout');
        const nextLayout = currentLayout?.type && currentLayout.type !== layout.type
            ? currentLayout
            : layout;
        graph.updateLayout(disableChangeDataRelayout(nextLayout));
    }
    return restartLayout;
};
