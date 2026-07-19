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

import axios from 'axios';
import {message} from 'antd';
import JSONbig from 'json-bigint';
import _ from 'lodash';
import i18n from '../i18n';
import * as user from '../utils/user';
import {withLanguageHeader} from './languageHeader';
import {showThrottleWarning} from './throttleWarning';
import {AUTH_REVALIDATE_EVENT} from '../utils/authEvents';
import {sanitizePublicError} from '../utils/publicError';

const isJsonResponse = headers => {
    const contentType = headers?.['content-type'] || headers?.['Content-Type'] || '';
    return contentType.includes('application/json');
};

const parseResponse = (data, headers) => {
    if (!data || !isJsonResponse(headers)) {
        return data;
    }
    return JSONbig.parse(data);
};

const redirectToLogin = () => {
    user.clearLogin();
    if (window.location.pathname !== '/login') {
        const redirect = `${window.location.pathname}${window.location.search}`
                         + window.location.hash;
        sessionStorage.setItem('redirect', redirect);
        window.location.href = `/login?redirect=${encodeURIComponent(redirect)}`;
    }
};

const showRequestError = res => {
    message.error(i18n.t('request.error', {
        message: res?.message ?? '',
        path: res?.path ?? '',
    }));
};

const sanitizeResponseError = response => {
    const data = response?.data;
    if (!data || typeof data !== 'object') {
        return;
    }
    if (typeof data.message === 'string') {
        data.message = sanitizePublicError(data.message);
    }
    if (typeof data.path === 'string') {
        data.path = sanitizePublicError(data.path);
    }
};

const isUnauthorizedError = error => {
    return error.response?.status === 401
           || error.response?.data?.status === 401
           || error.message?.includes('status code 401');
};

const isLoginRequest = config => config?.url?.endsWith('/auth/login');

const showLoginAuthError = response => {
    const errorMessage = response?.data?.message;
    message.error(!_.isEmpty(errorMessage) ? errorMessage : i18n.t('request.failed'));
};

const notifyForbidden = config => {
    if (!config?.url?.includes('/auth/context')) {
        window.dispatchEvent(new CustomEvent(AUTH_REVALIDATE_EVENT));
    }
};

const instance = axios.create({
    baseURL: '/api/v1.3',
    withCredentials: true,
    // Backend times out after 30s; keep this slightly higher to receive its error body.
    timeout: 31000,
    transformResponse: [parseResponse],
});

instance.interceptors.request.use(
    config => {
        config.headers = withLanguageHeader(config.headers);
        if (!config.headers['Content-Type']) {
            if (config.data !== undefined) {
                config.data = JSON.stringify(config.data);
            }
            config.headers = {
                ...config.headers,
                'Content-Type': 'application/json;charset=UTF-8',
            };
        }
        return config;
    },
    error => {
        return Promise.reject(error);
    }
);

instance.interceptors.response.use(
    response => {
        sanitizeResponseError(response);
        if (response.status === 401 || response.data?.status === 401) {
            if (isLoginRequest(response.config)) {
                showLoginAuthError(response);
            }
            else {
                redirectToLogin();
            }
            return Promise.reject(response);
        }
        else if (response.data?.status === 429) {
            showThrottleWarning(response.data.message);
        }
        else if (response.status === 403 || response.data?.status === 403) {
            if (isLoginRequest(response.config)) {
                showLoginAuthError(response);
                return Promise.reject(response);
            }
            notifyForbidden(response.config);
        }
        else if (response.data?.status !== 200
                 && !response.config?.suppressBusinessErrorToast) {
            if (!_.isEmpty(response.data.message)) {
                message.error(response.data.message);
            }
        }
        return response;
    },
    error => {
        sanitizeResponseError(error.response);
        if (typeof error.message === 'string') {
            error.message = sanitizePublicError(error.message);
        }
        if (isUnauthorizedError(error)) {
            if (isLoginRequest(error.config)) {
                showLoginAuthError(error.response);
            }
            else {
                redirectToLogin();
            }
            return Promise.reject(error);
        }
        if (error.response?.status === 429
            || error.response?.data?.status === 429) {
            showThrottleWarning(error.response?.data?.message);
            return error.response;
        }
        if (error.response?.status === 403
            || error.response?.data?.status === 403) {
            if (isLoginRequest(error.config)) {
                showLoginAuthError(error.response);
                return Promise.reject(error);
            }
            notifyForbidden(error.config);
            return Promise.reject(error);
        }
        if (!error.config?.suppressBusinessErrorToast) {
            const res = error.response?.data;
            showRequestError(res);
        }
        if (error.response) {
            // Keep legacy form callers settled while the server returns real HTTP errors.
            return error.response;
        }
        return Promise.reject(error);
    }
);

const request = {};

const responseData = response => {
    const data = response?.data;
    if (data?.status === 401) {
        redirectToLogin();
    }
    return data;
};

request.get = async (url, params) => {
    const resposne = await instance.get(`${url}`, params);
    return responseData(resposne);
};

request.post = async (url, params, config) => {
    const resposne = await instance.post(
        `${url}`,
        params,
        config
    );

    return responseData(resposne);
};

request.put = async (url, params, config) => {
    const resposne = await instance.put(
        `${url}`,
        params,
        config
    );

    return responseData(resposne);
};

request.delete = async (url, params, config) => {
    const resposne = await instance.delete(
        `${url}`,
        {...config, params}
    );

    return responseData(resposne);
};

export default request;
