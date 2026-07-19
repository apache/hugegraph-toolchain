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
import {Empty, Space} from 'antd';
import {Link} from 'react-router-dom';
import GraphAnalysisContext from '../../../Context';
import Graph from '../../../component/Graph';
import Legend from '../../../component/Legend';
import MiniMap from '../../../component/MiniMap';
import GraphMenuBar from '../GraphMenuBar';
import Tooltip from '../../../component/Tooltip';
import GraphToolBar from '../GraphToolBar';
import Menu from '../../../component/Menu';
import NumberCard from '../../../component/NumberCard';
import EditElement from '../../../component/EditElement';
import Search from '../../../component/Search';
import SettingConfigPanel from '../../../component/SettingConfigPanel';
import LayoutConfigPanel from '../../../component/layoutConfigPanel/Home';
import PanelControlButton from '../../../component/ClosePanelButton';
import DynamicAddNode from '../../../component/DynamicAddNode';
import DynamicAddEdge from '../../../component/DynamicAddEdge';
import NeighborRankApiView from '../NeighborRankView';
import StatisticPanel from '../../../component/StatisticsPanel/Home';
import RankApiView from '../RankApiView';
import JaccView from '../JaccView';
import GraphStatusView from '../../../component/GraphStatusView';
import TaskNavigateView from '../../../component/TaskNavigateView';
import Canvas3D from '../../../component/Canvas3D';
import {filterData} from '../../../../utils/filter';
import {formatToGraphData, formatToOptionedGraphData, formatToStyleData,
    formatToDownloadData, updateGraphDataStyle, formatToLegendData} from '../../../../utils/formatGraphResultData';
import {fetchExpandInfo, handleAddGraphNode, handleAddGraphEdge, handleExpandGraph} from '../utils';
import {mapLayoutNameToLayoutDetails} from '../../../../utils/graph';
import {
    GRAPH_STATUS, PANEL_TYPE, GRAPH_RENDER_MODE, ALGORITHM_NAME, Algorithm_Layout,
    getAlgorithmDisplayName, getCanonicalAlgorithmName,
} from '../../../../utils/constants';
import c from './index.module.scss';
import _ from 'lodash';
import {disableChangeDataRelayout} from '../../../component/Graph/data';

