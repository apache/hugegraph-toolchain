/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import {render, screen} from '@testing-library/react';
import GraphResult from './index';
import GraphAnalysisContext from '../../../Context';
import {GRAPH_STATUS, GRAPH_RENDER_MODE, PANEL_TYPE} from '../../../../utils/constants';

jest.mock('../../../component/Graph', () => ({children}) => <div>{children}</div>);
jest.mock('../../../component/Legend', () => () => null);
jest.mock('../../../component/MiniMap', () => () => null);
jest.mock('../GraphMenuBar', () => () => <div>graph menu</div>);
jest.mock('../../../component/Tooltip', () => () => null);
jest.mock('../GraphToolBar', () => () => null);
jest.mock('../../../component/Menu', () => () => null);
jest.mock('../../../component/NumberCard', () => () => null);
jest.mock('../../../component/EditElement', () => () => null);
jest.mock('../../../component/Search', () => () => null);
jest.mock('../../../component/SettingConfigPanel', () => () => null);
jest.mock('../../../component/layoutConfigPanel/Home', () => () => null);
jest.mock('../../../component/ClosePanelButton', () => () => null);
jest.mock('../../../component/DynamicAddNode', () => () => null);
jest.mock('../../../component/DynamicAddEdge', () => () => null);
jest.mock('../NeighborRankView', () => () => null);
jest.mock('../../../component/StatisticsPanel/Home', () => () => null);
jest.mock('../RankApiView', () => () => null);
jest.mock('../JaccView', () => () => null);
jest.mock('../../../component/GraphStatusView', () => props => <div>{props.message}</div>);
jest.mock('../../../component/TaskNavigateView', () => () => null);
jest.mock('../../../component/Canvas3D', () => () => null);
jest.mock('../utils', () => ({
    fetchExpandInfo: jest.fn(),
    handleAddGraphNode: jest.fn(),
    handleAddGraphEdge: jest.fn(),
    handleExpandGraph: jest.fn(),
}));
jest.mock('react-router-dom', () => ({
    Link: ({to, children}) => <a href={to}>{children}</a>,
}));
jest.mock('../../../../utils/formatGraphResultData', () => ({
    formatToGraphData: () => ({nodes: [], edges: []}),
    formatToOptionedGraphData: data => data,
    formatToStyleData: () => ({nodes: {}, edges: {}}),
    formatToDownloadData: data => data,
    updateGraphDataStyle: data => data,
    formatToLegendData: () => [],
}));
jest.mock('../../../../utils/graph', () => ({
    mapLayoutNameToLayoutDetails: () => ({}),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

test('places empty-graph recovery actions in the graph result area', () => {
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <GraphResult
                data={{}}
                metaData={{edgeMeta: [], vertexMeta: []}}
                graphNums={{vertexCount: 0, edgeCount: 0}}
                queryStatus={GRAPH_STATUS.STANDBY}
                panelType={PANEL_TYPE.CLOSED}
                graphRenderMode={GRAPH_RENDER_MODE.CANVAS2D}
                onGraphRenderModeChange={jest.fn()}
                updatePanelType={jest.fn()}
            />
        </GraphAnalysisContext.Provider>
    );

    expect(screen.getByText('analysis.algorithm.empty_graph_title')).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'analysis.algorithm.create_schema'}))
        .toHaveAttribute('href', '/graphspace/DEFAULT/graph/hugegraph/meta');
    expect(screen.getByRole('link', {name: 'analysis.algorithm.prepare_data'}))
        .toHaveAttribute('href', '/source');
});
