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

export {login, logout, status, getUserList, getAllUserList, getUserInfo, delUser,
    updateUser, addUser, updatePwd, importUserUrl, updateAdminspace};

const getPersonal = config => {
    return request.get('/auth/users/getpersonal', config);
};

const updatePersonal = data => {
    return request.put('/auth/users/personal', data);
};

export {getPersonal, updatePersonal};

const getDashboard = () => {
    return request.get('/dashboard');
};

const getVermeer = () => {
    return request.get('/vermeer');
};

export {getDashboard, getVermeer};