const GraphResult = props => {
    const {t} = useTranslation();
    const {
        data = {vertexs: [], edges: []},
        metaData,
        options,
        asyncTaskId,
        queryStatus,
        queryMessage,
        isQueryMode,
        algorithm: algorithmName,
        resetGraphStatus,
        panelType,
        updatePanelType,
        graphNums,
        propertyKeysRecords,
        graphRenderMode,
        onGraphRenderModeChange,
    } = props;
    const canonicalAlgorithmName = useMemo(
        () => getCanonicalAlgorithmName(algorithmName, t),
        [algorithmName, t]
    );
    const displayAlgorithmName = getAlgorithmDisplayName(algorithmName, t);

    const {STANDBY, LOADING, SUCCESS, FAILED, UPLOAD_FAILED} = GRAPH_STATUS;
    const {JACCARD_SIMILARITY, JACCARD_SIMILARITY_POST, RANK_API,
        NEIGHBOR_RANK_API, ADAMIC_ADAR, RESOURCE_ALLOCATION} = ALGORITHM_NAME;
    const noneGraphAlgorithm = [JACCARD_SIMILARITY, JACCARD_SIMILARITY_POST, RANK_API,
        NEIGHBOR_RANK_API, ADAMIC_ADAR, RESOURCE_ALLOCATION];
    const {CLOSED, LAYOUT, SETTING, STATISTICS} = PANEL_TYPE;
    const {CANVAS2D} = GRAPH_RENDER_MODE;


    const graphSpaceInfo = useContext(GraphAnalysisContext);
    const {edgeMeta, vertexMeta} = metaData || {};
    const hasGraphData = Number(graphNums?.vertexCount) > 0
        || Number(graphNums?.edgeCount) > 0;
    const hasKnownEmptyCounts = Number(graphNums?.vertexCount) === 0
        && Number(graphNums?.edgeCount) === 0;
    const hasKnownEmptySchema = Array.isArray(vertexMeta) && Array.isArray(edgeMeta)
        && vertexMeta.length === 0 && edgeMeta.length === 0;
    const isEmptyGraph = !hasGraphData && (hasKnownEmptyCounts || hasKnownEmptySchema);
    const [graphData, setGraphData] = useState({nodes: [], edges: []});
    const [styleConfigData, setStyleConfigData] = useState({nodes: {}, edges: {}});
    const [showAddNodeDrawer, setShowAddNodeDrawer] = useState(false);
    const [showAddEdgeDrawer, setShowAddEdgeDrawer] = useState(false);
    const [isClickNew, setIsClickNew] = useState(false);
    const [searchVisible, setSearchVisible] = useState(false);
    const [searchVertex, setSearchVertex] = useState({});
    const [addEdgeDrawerInfo, setAddEdgeDrawerInfo]  = useState({});
    const [isOutEdge, setOutEdge] = useState(false);
    const [showEditElement, setShowEditElement] = useState(false);
    const [editElementInfo, setEditElementInfo] = useState();
    const [graph, setGraph] = useState();
    const [graphAllInfo, setGraphAllInfo] = useState();
    const excuteStyleChangeCount = useRef(0);
    const {jaccardsimilarity, rankObj, rankArray} = options || {};
    const showCanvasInfo =  (_.size(data.vertices) !== 0 || _.size(data.edges) !== 0) && queryStatus === SUCCESS;
    const layoutInfo = useMemo(
        () => mapLayoutNameToLayoutDetails({
            layout: Algorithm_Layout[canonicalAlgorithmName],
            startId: options?.startId,
        }),
        [canonicalAlgorithmName, options?.startId]
    );

    const onGraphRender = useCallback(graph => {
        setGraph(graph);
    }, []);

    useEffect(() => {
        setGraphAllInfo(graphNums);
    }, [graphNums]);

    useEffect(
        () => {
            const rawGraphData = formatToGraphData(data, metaData, {});
            const finalGraphData = formatToOptionedGraphData(rawGraphData, options, canonicalAlgorithmName);
            const styleConfigData = formatToStyleData(rawGraphData);
            setGraphData(finalGraphData);
            setStyleConfigData(styleConfigData);
        },
        [canonicalAlgorithmName, data, metaData, options]
    );

    const handleUpdateStatus = useCallback(
        (status, message, result) => {
            resetGraphStatus && resetGraphStatus(status, message, result);
        },
        [resetGraphStatus]
    );

    const handleExportPng = useCallback(
        fileName => {
            graph.downloadFullImage(fileName, 'image/png', {backgroundColor: '#FFF', padding: 30});
        },
        [graph]
    );

    const handleGraphStyleChange = useCallback(
        styleConfigData => {
            try {
                const styledData = updateGraphDataStyle(graphData, styleConfigData);
                const newGraphData = formatToOptionedGraphData(styledData, options, canonicalAlgorithmName);
                graph.changeData(_.cloneDeep(newGraphData), true);
                graph.getNodes().forEach(item => {
                    graph.refreshItem(item);
                    if (item.hasLocked()) {
                        graph.setItemState(item, 'customFixed', true);
                    }
                });
                setGraphData({...styledData});
                setStyleConfigData(styleConfigData);
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
        [canonicalAlgorithmName, graph, graphData, options]
    );

    const handleRefreshExcuteCount = useCallback(() => {
        excuteStyleChangeCount.current = 0;
    }, []);

    const handleFilterChange = useCallback(
        values => {
            const {filter} = values;
            const newData = filterData(props.data, filter.rules, filter.logic);
            const newRawGraphData = formatToGraphData(newData || {}, metaData, styleConfigData);
            const newGraphData = formatToOptionedGraphData(newRawGraphData, options, canonicalAlgorithmName);
            graph.changeData(newGraphData, true);
            graph.refresh();
            setGraphData(newGraphData);
            setStyleConfigData(formatToStyleData(newRawGraphData));
        },
        [canonicalAlgorithmName, graph, metaData, options, props.data, styleConfigData]
    );

    const handleTogglePanel = useCallback(
        type => {
            if (panelType === type) {
                updatePanelType(CLOSED);
            }
            else {
                updatePanelType(type);
            }
        }, [CLOSED, panelType, updatePanelType]
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
        }, [graph]
    );

    const handleClickNewAddNode = useCallback(
        () => {
            setShowAddNodeDrawer(true);
        }, []);

    const handleClickNewAddEdge = useCallback(
        isOut => {
            setIsClickNew(true);
            setShowAddEdgeDrawer(true);
            setOutEdge(isOut);
        }, []);

    const handleClickGraphNode = useCallback(
        value => {
            setShowEditElement(true);
            setEditElementInfo(value.getModel());
        }, []);

    const handleExpand = useCallback(
        (newData, graphInstance) => {
            const newGraphData = handleExpandGraph(newData, metaData,
                styleConfigData, options, canonicalAlgorithmName, graphInstance);
            setGraphData(newGraphData);
            setStyleConfigData(formatToStyleData(newGraphData));
        }, [canonicalAlgorithmName, metaData, options, styleConfigData]);

    const getExpandInfo = useCallback(
        async (params, graphInstance) => {
            const searchResultRaw = await fetchExpandInfo(params, graphInstance, graphSpaceInfo);
            handleExpand(searchResultRaw, graphInstance);
        }, [graphSpaceInfo, handleExpand]);

    const handleClickGraphEdge = useCallback(
        value => {
            const drawerInfo = value.getModel();
            setShowEditElement(true);
            setEditElementInfo(drawerInfo);
        }, []
    );

    const handledbClickNode = useCallback(
        (node, graphInstance) => {
            const model = node.getModel();
            const params = {vertex_id: model.id, vertex_label: model.itemType};
            getExpandInfo(params, graphInstance);
        },
        [getExpandInfo]
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
        }, []
    );

    const toggleAddEdgeDrawer = useCallback(
        () => {
            setShowAddEdgeDrawer(pre => !pre);
        }, []
    );

    const handleClosePanel = useCallback(
        () => {
            updatePanelType(CLOSED);
        },
        [CLOSED, updatePanelType]
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
        [CLOSED, STANDBY, resetGraphStatus, updatePanelType]
    );

    const handleClickAddNode = useCallback(() => {
        setShowAddNodeDrawer(true);
    }, []);

    const handleClickAddEdge = useCallback(
        (info, isOutEdge) => {
            setIsClickNew(false);
            setShowAddEdgeDrawer(true);
            setAddEdgeDrawerInfo(info);
            setOutEdge(isOutEdge);
        },
        []
    );

    const handleClickMenuExpand = useCallback(
        params => {
            getExpandInfo(params, graph);
        },
        [getExpandInfo, graph]
    );

    const handleSearch = useCallback(
        vertex => {
            setSearchVisible(true);
            setSearchVertex(vertex);
        },
        []
    );

    const onCloseEditElement = useCallback(
        () => {
            setShowEditElement(false);
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
            const updatedGraphData = {...graphData, [type]: updatedInfo};
            setGraphData(updatedGraphData);
        },
        [graphData]
    );

    const handleCloseSearch = useCallback(
        () => {
            setSearchVisible(false);
        },
        []
    );

    const handleChangeSearch = useCallback(
        params => {
            getExpandInfo(params, graph);
            handleCloseSearch();
        },
        [getExpandInfo, graph, handleCloseSearch]
    );
    const renderCanvas2D = () => (
        <Graph
            data={graphData}
            layout={{layout: Algorithm_Layout[canonicalAlgorithmName], startId: options.startId}}
            onGraphRender={onGraphRender}
            onNodeClick={handleClickGraphNode}
            onEdgeClick={handleClickGraphEdge}
            onNodedbClick={handledbClickNode}
        >
            <MiniMap />
            <Tooltip />
            <GraphToolBar
                handleRedoUndoChange={handleRedoUndoChange}
                handleClearGraph={handleClearGraph}
                panelType={panelType}
                updatePanelType={updatePanelType}
            />
            <Menu
                onClickAddNode={handleClickAddNode}
                onClickAddEdge={handleClickAddEdge}
                onClickExpand={handleClickMenuExpand}
                onClickSearch={handleSearch}
            />
            <Legend data={formatToLegendData(graphData)} />
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
            <EditElement
                show={showEditElement}
                cancel={onCloseEditElement}
                drawerInfo={editElementInfo}
                edgeMeta={edgeMeta}
                onChange={onEditElementChange}
            />
            <Search
                open={searchVisible}
                onClose={handleCloseSearch}
                onChange={handleChangeSearch}
                propertykeys={propertyKeysRecords}
                {...searchVertex}
            />
            <StatisticPanel
                open={panelType === STATISTICS}
                graphDataNums={{nodesNum: graphData.nodes.length, edgesNum: graphData.edges.length}}
                statistics={data?.statistics || {}}
            />
        </Graph>
    );

    const renderCanvas3D = () => (<Canvas3D data={graphData} />);

    const statusMessage = useMemo(() => ({
        [STANDBY]: t('analysis.query_result.no_data'),
        [LOADING]: t('analysis.query_result.loading'),
        [FAILED]: queryMessage || t('analysis.query_result.run_failed'),
        [UPLOAD_FAILED]: queryMessage || t('analysis.query_result.import_failed'),
    }), [LOADING, FAILED, STANDBY, UPLOAD_FAILED, queryMessage, t]);

    const renderMainContent = () => {
        if (queryStatus === STANDBY && isEmptyGraph) {
            return (
                <Empty
                    className={c.emptyGraph}
                    description={(
                        <div>
                            <strong>{t('analysis.algorithm.empty_graph_title')}</strong>
                            <p>{t('analysis.algorithm.empty_graph_description')}</p>
                        </div>
                    )}
                >
                    <Space>
                        <Link
                            to={`/graphspace/${graphSpaceInfo.graphSpace}/graph/`
                                + `${graphSpaceInfo.graph}/meta`}
                        >
                            {t('analysis.algorithm.create_schema')}
                        </Link>
                        <Link to='/source'>
                            {t('analysis.algorithm.prepare_data')}
                        </Link>
                    </Space>
                </Empty>
            );
        }
        if (queryStatus === SUCCESS) {
            if (!isQueryMode) {
                return (
                    <TaskNavigateView
                        message={t('analysis.algorithm.task_submit_success', {
                            name: displayAlgorithmName,
                        })}
                        taskId={asyncTaskId}
                    />
                );
            }
            if (!showCanvasInfo && !noneGraphAlgorithm.includes(canonicalAlgorithmName)) {
                return (
                    <GraphStatusView
                        status={SUCCESS}
                        message={t('analysis.query_result.no_graph_result')}
                    />
                );
            }
            switch (canonicalAlgorithmName) {
                case JACCARD_SIMILARITY:
                case ADAMIC_ADAR:
                case RESOURCE_ALLOCATION:
                    return <JaccView jaccardsimilarity={jaccardsimilarity} />;
                case JACCARD_SIMILARITY_POST:
                case RANK_API:
                    return <RankApiView rankObj={rankObj} />;
                case NEIGHBOR_RANK_API:
                    return <NeighborRankApiView rankArray={rankArray} />;
            };
            return graphRenderMode === CANVAS2D ? renderCanvas2D() : renderCanvas3D();
        }
        return <GraphStatusView status={queryStatus} message={statusMessage[queryStatus]} />;
    };

    const handleSwitchRenderMode = useCallback(
        value => {
            onGraphRenderModeChange(value);
            updatePanelType(CLOSED);
        },
        [CLOSED, onGraphRenderModeChange, updatePanelType]
    );

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
            {renderMainContent()}
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
