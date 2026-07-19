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

// 图空间
const getGraphSpaceList = (params, config = {}) => {
    return request.get('/graphspaces', {...config, params});
};

const getGraphSpace = (graphspace, config) => {
    return request.get(`/graphspaces/${graphspace}`, config);
};

const addGraphSpace = (data, config) => {
    return request.post('/graphspaces', data, config);
};

const updateGraphSpace = (graphspace, data, config) => {
    return request.put(`/graphspaces/${graphspace}`, data, config);
};

const delGraphSpace = (graphspace, config) => {
    return request.delete(`/graphspaces/${graphspace}`, undefined, config);
};

const initBuiltin = (params, config) => {
    return request.post('/graphspaces/builtin', params, config);
};

export {getGraphSpace, getGraphSpaceList, addGraphSpace, updateGraphSpace,
    delGraphSpace, initBuiltin};

// schema
const getSchemaList = (graphspace, params, config = {}) => {
    return request.get(`/graphspaces/${graphspace}/schematemplates`, {...config, params});
};

const addSchema = (graphspace, data, config) => {
    return request.post(`/graphspaces/${graphspace}/schematemplates`, data, config);
};

const getSchema = (graphspace, name, config) => {
    return request.get(`graphspaces/${graphspace}/schematemplates/${name}`, config);
};

const getGraphSchema = (graphspace, graph) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/schema/groovy`);
};

const addGraphSchema = (graphspace, graph, data, config) => {
    return request.post(
        `/graphspaces/${graphspace}/graphs/${graph}/schema/groovy`,
        data,
        config
    );
};

const exportSchema = (graphspace, graph) => {
    return request.get(`graphspaces/${graphspace}/graphs/${graph}/schema/groovy/export`);
};

const updateSchema = (graphspace, name, data, config) => {
    return request.put(`graphspaces/${graphspace}/schematemplates/${name}`, data, config);
};

const delSchema = (graphspace, name, config) => {
    return request.delete(`graphspaces/${graphspace}/schematemplates/${name}`, undefined, config);
};

export {getSchemaList, addSchema, updateSchema, getSchema, getGraphSchema,
    addGraphSchema, exportSchema, delSchema};

// 图
const getGraphList = (graphspace, params, config = {}) => {
    return request.get(`/graphspaces/${graphspace}/graphs`, {...config, params});
};

const addGraph = (graphspace, data) => {
    const {graph, nickname, schema} = data;
    return request.post(`/graphspaces/${graphspace}/graphs/${graph}`, {
        nickname,
        schema,
    });
};

const updateGraph = (graphspace, graph, params, config) => {
    return request.put(`/graphspaces/${graphspace}/graphs/${graph}`, params, config);
};

const getGraph = (graphspace, graph, config) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/get`, config);
};

const delGraph = (graphspace, graph) => {
    return request.delete(`/graphspaces/${graphspace}/graphs/${graph}`);
};

const getGraphView = (graphspace, graph) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/schema/graphview`);
};

const setDefaultGraph = (graphspace, graph, config) => {
    const path = `graphspaces/${graphspace}/graphs/${graph}/default`;
    return config ? request.post(path, undefined, config) : request.post(path);
};

const getDefaultGraph = (graphspace, config) => {
    const path = `graphspaces/${graphspace}/graphs/default`;
    return config ? request.get(path, config) : request.get(path);
};

const clearGraph = (graphspace, graph) => {
    return request.post(`/graphspaces/${graphspace}/graphs/${graph}/clear`);
};

const loadSampleGraph = (graphspace, graph, dataset, config = {}) => {
    return request.post(`/graphspaces/${graphspace}/graphs/${graph}/sample`, undefined, {
        ...config,
        params: {dataset},
    });
};

const getGraphStatistic = (graphspace, graph, config) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/statistics`, config);
};

const updateGraphStatistic = (graphspace, graph) => {
    return request.post(`/graphspaces/${graphspace}/graphs/${graph}/statistics`);
};

