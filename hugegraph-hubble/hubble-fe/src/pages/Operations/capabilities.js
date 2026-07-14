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

import {useEffect, useState} from 'react';
import {getCapabilities} from '../../api/operations';
import {getUser, USER_CHANGE_EVENT} from '../../utils/user';

let capabilityRequest;

const getUserIdentity = () => {
    const currentUser = getUser();
    return String(currentUser.id ?? currentUser.user_name ?? 'anonymous');
};

const loadOperationsCapabilities = (identity = getUserIdentity()) => {
    if (!capabilityRequest || capabilityRequest.identity !== identity) {
        const request = getCapabilities().then(result => (
            Array.isArray(result?.capabilities) ? result.capabilities : []
        )).catch(error => {
            if (capabilityRequest?.request === request) {
                capabilityRequest = undefined;
            }
            throw error;
        });
        capabilityRequest = {identity, request};
    }
    return capabilityRequest.request;
};

const resetOperationsCapabilities = () => {
    capabilityRequest = undefined;
};

const useOperationsCapabilities = () => {
    const [identity, setIdentity] = useState(getUserIdentity);
    const [state, setState] = useState({loading: true, capabilities: [], error: null});

    useEffect(() => {
        const updateIdentity = () => setIdentity(getUserIdentity());
        window.addEventListener(USER_CHANGE_EVENT, updateIdentity);
        return () => window.removeEventListener(USER_CHANGE_EVENT, updateIdentity);
    }, []);

    useEffect(() => {
        let active = true;
        setState({loading: true, capabilities: [], error: null});
        loadOperationsCapabilities(identity).then(capabilities => {
            if (active) {
                setState({loading: false, capabilities, error: null});
            }
        }).catch(error => {
            if (active) {
                setState({loading: false, capabilities: [], error});
            }
        });
        return () => {
            active = false;
        };
    }, [identity]);

    return state;
};

export {
    loadOperationsCapabilities,
    resetOperationsCapabilities,
    useOperationsCapabilities,
};
