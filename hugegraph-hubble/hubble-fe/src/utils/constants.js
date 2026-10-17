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

import {useTranslation} from 'react-i18next';
import enAnalysis from '../i18n/resources/en-US/modules/analysis.json';
import zhAnalysis from '../i18n/resources/zh-CN/modules/analysis.json';

export const colors = [
    '#5c73e6',
    '#569380',
    '#8ecc93',
    '#fe9227',
    '#fe5b5d',
    '#fd6ace',
    '#4d8dda',
    '#57c7e3',
    '#ffe081',
    '#c570ff',
    '#2b65ff',
    '#0eb880',
    '#76c100',
    '#ed7600',
    '#e65055',
    '#a64ee6',
    '#108cee',
    '#00b5d9',
    '#f2ca00',
    '#e048ae',
];

export const iconsMap = {
    UserOutlined: 'user',
    UsergroupAddOutlined: 'add user',
    IdcardOutlined: 'id card',
    VerifiedOutlined: 'verified',
    UserSwitchOutlined: 'switch user',
    PropertySafetyOutlined: 'property safety',
    TransactionOutlined: 'transaction',
    InsuranceOutlined: 'insurance ',
    ShoppingOutlined: 'shopping',
    CloudSyncOutlined: 'cloud-sync',
    HomeOutlined: 'home',
    BankOutlined: 'bank',
    ShopOutlined: 'shop',
    ReadOutlined: 'read',
    MedicineBoxOutlined: 'medicinebox',
    CommentOutlined: 'comment',
    ChromeOutlined: 'chrome',
    DribbbleOutlined: 'dribbble',
    SlackOutlined: 'slack',
    MailOutlined: 'mail',
    LaptopOutlined: 'laptop',
    PhoneOutlined: 'phone',
    WhatsAppOutlined: 'whatsapp',
    AlertOutlined: 'alert',
    DashboardOutlined: 'dashboard',
    SettingOutlined: 'setting',
    StarOutlined: 'star',
    TrademarkOutlined: 'trademark',
    SoundOutlined: 'sound',
    LockOutlined: 'lock',
};

export const GREMLIN_EXECUTES_MODE = {
    QUERY: 'query',
    TASK: 'task',
};

export const GRAPH_STATUS = {
    STANDBY: 'standby',
    LOADING: 'loading',
    SUCCESS: 'success',
    FAILED: 'failed',
    UPLOAD_FAILED: 'uploadFailed',
};


export const ANALYSIS_TYPE = {
    GREMLIN: 'Gremlin',
    ALGORITHM: 'Algorithms',
    CYPHER: 'Cypher',
    TEXT2GQL: 'Text2GQL',
    ASYNC_CYPHER: 'Async_Cypher',
    ASYNC_GREMLIN: 'Async_Gremlin',
};

export const EDGE_TYPE = [
    'line',
    'runningLine',
    'quadratic',
    'runningQuadratic',
    'loop',
    'runningLoop',
];

export const PANEL_TYPE = {
    CLOSED: 0,
    LAYOUT: 1,
    SETTING: 2,
    STATISTICS: 3,
};

export const GRAPH_LOAD_STATUS = {
    CREATED: 'created',
    LOADING: 'loading',
    LOADED: 'loaded',
    ERROR: 'error',
};

export const EDGELABEL_TYPE = {
    PARENT: 'PARENT',
    SUB: 'SUB',
    NORMAL: 'NORMAL',
};

export const EDGELABEL_TYPE_NAME = {
    PARENT: 'analysis.canvas.element_tooltip.edge_label_type.parent',
    SUB: 'analysis.canvas.element_tooltip.edge_label_type.sub',
    NORMAL: 'analysis.canvas.element_tooltip.edge_label_type.normal',
};

