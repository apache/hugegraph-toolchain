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
import {getConfig, getText2GqlSettings, updateText2GqlSettings, testText2GqlSettings} from './config';
import {getText2GqlConfig} from './analysis';

jest.mock('./request', () => ({get: jest.fn(), put: jest.fn(), post: jest.fn()}));

test('allows configuration revalidation to own its inline failure feedback', () => {
    getConfig({suppressBusinessErrorToast: true});
    expect(request.get).toHaveBeenCalledWith('/config', {suppressBusinessErrorToast: true});
});

test('uses separate safe metadata and administrator settings endpoints with abort signals', () => {
    const controller = new AbortController();
    const config = {signal: controller.signal};
    getText2GqlConfig('DEFAULT', 'graph', config);
    getText2GqlSettings(config);
    const params = {enabled: true, connection_type: 'openai', base_url: 'https://test/v1',
        model: 'test', api_key: 'replacement'};
    updateText2GqlSettings(params, config);
    expect(request.get).toHaveBeenNthCalledWith(1, '/graphspaces/DEFAULT/graphs/graph/text2gql/config',
        {...config, suppressBusinessErrorToast: true});
    expect(request.get).toHaveBeenNthCalledWith(2, '/settings/text2gql',
        {...config, suppressBusinessErrorToast: true});
    expect(request.put).toHaveBeenCalledWith('/settings/text2gql', params,
        {...config, suppressBusinessErrorToast: true});
});


test('tests only the saved configuration without forwarding settings or keys', () => {
    const controller = new AbortController();
    testText2GqlSettings({signal: controller.signal});
    expect(request.post).toHaveBeenCalledWith('/settings/text2gql/test', undefined, {
        signal: controller.signal, timeout: 25000, suppressBusinessErrorToast: true,
    });
});
