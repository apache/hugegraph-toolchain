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

import request from './request';
import qs from 'qs';
import {streamText2Gql} from './text2gqlStream';
import {DEFAULT_QUERY_LANGUAGE, QUERY_LANGUAGES} from '../utils/text2gql';

// 图分析通用
const getGraphSpaceList = config => {
    return config
        ? request.get('/graphspaces/list', config)
        : request.get('/graphspaces/list');
};

const getOlapMode = (graphSpace, graph, config) => {
    const url = `/graphspaces/${graphSpace}/graphs/${graph}/graph_read_mode`;
    return config ? request.get(url, config) : request.get(url);
};

const switchOlapMode = (graphSpace, graph, params, config) => {
    const url = `/graphspaces/${graphSpace}/graphs/${graph}/graph_read_mode`;
    return config ? request.put(url, params, config) : request.put(url, params);
};

const getUploadList = (graphspace, graph) => {
    return `/api/v1.3/graphspaces/${graphspace}/graphs/${graph}/import`;
};

const getMetaEdgeList = (graphspace, graph) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/schema/edgelabels`);
};

const getMetaVertexList = (graphspace, graph, _params) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/schema/vertexlabels`);
};

const updateVertexProperties = (graphspace, graph, params) => {
    return request.put(`/graphspaces/${graphspace}/graphs/${graph}/vertex/${params.id}`, params);
};

const updateEdgeProperties = (graphspace, graph, params) => {
    return request.put(`/graphspaces/${graphspace}/graphs/${graph}/edge/${params.id}`, params);
};

const getVertexProperties = (graphspace, graph, params) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/vertexlabel/${params}`);
};

const getEdgeProperties = (graphspace, graph, params) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/edgelabel/${params}`);
};

const getExecutionLogs = (graphspace, graph, params) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/execute-histories`, {params});
};

const executeText2Gql = (graphspace, graph, language, params, config = {}) => {
    const dialect = QUERY_LANGUAGES[language];
    if (!dialect) {
        throw new Error('Unsupported query language');
    }
    return request.post(
        `/graphspaces/${graphspace}/graphs/${graph}/${dialect.endpoint}`,
        {...(typeof params === 'string' ? {content: params} : params), preview: true},
        {...config, suppressBusinessErrorToast: true}
    );
};

const getExecutionQuery = (graphspace, graph, params, config) => {
    return executeText2Gql(graphspace, graph, DEFAULT_QUERY_LANGUAGE, params, config);
};

const generateText2Gql = (graphspace, graph, params, config = {}) => {
    return request.post(
        `/graphspaces/${graphspace}/graphs/${graph}/text2gql`, params,
        {...config, timeout: 65000, suppressBusinessErrorToast: true}
    );
};

const getText2GqlConfig = (graphspace, graph, config = {}) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/text2gql/config`,
        {...config, suppressBusinessErrorToast: true});
};

const getGraphData = (graphspace, graph, config) => {
    const url = `/graphspaces/${graphspace}/graphs/${graph}/gremlin-query`;
    return config ? request.get(url, config) : request.get(url);
};

const putExecutionQuery = (graphspace, graph, params) => {
    return request.put(`/graphspaces/${graphspace}/graphs/${graph}/gremlin-query`, params);
};

const getCypherExecutionQuery = (graphspace, graph, params) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/cypher`, {
        params: {...params, preview: true},
        suppressBusinessErrorToast: true,
    });
};

const getExecutionTask = (graphspace, graph, params, config = {}) => {
    return request.post(
        `/graphspaces/${graphspace}/graphs/${graph}/gremlin-query/async-task`,
        params,
        {...config, suppressBusinessErrorToast: true}
    );
};

const getCypherTask = (graphspace, graph, params, config = {}) => {
    return request.post(
        `/graphspaces/${graphspace}/graphs/${graph}/cypher/async-task`,
        params,
        {...config, suppressBusinessErrorToast: true}
    );
};

const fetchManageTaskList = (graphspace, graph, params) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/async-tasks?`, {params});
};

export const fetchManageTaskById = (graphspace, graph, taskId) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/async-tasks/ids`, {
        params: {ids: taskId},
        suppressBusinessErrorToast: true,
    });
};

const addFavoriate = (graphspace, graph, params) => {
    return request.post(`graphspaces/${graphspace}/graphs/${graph}/gremlin-collections`, params);
};

const deleteQueryCollection = (graphspace, graph, id) => {
    return request.delete(`graphspaces/${graphspace}/graphs/${graph}/gremlin-collections/${id}`);
};

const editQueryCollection  = (graphspace, graph, parmas) => {
    return request.put(`graphspaces/${graphspace}/graphs/${graph}/gremlin-collections/${parmas.id}`, parmas);
};

const fetchFavoriteQueries = (graphspace, graph, params) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/gremlin-collections?`, {params});
};