export const Async_Task_Type = {
    '': 'analysis.async_task.type.all',
    gremlin: 'analysis.async_task.type.gremlin',
    'computer-dis': 'analysis.async_task.type.algorithm',
    remove_schema: 'analysis.async_task.type.remove_schema',
    create_index: 'analysis.async_task.type.create_index',
    rebuild_index: 'analysis.async_task.type.rebuild_index',
    cypher: 'analysis.async_task.type.cypher',
    'vermeer-task:load': 'analysis.async_task.type.vermeer_load',
    'vermeer-task:compute': 'analysis.async_task.type.vermeer_compute',
};

export const Async_Taskt_Status = {
    UNKNOWN: 'UNKNOW',
    NEW: 'new',
    SCHEDULING: 'scheduling',
    SCHEDULED: 'scheduled',
    QUEUED: 'queued',
    RUNNING: 'running',
    RESTORING: 'restoring',
    SUCCESS: 'success',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    CANCELLING: 'cancelling',
    HANGING: 'hanging',
    PENDING: 'pending',
    DELETING: 'deleting',
};

export const Async_Taskt_Status_Name = {
    '': 'analysis.async_task.status.all',
    UNKNOWN: 'analysis.async_task.status.unknown',
    new: 'analysis.async_task.status.new',
    scheduling: 'analysis.async_task.status.scheduling',
    scheduled: 'analysis.async_task.status.scheduled',
    queued: 'analysis.async_task.status.queued',
    running: 'analysis.async_task.status.running',
    restoring: 'analysis.async_task.status.restoring',
    success: 'analysis.async_task.status.success',
    failed: 'analysis.async_task.status.failed',
    cancelled: 'analysis.async_task.status.cancelled',
    cancelling: 'analysis.async_task.status.cancelling',
    hanging: 'analysis.async_task.status.hanging',
    pending: 'analysis.async_task.status.pending',
    deleting: 'analysis.async_task.status.deleting',
};

export const Filter_Task_Status = {
    '': Async_Taskt_Status_Name[''],
    scheduling: Async_Taskt_Status_Name.scheduling,
    queued: Async_Taskt_Status_Name.queued,
    running: Async_Taskt_Status_Name.running,
    restoring: Async_Taskt_Status_Name.restoring,
    success: Async_Taskt_Status_Name.success,
    failed: Async_Taskt_Status_Name.failed,
    cancelled: Async_Taskt_Status_Name.cancelled,
};

export const Async_Task_Manipulations = {
    abort: 'analysis.async_task.action.abort',
    aborting: 'analysis.async_task.action.aborting',
    delete: 'analysis.async_task.action.delete',
    check_result: 'analysis.async_task.action.check_result',
    check_reason: 'analysis.async_task.action.check_reason',
};

const translateMap = (t, map) => Object.entries(map)
    .reduce((result, [key, value]) => ({
        ...result,
        [key]: t(value),
    }), {});

export const getTranslatedAsyncTaskConstants = t => ({
    taskTypeNames: translateMap(t, Async_Task_Type),
    taskStatusNames: translateMap(t, Async_Taskt_Status_Name),
    taskManipulations: translateMap(t, Async_Task_Manipulations),
});

export const Status_Color = {
    new: 'geekblue',
    scheduling: 'geekblue',
    scheduled: 'geekblue',
    queued: 'geekblue',
    running: 'geekblue',
    restoring: 'geekblue',
    deleting: 'geekblue',
    hanging: 'geekblue',
    success: 'green',
    cancelling: 'green',
    cancelled: 'green',
    async_task_success: 'green',
    failed: 'red',
    async_task_failed: 'red',
    UNKNOWN: 'orange',
};

export const GRAPH_ANALYSIS_MODULE = {
    GREMLIN: 'gremlin',
    ALGORITHMS: 'algorithms',
    ASYNCTASKS: 'asyncTasks',
};

export const FAVORITE_TYPE = {
    Gremlin: 'GREMLIN',
    Algorithms: 'ALGORITHM',
    Cypher: 'CYPHER',
};

export const EXECUTION_LOGS_TYPE = {
    Gremlin: '6',
    Algorithms: '1',
    Cypher: '7',
    Async_Cypher: '4',
    Async_Gremlin: '5',
};

