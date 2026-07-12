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

const loadRequestInterceptor = modulePath => {
    jest.resetModules();

    const requestHandlers = [];
    const instance = {
        interceptors: {
            request: {
                use: jest.fn(handler => requestHandlers.push(handler)),
            },
            response: {
                use: jest.fn(),
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
            error: jest.fn(),
        },
    }));
    jest.doMock('../i18n', () => ({
        t: key => key,
    }));

    require(modulePath);
    return requestHandlers[0];
};

describe('request language header', () => {
    afterEach(() => {
        jest.dontMock('axios');
        jest.dontMock('antd');
        jest.dontMock('../i18n');
        localStorage.clear();
    });

    it('defaults fresh sessions to English', () => {
        const intercept = loadRequestInterceptor('./request');
        const config = intercept({headers: {}, data: {}});

        expect(config.headers['Accept-Language']).toBe('en-US');
    });

    it('adds the selected language to JSON requests', () => {
        localStorage.setItem('languageType', 'en-US');
        const intercept = loadRequestInterceptor('./request');

        const config = intercept({
            headers: {},
            data: {gremlin: 'bad('},
        });

        expect(config.headers['Accept-Language']).toBe('en-US');
    });

    it('preserves existing headers while adding the selected language to form requests', () => {
        localStorage.setItem('languageType', 'zh-CN');
        const intercept = loadRequestInterceptor('./request');

        const config = intercept({
            headers: {
                'X-Test': 'keep',
            },
            data: {name: 'hugegraph'},
        });

        expect(config.headers['Accept-Language']).toBe('zh-CN');
        expect(config.headers['X-Test']).toBe('keep');
    });
});
