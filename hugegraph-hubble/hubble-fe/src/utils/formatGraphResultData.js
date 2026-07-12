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

import _ from 'lodash';
import icons, {processParallelEdges, getComboConfig} from './graph';
import {ALGORITHM_NAME, iconsMap} from './constants';
const {
    SAME_NEIGHBORS,
    SHORTEST_PATH,
    ALLPATHS,
} = ALGORITHM_NAME;

/**
 * 基于查询结果和metaData以及设置中的styleData生成GraphData
 * @param {*} queryData
 * @param {*} metaData
 * @param {*} styleData
 * @returns
 */
const formatToGraphData = (queryData, metaData, styleConfig) => {
    const nodes = [];
    const edges = [];
    if (_.isEmpty(queryData) || _.isEmpty(metaData)) {
        return {nodes, edges};
    }
    for (let item of queryData?.vertices || []) {
        const {label, id} = item;
        const metaConfig = _.find(metaData.vertexMeta, item => item.name === label);
        const customizedStyle = styleConfig?.nodes?.[label] || {};
        const {
            type: customizedType,
            size: customizedSize,
            icon: customizedIcon = {},
            labelCfg: customizedLabelCfg = {},
            style: customizedNodeStyle = {},
            anchorPoints,
        } = customizedStyle;
        const {
            fill: customizedColor,
            stroke: customizedStroke,
            fillOpacity, lineWidth,
            strokeOpacity,
        } = customizedNodeStyle;
        const {position: labelPosition} = customizedLabelCfg;
        const {fill: customizedLabelColor, fontSize: customizedLabelFontSize} = customizedLabelCfg.style || {};
        const {fontSize: customizeIconFontSize, _iconName, fill: iconFill} = customizedIcon;
        const {style: metaStyle = {}} = metaConfig || {};
        const {color: metaColor = '#5c73e6', display_fields = ['~id'], size = 'NORMAL'} = metaStyle;
        const metaNodeSize = ['TINY', 'SMALL', 'NORMAL', 'BIG', 'HUGE'].indexOf(size) * 10 + 10;
        nodes.push({
            id: item.id,
            properties: {...item.properties},
            metaConfig: _.cloneDeep(metaConfig),
            statistics: {...item.statistics},
            type: customizedType || 'circle',
            label: display_fields?.map(k => (k === '~id' ? id : item.properties[k])).join('\n'),
            itemType: label,
            legendType: label,
            size: customizedSize || metaNodeSize,
            style: {
                fill: customizedColor || metaColor,
                stroke: customizedStroke || metaColor,
                lineWidth: lineWidth || 1,
                fillOpacity: fillOpacity || 0.4,
                strokeOpacity: strokeOpacity || 1,
            },
            labelCfg: {
                position: labelPosition || 'bottom',
                style: {
                    fill: customizedLabelColor || '#343434',
                    fontSize: customizedLabelFontSize || 12,
                },
            },
            icon: {
                show: true,
                text: icons[iconsMap[_iconName]] || ' ',
                fontFamily: 'graphin',
                fontSize: customizeIconFontSize || 12,
                fill: iconFill,
                _iconName: _iconName,
            },
            anchorPoints: anchorPoints,
            stateStyles: {
                customActive: {
                    shadowColor: customizedColor || metaColor,
                    shadowBlur: 25,
                },
                addActive: {
                    shadowColor: 'red',
                    shadowBlur: 25,
                },
                customSelected: {
                    shadowColor: customizedColor || metaColor,
                    shadowBlur: 20,
                },
                activeByLegend: {
                    shadowColor: customizedColor || metaColor,
                    shadowBlur: 10,
                },
                inactiveByLegend: {},
                customFixed: {
                    stroke: '#E4E5EC',
                    lineWidth: 5,
                },
            },
        });
    }
    for (let item of queryData?.edges || []) {
        const {label: rawLabel} = item;
        const customizedStyle = styleConfig?.edges?.[rawLabel] || {};
        const metaConfig = _.find(metaData.edgeMeta, item => item.name === rawLabel);
        const {
            type: customizedType,
            labelCfg: customizedLabelCfg = {},
            style: customizedEdgeStyle = {},
        } = customizedStyle;
        const {
            stroke: customizedStroke,
            lineWidth: customizedLineWidth,
            endArrow: customizedEndArrow,
            lineDash,
        } = customizedEdgeStyle;
        const {style = {}} = metaConfig || {};
        const {color = '#5c73e6', display_fields = ['~id'], thickness = 'NORMAL', with_arrow: withArrow} = style;
        const edgeDisplayFields = display_fields.length === 1 && display_fields[0] === '~id'
            ? ['~label']
            : display_fields;
        const size = ['THICK', 'NORMAL', 'FINE'].indexOf(thickness) * 0.8 + 0.8;
        const arrowWidth = size + 5;
        const endArrow = withArrow ? {
            d: -0.7,
            path: `M 0,0 L ${arrowWidth} ${arrowWidth / 2}  L ${arrowWidth} ${-arrowWidth / 2} Z`,
            fill: customizedStroke || color,
            lineDash: [0, 0],
        } : null;
        edges.push({
            metaConfig: _.cloneDeep(metaConfig),
            id: item.id,
            rawLabel,
            source: item.source,
            target: item.target,
            type: customizedType || 'line',
            properties: {...item.properties},
            label: edgeDisplayFields?.map(k => {
                if (k === '~id') {
                    return item.id;
                }
                if (k === '~label') {
                    return rawLabel || item.id;
                }
                return item.properties[k];
            }).join('\n'),
            legendType: rawLabel,
            itemType: rawLabel,
            style: {
                lineDash: lineDash || false,
                stroke: customizedStroke || color,
                lineWidth: customizedLineWidth || size,
                lineAppendWidth: 20,
                endArrow: customizedEndArrow || endArrow,
            },
            labelCfg: {
                autoRotate: true,
                style: {
                    fill: '#000',
                    fontSize: 12,
                    background: {
                        fill: '#ffffff',
                        padding: [2, 2, 2, 2],
                        radius: 2,
                    },
                    ...customizedLabelCfg.style,
                },
            },
            loopCfg: {
                position: 'top',
                dist: 40,
                clockwise: true,
            },
            stateStyles: {
                edgeActive: {
                    shadowColor: color,
                    shadowBlur: 10,
                    'text-shape': {
                        fontWeight: 'bold',
                    },
                },
                addActive: {
                    lineWidth: size + 2,
                    shadowColor: color,
                    shadowBlur: 10,
                    'text-shape': {
                        fontWeight: 'bold',
                    },
                },
                edgeSelected: {
                    shadowColor: color,
                    shadowBlur: 10,
                    'text-shape': {
                        fontWeight: 'bold',
                    },
                },
                activeByLegend: {
                    shadowColor: color,
                    shadowBlur: 8,
                },
                inactiveByLegend: {
                    opacity: 0.5,
                },
            },
        });
    }
    const processedEdges = processParallelEdges(edges || []);
    return {nodes, edges: processedEdges};
};

