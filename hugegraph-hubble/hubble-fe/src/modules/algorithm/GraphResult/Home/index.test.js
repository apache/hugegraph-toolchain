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

import {act, fireEvent, render, screen} from '@testing-library/react';
import GraphResult from './index';
import {USER_CHANGE_EVENT} from '../../../../utils/user';
import GraphAnalysisContext from '../../../Context';
import {GRAPH_STATUS, GRAPH_LOAD_STATUS, GRAPH_RENDER_MODE, PANEL_TYPE} from '../../../../utils/constants';

const mockFlushLayout = jest.fn();
const mockCancelLayout = jest.fn();
const mockLayoutPanel = jest.fn();
let mockModel;
const mockEdgeDrawer = jest.fn();
const mockNodeDrawer = jest.fn();
const mockCounts = jest.fn();
const mockSettingsPanel = jest.fn();
const mockMenuBar = jest.fn();
jest.mock('../../../component/Graph/useAnalysisGraph', () => ({useAnalysisGraph: () => mockModel}));

jest.mock('../../../component/Graph', () => ({children}) => <div>{children}</div>);
jest.mock('../../../component/Legend', () => () => null);
jest.mock('../../../component/MiniMap', () => () => null);
jest.mock('../GraphMenuBar', () => props => { mockMenuBar(props); return <>
    <div>graph menu</div>
    <button onClick={() => props.handleTogglePanel(1)}>Toggle layout</button>
    <button onClick={() => props.handleTogglePanel(2)}>Open settings</button>
</>; });
jest.mock('../GraphToolBar', () => props => <>
    <button onClick={() => props.updatePanelType(0)}>Toolbar close</button>
    <button onClick={props.handleClearGraph}>Clear graph</button>
</>);
jest.mock('../../../component/Menu', () => props => <button onClick={() => props.onClickAddEdge({}, true)}>Add edge</button>);
jest.mock('../../../component/NumberCard', () => props => { mockCounts(props); return null; });
jest.mock('../../../component/EditElement', () => () => null);
jest.mock('../../../component/Search', () => () => null);
jest.mock('../../../component/SettingConfigPanel', () => props => { mockSettingsPanel(props); return null; });
jest.mock('../../../component/layoutConfigPanel/Home', () => {
    const {useImperativeHandle} = require('react');
    return function MockLayoutPanel({ref, ...props}) {
        useImperativeHandle(ref, () => ({flush: mockFlushLayout, cancel: mockCancelLayout}));
        mockLayoutPanel(props);
        return null;
    };
});
jest.mock('../../../component/ClosePanelButton', () => props => props.show ? <button onClick={props.onClick}>Close panel</button> : null);
jest.mock('../../../component/DynamicAddNode', () => props => { mockNodeDrawer(props); return null; });
jest.mock('../../../component/DynamicAddEdge', () => props => {
    mockEdgeDrawer(props);
    return props.open ? <button onClick={props.onCancel}>Close edge drawer</button> : null;
});
jest.mock('../NeighborRankView', () => () => null);
jest.mock('../../../component/StatisticsPanel/Home', () => () => null);
jest.mock('../RankApiView', () => () => null);
jest.mock('../JaccView', () => () => null);
jest.mock('../../../component/GraphStatusView', () => props => <div>{props.message}</div>);
jest.mock('../../../component/TaskNavigateView', () => () => null);
jest.mock('../../../component/Canvas3D', () => ({onExit, children}) => (
    <><button onClick={onExit}>Return to 2D</button>{children}</>
));
jest.mock('react-router-dom', () => ({
    Link: ({to, children}) => <a href={to}>{children}</a>,
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));
beforeEach(() => {
    jest.clearAllMocks();
    mockModel = {graphData: {nodes: [], edges: []}, initialData: {nodes: [], edges: []},
        styleConfigData: {nodes: {}, edges: {}}};
});

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

test.each([null, undefined])('unavailable graph counts (%s) do not imply an empty database', count => {
    render(<GraphResult data={{}} metaData={{vertexMeta: [{name: 'person'}], edgeMeta: [{name: 'knows'}]}}
        graphNums={{vertexCount: count, edgeCount: count}} queryStatus={GRAPH_STATUS.STANDBY}
        panelType={PANEL_TYPE.CLOSED} graphRenderMode={GRAPH_RENDER_MODE.CANVAS2D}
        updatePanelType={jest.fn()} />);
    expect(screen.queryByText('analysis.algorithm.empty_graph_title')).not.toBeInTheDocument();
    expect(mockCounts.mock.lastCall[0].data).toMatchObject({allGraphNodesNum: count, allGraphEdgesNum: count});
});

test('an approximate zero snapshot keeps the current graph view available', () => {
    mockModel = {...mockModel, graphData: {nodes: [{id: 'existing'}], edges: []}};
    render(<GraphResult data={{vertices: [{id: 'existing', label: 'person'}], edges: []}}
        metaData={{vertexMeta: [{name: 'person'}], edgeMeta: [{name: 'knows'}]}}
        graphNums={{vertexCount: '0', edgeCount: '0', approximate: true, scan_limit: 100000}}
        queryStatus={GRAPH_STATUS.STANDBY} panelType={PANEL_TYPE.CLOSED}
        graphRenderMode={GRAPH_RENDER_MODE.CANVAS2D} updatePanelType={jest.fn()} />);

    expect(screen.queryByText('analysis.algorithm.empty_graph_title')).not.toBeInTheDocument();
    expect(screen.getByText('graph menu')).toBeInTheDocument();
    expect(mockCounts.mock.lastCall[0].data).toMatchObject({
        allGraphNodesNum: '0', allGraphEdgesNum: '0', approximate: true, scan_limit: 100000,
    });
});

test('only projects raw node choices while the edge drawer is visible', () => {
    const raw = {id: 'alice', label: 'person'};
    const reads = jest.fn(() => raw);
    mockModel = {...mockModel, graphData: {nodes: [{id: 'node:alice', data: {get raw() { return reads(); }}}], edges: []}};
    const props = {data: {vertices: [raw], edges: []}, isQueryMode: true,
        queryStatus: GRAPH_STATUS.SUCCESS, panelType: PANEL_TYPE.CLOSED,
        graphRenderMode: GRAPH_RENDER_MODE.CANVAS2D, updatePanelType: jest.fn()};
    const result = render(<GraphResult {...props} />);
    expect(reads).not.toHaveBeenCalled();
    expect(mockEdgeDrawer).toHaveBeenLastCalledWith(expect.objectContaining({graphData: null}));
    fireEvent.click(screen.getByRole('button', {name: 'Add edge'}));
    expect(reads).toHaveBeenCalledTimes(1);
    expect(mockEdgeDrawer.mock.lastCall[0].graphData.vertices[0]).toBe(raw);
    result.rerender(<GraphResult {...props} graphNums={{vertexCount: 1, edgeCount: 0}} />);
    expect(reads).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', {name: 'Close edge drawer'}));
    expect(mockEdgeDrawer).toHaveBeenLastCalledWith(expect.objectContaining({graphData: null}));
    expect(reads).toHaveBeenCalledTimes(1);
});


test.each(['node', 'edge'])('returns %s write-apply failures to the drawer without changing totals', async kind => {
    const error = new Error('local apply failed');
    const onRefreshGraphNums = jest.fn().mockResolvedValue();
    mockModel = {...mockModel, graphData: {nodes: [{id: 'existing', data: {raw: {id: 'existing'}}}], edges: []},
        addElements: jest.fn().mockRejectedValue(error)};
    render(<GraphResult data={{vertices: [{id: 'existing', label: 'person'}], edges: []}} isQueryMode
        queryStatus={GRAPH_STATUS.SUCCESS} panelType={PANEL_TYPE.CLOSED}
        graphNums={{vertexCount: 7, edgeCount: 9, approximate: true, scan_limit: 100000}} onRefreshGraphNums={onRefreshGraphNums}
        graphRenderMode={GRAPH_RENDER_MODE.CANVAS2D} updatePanelType={jest.fn()} />);
    const callback = kind === 'node' ? mockNodeDrawer.mock.lastCall[0].onOK : mockEdgeDrawer.mock.lastCall[0].onOk;
    await act(async () => { await expect(callback({vertices: [{id: 'saved'}], edges: [{id: 'saved-edge'}]})).rejects.toBe(error); });
    expect(onRefreshGraphNums).toHaveBeenCalledTimes(1);
    expect(mockCounts.mock.lastCall[0].data).toMatchObject({allGraphNodesNum: 7, allGraphEdgesNum: 9, approximate: true, scan_limit: 100000});
});

test.each(['applied', 'superseded', 'disposed', undefined])('preserves %s write-apply outcome while refreshing server totals independently', async status => {
    const outcome = status ? {status} : undefined;
    const onRefreshGraphNums = jest.fn().mockResolvedValue();
    mockModel = {...mockModel, graphData: {nodes: [{id: 'existing', data: {raw: {id: 'existing'}}}], edges: []},
        addElements: jest.fn().mockResolvedValue(outcome)};
    render(<GraphResult data={{vertices: [{id: 'existing', label: 'person'}], edges: []}} isQueryMode
        queryStatus={GRAPH_STATUS.SUCCESS} panelType={PANEL_TYPE.CLOSED}
        graphNums={{vertexCount: 7, edgeCount: 9}} onRefreshGraphNums={onRefreshGraphNums}
        graphRenderMode={GRAPH_RENDER_MODE.CANVAS2D} updatePanelType={jest.fn()} />);
    await act(async () => {
        await expect(mockNodeDrawer.mock.lastCall[0].onOK({vertices: [{id: 'saved'}]}))
            .resolves.toEqual(outcome ?? {status: 'disposed'});
        await expect(mockEdgeDrawer.mock.lastCall[0].onOk({edges: [{id: 'saved-edge'}]}))
            .resolves.toEqual(outcome ?? {status: 'disposed'});
    });
    expect(mockCounts.mock.lastCall[0].data).toMatchObject({
        allGraphNodesNum: 7, allGraphEdgesNum: 9,
    });
    expect(onRefreshGraphNums).toHaveBeenCalledTimes(2);
});

const countedGraphProps = () => ({data: {vertices: [{id: 'existing', label: 'person'}], edges: []},
    isQueryMode: true, queryStatus: GRAPH_STATUS.SUCCESS, panelType: PANEL_TYPE.CLOSED,
    graphNums: {vertexCount: 7, edgeCount: 9}, graphRenderMode: GRAPH_RENDER_MODE.CANVAS2D,
    updatePanelType: jest.fn()});

test.each([
    ['node', {vertices: [{id: 'existing'}, {id: 'existing'}]}],
    ['node', {vertices: [{id: 'already-in-db-but-not-on-canvas'}]}],
    ['edge', {vertices: [{id: 'existing'}, {id: 'already-in-db-but-not-on-canvas'}], edges: [{id: 'saved-edge'}]}],
])('refreshes authoritative totals after a saved %s without inferring inserts from returned IDs', async (kind, saved) => {
    mockModel = {...mockModel, addElements: jest.fn().mockResolvedValue({status: 'applied'})};
    const onRefreshGraphNums = jest.fn().mockResolvedValue();
    const initial = {...countedGraphProps(), onRefreshGraphNums};
    const view = render(<GraphResult {...initial} />);
    const callback = kind === 'node' ? mockNodeDrawer.mock.lastCall[0].onOK : mockEdgeDrawer.mock.lastCall[0].onOk;
    await act(async () => { await expect(callback(saved)).resolves.toEqual({status: 'applied'}); });
    expect(mockModel.addElements).toHaveBeenCalledWith(saved);
    expect(onRefreshGraphNums).toHaveBeenCalledTimes(1);
    expect(mockCounts.mock.lastCall[0].data).toMatchObject({allGraphNodesNum: 7, allGraphEdgesNum: 9});
    view.rerender(<GraphResult {...initial} graphNums={{vertexCount: 40, edgeCount: 60}} />);
    expect(mockCounts.mock.lastCall[0].data).toMatchObject({allGraphNodesNum: 40, allGraphEdgesNum: 60});
});

test.each(['node', 'edge'])('a failed statistics refresh never rejects a saved %s canvas application', async kind => {
    mockModel = {...mockModel, addElements: jest.fn().mockResolvedValue({status: 'applied'})};
    const onRefreshGraphNums = jest.fn().mockRejectedValue(new Error('statistics unavailable'));
    render(<GraphResult {...countedGraphProps()} onRefreshGraphNums={onRefreshGraphNums} />);
    const callback = kind === 'node' ? mockNodeDrawer.mock.lastCall[0].onOK : mockEdgeDrawer.mock.lastCall[0].onOk;
    await act(async () => { await expect(callback({vertices: [{id: 'saved'}]})).resolves.toEqual({status: 'applied'}); });
    expect(onRefreshGraphNums).toHaveBeenCalledTimes(1);
    expect(mockCounts.mock.lastCall[0].data).toMatchObject({allGraphNodesNum: 7, allGraphEdgesNum: 9});
});

test('a pending statistics refresh does not delay returning the canvas application outcome', async () => {
    mockModel = {...mockModel, addElements: jest.fn().mockResolvedValue({status: 'applied'})};
    const onRefreshGraphNums = jest.fn(() => new Promise(() => {}));
    render(<GraphResult {...countedGraphProps()} onRefreshGraphNums={onRefreshGraphNums} />);
    await act(async () => {
        await expect(mockNodeDrawer.mock.lastCall[0].onOK({vertices: [{id: 'saved'}]}))
            .resolves.toEqual({status: 'applied'});
    });
    expect(onRefreshGraphNums).toHaveBeenCalledTimes(1);
});


test.each([
    ['Close panel', PANEL_TYPE.CLOSED],
    ['Toggle layout', PANEL_TYPE.CLOSED],
    ['Open settings', PANEL_TYPE.SETTING],
    ['Toolbar close', PANEL_TYPE.CLOSED],
])('flushes the layout edit before the explicit %s transition', (action, nextPanel) => {
    mockModel = {...mockModel, graphData: {nodes: [{id: 'node:alice', data: {raw: {id: 'alice'}}}], edges: []},
        initialData: {nodes: [], edges: []}, layout: {type: 'd3-force', options: {collide: {radius: 55}}},
        layoutSettings: {type: 'd3-force', options: {nodeSize: 70, nodeSpacing: 40}}};
    const updatePanelType = jest.fn(() => expect(mockFlushLayout).toHaveBeenCalledTimes(1));
    render(<GraphResult data={{vertices: [{id: 'alice'}], edges: []}} isQueryMode
        queryStatus={GRAPH_STATUS.SUCCESS} panelType={PANEL_TYPE.LAYOUT}
        updatePanelType={updatePanelType} graphRenderMode={GRAPH_RENDER_MODE.CANVAS2D} />);
    expect(mockLayoutPanel.mock.lastCall[0].layout).toBe(mockModel.layoutSettings);
    fireEvent.click(screen.getByRole('button', {name: action}));
    expect(updatePanelType).toHaveBeenCalledWith(nextPanel);
    expect(mockFlushLayout).toHaveBeenCalledTimes(1);
    expect(mockCancelLayout).not.toHaveBeenCalled();
});

test.each(['Clear graph', 'Switch renderer'])('cancels pending layout edits for %s', action => {
    mockModel = {...mockModel, graphData: {nodes: [{id: 'node:alice', data: {raw: {id: 'alice'}}}], edges: []}};
    render(<GraphResult data={{vertices: [{id: 'alice'}], edges: []}} isQueryMode
        queryStatus={GRAPH_STATUS.SUCCESS} panelType={PANEL_TYPE.LAYOUT}
        updatePanelType={jest.fn()} onGraphRenderModeChange={jest.fn()}
        graphRenderMode={GRAPH_RENDER_MODE.CANVAS2D} />);
    if (action === 'Switch renderer') act(() => mockSettingsPanel.mock.lastCall[0].onRenderModeChange(GRAPH_RENDER_MODE.CANVAS3D));
    else fireEvent.click(screen.getByRole('button', {name: action}));
    expect(mockCancelLayout).toHaveBeenCalledTimes(1);
    expect(mockFlushLayout).not.toHaveBeenCalled();
});

test('direct result unmount does not flush a layout edit', () => {
    mockModel = {...mockModel, graphData: {nodes: [{id: 'node:alice', data: {raw: {id: 'alice'}}}], edges: []}};
    const view = render(<GraphResult data={{vertices: [{id: 'alice'}], edges: []}} isQueryMode
        queryStatus={GRAPH_STATUS.SUCCESS} panelType={PANEL_TYPE.LAYOUT}
        updatePanelType={jest.fn()} graphRenderMode={GRAPH_RENDER_MODE.CANVAS2D} />);
    view.unmount();
    expect(mockFlushLayout).not.toHaveBeenCalled();
});

test('returns from unavailable 3D through the normal algorithm renderer switch', () => {
    const onGraphRenderModeChange = jest.fn();
    const initial = {...countedGraphProps(), graphRenderMode: GRAPH_RENDER_MODE.CANVAS3D,
        onGraphRenderModeChange};
    render(<GraphResult {...initial} />);
    fireEvent.click(screen.getByRole('button', {name: 'Return to 2D'}));
    expect(onGraphRenderModeChange).toHaveBeenCalledWith(GRAPH_RENDER_MODE.CANVAS2D);
    expect(initial.updatePanelType).toHaveBeenCalledWith(PANEL_TYPE.CLOSED);
    expect(screen.getByText('graph menu')).toBeInTheDocument();
});

test('passes dataset-owned label choices to the 2D settings panel', () => {
    const fields = {current: {node: new Map(), edge: new Map()}};
    mockModel.labelFields = fields;
    render(<GraphResult {...countedGraphProps()} />);
    expect(mockSettingsPanel.mock.lastCall[0].selectedFields).toBe(fields);
});

test('keeps renderer settings reachable in 3D and switches back through the owned handler', () => {
    const onGraphRenderModeChange = jest.fn();
    const initial = {...countedGraphProps(), graphRenderMode: GRAPH_RENDER_MODE.CANVAS3D,
        panelType: PANEL_TYPE.SETTING, onGraphRenderModeChange};
    render(<GraphResult {...initial} />);
    const settings = mockSettingsPanel.mock.lastCall[0];
    expect(settings.open).toBe(true);
    expect(settings.renderMode).toBe(GRAPH_RENDER_MODE.CANVAS3D);
    act(() => settings.onRenderModeChange(GRAPH_RENDER_MODE.CANVAS2D));
    expect(onGraphRenderModeChange).toHaveBeenCalledWith(GRAPH_RENDER_MODE.CANVAS2D);
    expect(initial.updatePanelType).toHaveBeenCalledWith(PANEL_TYPE.CLOSED);
});

test('quick layout cancels pending panel edits and uses the existing layout update path', () => {
    const changeLayout = jest.fn();
    mockModel = {...mockModel, changeLayout, layoutSettings: {type: 'grid'}, defaultLayout: {type: 'columns'},
        graphData: {nodes: [{id: 'node:alice', data: {raw: {id: 'alice'}}}], edges: []}};
    const initial = {...countedGraphProps(), panelType: PANEL_TYPE.LAYOUT, options: {startId: 0}};
    const view = render(<GraphResult {...initial} />);
    expect(mockMenuBar.mock.lastCall[0].layout).toBe(mockModel.layoutSettings);
    expect(mockMenuBar.mock.lastCall[0].defaultLayout).toBe(mockModel.defaultLayout);
    expect(mockMenuBar.mock.lastCall[0].startId).toBe(0);
    act(() => mockMenuBar.mock.lastCall[0].handleQuickLayoutChange({type: 'radial'}));
    expect(mockCancelLayout).toHaveBeenCalledTimes(1);
    expect(mockFlushLayout).not.toHaveBeenCalled();
    expect(changeLayout).toHaveBeenCalledTimes(1);
    expect(changeLayout).toHaveBeenCalledWith({type: 'radial'});
    mockModel.layoutSettings = {type: 'radial'};
    view.rerender(<GraphResult {...initial} />);
    expect(mockLayoutPanel.mock.lastCall[0].layout).toBe(mockModel.layoutSettings);
    expect(initial.updatePanelType).not.toHaveBeenCalled();
});


test.each(['node', 'edge'].flatMap(kind => ['graph', 'account'].map(change => [kind, change])))(
    'keeps late %s drawer closes idempotent after a %s change', (kind, change) => {
        const initial = countedGraphProps();
        const scene = graph => <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph}}>
            <GraphResult {...initial} />
        </GraphAnalysisContext.Provider>;
        const view = render(scene('A'));
        const drawer = kind === 'node' ? mockNodeDrawer : mockEdgeDrawer;
        act(() => {
            const menu = mockMenuBar.mock.lastCall[0];
            if (kind === 'node') menu.handleClickNewAddNode();
            else menu.handleClickNewAddEdge(true);
        });
        expect(drawer.mock.lastCall[0].open).toBe(true);
        const lateClose = drawer.mock.lastCall[0].onCancel;
        if (change === 'graph') view.rerender(scene('B'));
        else act(() => window.dispatchEvent(new Event(USER_CHANGE_EVENT)));
        expect(drawer.mock.lastCall[0].open).toBe(false);
        // A completed write may still deliver its old close callback.
        act(() => lateClose());
        expect(drawer.mock.lastCall[0].open).toBe(false);
    }
);