export const SUPPORTED_LAYOUT_TYPE = {
    FORCE: 'force',
    CIRCULAR: 'circular',
    CONCENTRIC: 'concentric',
    DAGRE: 'dagre',
    CUSTOMGRID: 'customGrid',
    RADIAL: 'radial',
};

export const GRAPH_RENDER_MODE = {
    CANVAS2D: '2D模式',
    CANVAS3D: '3D模式',
};

const ALGORITHM_NAME_BASE_PATH = 'analysis.algorithm.olap.item';
const ALGORITHM_NAME_RESOURCE = enAnalysis.analysis.algorithm.olap.item;
const LEGACY_ALGORITHM_NAME_RESOURCE = zhAnalysis.analysis.algorithm.olap.item;
const LEGACY_ALGORITHM_NAME_ALIAS_RESOURCE
    = zhAnalysis.analysis.algorithm.olap.legacy_item_alias || {};

export const ALGORITHM_NAME = {
    PAGE_RANK: ALGORITHM_NAME_RESOURCE.PAGE_RANK,
    WEAKLY_CONNECTED_COMPONENT: ALGORITHM_NAME_RESOURCE.WEAKLY_CONNECTED_COMPONENT,
    DEGREE_CENTRALIT: ALGORITHM_NAME_RESOURCE.DEGREE_CENTRALIT,
    CLOSENESS_CENTRALITY: ALGORITHM_NAME_RESOURCE.CLOSENESS_CENTRALITY,
    TRIANGLE_COUNT: ALGORITHM_NAME_RESOURCE.TRIANGLE_COUNT,
    K_NEIGHBOR: ALGORITHM_NAME_RESOURCE.K_NEIGHBOR,
    K_OUT: ALGORITHM_NAME_RESOURCE.K_OUT,
    SAME_NEIGHBORS: ALGORITHM_NAME_RESOURCE.SAME_NEIGHBORS,
    RINGS: ALGORITHM_NAME_RESOURCE.RINGS,
    SHORTEST_PATH: ALGORITHM_NAME_RESOURCE.SHORTEST_PATH,
    ALLPATHS: ALGORITHM_NAME_RESOURCE.ALLPATHS,
    JACCARD_SIMILARITY: ALGORITHM_NAME_RESOURCE.JACCARD_SIMILARITY,
    CROSSPOINTS: ALGORITHM_NAME_RESOURCE.CROSSPOINTS,
    RINGS_DETECTION: ALGORITHM_NAME_RESOURCE.RINGS_DETECTION,
    FILTERED_RINGS_DETECTION: ALGORITHM_NAME_RESOURCE.FILTERED_RINGS_DETECTION,
    LINKS: ALGORITHM_NAME_RESOURCE.LINKS,
    CLUSTER_COEFFICIENT: ALGORITHM_NAME_RESOURCE.CLUSTER_COEFFICIENT,
    BETWEENNESS_CENTRALITY: ALGORITHM_NAME_RESOURCE.BETWEENNESS_CENTRALITY,
    LABEL_PROPAGATION_ALGORITHM: ALGORITHM_NAME_RESOURCE.LABEL_PROPAGATION_ALGORITHM,
    LOUVAIN: ALGORITHM_NAME_RESOURCE.LOUVAIN,
    FILTER_SUBGRAPH_MATCHING: ALGORITHM_NAME_RESOURCE.FILTER_SUBGRAPH_MATCHING,
    K_CORE: ALGORITHM_NAME_RESOURCE.K_CORE,
    PERSONAL_PAGE_RANK: ALGORITHM_NAME_RESOURCE.PERSONAL_PAGE_RANK,
    KOUT_POST: ALGORITHM_NAME_RESOURCE.KOUT_POST,
    KNEIGHBOR_POST: ALGORITHM_NAME_RESOURCE.KNEIGHBOR_POST,
    JACCARD_SIMILARITY_POST: ALGORITHM_NAME_RESOURCE.JACCARD_SIMILARITY_POST,
    RANK_API: ALGORITHM_NAME_RESOURCE.RANK_API,
    NEIGHBOR_RANK_API: ALGORITHM_NAME_RESOURCE.NEIGHBOR_RANK_API,
    FINDSHORTESTPATH: ALGORITHM_NAME_RESOURCE.FINDSHORTESTPATH,
    FINDSHORTESTPATHWITHWEIGHT: ALGORITHM_NAME_RESOURCE.FINDSHORTESTPATHWITHWEIGHT,
    SINGLESOURCESHORTESTPATH: ALGORITHM_NAME_RESOURCE.SINGLESOURCESHORTESTPATH,
    MULTINODESSHORTESTPATH: ALGORITHM_NAME_RESOURCE.MULTINODESSHORTESTPATH,
    CUSTOMIZEDPATHS: ALGORITHM_NAME_RESOURCE.CUSTOMIZEDPATHS,
    TEMPLATEPATHS: ALGORITHM_NAME_RESOURCE.TEMPLATEPATHS,
    CUSTOMIZED_CROSSPOINTS: ALGORITHM_NAME_RESOURCE.CUSTOMIZED_CROSSPOINTS,
    RAYS: ALGORITHM_NAME_RESOURCE.RAYS,
    PATHS: ALGORITHM_NAME_RESOURCE.PATHS,
    FUSIFORM_SIMILARITY: ALGORITHM_NAME_RESOURCE.FUSIFORM_SIMILARITY,
    ADAMIC_ADAR: ALGORITHM_NAME_RESOURCE.ADAMIC_ADAR,
    RESOURCE_ALLOCATION: ALGORITHM_NAME_RESOURCE.RESOURCE_ALLOCATION,
    SAME_NEIGHBORS_BATCH: ALGORITHM_NAME_RESOURCE.SAME_NEIGHBORS_BATCH,
    EGONET: ALGORITHM_NAME_RESOURCE.EGONET,
    SSSP: ALGORITHM_NAME_RESOURCE.SSSP,
};

