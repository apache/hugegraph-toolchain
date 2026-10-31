/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {fireEvent, render, screen} from '@testing-library/react';
import GraphAnalysisContext from '../../../Context';
import OlapFormHome from '.';
import * as api from '../../../../api';

jest.mock('../../../../api', () => ({
    analysis: {
        getOlapCapability: jest.fn(),
    },
}));

jest.mock('../algorithmDocs', () => ({COMPUTER_DOC: 'https://computer.example/docs'}));

jest.mock('../Olap/OlapItem', () => ({algorithmName}) => (
    <div data-testid="olap-item">{algorithmName}</div>
));

jest.mock('../../../../utils/constants', () => ({
    GRAPH_LOAD_STATUS: {LOADED: 'LOADED'},
    isAlgorithmNameMatched: (name, search) => name.toLowerCase().includes(search.toLowerCase()),
    TEXT_PATH: {ALGORITHM_COMMON: 'analysis.algorithm.common'},
    useTranslatedConstants: () => ({
        ALGORITHM_MODE: {OLAP: 'OLAP'},
        ALGORITHM_NAME: {
            PAGE_RANK: 'PageRank',
            WEAKLY_CONNECTED_COMPONENT: 'WCC',
            DEGREE_CENTRALIT: 'Degree',
            CLOSENESS_CENTRALITY: 'Closeness',
            TRIANGLE_COUNT: 'Triangle',
            RINGS_DETECTION: 'Rings',
            FILTERED_RINGS_DETECTION: 'FilteredRings',
            LINKS: 'Links',
            CLUSTER_COEFFICIENT: 'Cluster',
            BETWEENNESS_CENTRALITY: 'Betweenness',
            LABEL_PROPAGATION_ALGORITHM: 'LabelPropagation',
            LOUVAIN: 'Louvain',
            FILTER_SUBGRAPH_MATCHING: 'Subgraph',
            K_CORE: 'KCore',
            PERSONAL_PAGE_RANK: 'PersonalPageRank',
            SSSP: 'SSSP',
        },
    }),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

const home = ({isVermeer = false, vermeerReady = true} = {}, computerStatus = 'available',
    graph = 'hugegraph', search = '') => (
    <GraphAnalysisContext.Provider value={{isVermeer, vermeerReady}}>
        <OlapFormHome graphSpace='DEFAULT' graph={graph} search={search}
            computerStatus={computerStatus} currentAlgorithm='' updateCurrentAlgorithm={jest.fn()}
            onOlapFormSubmit={jest.fn()} canRunLouvain />
    </GraphAnalysisContext.Provider>
);
const expandComputer = () => fireEvent.click(screen.getByRole('button', {
    name: 'analysis.algorithm.computer_legacy_entry',
}));

beforeEach(() => jest.clearAllMocks());

test.each([false, true])('does not expose either OLAP engine before confirmation (previous enable=%s)', isVermeer => {
    const view = render(home({isVermeer, vermeerReady: false}));
    expect(screen.queryByRole('button', {name: 'analysis.algorithm.computer_legacy_entry'}))
        .not.toBeInTheDocument();
    expect(screen.queryByTestId('olap-item')).not.toBeInTheDocument();
    view.rerender(home({isVermeer: true}));
    expect(screen.getAllByTestId('olap-item')).toHaveLength(10);
    expect(screen.queryByText('Louvain')).not.toBeInTheDocument();
    expect(screen.getByText('SSSP')).toBeVisible();
    expect(screen.getByText('PersonalPageRank')).toBeVisible();
    expect(api.analysis.getOlapCapability).not.toHaveBeenCalled();
});

test.each(['checking', 'error', 'unavailable', 'select-graph'])(
    'keeps Computer opt-in and forms hidden while shared capability is %s', status => {
        render(home({}, status));
        expect(screen.queryByRole('button', {name: 'analysis.algorithm.computer_legacy_entry'}))
            .not.toBeInTheDocument();
        expect(screen.queryByTestId('olap-item')).not.toBeInTheDocument();
        expect(api.analysis.getOlapCapability).not.toHaveBeenCalled();
    }
);

test('allows confirmed-disabled Computer only after capability and explicit opt-in', () => {
    render(home());
    expect(screen.queryByTestId('olap-item')).not.toBeInTheDocument();
    expandComputer();
    expect(screen.getAllByTestId('olap-item')).toHaveLength(15);
    expect(screen.getByText('Louvain')).toBeVisible();
    expect(screen.queryByText('SSSP')).not.toBeInTheDocument();
    expandComputer();
    expect(screen.queryByTestId('olap-item')).not.toBeInTheDocument();
    expect(api.analysis.getOlapCapability).not.toHaveBeenCalled();
});

test('resets Computer opt-in when readiness is invalidated and retry later confirms disabled', () => {
    const view = render(home());
    expandComputer();
    expect(screen.getAllByTestId('olap-item')).toHaveLength(15);
    view.rerender(home({vermeerReady: false}));
    expect(screen.queryByTestId('olap-item')).not.toBeInTheDocument();
    view.rerender(home());
    expect(screen.getByRole('button', {name: 'analysis.algorithm.computer_legacy_entry'}))
        .toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('olap-item')).not.toBeInTheDocument();
});

test('requires a new Computer opt-in when changing graph', () => {
    const view = render(home());
    expandComputer();
    view.rerender(home({}, 'available', 'other'));
    expect(screen.getByRole('button', {name: 'analysis.algorithm.computer_legacy_entry'}))
        .toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('olap-item')).not.toBeInTheDocument();
});

test('keeps generic guidance outside the sidebar while retaining explicit search feedback', () => {
    render(home({}, 'available', 'hugegraph', 'unmatched-name'));
    expect(screen.queryByText('query_result.empty')).not.toBeInTheDocument();
    expandComputer();
    expect(screen.getByText('query_result.empty')).toBeVisible();
    expect(screen.queryByText('analysis.algorithm.vermeer_unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText('analysis.algorithm.computer_legacy_ready')).not.toBeInTheDocument();
});
