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

/**
 * @file 画布公共组件
 */

import React, {useCallback, useEffect, useState, useRef, useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import G6 from '@antv/g6';
import '@antv/graphin-icons/dist/index.css';
import _ from 'lodash';
import {GraphContext} from '../Context';
import ResizeObserver from 'resize-observer-polyfill';
import classnames from 'classnames';
import {fitView, mapLayoutNameToLayoutDetails} from '../../../utils/graph';
import {
    clearEdgesStates,
    clearItemStates,
    clearSelectedStates,
    highLightRelatedEdges,
    setItemLabelState,
} from '../../../utils/handleGraphState';
import c from './index.module.scss';
import './index.css';
import useCustomNode from '../../../customHook/useCustomNode';
import useCustomGrid from '../../../customHook/useCustomGrid';
import useCustomEdge from '../../../customHook/useCustomEdge';
import {
    applySemanticZoom,
    getItemCount,
    isSemanticZoomCandidate,
    setItemLabelVisibility,
} from '../../../utils/graphSemanticZoom';
import {applyGraphDataUpdate} from './data';

const Graph = (props, ref) => {
    const {t} = useTranslation();
    const {
        data,
        layout: layoutOptions,
        onGraphRender,
        isPanelEnable,
        onNodeClick,
        onEdgeClick,
        onNodedbClick,
        layoutRevision,
    } = props;

    useCustomGrid();
    useCustomNode();
    useCustomEdge();

    const container = useRef(null);
    const graph = useRef(null);
    const graphData = useRef(data);
    const graphDataRevision = useRef(layoutRevision);
    const hoveredItem = useRef(null);
    const semanticZoomVisibility = useRef();
    const semanticZoomHandler = useRef();
    const layoutName = layoutOptions?.layout;
    const layoutNodeCount = layoutOptions?.nodeCount;
    const layoutStartId = layoutOptions?.startId;

    const recordSemanticZoom = useCallback(
        visibility => {
            if (container.current) {
                container.current.dataset.semanticZoom = [
                    getItemCount(graphData.current),
                    graph.current?.getZoom?.().toFixed(2) || '1.00',
                    visibility.nodeLabels ? 'nodes-visible' : 'nodes-hidden',
                    visibility.edgeLabels ? 'edges-visible' : 'edges-hidden',
                ].join(':');
            }
        },
        []
    );

    const layout = useMemo(
        () => ({
            ...mapLayoutNameToLayoutDetails({
                layout: layoutName,
                nodeCount: layoutNodeCount,
                startId: layoutStartId,
            }),
            // G6 reads this option from cfg.layout in changeData(). Passing it
            // at the graph root or as changeData's second argument has no effect.
            relayoutAtChangeData: false,
        }),
        [layoutName, layoutNodeCount, layoutStartId]
    );
    const [context, setContext] = useState({
        graph: graph.current,
    });

    const focusCanvas = useCallback(event => {
        const isInteractive = event.target.closest?.(
            'button, input, textarea, select, a, [contenteditable="true"]'
        );
        if (!isInteractive) {
            event.currentTarget.focus({preventScroll: true});
        }
    }, []);

    const throttledContainerResize = useMemo(
        () => {
            return _.throttle((width, height) => {
                if (graph.current) {
                    graph.current.changeSize(width, height);
                    fitView(graph.current);
                }
            }, 500);
        },
        []
    );

    const graphClassName = classnames(
        c.graph,
        {[c.layoutPanelOpen]: isPanelEnable}
    );

    const syncGraphData = useCallback(
        graphInstance => {
            if (!graphInstance || graphInstance.destroyed) {
                return;
            }
            const nextData = data || {nodes: [], edges: []};
            applyGraphDataUpdate({
                graph: graphInstance,
                previousData: graphData.current,
                nextData,
                layout,
                previousRevision: graphDataRevision.current,
                nextRevision: layoutRevision,
            });
            graphData.current = nextData;
            graphDataRevision.current = layoutRevision;
            graphInstance.refresh();
            semanticZoomVisibility.current = applySemanticZoom(graphInstance, data, {
                excludedItem: hoveredItem.current,
                force: true,
                previousVisibility: semanticZoomVisibility.current,
            });
            recordSemanticZoom(semanticZoomVisibility.current);
        },
        [data, layout, layoutRevision, recordSemanticZoom]
    );

    useEffect(
        () => {
            const resizeObserver = new ResizeObserver(entries => {
                for (let entry of entries) {
                    const {width, height} = entry.contentRect;
                    throttledContainerResize(width, height);
                }
            });
            resizeObserver.observe(container.current);
            return () => {
                resizeObserver.disconnect();
            };
        },
        [throttledContainerResize]
    );

    let clickount = 0;
    const debounceClick = _.debounce((evt, graphInstance) => {
        if (clickount > 1) {
            clickount = 0;
            return;
        }
        clearEdgesStates(graph.current, ['edgeActive', 'addActive']);
        const {item} = evt;
        clearItemStates(graph.current, item, ['customActive', 'addActive']);
        graphInstance.setItemState(item, 'customSelected', true);
        onNodeClick && onNodeClick(item);
        clickount = 0;
    }, 300);

    useEffect(
        () => {
            const hasGraphInstance = graph.current && !graph.current.destroyed;
            const shouldLayout = !(_.isEmpty(data.nodes) && _.isEmpty(data.edges)) && layout;
            if (!hasGraphInstance && shouldLayout) {
                const graphOptions = {
                    container: container.current,
                    layout,
                    enabledStack: true,
                    maxStep: 11,
                    modes: {
                        default: [
                            'drag-canvas',
                            'zoom-canvas',
                            'drag-node'],
                    },
                    // Force2 already computes the final positions synchronously.
                    // G6's graph-level positionsAnimate() can race repeated result
                    // refreshes and restore stale grid coordinates afterwards.
                    animate: false,
                    defaultNode: {
                        labelCfg: {
                            position: 'bottom',
                        },
                        icon: {
                            lineWidth: 0,
                            fontSize: 36,
                        },
                    },
                };
                const graphInstance = new G6.Graph(graphOptions);
                const applyCurrentSemanticZoom = force => {
                    semanticZoomVisibility.current = applySemanticZoom(
                        graphInstance,
                        graphData.current,
                        {
                            excludedItem: hoveredItem.current,
                            force,
                            previousVisibility: semanticZoomVisibility.current,
                        }
                    );
                    recordSemanticZoom(semanticZoomVisibility.current);
                };
                graphInstance.on('node:mouseenter', evt => {
                    const {item} = evt;
                    hoveredItem.current = item;
                    graphInstance.setItemState(item, 'customActive', true);
                    highLightRelatedEdges(graphInstance, item);
                    setItemLabelState(graphInstance, item, 'bold');
                    if (isSemanticZoomCandidate(graphData.current)) {
                        setItemLabelVisibility(item, true);
                    }
                });
                graphInstance.on('node:mouseleave', evt => {
                    const {item} = evt;
                    hoveredItem.current = null;
                    clearItemStates(graphInstance, item, ['customActive', 'addActive']);
                    clearEdgesStates(graphInstance, ['edgeActive', 'addActive']);
                    setItemLabelState(graphInstance, item, 'normal');
                    setItemLabelVisibility(
                        item,
                        semanticZoomVisibility.current?.nodeLabels !== false
                    );
                });
                graphInstance.on('node:click', evt => {
                    const {item} = evt;
                    clickount++;
                    clearSelectedStates(graphInstance);
                    debounceClick(evt, graphInstance, item);
                });
                graphInstance.on('edge:mouseenter', evt => {
                    const {item} = evt;
                    hoveredItem.current = item;
                    graphInstance.setItemState(item, 'edgeActive', true);
                    if (isSemanticZoomCandidate(graphData.current)) {
                        setItemLabelVisibility(item, true);
                    }
                });
                graphInstance.on('edge:mouseleave', evt => {
                    const {item} = evt;
                    hoveredItem.current = null;
                    clearItemStates(graphInstance, item, ['edgeActive', 'addActive']);
                    setItemLabelVisibility(
                        item,
                        semanticZoomVisibility.current?.edgeLabels !== false
                    );
                });
                graphInstance.on('edge:click', evt => {
                    clearSelectedStates(graphInstance);
                    const {item} = evt;
                    graphInstance.setItemState(item, 'edgeSelected', true);
                    item.toFront();
                    onEdgeClick && onEdgeClick(item);
                });
                graphInstance.on('canvas:click', evt => {
                    clearSelectedStates(graphInstance);
                });
                graphInstance.on('node:dblclick', evt => {
                    const {item} = evt;
                    onNodedbClick && onNodedbClick(item, graphInstance);
                });
                graphInstance.on('afterrender', evt => {
                    applyCurrentSemanticZoom(true);
                    onGraphRender && onGraphRender(graphInstance);
                });
                graphInstance.on('afterlayout', () => {
                    fitView(graphInstance);
                    applyCurrentSemanticZoom(true);
                });
                semanticZoomHandler.current = _.throttle(evt => {
                    if (evt.action === 'zoom') {
                        applyCurrentSemanticZoom(false);
                    }
                }, 80);
                graphInstance.on('viewportchange', semanticZoomHandler.current);
                graphInstance.get('canvas').set('localRefresh', false);
                graph.current = graphInstance;
                setContext({
                    graph: graphInstance,
                });
                graphInstance.data(data);
                graphInstance.render();
            };
        },
        [clickount, data, debounceClick, layout, onEdgeClick, onGraphRender, onNodeClick,
            onNodedbClick, recordSemanticZoom]
    );

    useEffect(
        () => {
            const hasGraphInstance = graph.current && !graph.current.destroyed;
            if (hasGraphInstance) {
                syncGraphData(graph.current);
            }
        },
        [syncGraphData]
    );

    useEffect(
        () => {
            return () => {
                semanticZoomHandler.current?.cancel();
                graph.current?.destroy();
            };
        },
        []
    );

    return (
        <GraphContext.Provider value={context}>
            <div
                ref={container}
                className={graphClassName}
                id={'graph'}
                tabIndex={0}
                aria-label={t('analysis.canvas.graph_canvas')}
                onMouseDown={focusCanvas}
            >
                {props.children}
            </div>
        </GraphContext.Provider>
    );
};

export default Graph;
