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

import iconLoader from '@antv/graphin-icons';

/**
 * fitView
 * @param {*} graph
 */
const fitView = graph => {
    const padding = [50, 50, 50, 50];
    const width = graph.get('width');
    const height = graph.get('height');

    if (width <= padding[1] + padding[3]
        || height <= padding[0] + padding[2]) {
        return;
    }
    const group = graph.get('group');
    group.resetMatrix();
    const bbox = group.getCanvasBBox();

    if (bbox.width === 0 || bbox.height === 0) {
        return;
    }
    const viewCenter = {
        x: (width - padding[1] - padding[3]) / 2 + padding[3],
        y: (height - padding[0] - padding[2]) / 2 + padding[0],
    };

    const groupCenter = {
        x: bbox.x + bbox.width / 2,
        y: bbox.y + bbox.height / 2,
    };

    const w = (width - padding[1] - padding[3]) / bbox.width;
    const h = (height - padding[0] - padding[2]) / bbox.height;
    graph.translate(viewCenter.x - groupCenter.x, viewCenter.y - groupCenter.y);
    const fitRatio = Math.min(w, h);
    const itemCount = (graph.getNodes?.()?.length || 0)
        + (graph.getEdges?.()?.length || 0);
    const shouldMagnifySmallGraph = itemCount > 0 && itemCount <= 40 && fitRatio > 1;
    if (fitRatio < 1 || shouldMagnifySmallGraph) {
        const ratio = shouldMagnifySmallGraph ? Math.min(fitRatio, 1.35) : fitRatio;
        if (!graph.zoom(ratio, viewCenter)) {
            console.warn('zoom failed, ratio out of range, ratio: %f', ratio);
        }
    }
};

/**
 * 布局匹配
 * @param {*} layoutOpitions
 * @returns
 */
const mapLayoutNameToLayoutDetails = layoutOptions => {
    const {layout} = layoutOptions || {};
    const nodeCount = Number(layoutOptions?.nodeCount) || 0;
    const smallGraph = nodeCount > 0 && nodeCount <= 20;
    const largeGraph = nodeCount >= 500;
    let res;
    const forceOptions = {
        type: 'force2',
        animate: false,
        preventOverlap: !largeGraph,
        linkDistance: smallGraph ? 140 : largeGraph ? 48 : 84,
        nodeStrength: smallGraph ? 1800 : largeGraph ? 650 : 1000,
        nodeSpacing: node => {
            const size = Array.isArray(node?.size) ? Math.max(...node.size) : node?.size;
            return Math.max(smallGraph ? 32 : 12, Number(size) / 2 || 0);
        },
        maxIteration: largeGraph ? 260 : 420,
        centripetalOptions: {
            leaf: 5,
            single: 5,
            others: 2,
        },
        damping: 0.9,
        preset: {
            type: 'grid',
        },
    };
    switch (layout) {
        case 'force':
            res = forceOptions;
            break;
        case 'forceAtlas':
            res = {
                type: 'forceAtlas2',
                preventOverlap: true,
                kr: 200,
                kg: 30,
                barnesHut: true,
                maxIteration: 1000,
            };
            break;
        case 'radial':
            res = {
                type: 'radial',
                focusNode: layoutOptions.startId,
                unitRadius: 130,
                preventOverlap: true,
                strictRadial: true,
                maxPreventOverlapIteration: 1000,
                nodeSpacing: d => {
                    const {size = 60} = d;
                    return size / 3;
                },
            };
            break;
        case 'random':
            res = {
                type: 'random',
            };
            break;
        case 'relationship':
            res = {
                pipes: [
                    {
                        type: 'concentric',
                        nodesFilter: node => (node.tag === 'startNode'),
                        preventOverlap: true,
                        center: [100, 400],
                    },
                    {
                        type: 'concentric',
                        nodesFilter: node => (node.tag === 'centerNode'),
                        preventOverlap: true,
                        center: [600, 400],
                    },
                    {
                        type: 'concentric',
                        nodesFilter: node => (node.tag === 'endNode'),
                        preventOverlap: true,
                        center: [1100, 400],
                    },
                ],
            };
            break;
        case 'grid':
            res = {
                type: 'grid',
                rows: '',
                cols: '',
            };
            break;
        case 'dagre':
            res = {
                rankdir: 'TB',
                align: 'DL',
                ranksep: 50,
                nodesep: 50,
            };
            break;
        default:
            res = forceOptions;
    }
    return res;
};

/**
 * 颜色加深算法
 * @param {*} hex
 * @param {*} percent
 * @returns
 */
