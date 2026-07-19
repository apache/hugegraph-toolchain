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
 * @file OLAP算法item
 */

import React, {useContext} from 'react';
import GraphAnalysisContext from '../../../../Context';
import PageRank from '../PageRank';
import PageRankVermeer from '../PageRankVermeer';
import WeaklyConnectedComponent from '../WeaklyConnectedComponent';
import WeaklyConnectedComponentVermeer from '../WeaklyConnectedComponentVermeer';
import DegreeCentrality from '../DegreeCentrality';
import DegreeCentralityVermeer from '../DegreeCentralityVermeer';
import ClosenessCentrality from '../ClosenessCentrality';
import ClosenessCentralityVermeer from '../ClosenessCentralityVermeer';
import TriangleCount from '../TriangleCount';
import TriangleCountVermeer from '../TriangleCountVermeer';
import RingsDetection from '../RingsDetection';
import FilteredRingsDetection from '../FilteredRingsDetection';
import Links from '../Links';
import ClusterCoefficient from '../ClusterCoefficient';
import BetweennessCentrality from '../BetweennessCentrality';
import BetweennessCentralityVermeer from '../BetweennessCentralityVermeer';
import LabelPropagationAlgorithm from '../LabelPropagationAlgorithm';
import LabelPropagationAlgorithmVermeer from '../LabelPropagationAlgorithmVermeer';
import Louvain from '../Louvain';
import FilterSubGraphMatching from '../FilterSubGraphMatching';
import KCore from '../KCore';
import KCoreVermeer from '../KCoreVermeer';
import PersonalPageRank from '../PersonalPageRank';
import SSSPVermeer from '../SSSPVermeer';
import {
    getCanonicalAlgorithmName,
    useTranslatedConstants,
} from '../../../../../utils/constants';
import {AlgorithmPersistenceContext} from '../../algorithmFormPersistence';



const OlapItem = props => {
    const {ALGORITHM_NAME} = useTranslatedConstants();
    const {
        PAGE_RANK,
        WEAKLY_CONNECTED_COMPONENT,
        DEGREE_CENTRALIT,
        CLOSENESS_CENTRALITY,
        TRIANGLE_COUNT,
        RINGS_DETECTION,
        FILTERED_RINGS_DETECTION,
        LINKS,
        CLUSTER_COEFFICIENT,
        BETWEENNESS_CENTRALITY,
        LABEL_PROPAGATION_ALGORITHM,
        LOUVAIN,
        FILTER_SUBGRAPH_MATCHING,
        K_CORE,
        PERSONAL_PAGE_RANK,
        SSSP,
    } = ALGORITHM_NAME;


    const {
        algorithmName,
        canRunLouvain,
        ...args
    } = props;

    const {isVermeer} = useContext(GraphAnalysisContext);

    const renderItem = () => {
        switch (algorithmName) {
            case PAGE_RANK:
                return (
                    isVermeer
                        ? (<PageRankVermeer {...args} />)
                        : (<PageRank {...args} />)
                );
            case WEAKLY_CONNECTED_COMPONENT:
                return (
                    isVermeer
                        ? (<WeaklyConnectedComponentVermeer {...args} />)
                        : (<WeaklyConnectedComponent {...args} />)
                );
            case DEGREE_CENTRALIT:
                return (
                    isVermeer
                        ? (<DegreeCentralityVermeer {...args} />)
                        : (<DegreeCentrality {...args} />)
                );
            case CLOSENESS_CENTRALITY:
                return (
                    isVermeer
                        ? (<ClosenessCentralityVermeer {...args} />)
                        : (<ClosenessCentrality {...args} />)
                );
            case TRIANGLE_COUNT:
                return (
                    isVermeer
                        ? (<TriangleCountVermeer {...args} />)
                        : (<TriangleCount {...args} />)
                );
            case RINGS_DETECTION:
                return <RingsDetection {...args} />;
            case FILTERED_RINGS_DETECTION:
                return <FilteredRingsDetection {...args} />;
            case LINKS:
                return <Links {...args} />;
            case CLUSTER_COEFFICIENT:
                return <ClusterCoefficient {...args} />;
            case BETWEENNESS_CENTRALITY:
                return (
                    isVermeer
                        ? (<BetweennessCentralityVermeer {...args} />)
                        : (<BetweennessCentrality {...args} />)
                );
            case LABEL_PROPAGATION_ALGORITHM:
                return (
                    isVermeer
                        ? (<LabelPropagationAlgorithmVermeer {...args} />)
                        : (<LabelPropagationAlgorithm {...args} />)
                );
            case LOUVAIN:
                return <Louvain {...args} canRun={canRunLouvain} />;
            case FILTER_SUBGRAPH_MATCHING:
                return <FilterSubGraphMatching {...args} />;
            case K_CORE:
                return (
                    isVermeer ? <KCoreVermeer {...args} /> : <KCore {...args} />
                );
            case PERSONAL_PAGE_RANK:
                return <PersonalPageRank {...args} />;
            case SSSP:
                return <SSSPVermeer {...args} />;
        }
    };

    return (
        <AlgorithmPersistenceContext.Provider value={getCanonicalAlgorithmName(algorithmName)}>
            {renderItem()}
        </AlgorithmPersistenceContext.Provider>
    );
};

export default OlapItem;
