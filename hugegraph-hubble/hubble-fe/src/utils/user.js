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

const key = 'user_'; // 防止缓存问题
const USER_CHANGE_EVENT = 'hubble:user-change';

const notifyUserChange = () => {
    window.dispatchEvent(new CustomEvent(USER_CHANGE_EVENT));
};

const setUser = user => {
    sessionStorage.setItem(key, JSON.stringify(user));
    notifyUserChange();
};

const getUser = () => {
    let userStr = sessionStorage.getItem(key);
    if (userStr) {
        return JSON.parse(userStr);
    }

    return {};
};

const scopedStorageKey = prefix => {
    const user = getUser();
    const identity = user?.user_name || user?.id;
    if (typeof identity !== 'string' || !identity) {
        return prefix;
    }
    return `${prefix}.${encodeURIComponent(identity)}`;
};

const clearUser = () => {
    sessionStorage.removeItem(key);
    notifyUserChange();
};

const clearLogin = () => {
    localStorage.removeItem('user');
    clearUser();
};

const getDefaultGraphspace = () => {
    const user = getUser();

    if (!user) {
        return '';
    }

    if (user.is_superadmin) {
        return 'DEFAULT';
    }

    if (user.resSpaces && user.resSpaces.length > 0) {
        return user.resSpaces[0];
    }

    return '';
};

export {
    setUser,
    getUser,
    scopedStorageKey,
    clearUser,
    clearLogin,
    getDefaultGraphspace,
    USER_CHANGE_EVENT,
};
