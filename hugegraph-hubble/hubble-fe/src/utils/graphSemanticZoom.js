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

const SEMANTIC_ZOOM_ITEM_THRESHOLD = 800;
const NODE_LABEL_ZOOM_THRESHOLD = 2;
const EDGE_LABEL_ZOOM_THRESHOLD = 3;

const getItemCount = data => {
    const nodes = Array.isArray(data?.nodes) ? data.nodes.length : 0;
    const edges = Array.isArray(data?.edges) ? data.edges.length : 0;
    return nodes + edges;
};

const isSemanticZoomCandidate = data => {
    return getItemCount(data) >= SEMANTIC_ZOOM_ITEM_THRESHOLD;
};

const getSemanticZoomVisibility = ({itemCount = 0, zoom = 1} = {}) => {
    if (itemCount < SEMANTIC_ZOOM_ITEM_THRESHOLD) {
        return {nodeLabels: true, edgeLabels: true};
    }
    return {
        nodeLabels: zoom >= NODE_LABEL_ZOOM_THRESHOLD,
        edgeLabels: zoom >= EDGE_LABEL_ZOOM_THRESHOLD,
    };
};

const setItemLabelVisibility = (item, visible) => {
    const label = item?.getContainer?.()?.find?.(shape => {
        return shape.get?.('name') === 'text-shape';
    });
    if (!label) {
        return false;
    }
    if (visible) {
        label.show();
    }
    else {
        label.hide();
    }
    return true;
};

const applySemanticZoom = (graph, data, options = {}) => {
    if (!graph || graph.destroyed) {
        return {nodeLabels: true, edgeLabels: true};
    }
    const visibility = getSemanticZoomVisibility({
        itemCount: getItemCount(data),
        zoom: graph.getZoom?.() || 1,
    });
    const {excludedItem, force = false, previousVisibility} = options;
    if (force || previousVisibility?.nodeLabels !== visibility.nodeLabels) {
        (graph.getNodes?.() || []).forEach(item => {
            if (item !== excludedItem) {
                setItemLabelVisibility(item, visibility.nodeLabels);
            }
        });
    }
    if (force || previousVisibility?.edgeLabels !== visibility.edgeLabels) {
        (graph.getEdges?.() || []).forEach(item => {
            if (item !== excludedItem) {
                setItemLabelVisibility(item, visibility.edgeLabels);
            }
        });
    }
    return visibility;
};

export {
    applySemanticZoom,
    getItemCount,
    getSemanticZoomVisibility,
    isSemanticZoomCandidate,
    setItemLabelVisibility,
};
