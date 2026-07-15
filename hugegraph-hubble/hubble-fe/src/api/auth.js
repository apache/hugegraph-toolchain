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

// login
const login = data => {
    return request.post('/auth/login', data);
};

const logout = () => {
    return request.get('/auth/logout');
};

const status = () => {
    return request.get('/auth/status', {suppressBusinessErrorToast: true});
};

const context = () => {
    return request.get('/auth/context', {
        suppressBusinessErrorToast: true,
        headers: {
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
        },
    });
};

const getUserList = (params, config = {}) => {
    return request.get('/auth/users/list', {...config, params});
};

const getAllUserList = (params, config = {}) => {
    return request.get('/auth/users', {...config, params});
};

const getUserInfo = (username, config) => {
    return request.get(`/auth/users/${username}`, config);
};

const updateUser = (id, data, config) => {
    return request.put(`/auth/users/${id}`, data, config);
};

const delUser = (id, config) => {
    return request.delete(`/auth/users/${id}`, undefined, config);
};

const updateAdminspace = (username, data, config) => {
    return request.post(`/auth/users/updateadminspace/${username}`, data, config);
};

const addUser = (data, config) => {
    return request.post('/auth/users', data, config);
};

const updatePwd = (username, oldpwd, newpwd) => {
    return request.post('/auth/users/updatepwd', {username, oldpwd, newpwd});
};

const importUserUrl = '/api/v1.3/auth/users/batch';

export {login, logout, status, context, getUserList, getAllUserList, getUserInfo, delUser,
    updateUser, addUser, updatePwd, importUserUrl, updateAdminspace};

const getPersonal = config => {
    return request.get('/auth/users/getpersonal', config);
};

const updatePersonal = data => {
    return request.put('/auth/users/personal', data);
};

export {getPersonal, updatePersonal};

const scopedAuthPath = (graphspace, resource, id) => {
    const base = `/graphspaces/${encodeURIComponent(graphspace)}/auth/${resource}`;
    return id === undefined ? base : `${base}/${encodeURIComponent(id)}`;
};

const getSpaceMembers = (graphspace, params, config = {}) => {
    return request.get(scopedAuthPath(graphspace, 'users'), {...config, params});
};

const addSpaceMember = (graphspace, data, config) => {
    return request.post(scopedAuthPath(graphspace, 'users'), data, config);
};

const updateSpaceMember = (graphspace, id, data, config) => {
    return request.put(scopedAuthPath(graphspace, 'users', id), data, config);
};

const deleteSpaceMember = (graphspace, id, config) => {
    return request.delete(scopedAuthPath(graphspace, 'users', id),
        undefined, config);
};

const getSpaceRoles = (graphspace, params, config = {}) => {
    return request.get(scopedAuthPath(graphspace, 'roles'), {...config, params});
};

const addSpaceRole = (graphspace, data, config) => {
    return request.post(scopedAuthPath(graphspace, 'roles'), data, config);
};

const updateSpaceRole = (graphspace, id, data, config) => {
    return request.put(scopedAuthPath(graphspace, 'roles', id), data, config);
};

const deleteSpaceRole = (graphspace, id, config) => {
    return request.delete(scopedAuthPath(graphspace, 'roles', id),
        undefined, config);
};

const getSpaceTargets = (graphspace, params, config = {}) => {
    return request.get(scopedAuthPath(graphspace, 'targets'), {...config, params});
};

const addSpaceTarget = (graphspace, data, config) => {
    return request.post(scopedAuthPath(graphspace, 'targets'), data, config);
};

const updateSpaceTarget = (graphspace, id, data, config) => {
    return request.put(scopedAuthPath(graphspace, 'targets', id), data, config);
};

const deleteSpaceTarget = (graphspace, id, config) => {
    return request.delete(scopedAuthPath(graphspace, 'targets', id),
        undefined, config);
};

const getSpaceAccesses = (graphspace, params, config = {}) => {
    return request.get(scopedAuthPath(graphspace, 'accesses'), {...config, params});
};

const saveSpaceAccess = (graphspace, data, config) => {
    return request.put(scopedAuthPath(graphspace, 'accesses'), data, config);
};

const deleteSpaceAccess = (graphspace, roleId, targetId, config) => {
    return request.delete(scopedAuthPath(graphspace, 'accesses'), {
        role_id: roleId,
        target_id: targetId,
    }, config);
};

export {
    getSpaceMembers,
    addSpaceMember,
    updateSpaceMember,
    deleteSpaceMember,
    getSpaceRoles,
    addSpaceRole,
    updateSpaceRole,
    deleteSpaceRole,
    getSpaceTargets,
    addSpaceTarget,
    updateSpaceTarget,
    deleteSpaceTarget,
    getSpaceAccesses,
    saveSpaceAccess,
    deleteSpaceAccess,
};

const getDashboard = () => {
    return request.get('/dashboard');
};

const getVermeer = config => {
    return config ? request.get('/vermeer', config) : request.get('/vermeer');
};

export {getDashboard, getVermeer};
