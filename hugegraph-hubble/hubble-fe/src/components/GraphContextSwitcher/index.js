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

import {Alert, Button, Select, Space, Tag} from 'antd';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import * as api from '../../api';
import {isPdEnabled} from '../../utils/config';
import {DEFAULT_GRAPHSPACE} from '../../utils/productMode';
import {
    extractWorkbenchGraphContext,
    readWorkbenchGraphContext,
    resolveWorkbenchGraphContext,
    writeWorkbenchGraphContext,
} from '../../utils/workbenchGraphContext';
import style from './index.module.scss';

const {Option} = Select;
const GRAPHSPACE_LIST_PARAMS = {all: true};
const GRAPH_LIST_PARAMS = {page_no: 1, page_size: -1};
const INLINE_ERROR_CONFIG = {suppressBusinessErrorToast: true};

const getRecords = response => {
    if (response?.status !== 200) {
        throw new Error(`Unexpected graph context response: ${response?.status}`);
    }
    if (Array.isArray(response.data)) {
        return response.data;
    }
    return response.data?.records ?? [];
};

const GraphContextSwitcher = () => {
    const {t} = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const pdEnabled = isPdEnabled();
    const routeContext = useMemo(
        () => extractWorkbenchGraphContext(location.pathname),
        [location.pathname]
    );
    const [context, setContext] = useState(() => resolveWorkbenchGraphContext({
        pdEnabled,
        routeContext,
        storedContext: readWorkbenchGraphContext(),
    }));
    const [graphspaces, setGraphspaces] = useState(() => (
        pdEnabled ? [] : [{name: DEFAULT_GRAPHSPACE, nickname: DEFAULT_GRAPHSPACE}]
    ));
    const [graphs, setGraphs] = useState([]);
    const [loading, setLoading] = useState({graphspaces: pdEnabled, graphs: true});
    const [errors, setErrors] = useState({graphspaces: false, graphs: false});
    const [reloadTokens, setReloadTokens] = useState({graphspaces: 0, graphs: 0});

    useEffect(() => {
        const nextContext = resolveWorkbenchGraphContext({
            pdEnabled,
            routeContext,
            storedContext: readWorkbenchGraphContext(),
        });
        setContext(nextContext);
        if (nextContext.graphspace) {
            writeWorkbenchGraphContext(localStorage, nextContext);
        }
    }, [pdEnabled, routeContext]);

    useEffect(() => {
        let cancelled = false;
        if (!pdEnabled) {
            setGraphspaces([{name: DEFAULT_GRAPHSPACE, nickname: DEFAULT_GRAPHSPACE}]);
            setLoading(value => ({...value, graphspaces: false}));
            return undefined;
        }

        setLoading(value => ({...value, graphspaces: true}));
        api.manage.getGraphSpaceList(GRAPHSPACE_LIST_PARAMS, INLINE_ERROR_CONFIG)
            .then(response => {
                if (!cancelled) {
                    const records = getRecords(response);
                    setGraphspaces(records);
                    setErrors(value => ({...value, graphspaces: false}));
                    setLoading(value => ({...value, graphspaces: false}));
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setErrors(value => ({...value, graphspaces: true}));
                    setLoading(value => ({...value, graphspaces: false}));
                }
            });

        return () => {
            cancelled = true;
        };
    }, [navigate, pdEnabled, reloadTokens.graphspaces]);

    useEffect(() => {
        let cancelled = false;
        if (!context.graphspace) {
            setGraphs([]);
            setLoading(value => ({...value, graphs: false}));
            return undefined;
        }

        setLoading(value => ({...value, graphs: true}));
        setErrors(value => ({...value, graphs: false}));
        const requestedGraphspace = context.graphspace;
        api.manage.getGraphList(requestedGraphspace, GRAPH_LIST_PARAMS, INLINE_ERROR_CONFIG)
            .then(response => {
                if (!cancelled) {
                    const records = getRecords(response);
                    setGraphs(records);
                    setErrors(value => ({...value, graphs: false}));
                    setLoading(value => ({...value, graphs: false}));
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setErrors(value => ({...value, graphs: true}));
                    setLoading(value => ({...value, graphs: false}));
                }
            });

        return () => {
            cancelled = true;
        };
    }, [context.graphspace, navigate, reloadTokens.graphs]);

    useEffect(() => {
        if (!pdEnabled || loading.graphspaces || errors.graphspaces || !context.graphspace || (
            graphspaces.some(item => item.name === context.graphspace)
        )) {
            return;
        }

        const graphspace = graphspaces[0]?.name;
        const nextContext = graphspace ? {graphspace} : {};
        setContext(nextContext);
        setGraphs([]);
        if (graphspace) {
            writeWorkbenchGraphContext(localStorage, nextContext);
            navigate(`/graphspace/${encodeURIComponent(graphspace)}`, {replace: true});
        }
        else {
            localStorage.removeItem('hubble_workbench_graph_context');
            navigate('/graphspace', {replace: true});
        }
    }, [
        context.graphspace,
        errors.graphspaces,
        graphspaces,
        loading.graphspaces,
        navigate,
        pdEnabled,
    ]);

    useEffect(() => {
        if (loading.graphs || errors.graphs || !context.graph || (
            graphs.some(item => item.name === context.graph)
        )) {
            return;
        }

        const nextContext = {graphspace: context.graphspace};
        setContext(nextContext);
        writeWorkbenchGraphContext(localStorage, nextContext);
        navigate(
            `/graphspace/${encodeURIComponent(context.graphspace)}`,
            {replace: true}
        );
    }, [
        context.graph,
        context.graphspace,
        errors.graphs,
        graphs,
        loading.graphs,
        navigate,
    ]);

    const graphspaceOptions = useMemo(() => {
        if (!context.graphspace || graphspaces.some(item => item.name === context.graphspace)) {
            return graphspaces;
        }
        if (!loading.graphspaces && !errors.graphspaces) {
            return graphspaces;
        }
        return [{name: context.graphspace, nickname: context.graphspace}, ...graphspaces];
    }, [context.graphspace, errors.graphspaces, graphspaces, loading.graphspaces]);

    const selectGraphspace = useCallback(graphspace => {
        const nextContext = {graphspace};
        setGraphs([]);
        setErrors(value => ({...value, graphs: false}));
        setLoading(value => ({...value, graphs: true}));
        setContext(nextContext);
        writeWorkbenchGraphContext(localStorage, nextContext);
        navigate(`/graphspace/${encodeURIComponent(graphspace)}`);
    }, [navigate]);

    const selectGraph = useCallback(graph => {
        if (!context.graphspace) {
            return;
        }
        const nextContext = {graphspace: context.graphspace, graph};
        setContext(nextContext);
        writeWorkbenchGraphContext(localStorage, nextContext);
        navigate(
            `/graphspace/${encodeURIComponent(context.graphspace)}`
            + `/graph/${encodeURIComponent(graph)}/detail`
        );
    }, [context.graphspace, navigate]);

    const retryGraphspaces = useCallback(() => {
        setLoading(value => ({...value, graphspaces: true}));
        setErrors(value => ({...value, graphspaces: false}));
        setReloadTokens(value => ({...value, graphspaces: value.graphspaces + 1}));
    }, []);

    const retryGraphs = useCallback(() => {
        setLoading(value => ({...value, graphs: true}));
        setErrors(value => ({...value, graphs: false}));
        setReloadTokens(value => ({...value, graphs: value.graphs + 1}));
    }, []);

    return (
        <div
            className={style.context}
            role="group"
            aria-label={t('workbench.context.name')}
        >
            <Space size={8}>
                <Select
                    aria-label={t('workbench.context.graphspace')}
                    className={style.graphspace}
                    disabled={!pdEnabled}
                    loading={loading.graphspaces}
                    onChange={selectGraphspace}
                    placeholder={t('workbench.context.select_graphspace')}
                    value={context.graphspace}
                >
                    {graphspaceOptions.map(item => (
                        <Option key={item.name} value={item.name}>
                            {item.name === DEFAULT_GRAPHSPACE
                                ? t('workbench.context.default_graphspace')
                                : item.nickname || item.name}
                        </Option>
                    ))}
                </Select>
                <span className={style.separator}>/</span>
                <Select
                    aria-label={t('workbench.context.graph')}
                    className={style.graph}
                    disabled={!context.graphspace || loading.graphs || errors.graphs}
                    loading={loading.graphs}
                    onChange={selectGraph}
                    placeholder={t('workbench.context.select_graph')}
                    value={context.graph}
                >
                    {graphs.map(item => (
                        <Option key={item.name} value={item.name}>
                            {item.nickname || item.name}
                        </Option>
                    ))}
                </Select>
                {!pdEnabled && (
                    <Tag className={style.mode}>{t('workbench.context.non_pd_fixed')}</Tag>
                )}
            </Space>
            {(errors.graphspaces || errors.graphs) && (
                <div className={style.errorStack}>
                    {errors.graphspaces && (
                        <Alert
                            className={style.error}
                            type="error"
                            showIcon
                            message={t('workbench.context.graphspaces_load_failed')}
                            action={(
                                <Button size="small" onClick={retryGraphspaces}>
                                    {t('workbench.context.retry_graphspaces')}
                                </Button>
                            )}
                        />
                    )}
                    {errors.graphs && (
                        <Alert
                            className={style.error}
                            type="error"
                            showIcon
                            message={t('workbench.context.graphs_load_failed')}
                            action={(
                                <Button size="small" onClick={retryGraphs}>
                                    {t('workbench.context.retry_graphs')}
                                </Button>
                            )}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default GraphContextSwitcher;
