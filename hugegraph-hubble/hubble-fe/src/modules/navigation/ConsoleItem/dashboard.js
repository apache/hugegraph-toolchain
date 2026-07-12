/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const normalizeDashboardUrl = (address, protocol = 'http') => {
    const value = typeof address === 'string' ? address.trim() : '';
    if (!value) {
        throw new Error('Dashboard address is empty');
    }
    if (!['http', 'https'].includes(protocol)) {
        throw new Error('Dashboard address must use HTTP or HTTPS');
    }
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
        throw new Error('Dashboard address must contain only host and port');
    }
    const url = new URL(`${protocol}://${value}`);
    if (!url.hostname || url.username || url.password
        || url.pathname !== '/' || url.search || url.hash) {
        throw new Error('Dashboard address must contain only host and port');
    }
    return url.origin;
};

export {normalizeDashboardUrl};
