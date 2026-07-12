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

const setUser = user => {
    sessionStorage.setItem(key, JSON.stringify(user));
};

const getUser = () => {
    let userStr = sessionStorage.getItem(key);
    if (userStr) {
        return JSON.parse(userStr);
    }

    return {};
};

const clearUser = () => {
    sessionStorage.removeItem(key);
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

const isAdmin = () => {
    const user = getUser();

    return Boolean(user.is_superadmin);
};

const canAccessAccount = (pdEnabled, user = {}) => {
    return Boolean(pdEnabled && (
        user.is_superadmin
        || (Array.isArray(user.adminSpaces) && user.adminSpaces.length > 0)
    ));
};

export {
    canAccessAccount,
    setUser,
    getUser,
    clearUser,
    clearLogin,
    getDefaultGraphspace,
    isAdmin,
};
