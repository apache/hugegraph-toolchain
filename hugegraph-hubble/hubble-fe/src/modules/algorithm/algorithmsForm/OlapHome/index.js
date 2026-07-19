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
 * @file Olap图算法表单列表
 */

import React, {useContext} from 'react';
import {Collapse, Tooltip} from 'antd';
import GraphAnalysisContext from '../../../Context';
import _ from 'lodash';
import {
    GRAPH_LOAD_STATUS,
    isAlgorithmNameMatched,
    useTranslatedConstants,
    TEXT_PATH,
} from '../../../../utils/constants';
import OlapItem from '../Olap/OlapItem';
import c from './index.module.scss';
import {useTranslation} from 'react-i18next';




const OlapFormHome = props => {
    const {
        onOlapFormSubmit,
        search,
        currentAlgorithm,
        updateCurrentAlgorithm,
        canRunLouvain,
    } =  props;
    const {ALGORITHM_NAME, ALGORITHM_MODE} = useTranslatedConstants();
    const {t} = useTranslation();
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

    const olapComputeList = [
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
    ];

    const olapVermeerList = [
        PAGE_RANK,
        WEAKLY_CONNECTED_COMPONENT,
        LABEL_PROPAGATION_ALGORITHM,
        DEGREE_CENTRALIT,
        CLOSENESS_CENTRALITY,
        BETWEENNESS_CENTRALITY,
        TRIANGLE_COUNT,
        K_CORE,
        SSSP,
    ];


    const {OLAP} = ALGORITHM_MODE;
    const {isVermeer, graphStatus} = useContext(GraphAnalysisContext);

    const getSearchedList = (arr, value) => {
        return arr.filter(item => isAlgorithmNameMatched(item, value, t));
    };

    const olapList = isVermeer ? olapVermeerList : olapComputeList;
    const olapGroups = [
        {
            key: 'importance',
            items: [PAGE_RANK, PERSONAL_PAGE_RANK, DEGREE_CENTRALIT,
                CLOSENESS_CENTRALITY, BETWEENNESS_CENTRALITY],
        },
        {
            key: 'communities',
            items: [WEAKLY_CONNECTED_COMPONENT, LABEL_PROPAGATION_ALGORITHM,
                LOUVAIN, K_CORE],
        },
        {
            key: 'structure',
            items: [TRIANGLE_COUNT, RINGS_DETECTION, FILTERED_RINGS_DETECTION,
                LINKS, CLUSTER_COEFFICIENT, FILTER_SUBGRAPH_MATCHING, SSSP],
        },
    ];

    // 筛选显示已搜索到的算法
    const visibleGroups = olapGroups.map(group => ({
        ...group,
        items: getSearchedList(
            group.items.filter(item => olapList.includes(item)), search
        ),
    })).filter(group => !_.isEmpty(group.items));
    const isEmptyBasicOlap = _.isEmpty(visibleGroups);
    const shouldDisableForm = isVermeer && graphStatus !== GRAPH_LOAD_STATUS.LOADED;

    return (
        <div>
            {!isEmptyBasicOlap && (
                <Tooltip title={shouldDisableForm ? t(TEXT_PATH.ALGORITHM_COMMON + '.query_tooltip') : ''}>
                    <div className={c.algorithmCatagery}>{OLAP}</div>
                </Tooltip>
            )}
            {visibleGroups.map(group => (
                <div key={group.key}>
                    <div className={c.algorithmGoal}>
                        {t(`analysis.algorithm.group.${group.key}`)}
                    </div>
                    <Collapse ghost accordion className={c.sideBarCollapse}>
                        {group.items.map(item => (
                            <OlapItem
                                key={item}
                                handleFormSubmit={onOlapFormSubmit}
                                algorithmName={item}
                                searchValue={search}
                                currentAlgorithm={currentAlgorithm}
                                updateCurrentAlgorithm={updateCurrentAlgorithm}
                                canRunLouvain={canRunLouvain}
                            />
                        ))}
                    </Collapse>
                </div>
            ))}
        </div>
    );
};

export default OlapFormHome;
