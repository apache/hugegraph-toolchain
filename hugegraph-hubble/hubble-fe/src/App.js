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

import Route from './routes';
import './App.scss';
import './App.css';
import './styles/workbench.scss';
import Layout from './layout.ant';
import {AuthContextProvider} from './auth/AuthContext';
import * as api from './api';
import {isAuthEnabled, setConfig} from './utils/config';
import {ConfigConnectionContext} from './utils/ConfigConnectionContext';
import {clearLogin} from './utils/user';
import Login from './pages/Login';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

const CONFIG_RETRY_DELAY_MS = 2000;
const CONFIG_REVALIDATE_DELAY_MS = 30_000;
const routeConfigSignature = config => JSON.stringify([
    isAuthEnabled(config),
    config.pd_enabled === true,
    config.graph_create_enabled === true,
    config.cypher_enabled === true,
]);

function App() {
    const [configReady, setConfigReady] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('loading');
    const [retrying, setRetrying] = useState(false);
    const [configRevision, setConfigRevision] = useState(0);
    const retryRef = useRef(() => {});
    const retry = useCallback(() => retryRef.current(), []);
    const connection = useMemo(() => ({status: connectionStatus, retrying, retry}),
        [connectionStatus, retrying, retry]);

    useEffect(() => {
        let active = true;
        let mountedConfigSignature;
        let mountedAuthEnabled;
        let retryTimer;
        let inFlight = false;
        const loadConfig = (manual = false) => {
            if (!active) return;
            if (manual) setRetrying(true);
            if (inFlight) return;
            window.clearTimeout(retryTimer);
            inFlight = true;
            let nextDelay = CONFIG_RETRY_DELAY_MS;
            return api.config.getConfig({suppressBusinessErrorToast: true}).then(response => {
                if (response?.status !== 200 || !response.data) {
                    throw new Error('invalid_hubble_config');
                }
                if (active) {
                    const nextSignature = routeConfigSignature(response.data);
                    const nextAuthEnabled = isAuthEnabled(response.data);
                    const verified
                            = response.data.server_capabilities_verified !== false;
                    if (verified && mountedAuthEnabled !== false
                        && !nextAuthEnabled) {
                        clearLogin();
                    }
                    if (verified) {
                        mountedAuthEnabled = nextAuthEnabled;
                    }
                    setConfig(response.data);
                    if (nextSignature !== mountedConfigSignature) {
                        mountedConfigSignature = nextSignature;
                        setConfigRevision(value => value + 1);
                    }
                    setConfigReady(true);
                    const unverified = response.data
                        .server_capabilities_verified === false;
                    setConnectionStatus(unverified ? 'unverified' : 'verified');
                    nextDelay = unverified
                        ? CONFIG_RETRY_DELAY_MS : CONFIG_REVALIDATE_DELAY_MS;
                }
            }).catch(() => {
                if (active) {
                    setConnectionStatus('unavailable');
                }
            }).finally(() => {
                inFlight = false;
                if (!active) return;
                setRetrying(false);
                retryTimer = window.setTimeout(() => loadConfig(), nextDelay);
            });
        };
        retryRef.current = () => loadConfig(true);
        loadConfig();
        return () => {
            active = false;
            window.clearTimeout(retryTimer);
        };
    }, []);

    if (!configReady && connectionStatus === 'loading') {
        return null;
    }
    return (
        <ConfigConnectionContext.Provider value={connection}>
            {configReady
                ? <AuthContextProvider key={configRevision}>
                    <Route element={<Layout />} />
                </AuthContextProvider>
                : <Login />}
        </ConfigConnectionContext.Provider>
    );
};

export default App;
