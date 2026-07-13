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
 * @file OLTP算法item
 */

import React from 'react';
import {ALGORITHM_NAME, getCanonicalAlgorithmName} from '../../../../../utils/constants';
import KoutGet from '../KoutGet';
import KneighborGet from '../KneighborGet';
import SameNeighbors from '../SameNeighbors';
import Rings from '../Rings';
import ShortestPath from '../ShortestPath';
import AllPaths from '../AllPaths';
import JaccardSimilarityGet from '../JaccardSimilarityGet';
import KoutPost from '../KoutPost/Home';
import KneighborPost from '../KneighborPost';
import JaccardSimilarityPost from '../JaccardSimilarityPost';
import RankApi from '../RankApi';
import NeighborRankApi from '../NeighborRankApi';
import FindShortestPath from '../FindShortestPath';
import FindShortestPathWithWeight from '../FindShortestPathWithWeight';
import SingleSourceShortestPath from '../SingleSourceShortestPath';
import MultiNodesShortestPath from '../MultiNodesShortestPath';
import CustomizedPaths from '../CustomizedPaths/Home';
import TemplatePaths from '../TemplatePaths/Home';
import Crosspoints from '../Crosspoints';
import CustomizedCrosspoints from '../CustomizedCrosspoints/Home';
import Rays from '../Rays';
import FusiformSimilarity from '../FusiformSimilarity';
import AdamicAdar from '../AdamicAdar';
import ResourceAllocation from '../ResourceAllocation';
import SameNeighborsBatch from '../SameNeighborsBatch';
import Egonet from '../Egonet';
import Paths from '../Paths';
import {AlgorithmPersistenceContext} from '../../algorithmFormPersistence';

const {
    K_OUT,
    K_NEIGHBOR,
    SAME_NEIGHBORS,
    RINGS,
    SHORTEST_PATH,
    ALLPATHS,
    JACCARD_SIMILARITY,
    KOUT_POST,
    KNEIGHBOR_POST,
    JACCARD_SIMILARITY_POST,
    RANK_API,
    NEIGHBOR_RANK_API,
    FINDSHORTESTPATH,
    FINDSHORTESTPATHWITHWEIGHT,
    SINGLESOURCESHORTESTPATH,
    MULTINODESSHORTESTPATH,
    CUSTOMIZEDPATHS,
    TEMPLATEPATHS,
    CROSSPOINTS,
    CUSTOMIZED_CROSSPOINTS,
    RAYS,
    FUSIFORM_SIMILARITY,
    ADAMIC_ADAR,
    RESOURCE_ALLOCATION,
    SAME_NEIGHBORS_BATCH,
    EGONET,
    PATHS,
} = ALGORITHM_NAME;

const OltpItem = props => {
    const {
        algorithmName,
        ...args
    } = props;

    const renderItem = () => {
        switch (algorithmName) {
            case K_OUT:
                return <KoutGet {...args} />;
            case K_NEIGHBOR:
                return <KneighborGet {...args} />;
            case SAME_NEIGHBORS:
                return <SameNeighbors {...args} />;
            case RINGS:
                return <Rings {...args} />;
            case SHORTEST_PATH:
                return <ShortestPath {...args} />;
            case ALLPATHS:
                return <AllPaths {...args} />;
            case JACCARD_SIMILARITY:
                return <JaccardSimilarityGet {...args} />;
            case KOUT_POST:
                return <KoutPost {...args} />;
            case KNEIGHBOR_POST:
                return <KneighborPost {...args} />;
            case JACCARD_SIMILARITY_POST:
                return <JaccardSimilarityPost {...args} />;
            case RANK_API:
                return <RankApi {...args} />;
            case NEIGHBOR_RANK_API:
                return <NeighborRankApi {...args} />;
            case FINDSHORTESTPATH:
                return <FindShortestPath {...args} />;
            case FINDSHORTESTPATHWITHWEIGHT:
                return <FindShortestPathWithWeight {...args} />;
            case SINGLESOURCESHORTESTPATH:
                return <SingleSourceShortestPath {...args} />;
            case MULTINODESSHORTESTPATH:
                return <MultiNodesShortestPath {...args} />;
            case CUSTOMIZEDPATHS:
                return <CustomizedPaths {...args} />;
            case TEMPLATEPATHS:
                return <TemplatePaths {...args} />;
            case CROSSPOINTS:
                return <Crosspoints {...args} />;
            case CUSTOMIZED_CROSSPOINTS:
                return <CustomizedCrosspoints {...args} />;
            case RAYS:
                return <Rays {...args} />;
            case FUSIFORM_SIMILARITY:
                return <FusiformSimilarity {...args} />;
            case ADAMIC_ADAR:
                return <AdamicAdar {...args} />;
            case RESOURCE_ALLOCATION:
                return <ResourceAllocation {...args} />;
            case SAME_NEIGHBORS_BATCH:
                return <SameNeighborsBatch {...args} />;
            case EGONET:
                return <Egonet {...args} />;
            case PATHS:
                return <Paths {...args} />;
            default:
                break;
        }
    };

    return (
        <AlgorithmPersistenceContext.Provider value={getCanonicalAlgorithmName(algorithmName)}>
            {renderItem()}
        </AlgorithmPersistenceContext.Provider>
    );
};

export default OltpItem;
