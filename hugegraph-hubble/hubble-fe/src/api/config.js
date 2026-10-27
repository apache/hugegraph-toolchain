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

const getConfig = config => {
    return request.get('/config', config);
};

const getText2GqlSettings = config => request.get('/settings/text2gql',
    {...config, suppressBusinessErrorToast: true});
const updateText2GqlSettings = (params, config) => request.put('/settings/text2gql', params,
    {...config, suppressBusinessErrorToast: true});

const testText2GqlSettings = config => request.post('/settings/text2gql/test', undefined,
    {...config, timeout: 25000, suppressBusinessErrorToast: true});

export {getConfig, getText2GqlSettings, updateText2GqlSettings, testText2GqlSettings};
