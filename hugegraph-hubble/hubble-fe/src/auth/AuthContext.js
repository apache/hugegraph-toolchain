/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {useLocation} from 'react-router-dom';
import * as api from '../api/index';
import {AUTH_REVALIDATE_EVENT} from '../utils/authEvents';
import {getUser, USER_CHANGE_EVENT} from '../utils/user';

const REFRESH_INTERVAL_MS = 60_000;
const MIN_REFRESH_INTERVAL_MS = 5_000;
const emptyState = {loading: false, context: null, error: null};
const AuthContext = createContext({
    ...emptyState,
    identityEpoch: 0,
    hasCapability: () => false,
    refresh: () => Promise.resolve(),
});

const isSignedIn = () => Boolean(getUser()?.id);

const unwrapContext = response => {
    if (response?.status !== 200 || !response.data
        || !Array.isArray(response.data.capabilities)) {
        const error = new Error(`auth_context_${response?.status ?? 'invalid'}`);
        error.status = response?.status;
        throw error;
    }
    return response.data;
};

const AuthContextProvider = ({children}) => {
    const location = useLocation();
    const epochRef = useRef(0);
    const latestRequestRef = useRef(0);
    const inFlightRef = useRef(null);
    const lastSuccessRef = useRef(0);
    const [identityEpoch, setIdentityEpoch] = useState(0);
    const [state, setState] = useState(() => (
        isSignedIn() ? {...emptyState, loading: true} : emptyState
    ));

    const load = useCallback(({force = false} = {}) => {
        if (!isSignedIn()) {
            setState(emptyState);
            return Promise.resolve(null);
        }
        const epoch = epochRef.current;
        const now = Date.now();
        if (!force && lastSuccessRef.current > 0
            && now - lastSuccessRef.current < MIN_REFRESH_INTERVAL_MS) {
            return Promise.resolve(null);
        }
        if (!force && inFlightRef.current?.epoch === epoch) {
            return inFlightRef.current.promise;
        }

        const requestId = ++latestRequestRef.current;
        if (force) {
            setState({loading: true, context: null, error: null});
        }
        const promise = api.auth.context()
            .then(unwrapContext)
            .then(context => {
                if (epoch === epochRef.current
                    && requestId === latestRequestRef.current
                    && isSignedIn()) {
                    lastSuccessRef.current = Date.now();
                    setState({loading: false, context, error: null});
                }
                return context;
            })
            .catch(error => {
                if (epoch === epochRef.current
                    && requestId === latestRequestRef.current) {
                    setState({loading: false, context: null, error});
                }
                throw error;
            })
            .finally(() => {
                if (inFlightRef.current?.requestId === requestId) {
                    inFlightRef.current = null;
                }
            });
        inFlightRef.current = {epoch, requestId, promise};
        return promise;
    }, []);

    useEffect(() => {
        const identityChanged = () => {
            epochRef.current += 1;
            latestRequestRef.current += 1;
            inFlightRef.current = null;
            lastSuccessRef.current = 0;
            setIdentityEpoch(epochRef.current);
            if (isSignedIn()) {
                load({force: true}).catch(() => undefined);
            }
            else {
                setState(emptyState);
            }
        };
        window.addEventListener(USER_CHANGE_EVENT, identityChanged);
        return () => window.removeEventListener(
            USER_CHANGE_EVENT,
            identityChanged
        );
    }, [load]);

    useEffect(() => {
        load().catch(() => undefined);
    }, [load, location.pathname, location.search]);

    useEffect(() => {
        const revalidate = () => load({force: true}).catch(() => undefined);
        const onFocus = () => load().catch(() => undefined);
        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                onFocus();
            }
        };
        window.addEventListener(AUTH_REVALIDATE_EVENT, revalidate);
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibility);
        const timer = window.setInterval(onFocus, REFRESH_INTERVAL_MS);
        return () => {
            window.removeEventListener(AUTH_REVALIDATE_EVENT, revalidate);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibility);
            window.clearInterval(timer);
        };
    }, [load]);

    const value = useMemo(() => {
        const capabilities = state.context?.capabilities ?? [];
        return {
            ...state,
            identityEpoch,
            hasCapability: capability => capabilities.includes(capability),
            refresh: () => load({force: true}),
        };
    }, [identityEpoch, load, state]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const useAuthContext = () => useContext(AuthContext);

export {AuthContextProvider, useAuthContext};