const renderGuide = (props = {}, context = {}) => render(
    <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'g',
        isVermeer: false, vermeerReady: true, ...context}}>
        <GraphResult data={{}} engine='olap' queryStatus={GRAPH_STATUS.STANDBY}
            panelType={PANEL_TYPE.CLOSED} graphRenderMode={GRAPH_RENDER_MODE.CANVAS2D}
            updatePanelType={jest.fn()} {...props} />
    </GraphAnalysisContext.Provider>
);

test('shows unconfigured graph compute and verified startup documentation in the default canvas', () => {
    renderGuide({computerStatus: 'unavailable'});
    expect(screen.getByText('analysis.algorithm.olap_guide')).toBeVisible();
    expect(screen.getByText('analysis.algorithm.olap_unconfigured')).toBeVisible();
    expect(screen.getByRole('link', {name: 'analysis.algorithm.vermeer_docs'}))
        .toHaveAttribute('href', 'https://hugegraph.apache.org/docs/quickstart/computing/hugegraph-vermeer/');
    expect(screen.getByRole('link', {name: 'analysis.algorithm.helm_guide'}))
        .toHaveAttribute('href', 'https://hugegraph.apache.org/docs/quickstart/hugegraph/hugegraph-helm/');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test.each([
    ['checking', {}, 'computer_checking'],
    ['error', {}, 'computer_check_failed'],
    ['available', {}, 'computer_legacy_ready'],
    ['unavailable', {vermeerReady: false}, 'vermeer_unconfirmed'],
    ['unavailable', {graph: null}, 'olap_select_graph'],
    ['unavailable', {isVermeer: true, graphStatus: 'created'}, 'vermeer_load_first'],
    ['unavailable', {isVermeer: true, graphStatus: GRAPH_LOAD_STATUS.LOADED}, 'vermeer_ready'],
])('shows %s compute state %j as %s without claiming it is unconfigured', (status, context, key) => {
    renderGuide({computerStatus: status}, context);
    expect(screen.getByText(`analysis.algorithm.${key}`)).toBeVisible();
    expect(screen.queryByText('analysis.algorithm.olap_unconfigured')).not.toBeInTheDocument();
});

test.each(['error', 'unavailable'])('retries a %s Computer check from the default canvas without a modal', status => {
    const retry = jest.fn();
    const retryVermeer = jest.fn();
    renderGuide({computerStatus: status, onRetryComputerCapability: retry}, {retryVermeer});
    fireEvent.click(screen.getByRole('button', {name: 'analysis.algorithm.retry_compute_status'}));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retryVermeer).toHaveBeenCalledTimes(status === 'unavailable' ? 1 : 0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('retries an uncertain Vermeer status using the existing parent action', () => {
    const retryVermeer = jest.fn();
    const retryComputer = jest.fn();
    renderGuide({computerStatus: 'unavailable', onRetryComputerCapability: retryComputer},
        {vermeerReady: false, vermeerError: true, retryVermeer});
    expect(screen.getByText('analysis.topbar.get_vermeer_failed')).toBeVisible();
    fireEvent.click(screen.getByRole('button', {name: 'analysis.algorithm.retry_compute_status'}));
    expect(retryVermeer).toHaveBeenCalledTimes(1);
    expect(retryComputer).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', {name: 'analysis.algorithm.retry_compute_status'}))
        .not.toHaveAttribute('title');
});

test.each([GRAPH_STATUS.SUCCESS, GRAPH_STATUS.LOADING, GRAPH_STATUS.FAILED, GRAPH_STATUS.STANDBY])(
    'keeps a single compute retry reachable without replacing existing %s results', queryStatus => {
        const retryVermeer = jest.fn();
        mockModel = {...mockModel, graphData: {nodes: [{id: 'existing'}], edges: []}};
        renderGuide({queryStatus, isQueryMode: true, data: {vertices: [{id: 'existing'}], edges: []}},
            {vermeerReady: false, vermeerError: true, retryVermeer});
        expect(screen.queryByText('analysis.algorithm.olap_guide')).not.toBeInTheDocument();
        const retry = screen.getByRole('button', {name: 'analysis.algorithm.retry_compute_status'});
        expect(retry).toHaveAttribute('title', 'analysis.topbar.get_vermeer_failed');
        expect(retry.compareDocumentPosition(screen.getByText('graph menu')) & Node.DOCUMENT_POSITION_FOLLOWING)
            .toBeTruthy();
        fireEvent.click(retry);
        expect(retryVermeer).toHaveBeenCalledTimes(1);
        expect(mockCounts.mock.lastCall[0].data.currentGraphNodesNum).toBe(1);
    }
);

test('keeps discovery retry reachable from the OLTP canvas without adding OLAP guidance', () => {
    const retryVermeer = jest.fn();
    renderGuide({engine: 'oltp'}, {vermeerError: true, retryVermeer});
    fireEvent.click(screen.getByRole('button', {name: 'analysis.algorithm.retry_compute_status'}));
    expect(retryVermeer).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('analysis.algorithm.olap_guide')).not.toBeInTheDocument();
});

test.each(['error', 'unavailable'])('keeps %s Computer capability retry reachable alongside existing canvas data', status => {
    const retry = jest.fn();
    const retryVermeer = jest.fn();
    mockModel = {...mockModel, graphData: {nodes: [{id: 'existing'}], edges: []}};
    renderGuide({computerStatus: status, onRetryComputerCapability: retry,
        data: {vertices: [{id: 'existing'}], edges: []}}, {retryVermeer});
    fireEvent.click(screen.getByRole('button', {name: 'analysis.algorithm.retry_compute_status'}));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retryVermeer).toHaveBeenCalledTimes(status === 'unavailable' ? 1 : 0);
});

test('keeps OLTP default guidance usable while graph compute is unknown', () => {
    renderGuide({engine: 'oltp'}, {vermeerReady: false});
    expect(screen.getByText('analysis.algorithm.oltp_guide')).toBeVisible();
    expect(screen.queryByText('analysis.algorithm.olap_guide')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', {name: 'analysis.algorithm.helm_guide'})).not.toBeInTheDocument();
});

test.each([GRAPH_STATUS.SUCCESS, GRAPH_STATUS.LOADING, GRAPH_STATUS.FAILED])(
    'does not overlay generic guidance over %s query/task feedback', queryStatus => {
        renderGuide({computerStatus: 'unavailable', queryStatus});
        expect(screen.queryByText('analysis.algorithm.olap_guide')).not.toBeInTheDocument();
        expect(screen.getByText('analysis.algorithm.olap_unconfigured')).toBeVisible();
    }
);

test('does not replace existing canvas data with default guidance', () => {
    mockModel = {...mockModel, graphData: {nodes: [{id: 'existing'}], edges: []}};
    renderGuide({data: {vertices: [{id: 'existing'}], edges: []}, computerStatus: 'unavailable'});
    expect(screen.queryByText('analysis.algorithm.olap_guide')).not.toBeInTheDocument();
    expect(screen.getByText('analysis.algorithm.olap_unconfigured')).toBeVisible();
    expect(mockCounts.mock.lastCall[0].data.currentGraphNodesNum).toBe(1);
});

test.each([
    ['unavailable', {vermeerReady: false}, 'vermeer_unconfirmed', false],
    ['unavailable', {}, 'olap_unconfigured', true],
    ['checking', {}, 'computer_checking', false],
    ['available', {}, 'computer_legacy_ready', false],
    ['unavailable', {isVermeer: true, graphStatus: 'created'}, 'vermeer_load_first', true],
    ['unavailable', {isVermeer: true, graphStatus: GRAPH_LOAD_STATUS.LOADED}, 'vermeer_ready', false],
])('keeps %s OLAP status %s visible alongside an existing result', (computerStatus, context, statusKey, hasDocs) => {
    mockModel = {...mockModel, graphData: {nodes: [{id: 'existing'}], edges: []}};
    renderGuide({computerStatus, queryStatus: GRAPH_STATUS.SUCCESS, isQueryMode: true,
        data: {vertices: [{id: 'existing'}], edges: []}}, context);
    const status = screen.getByText(`analysis.algorithm.${statusKey}`);
    expect(status).toBeVisible();
    expect(status.compareDocumentPosition(screen.getByText('graph menu')) & Node.DOCUMENT_POSITION_FOLLOWING)
        .toBeTruthy();
    expect(screen.queryByText('analysis.algorithm.olap_guide')).not.toBeInTheDocument();
    expect(Boolean(screen.queryByRole('link', {name: 'analysis.algorithm.vermeer_docs'}))).toBe(hasDocs);
    expect(Boolean(screen.queryByRole('link', {name: 'analysis.algorithm.helm_guide'}))).toBe(hasDocs);
    expect(mockCounts.mock.lastCall[0].data.currentGraphNodesNum).toBe(1);
});