const getAlgorithmNameEntry = (name, t = key => key) => {
    return Object.entries(ALGORITHM_NAME).find(([key, value]) => {
        const i18nKey = `${ALGORITHM_NAME_BASE_PATH}.${key}`;
        return value === name
            || t(i18nKey) === name
            || LEGACY_ALGORITHM_NAME_RESOURCE[key] === name
            || LEGACY_ALGORITHM_NAME_ALIAS_RESOURCE[key] === name;
    });
};

export const getCanonicalAlgorithmName = (name, t = key => key) => {
    const entry = getAlgorithmNameEntry(name, t);
    return entry ? entry[1] : name;
};

export const getAlgorithmNameI18nKey = name => {
    const entry = getAlgorithmNameEntry(name);
    return entry ? `${ALGORITHM_NAME_BASE_PATH}.${entry[0]}` : undefined;
};

export const getAlgorithmDisplayName = (name, t = key => key) => {
    const entry = getAlgorithmNameEntry(name, t);
    const i18nKey = entry ? `${ALGORITHM_NAME_BASE_PATH}.${entry[0]}` : undefined;
    return i18nKey ? t(i18nKey) : name;
};

const getAlgorithmSearchNames = (name, t = key => key) => {
    const entry = getAlgorithmNameEntry(name, t);
    if (!entry) {
        return [name];
    }
    const [key, value] = entry;
    const i18nValue = t(`${ALGORITHM_NAME_BASE_PATH}.${key}`);
    return [
        name,
        value,
        LEGACY_ALGORITHM_NAME_RESOURCE[key],
        LEGACY_ALGORITHM_NAME_ALIAS_RESOURCE[key],
        i18nValue,
    ];
};

export const isAlgorithmNameMatched = (name, search, t = key => key) => {
    const keyword = `${search || ''}`.trim().toLowerCase();
    if (!keyword) {
        return true;
    }
    return getAlgorithmSearchNames(name, t)
        .some(text => `${text || ''}`.toLowerCase().includes(keyword));
};