const colorBrightness = (hex, percent) => {
    hex = hex.replace(/^\s*#|\s*$/g, '');

    if (hex.length === 3) {
        hex = hex.replace(/(.)/g, '$1$1');
    }

    let r = parseInt(hex.substr(0, 2), 16);
    let g = parseInt(hex.substr(2, 2), 16);
    let b = parseInt(hex.substr(4, 2), 16);

    return '#'
       + ((0 | (1 << 8) + r + (256 - r) * percent / 100).toString(16)).substring(1)
       + ((0 | (1 << 8) + g + (256 - g) * percent / 100).toString(16)).substring(1)
       + ((0 | (1 << 8) + b + (256 - b) * percent / 100).toString(16)).substring(1);
};

const registerFontFamily = iconLoader => {
    const iconFont = iconLoader();
    const {glyphs} = iconFont;
    const icons = glyphs.map(item => {
        return {
            name: item.name,
            unicode: String.fromCodePoint(item.unicode_decimal),
        };
    });
    return new Proxy(icons, {
        get: (target, propKey) => {
            const matchIcon = target.find(icon => {
                return icon.name === propKey;
            });
            if (!matchIcon) {
                return '';
            }
            return matchIcon?.unicode;
        },
    });
};
const icons = registerFontFamily(iconLoader);


const processParallelEdges = edges => {
    const offsetDiff = -18;
    const runningLineType = {
        multiEdgeType: 'runningQuadratic',
        singleEdgeType: 'runningLine',
        loopEdgeType: 'runningLoop',
    };
    const defaultLineType = {
        multiEdgeType: 'quadratic',
        singleEdgeType: 'line',
        loopEdgeType: 'loop',
    };
    const len = edges.length;
    const cod = offsetDiff * 2;
    const loopPosition = [
        'top',
        'top-right',
        'right',
        'bottom-right',
        'bottom',
        'bottom-left',
        'left',
        'top-left',
    ];
    const loopArc = [
        0,
        0.25 * Math.PI,
        0.5 * Math.PI,
        0.75 * Math.PI,
        Math.PI,
        1.25 * Math.PI,
        1.5 * Math.PI,
        1.75 * Math.PI,
    ];
    const edgeMap = {};
    const tags = [];
    const reverses = {};
    for (let i = 0; i < len; i++) {
        const edge = edges[i];
        const {source, target} = edge;
        const sourceTarget = `${source}-${target}`;
        if (tags[i]) {
            continue;
        }
        if (!edgeMap[sourceTarget]) {
            edgeMap[sourceTarget] = [];
        }
        tags[i] = true;
        edgeMap[sourceTarget].push(edge);
        for (let j = 0; j < len; j++) {
            if (i === j) {
                continue;
            }
            const sedge = edges[j];
            const src = sedge.source;
            const dst = sedge.target;
            // 两个节点之间共同的边,第一条的source = 第二条的target 或者 第一条的target = 第二条的source
            if (!tags[j]) {
                if (source === dst && target === src) {
                    edgeMap[sourceTarget].push(sedge);
                    tags[j] = true;
                    reverses[`${src}|${dst}|${edgeMap[sourceTarget].length - 1}`] = true;
                }
                else if (source === src && target === dst) {
                    edgeMap[sourceTarget].push(sedge);
                    tags[j] = true;
                }
            }
        }
    }
    // current.rotation和current.curvate参数用于3D展示的重叠边处理
    // eslint-disable-next-line guard-for-in
    for (const key in edgeMap) {
        const arcEdges = edgeMap[key];
        const {length} = arcEdges;
        for (let k = 0; k < length; k++) {
            const current = arcEdges[k];
            const lineTypes = current.type === 'runningLine' ? runningLineType : defaultLineType;
            const {singleEdgeType, multiEdgeType, loopEdgeType} = lineTypes;
            // loop边处理
            if (current.source === current.target) {
                if (loopEdgeType) {
                    current.type = loopEdgeType;
                }
                // 超过8条自环边，则需要重新处理
                current.loopCfg = {
                    position: loopPosition[k % 8],
                    dist: Math.floor(k / 8) * 20 + 50,
                };
                // 3D部分超过8条子环边，增加curvature，循环rotation
                current.curvature = Math.floor(k / 8) * 0.2 + 0.5;
                current.rotation = loopArc[k % 8];
                continue;
            }
            // 直线边，不需要新增参数
            if (length === 1 && singleEdgeType && current.source !== current.target) {
                current.type = singleEdgeType;
                continue;
            }
            // 平行边处理 对于2D只需要增加offset，对于3D，8个内增加rotation，其余增加curvature;
            current.type = multiEdgeType;
            const sign = (k % 2 === 0 ? 1 : -1) * (reverses[`${current.source}|${current.target}|${k}`] ? -1 : 1);
            if (length % 2 === 1) {
                current.curveOffset = sign * Math.ceil(k / 2) * cod;
            }
            else {
                current.curveOffset = sign * (Math.floor(k / 2) * cod + offsetDiff);
            }
            const shouldReverse = reverses[`${current.source}|${current.target}|${k}`] ? -1 : 1;
            current.curvature = (Math.floor(k / 8) * 0.4 + 0.5) * shouldReverse;
            current.rotation = length > 8 ? loopArc[k % 8] * shouldReverse : k / length * Math.PI * 2 * shouldReverse;
        }
    }
    return edges;
};

const getComboConfig = (id, color) => {
    const comboConfig = {
        id: id,
        type: 'rect',
        style: {
            stroke: color,
            fill: color,
            fillOpacity: '0.1',
        },
    };
    return comboConfig;
};

export {
    fitView,
    mapLayoutNameToLayoutDetails,
    colorBrightness,
    processParallelEdges,
    getComboConfig,
};
export default icons;
