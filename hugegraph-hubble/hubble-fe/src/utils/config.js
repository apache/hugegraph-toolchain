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

const CONFIG_KEY = 'hubble_config_';

const setConfig = config => {
    sessionStorage.setItem(CONFIG_KEY, JSON.stringify(config));
};

const getConfig = () => {
    const str = sessionStorage.getItem(CONFIG_KEY);
    return str ? JSON.parse(str) : {pd_enabled: true};
};

const isPdEnabled = () => {
    return getConfig().pd_enabled;
};

const isAuthEnabled = (config = getConfig()) => {
    // A failed probe can leave partially populated fields; do not open anonymous routes.
    return config.server_capabilities_verified === false || config.auth_enabled !== false;
};

const isGraphCreateEnabled = () => {
    return getConfig().graph_create_enabled === true;
};

const isSchemaCloneEnabled = (config = getConfig()) => {
    return config.server_capabilities_verified !== false && config.schema_clone_enabled === true;
};

const isCypherEnabled = () => {
    return getConfig().cypher_enabled === true;
};

export {
    setConfig,
    getConfig,
    isPdEnabled,
    isAuthEnabled,
    isGraphCreateEnabled,
    isSchemaCloneEnabled,
    isCypherEnabled,
};