const addGraphNode = (graphspace, graph, params) => {
    return request.post(`/graphspaces/${graphspace}/graphs/${graph}/vertex`, params);
};

const fetchEdgeLabels = (graphspace, graph, params) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/schema/edgelabels/${params}`);
};

const fetchVertexlinks = (graphspace, graph, params) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/schema/vertexlabels/${params}/link`);
};

const addEdge = (graphspace, graph, params) => {
    return request.post(`/graphspaces/${graphspace}/graphs/${graph}/edge`, params);
};


// 图算法
const runAlgorithmRequest = async requestCall => {
    try {
        return await requestCall();
    }
    catch (error) {
        const errorData = error?.response?.data || error?.data;
        return {
            status: errorData?.status || error?.response?.status || 500,
            data: null,
            message: errorData?.message || error?.message || '',
        };
    }
};

const postOlapInfo =  (graphspace, graph, data) => {
    return runAlgorithmRequest(() => {
        return request.post(`/graphspaces/${graphspace}/graphs/${graph}/algorithms/olap`, data);
    });
};

const getOlapCapability = (graphspace, graph, config = {}) => {
    return request.get(
        `/graphspaces/${graphspace}/graphs/${graph}/algorithms/olap/capability`,
        config
    );
};

const runOltpInfo =  (graphspace, graph, data) => {
    return runAlgorithmRequest(() => {
        return request.post(
            `/graphspaces/${graphspace}/graphs/${graph}/algorithms/oltp/` + data.algorithmName,
            data
        );
    });
};

const runOlapVermeer =  (graphspace, graph, params) => {
    return runAlgorithmRequest(() => {
        return request.post(
            `/graphspaces/${graphspace}/graphs/${graph}/algorithms/vermeer`,
            {params}
        );
    });
};

// 任务管理
const fetchAsyncTaskResult = (graphspace, graph, taskId) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/async-tasks/${taskId}`, {
        suppressBusinessErrorToast: true,
    });
};

const fetchVermeerTaskValues = (graphspace, graph, taskId, cursor) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/async-tasks/${taskId}/values`, {
        params: {cursor, limit: 1000},
        suppressBusinessErrorToast: true,
    });
};

const deleteAsyncTask = (graphspace, graph, selectedTaskIds) => {
    const params  = qs.stringify(selectedTaskIds, {arrayFormat: 'repeat'});
    return request.delete(`/graphspaces/${graphspace}/graphs/${graph}/async-tasks?` + params);
};

const abortAsyncTask = (graphspace, graph, taskId) => {
    return request.post(`/graphspaces/${graphspace}/graphs/${graph}/async-tasks/cancel/${taskId}`);
};

const getExecuteAsyncTaskList = (graphspace, graph, params) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/execute-histories`, {params});
};

const loadVermeerTask = (params, config) => {
    return config
        ? request.post('/vermeer/task', {...params}, config)
        : request.post('/vermeer/task', {...params});
};

export {
    getGraphSpaceList,
    getOlapMode,
    switchOlapMode,
    getExecutionLogs,
    getExecutionQuery,
    executeText2Gql,
    generateText2Gql,
    streamText2Gql,
    getText2GqlConfig,
    getGraphData,
    putExecutionQuery,
    getExecutionTask,
    getCypherTask,
    fetchManageTaskList,
    addFavoriate,
    postOlapInfo,
    getOlapCapability,
    runOltpInfo,
    runOlapVermeer,
    fetchAsyncTaskResult,
    fetchVermeerTaskValues,
    addGraphNode,
    deleteAsyncTask,
    abortAsyncTask,
    getMetaEdgeList,
    getMetaVertexList,
    deleteQueryCollection,
    editQueryCollection,
    fetchFavoriteQueries,
    getUploadList,
    updateVertexProperties,
    updateEdgeProperties,
    getCypherExecutionQuery,
    getVertexProperties,
    getEdgeProperties,
    getExecuteAsyncTaskList,
    fetchEdgeLabels,
    fetchVertexlinks,
    addEdge,
    loadVermeerTask,
};
