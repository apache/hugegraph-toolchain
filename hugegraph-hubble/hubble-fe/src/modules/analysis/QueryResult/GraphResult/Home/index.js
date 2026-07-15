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
 * @file 图分析画布 Home
 */

import React, {useCallback, useEffect, useState, useContext, useMemo, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import GraphAnalysisContext from '../../../../Context';
import Graph from '../../../../component/Graph';
import Legend from '../../../../component/Legend';
import Menu from '../../../../component/Menu';
import Search from '../../../../component/Search';
import DynamicAddNode from '../../../../component/DynamicAddNode';
import DynamicAddEdge from '../../../../component/DynamicAddEdge';
import LayoutConfigPanel from '../../../../component/layoutConfigPanel/Home';
import SettingConfigPanel from '../../../../component/SettingConfigPanel';
import PanelControlButton from '../../../../component/ClosePanelButton';
import Canvas3D from '../../../../component/Canvas3D';
import StatisticPanel from '../../../../component/StatisticsPanel/Home';
import Tooltip from '../../../../component/Tooltip';
import MiniMap from '../../../../component/MiniMap';
import NumberCard from '../../../../component/NumberCard';
import GraphStatusView from '../../../../component/GraphStatusView';
import TaskNavigateView from '../../../../component/TaskNavigateView';
import EditElement from '../../../../component/EditElement';
import GraphToolBar from '../GraphToolBar';
import GraphMenuBar from '../GraphMenubar';
import {GRAPH_STATUS, PANEL_TYPE, GRAPH_RENDER_MODE} from '../../../../../utils/constants';
import {formatToGraphData, formatToLegendData, formatToDownloadData,
    formatToStyleData, updateGraphDataStyle} from '../../../../../utils/formatGraphResultData';
import {mapLayoutNameToLayoutDetails} from '../../../../../utils/graph';
import {
    disableChangeDataRelayout,
    shouldKeepGraphCanvas,
} from '../../../../component/Graph/data';
import {nextResultRevision} from './data';
import {getQueryResultStandbyMessage} from '../../Home/utils';
import {fetchExpandInfo, handleAddGraphNode, handleAddGraphEdge, handleExpandGraph} from '../utils';
import {filterData} from '../../../../../utils/filter';
import c from './index.module.scss';
import _ from 'lodash';

const {STANDBY, LOADING, SUCCESS, FAILED, UPLOAD_FAILED} = GRAPH_STATUS;
const {CLOSED, LAYOUT, SETTING, STATISTICS} = PANEL_TYPE;
const {CANVAS2D} = GRAPH_RENDER_MODE;

const layoutInfo = mapLayoutNameToLayoutDetails('force');

const GraphResult = props => {
    const {t} = useTranslation();
    const {
        data = {vertexs: [], edges: []},
        metaData,
        isQueryMode,
        queryStatus,
        queryMessage,
        asyncTaskId,
        resetGraphStatus,
        panelType,
        updatePanelType,
        propertyKeysRecords,
        graphNums,
        graphRenderMode,
        onGraphRenderModeChange,
    } = props;

    const excuteStyleChangeCount = useRef(0);

    const {edgeMeta, vertexMeta} = metaData || {};
    const graphSpaceInfo = useContext(GraphAnalysisContext);

    const [graphData, setGraphData] = useState({nodes: [], edges: []});
    const [resultRevision, setResultRevision] = useState(0);
    const queryResultRef = useRef(data);
    const [legendData, setLegendData] = useState();
    const [styleConfigData, setStyleConfigData] = useState({nodes: {}, edges: {}});
    const [showEditElement, setShowEditElement] = useState(false);
    const [showAddNodeDrawer, setShowAddNodeDrawer] = useState(false);
    const [showAddEdgeDrawer, setShowAddEdgeDrawer] = useState(false);
    const [editElementInfo, setEditElementInfo] = useState();
    const [isClickNew, setIsClickNew] = useState(false);
    const [addEdgeDrawerInfo, setAddEdgeDrawerInfo]  = useState({});
    const [isOutEdge, setOutEdge] = useState(false);
    const [searchVisible, setSearchVisible] = useState(false);
    const [searchVertex, setSearchVertex] = useState({});
    const [graphAllInfo, setGraphAllInfo] = useState();
    const [graph, setGraph] = useState();
    const showCanvasInfo =  (_.size(data.vertices) !== 0 || _.size(data.edges) !== 0) && queryStatus === SUCCESS;
    const defaultLayout = useMemo(
        () => ({layout: 'force', nodeCount: graphData.nodes.length}),
        [graphData.nodes.length]
    );

    useEffect(
        () => {
            const graphData = formatToGraphData(data, metaData, {});
            setGraphData(graphData);
            setResultRevision(revision => nextResultRevision(
                queryResultRef.current,
                data,
                revision
            ));
            queryResultRef.current = data;
        },
        [data, metaData]
    );

    useEffect(
        () => {
            setGraphAllInfo(graphNums);
        },
        [graphNums]
    );

    useEffect(
        () => {
            const legendData = formatToLegendData(graphData);
            setLegendData(legendData);
        },
        [graphData]
    );

    useEffect(
        () => {
            const styleConfigData = formatToStyleData(graphData);
            setStyleConfigData(styleConfigData);
        },
        [graphData]
    );

    const handleGraphStyleChange = useCallback(
        styleConfigData => {
            try {
                const styledData = updateGraphDataStyle(graphData, styleConfigData);
                graph.changeData(_.cloneDeep(styledData), true);
                graph.getNodes().forEach(item => {
                    graph.refreshItem(item);
                    if (item.hasLocked()) {
                        graph.setItemState(item, 'customFixed', true);
                    }
                });
                setGraphData({...styledData});
            }
            catch (err) {
                if (excuteStyleChangeCount.current > 2) {
                    throw new Error(err);
                }
                else {
                    excuteStyleChangeCount.current++;
                    handleGraphStyleChange(styleConfigData);
                }
            }
        },
        [graph, graphData]
    );

    const handleUpdateStatus = useCallback(
        (status, message, result) => {
            const uploadedData = {
                graph_view: result,
                json_view: {},
                table_view: {},
            };
            resetGraphStatus && resetGraphStatus(status, message, uploadedData);
        },
        [resetGraphStatus]
    );

    const handleLayoutChange = useCallback(
        layout => {
            graph.destroyLayout();
            graph.updateLayout(
                disableChangeDataRelayout(layout),
                'center',
                undefined,
                false
            );
        },
        [graph]
    );

    const handleSettingChange = useCallback(
        changedData => {
            graph.changeData(_.cloneDeep(changedData), false);
            graph.refresh();
            setGraphData({...changedData});
        },
        [graph]
    );

    const handleClosePanel = useCallback(
        () => {
            updatePanelType(CLOSED);
        },
        [updatePanelType]
    );

    const handleExportPng = useCallback(
        fileName => {
            graph.downloadFullImage(fileName, 'image/png', {backgroundColor: '#FFF', padding: 30});
        },
        [graph]
    );

    const handleRedoUndoChange = useCallback(
        (type, values) => {
            let changedData;
            if (type === 'changedata') {
                changedData = values;
            }
            else {
                changedData = graph.cfg.data;
            }
            setGraphData({...changedData});
        },
        [graph]
    );

    const handleClearGraph = useCallback(
        () => {
            resetGraphStatus && resetGraphStatus(STANDBY, undefined, {});
            updatePanelType(CLOSED);
        },
        [resetGraphStatus, updatePanelType]
    );

    const handleAddNode = useCallback(
        data => {
            const newItem = handleAddGraphNode(data, metaData, styleConfigData, graph);
            const {nodes, edges} = graphData;
            setGraphData({edges, nodes: [...nodes, newItem]});
            setGraphAllInfo({...graphAllInfo, vertexCount: Number(graphAllInfo.vertexCount) + 1});
        },
        [graph, graphAllInfo, graphData, metaData, styleConfigData]
    );

    const handleAddEdge = useCallback(
        data => {
            const newGraphData = handleAddGraphEdge(data, metaData, graphData, styleConfigData, graph);
            setGraphData(newGraphData);
            setGraphAllInfo({...graphAllInfo, edgeCount: Number(graphAllInfo.edgeCount) + 1});
        },
        [graph, graphAllInfo, graphData, metaData, styleConfigData]
    );

    const toggleAddNodeDrawer = useCallback(
        () => {
            setShowAddNodeDrawer(pre => !pre);
        },
        []
    );

    const toggleAddEdgeDrawer = useCallback(
        () => {
            setShowAddEdgeDrawer(pre => !pre);
        },
        []
    );

    const handleClickNewAddNode = useCallback(
        () => {
            setShowAddNodeDrawer(true);
        },
        []
    );

    const handleClickAddNode = useCallback(
        () => {
            setShowAddNodeDrawer(true);
        },
        []
    );

    const handleClickAddEdge = useCallback(
        (info, isOutEdge) => {
            setIsClickNew(false);
            setShowAddEdgeDrawer(true);
            setAddEdgeDrawerInfo(info);
            setOutEdge(isOutEdge);
        },
        []
    );

    const handleClickNewAddEdge = useCallback(
        isOut => {
            setIsClickNew(true);
            setShowAddEdgeDrawer(true);
            setOutEdge(isOut);
        }, []
    );

    const handleSwitchRenderMode = useCallback(
        value => {
            onGraphRenderModeChange(value);
            updatePanelType(CLOSED);

        },
        [onGraphRenderModeChange, updatePanelType]
    );

    const handleFilterChange = useCallback(
        values => {
            const {filter} = values;
            const newData = filterData(props.data, filter.rules, filter.logic);
            const newGraphData = formatToGraphData(newData || {}, metaData, styleConfigData);
            graph.changeData(newGraphData, true);
            graph.refresh();
            setGraphData(newGraphData);
        },
        [graph, metaData, props.data, styleConfigData]
    );

    const handleRefreshExcuteCount = useCallback(
        () => {
            excuteStyleChangeCount.current = 0;
        },
        []
    );

    const onGraphRender = useCallback(
        graph => {
            setGraph(graph);
        },
        []
    );

    const onCloseEditElement = useCallback(
        () => {
            setShowEditElement(false);
        },
        []
    );

    const handleClickGraphNode = useCallback(
        value => {
            const drawerInfo = value.getModel();
            setShowEditElement(true);
            setEditElementInfo(drawerInfo);
        },
        []
    );

    const handleClickGraphEdge = useCallback(
        value => {
            const drawerInfo = value.getModel();
            setShowEditElement(true);
            setEditElementInfo(drawerInfo);
        },
        []
    );

    const onEditElementChange = useCallback(
        (type, item, itemData) => {
            const {id} = item.getModel();
            const updatedInfo = graphData[type].map(
                item => {
                    if (item.id === id) {
                        return {...item, ...itemData};
                    }
                    return item;
                }
            );
            const updatedGraphData = {
                ...graphData,
                [type]: updatedInfo,
            };
            setGraphData(updatedGraphData);
        },
        [graphData]
    );

    const handleExpand = useCallback(
        (newData, graphInstance) => {
            const newGraphData = handleExpandGraph(newData, metaData, styleConfigData, graphInstance);
            setGraphData(newGraphData);
        },
        [metaData, styleConfigData]
    );

    const handleSearch = useCallback(
        vertex => {
            setSearchVisible(true);
            setSearchVertex(vertex);
        },
        []
    );

    const handleCloseSearch = useCallback(
        () => {
            setSearchVisible(false);
        },
        []
    );

    const getExpandInfo = useCallback(
        async (params, graphInstance) => {
            const searchResultRaw = await fetchExpandInfo(params, graphInstance, graphSpaceInfo);
            handleExpand(searchResultRaw, graphInstance);
        },
        [graphSpaceInfo, handleExpand]
    );

    const handleChangeSearch = useCallback(
        params => {
            getExpandInfo(params, graph);
            handleCloseSearch();
        },
        [getExpandInfo, graph, handleCloseSearch]
    );

    const handledbClickNode = useCallback(
        (node, graphInstance) => {
            const model = node.getModel();
            const params = {vertex_id: model.id, vertex_label: model.itemType};
            getExpandInfo(params, graphInstance);
        },
        [getExpandInfo]
    );

    const handleClickMenuExpand = useCallback(
        params => {
            getExpandInfo(params, graph);
        },
        [getExpandInfo, graph]
    );

    const handleTogglePanel = useCallback(
        type => {
            if (panelType === type) {
                updatePanelType(CLOSED);
            }
            else {
                updatePanelType(type);
            }
        }, [panelType, updatePanelType]
    );

    const renderCanvas2D = () => (
        <Graph
            data={graphData}
            layout={defaultLayout}
            layoutRevision={resultRevision}
            onGraphRender={onGraphRender}
            onNodeClick={handleClickGraphNode}
            onEdgeClick={handleClickGraphEdge}
            onNodedbClick={handledbClickNode}
        >
            <Legend data={legendData} />
            <Menu
                onClickAddNode={handleClickAddNode}
                onClickAddEdge={handleClickAddEdge}
                onClickExpand={handleClickMenuExpand}
                onClickSearch={handleSearch}
            />
            <EditElement
                show={showEditElement}
                cancel={onCloseEditElement}
                drawerInfo={editElementInfo}
                onChange={onEditElementChange}
                edgeMeta={edgeMeta}
            />
            <DynamicAddNode
                open={showAddNodeDrawer}
                onOK={handleAddNode}
                onCancel={toggleAddNodeDrawer}
                drawerInfo={vertexMeta}
            />
            <DynamicAddEdge
                open={showAddEdgeDrawer}
                onCancel={toggleAddEdgeDrawer}
                onOk={handleAddEdge}
                graphData={formatToDownloadData(graphData)}
                drawerInfo={addEdgeDrawerInfo}
                isClickNew={isClickNew}
                isOutEdge={isOutEdge}
            />
            <PanelControlButton show={panelType !== CLOSED} onClick={handleClosePanel} />
            <LayoutConfigPanel
                layout={layoutInfo}
                data={graphData}
                onChange={handleLayoutChange}
                open={panelType === LAYOUT}
            />
            <SettingConfigPanel
                data={_.cloneDeep(graphData)}
                onChange={handleSettingChange}
                open={panelType === SETTING}
            />
            <Search
                open={searchVisible}
                onClose={handleCloseSearch}
                onChange={handleChangeSearch}
                propertykeys={propertyKeysRecords}
                {...searchVertex}
            />
            <GraphToolBar
                handleRedoUndoChange={handleRedoUndoChange}
                handleClearGraph={handleClearGraph}
                panelType={panelType}
                updatePanelType={updatePanelType}
            />
            <Tooltip />
            <MiniMap />
            <StatisticPanel
                open={panelType === STATISTICS}
                graphDataNums={{nodesNum: graphData.nodes.length, edgesNum: graphData.edges.length}}
                statistics={data?.statistics || {}}
            />
        </Graph>
    );

    const renderCanvas3D = () => (<Canvas3D data={graphData} />);

    const renderGraphView = () => {
        switch (queryStatus) {
            case STANDBY:
                return (
                    <GraphStatusView
                        status={STANDBY}
                        message={getQueryResultStandbyMessage(t, isQueryMode)}
                    />
                );
            case LOADING:
                if (shouldKeepGraphCanvas(isQueryMode, queryStatus, graphData)) {
                    return graphRenderMode === CANVAS2D ? renderCanvas2D() : renderCanvas3D();
                }
                return (
                    <GraphStatusView
                        status={LOADING}
                        message={isQueryMode
                            ? t('analysis.query_result.loading')
                            : t('analysis.query_result.submitting_task')}
                    />
                );
            case FAILED:
                return (
                    <GraphStatusView
                        status={FAILED}
                        message={queryMessage || t('analysis.query_result.submit_failed')}
                    />
                );
            case UPLOAD_FAILED:
                return (
                    <GraphStatusView
                        status={UPLOAD_FAILED}
                        message={queryMessage || t('analysis.query_result.import_failed')}
                    />
                );
            case SUCCESS:
                if (isQueryMode) {
                    if (!showCanvasInfo) {
                        return (
                            <GraphStatusView
                                status={SUCCESS}
                                message={t('analysis.query_result.no_graph_result')}
                            />
                        );
                    }
                    return graphRenderMode === CANVAS2D ? renderCanvas2D() : renderCanvas3D();
                }
                return (
                    <TaskNavigateView message={t('analysis.query_result.submit_success')} taskId={asyncTaskId} />
                );
        }
    };

    return (
        <div className={c.graphResult}>
            <GraphMenuBar
                styleConfigData={styleConfigData}
                graphData={graphData}
                handleImportData={handleUpdateStatus}
                handleExportPng={handleExportPng}
                handleGraphStyleChange={handleGraphStyleChange}
                handleFilterChange={handleFilterChange}
                handleTogglePanel={handleTogglePanel}
                handleClickNewAddNode={handleClickNewAddNode}
                handleClickNewAddEdge={handleClickNewAddEdge}
                handleSwitchRenderMode={handleSwitchRenderMode}
                refreshExcuteCount={handleRefreshExcuteCount}
                showCanvasInfo={showCanvasInfo}
                graphRenderMode={graphRenderMode}
            />
            {renderGraphView()}
            <NumberCard
                hasPadding={panelType !== CLOSED}
                data={{
                    currentGraphNodesNum: graphData.nodes.length,
                    currentGraphEdgesNum: graphData.edges.length,
                    allGraphNodesNum: graphAllInfo?.vertexCount,
                    allGraphEdgesNum: graphAllInfo?.edgeCount,
                }}
            />
        </div>
    );
};

export default GraphResult;