const cloneGraph = (graphspace, graph, params) => {
    return request.post(`/graphspaces/${graphspace}/graphs/${graph}/clone`, params);
};

export {getGraphList, getGraph, addGraph, updateGraph, delGraph, getDefaultGraph,
    getGraphView, setDefaultGraph, clearGraph, loadSampleGraph,
    getGraphStatistic, updateGraphStatistic, cloneGraph};

// meta property
const getMetaPropertyList = (graphspace, graph, params) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/schema/propertykeys`, {params});
};

const addMetaProperty = (graphspace, graph, data, config) => {
    return request.post(
        `/graphspaces/${graphspace}/graphs/${graph}/schema/propertykeys`, data, config);
};

const checkMetaProperty = (graphspace, graph, data, config) => {
    return request.post(
        `/graphspaces/${graphspace}/graphs/${graph}/schema/propertykeys/check_using`, data, config);
};

const updateMetaProperty = () => {};

const delMetaProperty = (graphspace, graph, data, config) => {
    const {names} = data;
    const str = names.map(name => 'names=' + encodeURIComponent(name)).join('&');
    const skip_using = String(names.length !== 1);

    // return request.delete(`/graphspaces/${graphspace}/graphs/${graph}/schema/propertykeys`, data);
    return request.delete(
        `/graphspaces/${graphspace}/graphs/${graph}/schema/propertykeys?${str}&skip_using=${skip_using}`,
        undefined, config);
};

export {getMetaPropertyList, addMetaProperty, updateMetaProperty, delMetaProperty, checkMetaProperty};

// meta vertex
const getMetaVertexList = (graphspace, graph, params) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/schema/vertexlabels`, {params});
};

const getMetaVertex = (graphspace, graph, name) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/schema/vertexlabels/${name}`);
};

const getMetaVertexLink = (graphspace, graph, name) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/schema/vertexlabels/${name}/link`);
};

const getMetaVertexNew = (graphspace, graph, name) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/schema/vertexlabels/${name}/new`);
};

const addMetaVertex = (graphspace, graph, data) => {
    return request.post(`/graphspaces/${graphspace}/graphs/${graph}/schema/vertexlabels`, data);
};

const addMetaVertexNew = (graphspace, graph, data) => {
    return request.post(`/graphspaces/${graphspace}/graphs/${graph}/schema/vertexlabels/create_new`, data);
};

const checkMetaVertex = (graphspace, graph, data, config) => {
    return request.post(
        `/graphspaces/${graphspace}/graphs/${graph}/schema/vertexlabels/check_using`, data, config);
};

const updateMetaVertex = (graphspace, graph, name, data) => {
    return request.put(`/graphspaces/${graphspace}/graphs/${graph}/schema/vertexlabels/${name}`, data);
};

const delMetaVertex = (graphspace, graph, data, config) => {
    // return request.delete(`/graphspaces/${graphspace}/graphs/${graph}/schema/vertexlabels`, data);

    const {names} = data;
    const str = names.map(name => 'names=' + encodeURIComponent(name)).join('&');
    const skip_using = String(names.length !== 1);

    return request.delete(
        `/graphspaces/${graphspace}/graphs/${graph}/schema/vertexlabels?${str}&skip_using=${skip_using}`,
        undefined, config);
};

export {getMetaVertexList, addMetaVertex, updateMetaVertex, delMetaVertex, checkMetaVertex, getMetaVertex,
    getMetaVertexNew, addMetaVertexNew, getMetaVertexLink};

// meta edge
const getMetaEdgeList = (graphspace, graph, params) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/schema/edgelabels`, {params});
};