export const Algorithm_Layout = {
    [ALGORITHM_NAME.K_OUT]: 'radial',
    [ALGORITHM_NAME.K_NEIGHBOR]: 'radial',
    [ALGORITHM_NAME.SAME_NEIGHBORS]: 'relationship',
    [ALGORITHM_NAME.RINGS]: 'force',
    [ALGORITHM_NAME.SHORTEST_PATH]: 'relationship',
    [ALGORITHM_NAME.ALLPATHS]: 'relationship',
    [ALGORITHM_NAME.KOUT_POST]: 'force',
    [ALGORITHM_NAME.KNEIGHBOR_POST]: 'force',
    [ALGORITHM_NAME.FINDSHORTESTPATH]: 'force',
    [ALGORITHM_NAME.FINDSHORTESTPATHWITHWEIGHT]: 'force',
    [ALGORITHM_NAME.SINGLESOURCESHORTESTPATH]: 'force',
    [ALGORITHM_NAME.MULTINODESSHORTESTPATH]: 'relationship',
    [ALGORITHM_NAME.CUSTOMIZEDPATHS]: 'forceAtlas',
    [ALGORITHM_NAME.TEMPLATEPATHS]: 'forceAtlas',
    [ALGORITHM_NAME.CROSSPOINTS]: 'grid',
    [ALGORITHM_NAME.CUSTOMIZED_CROSSPOINTS]: 'relationship',
    [ALGORITHM_NAME.RAYS]: 'forceAtlas',
    [ALGORITHM_NAME.FUSIFORM_SIMILARITY]: 'force',
    [ALGORITHM_NAME.SAME_NEIGHBORS_BATCH]: 'relationship',
    [ALGORITHM_NAME.EGONET]: 'force',
    [ALGORITHM_NAME.PATHS]: 'force',
};

export const Algorithm_Url = {
    [ALGORITHM_NAME.K_OUT]: 'kout',
    [ALGORITHM_NAME.K_NEIGHBOR]: 'kneighbor',
    [ALGORITHM_NAME.SAME_NEIGHBORS]: 'sameNeighbors',
    [ALGORITHM_NAME.SHORTEST_PATH]: 'shortestPath',
    [ALGORITHM_NAME.RINGS]: 'rings',
    [ALGORITHM_NAME.ALLPATHS]: 'advancedPaths',
    [ALGORITHM_NAME.JACCARD_SIMILARITY]: 'jaccardSimilarity',
    [ALGORITHM_NAME.KOUT_POST]: 'kout_post',
    [ALGORITHM_NAME.KNEIGHBOR_POST]: 'kneighbor_post',
    [ALGORITHM_NAME.RANK_API]: 'personalrank',
    [ALGORITHM_NAME.NEIGHBOR_RANK_API]: 'neighborrank',
    [ALGORITHM_NAME.JACCARD_SIMILARITY_POST]: 'jaccardSimilarity_post',
    [ALGORITHM_NAME.FINDSHORTESTPATH]: 'allshortestpaths',
    [ALGORITHM_NAME.FINDSHORTESTPATHWITHWEIGHT]: 'weightedshortestpath',
    [ALGORITHM_NAME.SINGLESOURCESHORTESTPATH]: 'singlesourceshortestpath',
    [ALGORITHM_NAME.MULTINODESSHORTESTPATH]: 'multinodeshortestpath',
    [ALGORITHM_NAME.CUSTOMIZEDPATHS]: 'customizedpaths',
    [ALGORITHM_NAME.TEMPLATEPATHS]: 'templatepaths',
    [ALGORITHM_NAME.CROSSPOINTS]: 'crosspoints',
    [ALGORITHM_NAME.CUSTOMIZED_CROSSPOINTS]: 'customizedcrosspoints',
    [ALGORITHM_NAME.RAYS]: 'rays',
    [ALGORITHM_NAME.RANK_API]: 'personalrank',
    [ALGORITHM_NAME.FUSIFORM_SIMILARITY]: 'fusiformsimilarity',
    [ALGORITHM_NAME.ADAMIC_ADAR]: 'adamicadar',
    [ALGORITHM_NAME.RESOURCE_ALLOCATION]: 'resourceallocation',
    [ALGORITHM_NAME.SAME_NEIGHBORS_BATCH]: 'sameneighborsbatch',
    [ALGORITHM_NAME.EGONET]: 'egonet',
    [ALGORITHM_NAME.PATHS]: 'paths',
};
//



