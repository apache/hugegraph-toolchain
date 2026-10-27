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

const browserNavigation = {
    assignBrowserLocation: jest.fn(),
    replaceBrowserLocation: jest.fn(),
};

const loadResponseHandlers = modulePath => {
    jest.resetModules();

    const responseHandlers = [];
    const messageError = jest.fn();
    const modalWarning = jest.fn();
    const clearLogin = jest.fn();
    const isLogoutTransition = jest.fn(() => false);
    const isAuthEnabled = jest.fn(() => true);
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
        isCancel: error => Boolean(error?.__CANCEL__),
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
        isLogoutTransition,
    }));
    jest.doMock('../utils/browserNavigation', () => browserNavigation);
    jest.doMock('../utils/config', () => ({
        isAuthEnabled,
    }));

    const {default: request, handleRequestAuthStatus} = require(modulePath);
    return {
        handleRequestAuthStatus,
        resolve: responseHandlers[0].resolve,
        reject: responseHandlers[0].reject,
        messageError,
        modalWarning,
        clearLogin,
        isLogoutTransition,
        isAuthEnabled,
        instance,
        request,
    };
};

describe.each(['./request'])('%s error semantics', modulePath => {
    beforeEach(() => {
        window.history.replaceState(null, '', '/gremlin/DEFAULT/hugegraph?x=1#result');
        browserNavigation.assignBrowserLocation.mockClear();
        browserNavigation.replaceBrowserLocation.mockClear();
    });

    afterEach(() => {
        jest.dontMock('axios');
        jest.dontMock('antd');
        jest.dontMock('../i18n');
        jest.dontMock('../utils/user');
        jest.dontMock('../utils/config');
        jest.dontMock('../utils/browserNavigation');
        localStorage.clear();
        sessionStorage.clear();
    });

    it('adapts non-auth HTTP errors to legacy response data after showing the error',
        async () => {
            const {reject, messageError} = loadResponseHandlers(modulePath);
            const error = {
                config: {},
                response: {
                    status: 500,
                    data: {
                        status: 500,
                        message: 'boom',
                        path: '/api/v1.3/graphs',
                    },
                },
            };

            expect(reject(error)).toBe(error.response);
            expect(messageError).toHaveBeenCalledWith('request.error_with_path');
        });

    it('keeps network errors rejected after showing the fallback message', async () => {
        const {reject, messageError} = loadResponseHandlers(modulePath);
        const error = new Error('Network Error');

        await expect(reject(error)).rejects.toBe(error);
        expect(messageError).toHaveBeenCalledWith('request.failed');
    });

    it.each([{code: 'ERR_CANCELED'}, {__CANCEL__: true}])(
        'keeps intentional cancellation rejected without an error toast (%j)', async error => {
            const {reject, messageError, clearLogin} = loadResponseHandlers(modulePath);
            await expect(reject(error)).rejects.toBe(error);
            expect(messageError).not.toHaveBeenCalled();
            expect(clearLogin).not.toHaveBeenCalled();
        }
    );

    it('keeps fallback and detailed copy from repeating the failure prefix',
        () => {
            const en = require('../i18n/resources/en-US/components/common.json');
            const zh = require('../i18n/resources/zh-CN/components/common.json');
            const interpolate = (template, values) => Object.entries(values)
                .reduce((text, [key, value]) => text.replace(
                    `{{${key}}}`,
                    value
                ), template);

            expect(en.request.failed).toBe('Request failed');
            expect(interpolate(en.request.error, {
                message: 'Connection unavailable',
            })).toBe('Request failed: Connection unavailable');
            expect(zh.request.failed).toBe('请求失败');
            expect(interpolate(zh.request.error, {
                message: '暂时无法连接',
            })).toBe('请求失败：暂时无法连接');
        });

    it('omits the path label when the server does not provide a path', () => {
        const {reject, messageError} = loadResponseHandlers(modulePath);
        const error = {
            config: {},
            response: {
                status: 500,
                data: {
                    status: 500,
                    message: 'No service available',
                    path: '   ',
                },
            },
        };

        expect(reject(error)).toBe(error.response);
        expect(messageError).toHaveBeenCalledWith('request.error');
        expect(messageError).not.toHaveBeenCalledWith('request.error_with_path');
    });

    it('redacts secrets and absolute paths before errors reach the DOM', async () => {
        const {resolve, reject, messageError} = loadResponseHandlers(modulePath);
        const business = {
            status: 200,
            config: {},
            data: {
                status: 500,
                message: 'Cookie: first=canary-one; JSESSIONID=canary-two\n'
                         + 'Authorization: Bearer canary-token at /Users/alice/key.pem',
            },
        };

        expect(resolve(business)).toBe(business);
        expect(messageError).toHaveBeenLastCalledWith(expect.not.stringContaining(
            'canary-token'
        ));
        expect(business.data.message).not.toContain('canary-two');
        expect(business.data.message).not.toContain('/Users/alice');

        const transport = {
            config: {},
            message: 'token=transport-canary',
            response: {
                status: 500,
                data: {
                    message: 'password=transport-canary',
                    path: 'C:\\secrets\\private.key',
                },
            },
        };
        expect(reject(transport)).toBe(transport.response);
        expect(transport.message).not.toContain('transport-canary');
        expect(transport.response.data.message).not.toContain('transport-canary');
        expect(transport.response.data.path).not.toContain('C:\\secrets');
    });

    it('requests authorization revalidation after an HTTP 403', async () => {
        const {reject} = loadResponseHandlers(modulePath);
        const revalidate = jest.fn();
        window.addEventListener('hubble:auth-revalidate', revalidate);
        const error = {
            config: {url: '/operations/nodes'},
            response: {
                status: 403,
                data: {status: 403, message: 'Forbidden'},
            },
        };

        await expect(reject(error)).rejects.toBe(error);

        expect(revalidate).toHaveBeenCalledTimes(1);
        window.removeEventListener('hubble:auth-revalidate', revalidate);
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
        expect(browserNavigation.assignBrowserLocation).toHaveBeenCalledWith(
            '/login?redirect=%2Fgremlin%2FDEFAULT%2Fhugegraph%3Fx%3D1%23result'
        );
        expect(instance.get).not.toHaveBeenCalled();
        expect(instance.post).not.toHaveBeenCalled();
        expect(instance.put).not.toHaveBeenCalled();
        expect(instance.delete).not.toHaveBeenCalled();
    });

    it('keeps anonymous HTTP 401 local and shows the resource error', async () => {
        const {reject, clearLogin, isAuthEnabled, messageError}
            = loadResponseHandlers(modulePath);
        isAuthEnabled.mockReturnValue(false);
        const error = {
            config: {url: '/graphspaces/protected/graphs/graph/schema'},
            response: {
                status: 401,
                data: {
                    status: 401,
                    message: 'GraphSpace is unavailable',
                },
            },
        };

        await expect(reject(error)).rejects.toBe(error);
        expect(clearLogin).not.toHaveBeenCalled();
        expect(sessionStorage.getItem('redirect')).toBeNull();
        expect(browserNavigation.assignBrowserLocation).not.toHaveBeenCalled();
        expect(browserNavigation.replaceBrowserLocation).not.toHaveBeenCalled();
        expect(messageError).toHaveBeenCalledWith('request.error');
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
        expect(browserNavigation.assignBrowserLocation).toHaveBeenCalledWith(
            '/login?redirect=%2Fgremlin%2FDEFAULT%2Fhugegraph%3Fx%3D1%23result'
        );
        expect(instance.get).not.toHaveBeenCalled();
        expect(instance.post).not.toHaveBeenCalled();
        expect(instance.put).not.toHaveBeenCalled();
        expect(instance.delete).not.toHaveBeenCalled();
    });

    it('does not restore the previous route when logout receives business 401', async () => {
        const {resolve, clearLogin, isLogoutTransition}
            = loadResponseHandlers(modulePath);
        isLogoutTransition.mockReturnValue(true);
        const response = {
            status: 200,
            config: {url: '/auth/logout'},
            data: {
                status: 401,
                message: 'Unauthorized',
            },
        };

        await expect(resolve(response)).rejects.toBe(response);
        expect(clearLogin).toHaveBeenCalledTimes(1);
        expect(sessionStorage.getItem('redirect')).toBeNull();
        expect(browserNavigation.replaceBrowserLocation).toHaveBeenCalledWith('/login');
        expect(browserNavigation.assignBrowserLocation).not.toHaveBeenCalled();
    });

    it('does not restore the previous route when a concurrent status returns HTTP 401',
        async () => {
            const {reject, clearLogin, isLogoutTransition}
                = loadResponseHandlers(modulePath);
            isLogoutTransition.mockReturnValue(true);
            const error = {
                config: {url: '/auth/status'},
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
            expect(sessionStorage.getItem('redirect')).toBeNull();
            expect(browserNavigation.replaceBrowserLocation).toHaveBeenCalledWith('/login');
            expect(browserNavigation.assignBrowserLocation).not.toHaveBeenCalled();
        });

    it.each([401, 403])(
        'shows business %s from login without redirecting',
        async status => {
            window.history.replaceState(null, '', '/login');
            const {resolve, messageError, clearLogin}
                = loadResponseHandlers(modulePath);
            const response = {
                status: 200,
                config: {url: '/auth/login'},
                data: {
                    status,
                    message: '用户名或密码不正确',
                },
            };

            await expect(resolve(response)).rejects.toBe(response);

            expect(messageError).toHaveBeenCalledTimes(1);
            expect(messageError).toHaveBeenCalledWith('用户名或密码不正确');
            expect(clearLogin).not.toHaveBeenCalled();
            expect(sessionStorage.getItem('redirect')).toBeNull();
            expect(browserNavigation.assignBrowserLocation).not.toHaveBeenCalled();
            expect(browserNavigation.replaceBrowserLocation).not.toHaveBeenCalled();
        }
    );

    it.each([401, 403])(
        'shows HTTP %s from login without redirecting',
        async status => {
            window.history.replaceState(null, '', '/login');
            const {reject, messageError, clearLogin}
                = loadResponseHandlers(modulePath);
            const error = {
                config: {url: '/auth/login'},
                response: {
                    status,
                    data: {
                        status,
                        message: '用户名或密码不正确',
                    },
                },
            };

            await expect(reject(error)).rejects.toBe(error);

            expect(messageError).toHaveBeenCalledTimes(1);
            expect(messageError).toHaveBeenCalledWith('用户名或密码不正确');
            expect(clearLogin).not.toHaveBeenCalled();
            expect(sessionStorage.getItem('redirect')).toBeNull();
            expect(browserNavigation.assignBrowserLocation).not.toHaveBeenCalled();
            expect(browserNavigation.replaceBrowserLocation).not.toHaveBeenCalled();
        }
    );

    it.each([
        [401, 'an empty body', undefined],
        [401, 'a non-JSON body', 'Unauthorized'],
        [403, 'an empty body', undefined],
        [403, 'a non-JSON body', 'Forbidden'],
    ])('shows one localized fallback for login HTTP %s with %s',
        async (status, description, data) => {
            window.history.replaceState(null, '', '/login');
            const {reject, messageError, clearLogin}
               = loadResponseHandlers(modulePath);
            const error = {
                config: {url: '/auth/login'},
                response: {status, data},
            };

            await expect(reject(error)).rejects.toBe(error);

            expect(messageError).toHaveBeenCalledTimes(1);
            expect(messageError).toHaveBeenCalledWith('request.failed');
            expect(clearLogin).not.toHaveBeenCalled();
        });

    it('keeps the session for an upstream query authentication failure', () => {
        const {resolve, clearLogin} = loadResponseHandlers(modulePath);
        const response = {
            status: 200,
            config: {suppressBusinessErrorToast: true},
            data: {
                status: 502,
                message: 'The graph server rejected query authentication.',
            },
        };

        expect(resolve(response)).toBe(response);
        expect(clearLogin).not.toHaveBeenCalled();
        expect(browserNavigation.assignBrowserLocation).not.toHaveBeenCalled();
        expect(browserNavigation.replaceBrowserLocation).not.toHaveBeenCalled();
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

        expect(reject(error)).toBe(error.response);
        expect(reject(error)).toBe(error.response);
        expect(modalWarning).toHaveBeenCalledTimes(1);
        expect(messageError).not.toHaveBeenCalled();
    });

    it.each(['business', 'http'])('keeps silent configuration %s throttling feedback inline', mode => {
        const {resolve, reject, modalWarning, messageError} = loadResponseHandlers(modulePath);
        const config = {url: '/config', suppressBusinessErrorToast: true};
        const response = {status: mode === 'http' ? 429 : 200, config,
            data: {status: 429, message: 'Retry later'}};
        const returned = mode === 'http' ? reject({config, response}) : resolve(response);
        expect(returned).toBe(response);
        expect(modalWarning).not.toHaveBeenCalled();
        expect(messageError).not.toHaveBeenCalled();
    });

    it.each([
        ['/config', false],
        ['/auth/login', true],
        ['/graphspaces/DEFAULT/graphs/g/gremlin-query', true],
        ['/graphspaces/DEFAULT/graphs/g/text2gql/config', true],
    ])('preserves throttling warnings for %s (silent business errors=%s)', (url, silent) => {
        const {resolve, modalWarning} = loadResponseHandlers(modulePath);
        resolve({status: 200, config: {url, suppressBusinessErrorToast: silent},
            data: {status: 429, message: 'Retry later'}});
        expect(modalWarning).toHaveBeenCalledWith(expect.objectContaining({content: 'Retry later'}));
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

        expect(reject(error)).toBe(error.response);
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


describe('fetch streaming auth handling', () => {
    it.each([true, false])('only expires a 401 session on authenticated deployments (%s)', enabled => {
        const {handleRequestAuthStatus, isAuthEnabled, clearLogin} = loadResponseHandlers('./request');
        isAuthEnabled.mockReturnValue(enabled);
        handleRequestAuthStatus(401);
        expect(clearLogin).toHaveBeenCalledTimes(enabled ? 1 : 0);
    });

    it('revalidates permissions after a forbidden stream', () => {
        const {handleRequestAuthStatus} = loadResponseHandlers('./request');
        const revalidate = jest.fn();
        window.addEventListener('hubble:auth-revalidate', revalidate);
        handleRequestAuthStatus(403);
        expect(revalidate).toHaveBeenCalledTimes(1);
        window.removeEventListener('hubble:auth-revalidate', revalidate);
    });
});