const getMetaEdge = (graphspace, graph, name) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/schema/edgelabels/${name}`);
};

const addMetaEdge = (graphspace, graph, data) => {
    return request.post(`/graphspaces/${graphspace}/graphs/${graph}/schema/edgelabels`, data);
};

const updateMetaEdge = (graphspace, graph, name, data) => {
    return request.put(`/graphspaces/${graphspace}/graphs/${graph}/schema/edgelabels/${name}`, data);
};

const delMetaEdge = (graphspace, graph, data, config) => {
    // return request.delete(`/graphspaces/${graphspace}/graphs/${graph}/schema/edgelabels`, data);

    const {names} = data;
    const str = names.map(name => 'names=' + encodeURIComponent(name)).join('&');
    const skip_using = String(names.length !== 1);

    return request.delete(
        `/graphspaces/${graphspace}/graphs/${graph}/schema/edgelabels?${str}&skip_using=${skip_using}`,
        undefined, config);
};

export {getMetaEdgeList, getMetaEdge, addMetaEdge, updateMetaEdge, delMetaEdge};

// meta vertex index
const getMetaVertexIndexList = (graphspace, graph, params) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/schema/propertyindexes?is_vertex_label=true`,
        {params});
};

// meta edge index
const getMetaEdgeIndexList = (graphspace, graph, params) => {
    return request.get(`/graphspaces/${graphspace}/graphs/${graph}/schema/propertyindexes?is_vertex_label=false`,
        {params});
};

export {getMetaVertexIndexList, getMetaEdgeIndexList};

// datasource
const testhost = '/ingest';
const getDatasourceList = params => {
    // return request.get('/datasources/list', data);
    return request.get(`${testhost}/datasources/list`, {params});
};

const getDatasource = id => {
    // return request.get(`/datasources/${id}`);
    return request.get(`${testhost}/datasources/${id}`);
};

const addDatasource = data => {
    // return request.post('/datasources', data);
    return request.post(`${testhost}/datasources`, data);
};

// const updateDatasource = () => {};

const delDatasource = id => {
    // return request.delete(`/datasources/${id}`);
    return request.delete(`${testhost}/datasources/${id}`);
};

const delBatchDatasource = data => {
    return request.post(`${testhost}/datasources/delete`, data);
};

const getDatasourceSchema = datasourceID => {
    return request.get(`${testhost}/schemas`, {params: {datasource: datasourceID}});
};

const checkJDBC = data => {
    return request.post(`${testhost}/jdbc/check`, data);
};


const datasourceUploadUrl = '/api/v1.3/ingest/files/upload';

export {getDatasource, getDatasourceList, addDatasource, delDatasource,
    getDatasourceSchema, delBatchDatasource, checkJDBC, datasourceUploadUrl};

// task
const addTask = data => {
    return request.post(`${testhost}/tasks`, data, {
        headers: {
            'Content-Type': 'application/json;charset=UTF-8',
        },
    });
};

const getTaskList = params => {
    return request.get(`${testhost}/tasks/list`, {params});
};

const getTaskDetail = id => {
    return request.get(`${testhost}/tasks/${id}`);
};

const deleteTask = id => {
    return request.delete(`${testhost}/tasks/${id}`);
};

const disableTask = id => {
    return request.put(`${testhost}/tasks/${id}/disable`);
};

const enableTask = id => {
    return request.put(`${testhost}/tasks/${id}/enable`);
};

const updateTask = (id, data) => {
    return request.put(`${testhost}/tasks/${id}`, data);
};

const getMetricsTask = () => {
    return request.get(`${testhost}/metrics/task`);
};

export {addTask, getTaskList, getTaskDetail, deleteTask, disableTask, enableTask, updateTask, getMetricsTask};

// job
const getJobsList = (params, config = {}) => {
    return request.get(`${testhost}/jobs/list`, {...config, params});
};

const getJobsDetail = id => {
    return request.get(`${testhost}/jobs/${id}`);
};

const deleteJobs = id => {
    return request.delete(`${testhost}/jobs/${id}`);
};

export {getJobsList, getJobsDetail, deleteJobs};