/**
 * 补充图算法的options
 * @param {*} rawGraphData
 * @param {*} options
 * @param {*} algorithmName
 * @returns
 */
const formatToOptionedGraphData = (rawGraphData, options, algorithmName) => {
    const graphData = _.cloneDeep(rawGraphData);
    const {startId, endPointsId} = options || {};
    if (startId) {
        const startNode = _.find(graphData.nodes, ['id', startId]) || {};
        startNode.style = {
            ...startNode.style,
            shadowColor: startNode.style?.fill,
            shadowBlur: 10,
            lineWidth: 2,
        };
    }
    if (endPointsId) {
        const {startNodes, endNodes} = endPointsId;
        let combosTypeSet = new Set();
        graphData.combos = [];
        if (!_.isEmpty(startNodes)) {
            startNodes.forEach(item => {
                const node = _.find(graphData.nodes, ['id', item]) || {};
                node.tag = 'startNode';
                node.comboId = 'startCombo';
            });
        }
        if (!_.isEmpty(endNodes)) {
            endNodes.forEach(item => {
                const node = _.find(graphData.nodes, ['id', item]) || {};
                node.tag = 'endNode';
                node.comboId = 'endCombo';
            });
        }
        graphData.nodes.forEach(item => {
            const {comboId} = item;
            if (comboId) {
                combosTypeSet.add(comboId);
            }
            else {
                item.comboId = 'centerCombo';
                item.tag = 'centerNode';
                combosTypeSet.add('centerCombo');
            }
        }
        );
        for (let item of combosTypeSet) {
            let combo;
            switch (item) {
                case 'startCombo':
                    combo = getComboConfig('startCombo', 'blue');
                    graphData.combos.push(combo);
                    break;
                case 'centerCombo':
                    combo = getComboConfig('centerCombo', 'yellow');
                    graphData.combos.push(combo);
                    break;
                case 'endCombo':
                    combo = getComboConfig('endCombo', 'green');
                    graphData.combos.push(combo);
                    break;
                default:
                    break;
            }
        }
    }
    switch (algorithmName) {
        case SAME_NEIGHBORS:
            if (endPointsId) {
                const {startNodes, endNodes} = endPointsId;
                startNodes.forEach(item => {
                    const node = _.find(graphData.nodes, ['id', item]) || {};
                    node.style = {
                        ...node.style,
                        shadowColor: node.style?.fill,
                        shadowBlur: 10,
                        lineWidth: 2,
                    };
                });
                endNodes.forEach(item => {
                    const node = _.find(graphData.nodes, ['id', item]) || {};
                    node.style = {
                        ...node.style,
                        shadowColor: node.style?.fill,
                        shadowBlur: 10,
                        lineWidth: 2,
                    };
                });
                graphData.edges.forEach(item => {
                    item.style = {
                        ...item.style,
                        shadowColor: 'yellow',
                        shadowBlur: 8,
                    };
                });
            }
            break;
        case SHORTEST_PATH:
            graphData.nodes.forEach(item => {
                item.style = {
                    ...item.style,
                    shadowColor: item.style.fill,
                    shadowBlur: 10,
                    lineWidth: 2,
                };
            });
            graphData.edges.forEach(item => {
                item.style = {
                    ...item.style,
                    shadowColor: 'yellow',
                    shadowBlur: 8,
                };
            });
            break;
        case ALLPATHS:
            if (endPointsId) {
                const {startNodes, endNodes} = endPointsId;
                startNodes.forEach(item => {
                    const node = _.find(graphData.nodes, ['id', item]) || {};
                    node.style = {
                        ...node.style,
                        shadowColor: node.style?.fill,
                        shadowBlur: 10,
                        lineWidth: 2,
                    };
                });
                endNodes.forEach(item => {
                    const node = _.find(graphData.nodes, ['id', item]) || {};
                    node.style = {
                        ...node.style,
                        shadowColor: node.style?.fill,
                        shadowBlur: 10,
                        lineWidth: 2,
                    };
                });
            }
            break;
        default:
            break;
    }
    return graphData;
};

