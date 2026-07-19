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

import {
    Alert, PageHeader, Row, Col, Button, Spin, message, Space, Table,
    Card, Empty, Statistic, Tag,
} from 'antd';
import {
    NodeIndexOutlined, ReloadOutlined, SearchOutlined, ShareAltOutlined,
} from '@ant-design/icons';
import {useCallback, useEffect, useRef, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import * as api from '../../api';
import GraphJourneyNav from '../../components/GraphJourneyNav';
import style from './index.module.scss';
import {useTranslation} from 'react-i18next';

const GraphDetail = () => {
    const [pageLoading, setPageLoading] = useState(true);
    const [statisticsLoading, setStatisticsLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [statistic, setStatistic] = useState({});
    const [statisticsStatus, setStatisticsStatus] = useState('loading');
    const [pageDataRoute, setPageDataRoute] = useState(null);
    const [statisticsDataRoute, setStatisticsDataRoute] = useState(null);
    const [pageError, setPageError] = useState(false);
    const pageRequest = useRef(null);
    const statisticsRequest = useRef(null);
    const updateRequest = useRef(null);
    const {graphspace, graph} = useParams();
    const navigate = useNavigate();
    const {t} = useTranslation();
    const routeKey = `${graphspace}/${graph}`;
    const currentRoute = useRef(routeKey);
    currentRoute.current = routeKey;

    const handleBack = useCallback(() => {
        navigate(-1);
    }, [navigate]);

    const handleQuery = useCallback(() => {
        navigate(`/gremlin/${graphspace}/${graph}`);
    }, [graphspace, graph, navigate]);

    const handleSchema = useCallback(() => {
        navigate(`/graphspace/${graphspace}/graph/${graph}/meta`);
    }, [graphspace, graph, navigate]);

    const handlePrepareData = useCallback(() => {
        navigate('/source');
    }, [navigate]);

    const formatList = data => {
        if (!data || Object.keys(data).length === 0) {
            return [];
        }

        return Object.keys(data).map(item => ({key: item, num: data[item]}));
    };

    const loadPage = useCallback(async () => {
        const token = Symbol('graph-detail-page');
        pageRequest.current = token;
        setPageLoading(true);
        setPageError(false);
        const inlineErrorConfig = {suppressBusinessErrorToast: true};
        try {
            const [graphspaceResponse, graphResponse] = await Promise.all([
                api.manage.getGraphSpace(graphspace, inlineErrorConfig),
                api.manage.getGraph(graphspace, graph, inlineErrorConfig),
            ]);
            if (pageRequest.current !== token) {
                return;
            }
            if (!graphspaceResponse || !graphResponse
                || graphspaceResponse.status !== 200
                || graphResponse.status !== 200) {
                setPageDataRoute(routeKey);
                setPageError(true);
                return;
            }
            setPageDataRoute(routeKey);
        }
        catch (error) {
            if (pageRequest.current !== token) {
                return;
            }
            setPageError(true);
            setPageDataRoute(routeKey);
        }
        finally {
            if (pageRequest.current === token) {
                setPageLoading(false);
            }
        }
    }, [graphspace, graph, routeKey]);

    const loadStatistics = useCallback(async () => {
        const token = Symbol('graph-detail-statistics');
        statisticsRequest.current = token;
        setStatisticsLoading(true);
        setStatisticsStatus('loading');
        setStatistic({});
        const inlineErrorConfig = {suppressBusinessErrorToast: true};
        try {
            const res = await api.manage.getGraphStatistic(
                graphspace,
                graph,
                inlineErrorConfig
            );
            if (statisticsRequest.current !== token) {
                return;
            }
            if (res.status === 200) {
                setStatistic(res.data);
                setStatisticsStatus('success');
                setStatisticsDataRoute(routeKey);
                return;
            }
            setStatisticsStatus('error');
            setStatistic({});
            setStatisticsDataRoute(routeKey);
        }
        catch (error) {
            if (statisticsRequest.current !== token) {
                return;
            }
            setStatisticsStatus('error');
            setStatistic({});
            setStatisticsDataRoute(routeKey);
        }
        finally {
            if (statisticsRequest.current === token) {
                setStatisticsLoading(false);
            }
        }
    }, [graphspace, graph, routeKey]);

    const handleUpdate = useCallback(async () => {
        const token = Symbol('graph-detail-update');
        const requestedRoute = routeKey;
        updateRequest.current = token;
        setUpdating(true);
        try {
            const res = await api.manage.updateGraphStatistic(graphspace, graph);
            if (updateRequest.current !== token
                || currentRoute.current !== requestedRoute) {
                return;
            }
            if (res.status !== 200) {
                message.error(t('graph.detail.update_failed'));
                return;
            }
            message.success(t('graph.detail.update_success'));
            await loadStatistics();
        }
        catch (error) {
            if (updateRequest.current === token
                && currentRoute.current === requestedRoute) {
                message.error(t('graph.detail.update_failed'));
            }
        }
        finally {
            if (updateRequest.current === token
                && currentRoute.current === requestedRoute) {
                setUpdating(false);
            }
        }
    }, [graphspace, graph, loadStatistics, routeKey, t]);

    useEffect(() => {
        if (!graphspace || !graph) {
            return undefined;
        }
        loadPage();
        loadStatistics();
        return () => {
            pageRequest.current = null;
            statisticsRequest.current = null;
            updateRequest.current = null;
            setUpdating(false);
        };
    }, [graphspace, graph, loadPage, loadStatistics]);

    const isPageDataCurrent = pageDataRoute === routeKey;
    const isStatisticsDataCurrent = statisticsDataRoute === routeKey;
    const visibleStatisticsStatus = isStatisticsDataCurrent
        ? statisticsStatus
        : 'loading';
    const visibleStatistic = isStatisticsDataCurrent ? statistic : {};
    const isEmptyGraph = visibleStatisticsStatus === 'success'
        && Number(visibleStatistic.vertex_count ?? 0) === 0
        && Number(visibleStatistic.edge_count ?? 0) === 0
        && formatList(visibleStatistic.vertices).length === 0
        && formatList(visibleStatistic.edges).length === 0;

    return (
        <Spin spinning={pageLoading || !isPageDataCurrent}>
            {!pageLoading && isPageDataCurrent && (
                <>
                    <PageHeader
                        ghost={false}
                        onBack={handleBack}
                        title={t('graph.detail.title')}
                        extra={[
                            <Button
                                key='query'
                                type='primary'
                                icon={<SearchOutlined />}
                                onClick={handleQuery}
                            >
                                {t('graph.detail.query')}
                            </Button>,
                        ]}
                    />

                    <div className={'container'}>
                        <GraphJourneyNav
                            graphspace={graphspace}
                            graph={graph}
                            active='overview'
                        />

                        {pageError ? (
                            <Alert
                                type='error'
                                showIcon
                                message={t('graph.detail.unavailable')}
                                action={(
                                    <Space>
                                        <Button
                                            size='small'
                                            href={`/graphspace/${encodeURIComponent(graphspace)}`}
                                        >
                                            {t('graph.detail.back_to_graphs')}
                                        </Button>
                                        <Button size='small' type='primary' onClick={loadPage}>
                                            {t('graph.detail.retry_page')}
                                        </Button>
                                    </Space>
                                )}
                            />
                        ) : (
                            <>
                                <div className={style.statusBar}>
                                    <Space size='middle'>
                                        <span>{t('graph.detail.data_status')}</span>
                                        <Tag
                                            color={visibleStatisticsStatus === 'error'
                                                ? 'gold'
                                                : visibleStatisticsStatus === 'success'
                                                    ? 'green' : 'blue'}
                                            className={style[`statusTag-${visibleStatisticsStatus}`]}
                                        >
                                            {visibleStatisticsStatus === 'error'
                                                ? t('graph.detail.partial')
                                                : visibleStatisticsStatus === 'success'
                                                    ? t('graph.detail.available')
                                                    : t('graph.detail.loading')}
                                        </Tag>
                                        <span className={style.updatedAt}>
                                            {t('graph.detail.last_update')}
                                            {visibleStatistic.update_time ?? '--/--'}
                                        </span>
                                    </Space>
                                    <Button
                                        icon={<ReloadOutlined />}
                                        loading={updating}
                                        onClick={handleUpdate}
                                    >
                                        {t('graph.detail.update_data')}
                                    </Button>
                                </div>

                                {visibleStatisticsStatus === 'error' && (
                                    <Alert
                                        className={style.inlineAlert}
                                        type='warning'
                                        showIcon
                                        message={t('graph.detail.statistics_unavailable')}
                                        action={(
                                            <Button
                                                size='small'
                                                loading={statisticsLoading}
                                                onClick={loadStatistics}
                                            >
                                                {t('graph.detail.retry_statistics')}
                                            </Button>
                                        )}
                                    />
                                )}

                                {isEmptyGraph ? (
                                    <Empty
                                        className={style.emptyJourney}
                                        description={(
                                            <div>
                                                <strong>{t('graph.detail.empty_title')}</strong>
                                                <p>{t('graph.detail.empty_description')}</p>
                                            </div>
                                        )}
                                    >
                                        <Space wrap>
                                            <Button type='primary' onClick={handleSchema}>
                                                {t('graph.detail.create_schema')}
                                            </Button>
                                            <Button onClick={handlePrepareData}>
                                                {t('graph.detail.prepare_data')}
                                            </Button>
                                            <Button onClick={handleQuery}>
                                                {t('graph.detail.query')}
                                            </Button>
                                        </Space>
                                    </Empty>
                                ) : (
                                    <Row gutter={[16, 16]}>
                                        <Col span={12}>
                                            <Card
                                                className={style.metricCard}
                                                title={(
                                                    <Space>
                                                        <NodeIndexOutlined />
                                                        {t('graph.detail.vertex_total')}
                                                    </Space>
                                                )}
                                            >
                                                <Statistic
                                                    loading={statisticsLoading}
                                                    value={visibleStatisticsStatus !== 'success'
                                                        ? '--'
                                                        : visibleStatistic.vertex_count ?? 0}
                                                />
                                                <Table
                                                    columns={[
                                                        {title: t('graph.detail.vertex_type'), dataIndex: 'key'},
                                                        {title: t('graph.detail.count'), dataIndex: 'num'},
                                                    ]}
                                                    dataSource={formatList(visibleStatistic.vertices)}
                                                    pagination={false}
                                                    size='small'
                                                />
                                            </Card>
                                        </Col>

                                        <Col span={12}>
                                            <Card
                                                className={style.metricCard}
                                                title={(
                                                    <Space>
                                                        <ShareAltOutlined />
                                                        {t('graph.detail.edge_total')}
                                                    </Space>
                                                )}
                                            >
                                                <Statistic
                                                    loading={statisticsLoading}
                                                    value={visibleStatisticsStatus !== 'success'
                                                        ? '--'
                                                        : visibleStatistic.edge_count ?? 0}
                                                />
                                                <Table
                                                    columns={[
                                                        {title: t('graph.detail.edge_type'), dataIndex: 'key'},
                                                        {title: t('graph.detail.count'), dataIndex: 'num'},
                                                    ]}
                                                    dataSource={formatList(visibleStatistic.edges)}
                                                    pagination={false}
                                                    size='small'
                                                />
                                            </Card>
                                        </Col>
                                    </Row>
                                )}
                            </>
                        )}
                    </div>
                </>
            )}
        </Spin>
    );
};

export default GraphDetail;
