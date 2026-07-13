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
 * @file Oltp图算法表单列表
 */

import React from 'react';
import {Collapse} from 'antd';
import _ from 'lodash';
import {useTranslation} from 'react-i18next';
import {
    ALGORITHM_NAME,
    isAlgorithmNameMatched,
    useTranslatedConstants,
} from '../../../../utils/constants';
import OltpItem from '../Oltp/OltpItem';
import c from './index.module.scss';

const {
    K_NEIGHBOR,
    K_OUT,
    SAME_NEIGHBORS,
    RINGS,
    SHORTEST_PATH,
    ALLPATHS,
    JACCARD_SIMILARITY,
    CROSSPOINTS,
    CUSTOMIZED_CROSSPOINTS,
    KOUT_POST,
    KNEIGHBOR_POST,
    FINDSHORTESTPATH,
    FINDSHORTESTPATHWITHWEIGHT,
    SINGLESOURCESHORTESTPATH,
    MULTINODESSHORTESTPATH,
    CUSTOMIZEDPATHS,
    TEMPLATEPATHS,
    RAYS,
    FUSIFORM_SIMILARITY,
    ADAMIC_ADAR,
    RESOURCE_ALLOCATION,
    SAME_NEIGHBORS_BATCH,
    EGONET,
    JACCARD_SIMILARITY_POST,
    RANK_API,
    NEIGHBOR_RANK_API, PATHS,
} = ALGORITHM_NAME;

const oltpGroups = [
    {
        key: 'neighbors',
        items: [K_OUT, K_NEIGHBOR, SAME_NEIGHBORS, KOUT_POST, KNEIGHBOR_POST,
            SAME_NEIGHBORS_BATCH, EGONET],
    },
    {
        key: 'paths',
        items: [RINGS, SHORTEST_PATH, ALLPATHS, FINDSHORTESTPATH,
            FINDSHORTESTPATHWITHWEIGHT, SINGLESOURCESHORTESTPATH,
            MULTINODESSHORTESTPATH, CUSTOMIZEDPATHS, TEMPLATEPATHS, CROSSPOINTS,
            CUSTOMIZED_CROSSPOINTS, PATHS],
    },
    {
        key: 'similarity',
        items: [JACCARD_SIMILARITY, JACCARD_SIMILARITY_POST, RANK_API,
            NEIGHBOR_RANK_API, RAYS, FUSIFORM_SIMILARITY, ADAMIC_ADAR,
            RESOURCE_ALLOCATION],
    },
];



const OltpFormHome = props => {
    const {
        onOltpFormSubmit,
        search,
        currentAlgorithm,
        updateCurrentAlgorithm,
    } =  props;
    const {t} = useTranslation();
    const {ALGORITHM_MODE} = useTranslatedConstants();
    const {OLTP} = ALGORITHM_MODE;
    const getSearchedList = (arr, value) => {
        return arr.filter(item => isAlgorithmNameMatched(item, value, t));
    };

    const visibleGroups = oltpGroups.map(group => ({
        ...group,
        items: getSearchedList(group.items, search),
    })).filter(group => !_.isEmpty(group.items));
    const isEmptyBasicOltp = _.isEmpty(visibleGroups);

    return (
        <div>
            {!isEmptyBasicOltp && (<div className={c.algorithmCatagery}>{OLTP}</div>)}
            {visibleGroups.map(group => (
                <div key={group.key}>
                    <div className={c.algorithmGoal}>
                        {t(`analysis.algorithm.group.${group.key}`)}
                    </div>
                    <Collapse ghost accordion className={c.sideBarCollapse}>
                        {group.items.map(item => (
                            <OltpItem
                                key={item}
                                handleFormSubmit={onOltpFormSubmit}
                                algorithmName={item}
                                searchValue={search}
                                currentAlgorithm={currentAlgorithm}
                                updateCurrentAlgorithm={updateCurrentAlgorithm}
                            />
                        ))}
                    </Collapse>
                </div>
            ))}
        </div>
    );
};

export default OltpFormHome;