/**
 * 基于GraphData生成LegendData
 * @param {*} graphData
 * @returns
 */
const formatToLegendData = graphData => {
    const {nodes, edges} = graphData;
    const legendNodes = [];
    const legendEdges = [];
    const nodesTypes = new Set(nodes && nodes.map(item => item.legendType));
    for (const item of nodes) {
        const {legendType, labelCfg, style} = item;
        if (nodesTypes.has(legendType)) {
            legendNodes.push(
                {
                    id: legendType,
                    label: legendType,
                    type: 'circle',
                    size: 6,
                    style: {
                        ...style,
                        lineWidth: 1,
                        shadowBlur: 0,
                    },
                    labelCfg: {
                        style: {
                            ...labelCfg.style,
                            fontWeight: 'normal',
                            fontSize: 12,
                        },
                    },
                }
            );
            nodesTypes.delete(legendType);
        }
    }
    const edgesTypes = new Set(edges && edges.map(item => item.legendType));
    for (const item of edges) {
        const {labelCfg, style, legendType} = item;
        if (edgesTypes.has(legendType)) {
            legendEdges.push(
                {
                    id: legendType,
                    label: legendType,
                    type: 'line',
                    style: {
                        ...style,
                        lineWidth: 2,
                        endArrow: false,
                    },
                    labelCfg: {
                        style: {
                            ...labelCfg.style,
                            fontSize: 12,
                        },
                    },
                }
            );
            edgesTypes.delete(legendType);
        }
    }
    return {nodes: legendNodes, edges: legendEdges};
};

/**
 * 基于GraphData生成DownloadData
 * @param {*} graphData
 * @returns
 */
const formatToDownloadData = graphData => {
    const clonedGraphData = _.cloneDeep(graphData);
    const {nodes, edges: graphEdges} = clonedGraphData;
    const vertices = nodes.map(
        item => {
            const {id, legendType, properties} = item;
            return {id, label: legendType, properties};
        }
    );
    const edges = graphEdges.map(
        item => {
            const {id, rawLabel, itemType, legendType, label, source, target, properties} = item;
            return {id, label: rawLabel || itemType || legendType || label, source, target, properties};
        }
    );
    return {vertices, edges};
};

/**
 * 基于GraphData生成StyleConfigModal所需数据
 * @param {*} graphData
 * @returns
 */
const formatToStyleData = graphData => {
    const styleConfig = {nodes: {}, edges: {}};
    const {nodes, edges} = graphData || {};
    nodes?.forEach(item => {
        const {legendType, type, size, style, labelCfg, icon, anchorPoints} = item;
        styleConfig.nodes[legendType] = {
            type: type,
            size: size,
            style: style,
            labelCfg: labelCfg,
            icon: icon,
            anchorPoints: anchorPoints,
        };
    });
    edges?.forEach(item => {
        const {legendType, type, style, labelCfg} = item;
        styleConfig.edges[legendType] = {
            type: type,
            style: style,
            labelCfg: labelCfg,
        };
    });
    return styleConfig;
};

/**
 * 根据styleConfig生成新的GraphData
 * @param {*} graphData
 * @param {*} styleConfig
 * @returns
 */
const updateGraphDataStyle = (graphData, styleConfig) => {
    const {nodes, edges, combos} = graphData;
    const changedNodes = [];
    const changedEdges = [];
    const {nodes: nodesConfig, edges: edgesConfig} = styleConfig;
    nodes.forEach(item => {
        const {legendType} = item;
        const itemStyleConfig = nodesConfig[legendType];
        changedNodes.push({
            ...item,
            ...itemStyleConfig,
        });
    });
    edges.forEach(item => {
        const {legendType} = item;
        const itemStyleConfig = edgesConfig[legendType];
        changedEdges.push({
            ...item,
            ...itemStyleConfig,
        });
    });
    const processedEdges = processParallelEdges(changedEdges);
    return {nodes: changedNodes, edges: processedEdges, combos};
};

export {
    formatToGraphData,
    formatToOptionedGraphData,
    formatToLegendData,
    formatToDownloadData,
    formatToStyleData,
    updateGraphDataStyle,
};
