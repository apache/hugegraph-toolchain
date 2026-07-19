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

import {Alert, Button, PageHeader, Radio, Spin, Space} from 'antd';
import {useCallback, useEffect, useRef, useState} from 'react';
import ImageView from './ImageView';
import ListView from './ListView';
import {useParams, useNavigate} from 'react-router-dom';
import * as api from '../../api';
import {useTranslation} from 'react-i18next';
import GraphJourneyNav from '../../components/GraphJourneyNav';
import {TopbarPageContextSlot} from '../../components/Topbar/PageContextSlot';

const Meta = () => {
    const [viewType, setViewType] = useState('image');
    const [loading, setLoading] = useState(true);
    const [errors, setErrors] = useState({graph: false, graphspace: false});
    const identityRequest = useRef(null);
    const {graphspace, graph} = useParams();
    const navigate = useNavigate();
    const {t} = useTranslation();

    const handlePageBack = useCallback(() => {
        // navigate(`/graphspace/${graphspace}`);
        navigate(-1);
    }, [navigate]);

    const handleChangeViewType = useCallback(e => {
        setViewType(e.target.value);
    }, []);

    const loadIdentity = useCallback(async () => {
        const token = Symbol('meta-identity');
        identityRequest.current = token;
        setLoading(true);
        setErrors({graph: false, graphspace: false});
        const config = {suppressBusinessErrorToast: true};
        const [graphResult, graphspaceResult] = await Promise.allSettled([
            api.manage.getGraph(graphspace, graph, config),
            api.manage.getGraphSpace(graphspace, config),
        ]);
        if (identityRequest.current !== token) {
            return;
        }
        const graphResponse = graphResult.status === 'fulfilled'
            ? graphResult.value : null;
        const graphspaceResponse = graphspaceResult.status === 'fulfilled'
            ? graphspaceResult.value : null;
        const nextErrors = {
            graph: graphResponse?.status !== 200,
            graphspace: graphspaceResponse?.status !== 200,
        };
        setErrors(nextErrors);
        setLoading(false);
    }, [graphspace, graph]);

    useEffect(() => {
        if (!graphspace || !graph) {
            return undefined;
        }
        loadIdentity();
        return () => {
            identityRequest.current = null;
        };
    }, [graphspace, graph, loadIdentity]);

    const hasIdentityError = errors.graph || errors.graphspace;
    return (
        <>
            <Spin spinning={loading}>
                <PageHeader
                    ghost={false}
                    onBack={handlePageBack}
                    title={t('schema.title')}
                    extra={[
                        <TopbarPageContextSlot key='view-mode'>
                            <Radio.Group
                                role='radiogroup'
                                aria-label={t('schema.view_mode')}
                                options={[
                                    {label: t('common.label.view_mode'), value: 'image'},
                                    {label: t('common.label.list_mode'), value: 'list'},
                                ]}
                                optionType='button'
                                buttonStyle='solid'
                                value={viewType}
                                onChange={handleChangeViewType}
                            />
                        </TopbarPageContextSlot>,
                    ]}
                />

                <div className='container'>
                    <GraphJourneyNav
                        graphspace={graphspace}
                        graph={graph}
                        active='schema'
                    />
                    {hasIdentityError && (
                        <Space direction='vertical' style={{width: '100%'}}>
                            {errors.graphspace && (
                                <Alert
                                    type='error'
                                    showIcon
                                    message={t('schema.identity.graphspace_unavailable')}
                                />
                            )}
                            {errors.graph && (
                                <Alert
                                    type='error'
                                    showIcon
                                    message={t('schema.identity.graph_unavailable')}
                                />
                            )}
                            <Button onClick={loadIdentity}>
                                {t('schema.identity.retry')}
                            </Button>
                            <Button
                                href={`/graphspace/${encodeURIComponent(graphspace)}`
                                    + `/graph/${encodeURIComponent(graph)}/detail`}
                            >
                                {t('schema.identity.back_to_graph')}
                            </Button>
                        </Space>
                    )}
                    {!hasIdentityError && viewType === 'list'
                        ? (
                            <ListView />
                        )
                        : !hasIdentityError ? (
                            <ImageView />
                        ) : null
                    }
                </div>
            </Spin>
        </>
    );
};

export default Meta;
