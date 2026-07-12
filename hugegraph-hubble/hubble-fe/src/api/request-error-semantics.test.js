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

const loadResponseHandlers = modulePath => {
    jest.resetModules();

    const responseHandlers = [];
    const messageError = jest.fn();
    const modalWarning = jest.fn();
    const clearLogin = jest.fn();
    const instance = {
        interceptors: {
            request: {
                use: jest.fn(),
            },
            response: {
                use: jest.fn((resolve, reject) => {
                    responseHandlers.push({resolve, reject});
                }),
            },
        },
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
    };

    jest.doMock('axios', () => ({
        create: jest.fn(() => instance),
    }));
    jest.doMock('antd', () => ({
        message: {
            error: messageError,
        },
        Modal: {
            warning: modalWarning,
        },
    }));
    jest.doMock('../i18n', () => ({
        t: key => key,
    }));
    jest.doMock('../utils/user', () => ({
        clearLogin,
    }));

    const request = require(modulePath).default;
    return {
        resolve: responseHandlers[0].resolve,
        reject: responseHandlers[0].reject,
        messageError,
        modalWarning,
        clearLogin,
        instance,
        request,
    };
};

describe.each(['./request'])('%s error semantics', modulePath => {
    beforeEach(() => {
        delete window.location;
        window.location = {
            pathname: '/gremlin/DEFAULT/hugegraph',
            search: '?x=1',
            hash: '#result',
            href: '',
        };
    });

    afterEach(() => {
        jest.dontMock('axios');
        jest.dontMock('antd');
        jest.dontMock('../i18n');
        jest.dontMock('../utils/user');
        localStorage.clear();
        sessionStorage.clear();
    });

    it('keeps non-401 HTTP errors rejected after showing the error message', async () => {
        const {reject, messageError} = loadResponseHandlers(modulePath);
        const error = {
            response: {
                status: 500,
                data: {
                    message: 'boom',
                    path: '/api/v1.3/graphs',
                },
            },
        };

        await expect(reject(error)).rejects.toBe(error);
        expect(messageError).toHaveBeenCalledWith('request.error');
    });

    it('keeps network errors rejected after showing the fallback message', async () => {
        const {reject, messageError} = loadResponseHandlers(modulePath);
        const error = new Error('Network Error');

        await expect(reject(error)).rejects.toBe(error);
        expect(messageError).toHaveBeenCalledWith('request.error');
    });

    it('rejects HTTP 401 and redirects to login', async () => {
        const {reject, clearLogin, instance} = loadResponseHandlers(modulePath);
        const error = {
            response: {
                status: 401,
                data: {
                    status: 401,
                    message: 'Unauthorized',
                },
            },
        };

        await expect(reject(error)).rejects.toBe(error);
        expect(clearLogin).toHaveBeenCalledTimes(1);
        expect(sessionStorage.getItem('redirect'))
            .toBe('/gremlin/DEFAULT/hugegraph?x=1#result');
        expect(window.location.href).toBe(
            '/login?redirect=%2Fgremlin%2FDEFAULT%2Fhugegraph%3Fx%3D1%23result'
        );
        expect(instance.get).not.toHaveBeenCalled();
        expect(instance.post).not.toHaveBeenCalled();
        expect(instance.put).not.toHaveBeenCalled();
        expect(instance.delete).not.toHaveBeenCalled();
    });

    it('rejects business 401 and redirects to login', async () => {
        const {resolve, clearLogin, instance} = loadResponseHandlers(modulePath);
        const response = {
            status: 200,
            data: {
                status: 401,
                message: 'Unauthorized',
            },
        };

        await expect(resolve(response)).rejects.toBe(response);
        expect(clearLogin).toHaveBeenCalledTimes(1);
        expect(sessionStorage.getItem('redirect'))
            .toBe('/gremlin/DEFAULT/hugegraph?x=1#result');
        expect(window.location.href).toBe(
            '/login?redirect=%2Fgremlin%2FDEFAULT%2Fhugegraph%3Fx%3D1%23result'
        );
        expect(instance.get).not.toHaveBeenCalled();
        expect(instance.post).not.toHaveBeenCalled();
        expect(instance.put).not.toHaveBeenCalled();
        expect(instance.delete).not.toHaveBeenCalled();
    });

    it('shows a modal warning for throttled login attempts', () => {
        const {resolve, modalWarning, messageError} = loadResponseHandlers(modulePath);
        const response = {
            status: 200,
            data: {
                status: 429,
                message: 'Retry in 2 seconds',
            },
        };

        expect(resolve(response)).toBe(response);
        expect(modalWarning).toHaveBeenCalledWith(expect.objectContaining({
            content: 'Retry in 2 seconds',
        }));
        expect(messageError).not.toHaveBeenCalled();
    });

    it('shows only one warning while repeated HTTP throttles are active', async () => {
        const {reject, modalWarning, messageError} = loadResponseHandlers(modulePath);
        const error = {
            response: {
                status: 429,
                data: {
                    status: 429,
                    message: 'Retry in 5 seconds',
                },
            },
        };

        await expect(reject(error)).rejects.toBe(error);
        await expect(reject(error)).rejects.toBe(error);
        expect(modalWarning).toHaveBeenCalledTimes(1);
        expect(messageError).not.toHaveBeenCalled();
    });

    it('lets an inline error owner suppress the duplicate business-error toast', () => {
        const {resolve, messageError} = loadResponseHandlers(modulePath);
        const response = {
            status: 200,
            config: {suppressBusinessErrorToast: true},
            data: {
                status: 400,
                message: 'internal implementation details',
            },
        };

        expect(resolve(response)).toBe(response);
        expect(messageError).not.toHaveBeenCalled();
    });

    it('lets an inline error owner suppress the duplicate transport-error toast', async () => {
        const {reject, messageError} = loadResponseHandlers(modulePath);
        const error = {
            config: {suppressBusinessErrorToast: true},
            response: {
                status: 500,
                data: {message: 'connection refused'},
            },
        };

        await expect(reject(error)).rejects.toBe(error);
        expect(messageError).not.toHaveBeenCalled();
    });

    it('forwards page-owned error controls through PUT and DELETE', async () => {
        const {instance, request} = loadResponseHandlers(modulePath);
        const config = {suppressBusinessErrorToast: true};
        instance.put.mockResolvedValue({data: {status: 200}});
        instance.delete.mockResolvedValue({data: {status: 200}});

        await request.put('/resource', {name: 'value'}, config);
        await request.delete('/resource', {name: 'value'}, config);

        expect(instance.put).toHaveBeenCalledWith(
            '/resource', {name: 'value'}, config
        );
        expect(instance.delete).toHaveBeenCalledWith(
            '/resource', {params: {name: 'value'}, ...config}
        );
    });
});