export const TEXT_PATH = {
    COMMON_VERIFY: 'common.verify',
    COMMON_STATUS: 'common.status',
    ALGORITHM: 'analysis.algorithm',
    OLAP: 'analysis.algorithm.olap',
    OLTP: 'analysis.algorithm.oltp',
    ALGORITHM_COMMON: 'analysis.algorithm.common',
};

export const useTranslatedConstants = () => {
    const {t} = useTranslation();
    const boolOptions = [
        {label: t('common.verify.yes'), value: 1},
        {label: t('common.verify.no'), value: 0},
    ];
    const directionOptions = [
        {label: t('analysis.algorithm.form.direction_options.out'), value: 'out'},
        {label: t('analysis.algorithm.form.direction_options.in'), value: 'in'},
        {label: t('analysis.algorithm.form.direction_options.both'), value: 'both'},
    ];
    const ALGORITHM_NAME = {
        PAGE_RANK: t(`${ALGORITHM_NAME_BASE_PATH}.PAGE_RANK`),
        WEAKLY_CONNECTED_COMPONENT: t(`${ALGORITHM_NAME_BASE_PATH}.WEAKLY_CONNECTED_COMPONENT`),
        DEGREE_CENTRALIT: t(`${ALGORITHM_NAME_BASE_PATH}.DEGREE_CENTRALIT`),
        CLOSENESS_CENTRALITY: t(`${ALGORITHM_NAME_BASE_PATH}.CLOSENESS_CENTRALITY`),
        TRIANGLE_COUNT: t(`${ALGORITHM_NAME_BASE_PATH}.TRIANGLE_COUNT`),
        K_NEIGHBOR: t(`${ALGORITHM_NAME_BASE_PATH}.K_NEIGHBOR`),
        K_OUT: t(`${ALGORITHM_NAME_BASE_PATH}.K_OUT`),
        SAME_NEIGHBORS: t(`${ALGORITHM_NAME_BASE_PATH}.SAME_NEIGHBORS`),
        RINGS: t(`${ALGORITHM_NAME_BASE_PATH}.RINGS`),
        SHORTEST_PATH: t(`${ALGORITHM_NAME_BASE_PATH}.SHORTEST_PATH`),
        ALLPATHS: t(`${ALGORITHM_NAME_BASE_PATH}.ALLPATHS`),
        JACCARD_SIMILARITY: t(`${ALGORITHM_NAME_BASE_PATH}.JACCARD_SIMILARITY`),
        CROSSPOINTS: t(`${ALGORITHM_NAME_BASE_PATH}.CROSSPOINTS`),
        RINGS_DETECTION: t(`${ALGORITHM_NAME_BASE_PATH}.RINGS_DETECTION`),
        FILTERED_RINGS_DETECTION: t(`${ALGORITHM_NAME_BASE_PATH}.FILTERED_RINGS_DETECTION`),
        LINKS: t(`${ALGORITHM_NAME_BASE_PATH}.LINKS`),
        CLUSTER_COEFFICIENT: t(`${ALGORITHM_NAME_BASE_PATH}.CLUSTER_COEFFICIENT`),
        BETWEENNESS_CENTRALITY: t(`${ALGORITHM_NAME_BASE_PATH}.BETWEENNESS_CENTRALITY`),
        LABEL_PROPAGATION_ALGORITHM: t(`${ALGORITHM_NAME_BASE_PATH}.LABEL_PROPAGATION_ALGORITHM`),
        LOUVAIN: t(`${ALGORITHM_NAME_BASE_PATH}.LOUVAIN`),
        FILTER_SUBGRAPH_MATCHING: t(`${ALGORITHM_NAME_BASE_PATH}.FILTER_SUBGRAPH_MATCHING`),
        K_CORE: t(`${ALGORITHM_NAME_BASE_PATH}.K_CORE`),
        PERSONAL_PAGE_RANK: t(`${ALGORITHM_NAME_BASE_PATH}.PERSONAL_PAGE_RANK`),
        KOUT_POST: t(`${ALGORITHM_NAME_BASE_PATH}.KOUT_POST`),
        KNEIGHBOR_POST: t(`${ALGORITHM_NAME_BASE_PATH}.KNEIGHBOR_POST`),
        JACCARD_SIMILARITY_POST: t(`${ALGORITHM_NAME_BASE_PATH}.JACCARD_SIMILARITY_POST`),
        RANK_API: t(`${ALGORITHM_NAME_BASE_PATH}.RANK_API`),
        NEIGHBOR_RANK_API: t(`${ALGORITHM_NAME_BASE_PATH}.NEIGHBOR_RANK_API`),
        FINDSHORTESTPATH: t(`${ALGORITHM_NAME_BASE_PATH}.FINDSHORTESTPATH`),
        FINDSHORTESTPATHWITHWEIGHT: t(`${ALGORITHM_NAME_BASE_PATH}.FINDSHORTESTPATHWITHWEIGHT`),
        SINGLESOURCESHORTESTPATH: t(`${ALGORITHM_NAME_BASE_PATH}.SINGLESOURCESHORTESTPATH`),
        MULTINODESSHORTESTPATH: t(`${ALGORITHM_NAME_BASE_PATH}.MULTINODESSHORTESTPATH`),
        CUSTOMIZEDPATHS: t(`${ALGORITHM_NAME_BASE_PATH}.CUSTOMIZEDPATHS`),
        TEMPLATEPATHS: t(`${ALGORITHM_NAME_BASE_PATH}.TEMPLATEPATHS`),
        CUSTOMIZED_CROSSPOINTS: t(`${ALGORITHM_NAME_BASE_PATH}.CUSTOMIZED_CROSSPOINTS`),
        RAYS: t(`${ALGORITHM_NAME_BASE_PATH}.RAYS`),
        PATHS: t(`${ALGORITHM_NAME_BASE_PATH}.PATHS`),
        FUSIFORM_SIMILARITY: t(`${ALGORITHM_NAME_BASE_PATH}.FUSIFORM_SIMILARITY`),
        ADAMIC_ADAR: t(`${ALGORITHM_NAME_BASE_PATH}.ADAMIC_ADAR`),
        RESOURCE_ALLOCATION: t(`${ALGORITHM_NAME_BASE_PATH}.RESOURCE_ALLOCATION`),
        SAME_NEIGHBORS_BATCH: t(`${ALGORITHM_NAME_BASE_PATH}.SAME_NEIGHBORS_BATCH`),
        EGONET: t(`${ALGORITHM_NAME_BASE_PATH}.EGONET`),
        SSSP: t(`${ALGORITHM_NAME_BASE_PATH}.SSSP`),
    };

    const Algorithm_Layout = {
        [ALGORITHM_NAME.K_OUT]: 'radial',
        [ALGORITHM_NAME.K_NEIGHBOR]: 'radial',
        [ALGORITHM_NAME.SAME_NEIGHBORS]: 'relationship',
        [ALGORITHM_NAME.RINGS]: 'force',
        [ALGORITHM_NAME.SHORTEST_PATH]: 'relationship',
        [ALGORITHM_NAME.ALLPATHS]: 'relationship',
        [ALGORITHM_NAME.KOUT_POST]: 'force',
        [ALGORITHM_NAME.KNEIGHBOR_POST]: 'force',
        [ALGORITHM_NAME.FINDSHORTESTPATH]: 'force',
        [ALGORITHM_NAME.FINDSHORTESTPATHWITHWEIGHT]: 'force',
        [ALGORITHM_NAME.SINGLESOURCESHORTESTPATH]: 'force',
        [ALGORITHM_NAME.MULTINODESSHORTESTPATH]: 'relationship',
        [ALGORITHM_NAME.CUSTOMIZEDPATHS]: 'forceAtlas',
        [ALGORITHM_NAME.TEMPLATEPATHS]: 'forceAtlas',
        [ALGORITHM_NAME.CROSSPOINTS]: 'grid',
        [ALGORITHM_NAME.CUSTOMIZED_CROSSPOINTS]: 'relationship',
        [ALGORITHM_NAME.RAYS]: 'forceAtlas',
        [ALGORITHM_NAME.FUSIFORM_SIMILARITY]: 'force',
        [ALGORITHM_NAME.SAME_NEIGHBORS_BATCH]: 'relationship',
        [ALGORITHM_NAME.EGONET]: 'force',
        [ALGORITHM_NAME.PATHS]: 'force',
    };

    const Algorithm_Url = {
        [ALGORITHM_NAME.K_OUT]: 'kout',
        [ALGORITHM_NAME.K_NEIGHBOR]: 'kneighbor',
        [ALGORITHM_NAME.SAME_NEIGHBORS]: 'sameNeighbors',
        [ALGORITHM_NAME.SHORTEST_PATH]: 'shortestPath',
        [ALGORITHM_NAME.RINGS]: 'rings',
        [ALGORITHM_NAME.ALLPATHS]: 'advancedPaths',
        [ALGORITHM_NAME.JACCARD_SIMILARITY]: 'jaccardSimilarity',
        [ALGORITHM_NAME.KOUT_POST]: 'kout_post',
        [ALGORITHM_NAME.KNEIGHBOR_POST]: 'kneighbor_post',
        [ALGORITHM_NAME.RANK_API]: 'personalrank',
        [ALGORITHM_NAME.NEIGHBOR_RANK_API]: 'neighborrank',
        [ALGORITHM_NAME.JACCARD_SIMILARITY_POST]: 'jaccardSimilarity_post',
        [ALGORITHM_NAME.FINDSHORTESTPATH]: 'allshortestpaths',
        [ALGORITHM_NAME.FINDSHORTESTPATHWITHWEIGHT]: 'weightedshortestpath',
        [ALGORITHM_NAME.SINGLESOURCESHORTESTPATH]: 'singlesourceshortestpath',
        [ALGORITHM_NAME.MULTINODESSHORTESTPATH]: 'multinodeshortestpath',
        [ALGORITHM_NAME.CUSTOMIZEDPATHS]: 'customizedpaths',
        [ALGORITHM_NAME.TEMPLATEPATHS]: 'templatepaths',
        [ALGORITHM_NAME.CROSSPOINTS]: 'crosspoints',
        [ALGORITHM_NAME.CUSTOMIZED_CROSSPOINTS]: 'customizedcrosspoints',
        [ALGORITHM_NAME.RAYS]: 'rays',
        [ALGORITHM_NAME.RANK_API]: 'personalrank',
        [ALGORITHM_NAME.FUSIFORM_SIMILARITY]: 'fusiformsimilarity',
        [ALGORITHM_NAME.ADAMIC_ADAR]: 'adamicadar',
        [ALGORITHM_NAME.RESOURCE_ALLOCATION]: 'resourceallocation',
        [ALGORITHM_NAME.SAME_NEIGHBORS_BATCH]: 'sameneighborsbatch',
        [ALGORITHM_NAME.EGONET]: 'egonet',
        [ALGORITHM_NAME.PATHS]: 'paths',
    };
    const ALGORITHM_MODE = {
        OLTP: t(TEXT_PATH.ALGORITHM + '.mode.OLTP'),
        OLAP: t(TEXT_PATH.ALGORITHM + '.mode.OLAP'),
    };
    return {
        boolOptions,
        directionOptions,
        ALGORITHM_NAME,
        Algorithm_Layout,
        Algorithm_Url,
        ALGORITHM_MODE,
    };
};
