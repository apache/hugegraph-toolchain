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
    Button,
    Row,
    Col,
    PageHeader,
    Input,
    Modal,
    Table,
    Space,
    Tooltip,
    message,
    Badge,
    Spin,
    Alert,
    Typography,
} from 'antd';
import {
    EditOutlined,
    DeleteOutlined,
    FileTextOutlined,
    PauseOutlined,
    CaretRightOutlined,
    LineChartOutlined,
} from '@ant-design/icons';
import {useState, useEffect, useCallback, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import style from './index.module.scss';
import EditLayer from './components/EditLayer';
import ViewLayer from './components/ViewLayer';
import TopStatistic from './components/TopStatistic';
import {useNavigate, Link} from 'react-router-dom';
import * as api from '../../api';
import {StatusField} from '../../components/Status';
import {sourceType, syncType} from './config';
import TableHeader from '../../components/TableHeader';
import DataPreparationNav from '../../components/DataPreparationNav';
import {readWorkbenchGraphContext} from '../../utils/workbenchGraphContext';

const {Text} = Typography;

const DetailTip = ({row}) => {
    const {t} = useTranslation();
    const {job_summary} = row;

    return (
        <Link
            to={`/task/detail/${row.task_id}`}
            aria-label={t('task.action.detail')}
            title={t('task.action.detail')}
        >
            <Tooltip
                title={(
                    <div className={style.task_detail}>
                        <div>{t('task.detail.title')}</div>
                        <Space>
                            <Badge
                                status="success"
                                text={(
                                    <span>
                                        {t('task.detail.success')}:
                                        {job_summary?.success_count ?? 0}
                                    </span>
                                )}
                            />
                            <Badge
                                status="error"
                                text={(
                                    <span>
                                        {t('task.detail.failed')}:
                                        {job_summary?.failed_count ?? 0}
                                    </span>
                                )}
                            />
                            <Badge
                                status="processing"
                                text={(
                                    <span>
                                        {t('task.detail.running')}:
                                        {job_summary?.running_count ?? 0}
                                    </span>
                                )}
                            />
                        </Space>
                    </div>)
                }
            >
                <LineChartOutlined />
            </Tooltip>
        </Link>
    );
};

const RunningText = ({status, onClick, data}) => {
    const {t} = useTranslation();
    const handleClick = useCallback(() => {
        onClick(data);
    }, [onClick, data]);

    const isEnabled = status === 'enable';
    const label = isEnabled ? t('task.action.pause') : t('task.action.run');

    return (
        <Tooltip title={label}>
            <Button
                type='link'
                aria-label={label}
                icon={isEnabled ? <PauseOutlined /> : <CaretRightOutlined />}
                onClick={handleClick}
            />
        </Tooltip>
    );
};

const TaskActions = ({row, onView, onEdit, onEnable, onDisable, onDelete}) => {
    const {t} = useTranslation();
    const canEditOrDelete = row.task_schedule_status === 'DISABLE';
    const handleView = useCallback(() => onView(row), [onView, row]);
    const handleEdit = useCallback(() => onEdit(row), [onEdit, row]);
    const handleDelete = useCallback(() => {
        Modal.confirm({
            title: t('common.confirm.delete'),
            content: t('common.confirm.delete_irrecoverable'),
            onOk: () => onDelete(row.task_id),
        });
    }, [onDelete, row.task_id, t]);

    return (
        <Space>
            <DetailTip row={row} />
            <Button
                type='link'
                aria-label={t('task.action.config')}
                title={t('task.action.config')}
                icon={<FileTextOutlined />}
                onClick={handleView}
            />
            <Button
                type='link'
                aria-label={t('task.action.edit')}
                title={t('task.action.edit')}
                icon={<EditOutlined />}
                disabled={!canEditOrDelete}
                onClick={handleEdit}
            />
            {row.task_schedule_status === 'ENABLE'
                ? (
                    <RunningText
                        status='enable'
                        data={row.task_id}
                        onClick={onDisable}
                    />)
                : <RunningText data={row.task_id} onClick={onEnable} />}
            <Button
                type='link'
                danger
                aria-label={t('task.action.delete')}
                title={t('task.action.delete')}
                icon={<DeleteOutlined />}
                disabled={!canEditOrDelete}
                onClick={handleDelete}
            />
        </Space>
    );
};

const Task = () => {
    const {t} = useTranslation();
    const [data, setData] = useState([]);
    const [searchName, setSearchName] = useState('');
    const [editLayer, setEditLayer] = useState(false);
    const [viewLayer, setViewLayer] = useState(false);
    const [refresh, setRefresh] = useState(false);
    const [detail, setDetail] = useState({});
    const [pagination, setPagination] = useState({pageSize: 10, current: 1});
    const [metricsData, setMetricsData] = useState({});
    const [loading, setLoading] = useState(false);
    const [listLoading, setListLoading] = useState(true);
    const [listError, setListError] = useState(false);
    const [metricsError, setMetricsError] = useState(false);
    const [metricsAvailable, setMetricsAvailable] = useState(false);
    const [listRetryToken, setListRetryToken] = useState(0);
    const [metricsRetryToken, setMetricsRetryToken] = useState(0);
    const [listPollToken, setListPollToken] = useState(0);
    const [metricsPollToken, setMetricsPollToken] = useState(0);
    const [demoLoading, setDemoLoading] = useState('');
    const listRequest = useRef(null);
    const metricsRequest = useRef(null);
    const demoRequest = useRef(null);
    const mounted = useRef(true);
    const listPending = useRef(false);
    const metricsPending = useRef(false);
    const listFailed = useRef(false);
    const metricsFailed = useRef(false);
    const navigate = useNavigate();
    const sourceTypes = sourceType(t);
    const syncTypes = syncType(t);
    const demoTarget = readWorkbenchGraphContext();

    useEffect(() => {
        return () => {
            mounted.current = false;
            demoRequest.current = null;
        };
    }, []);

    const search = useCallback(val => {
        setSearchName(val);
        setPagination({...pagination, current: 1});
    }, [pagination]);

    const handleTable = useCallback(newPagination => {
        setPagination(newPagination);
    }, []);

    const enableTask = useCallback(id => {
        api.manage.enableTask(id).then(res => {
            if (res.status === 200) {
                setRefresh(!refresh);
                message.success(t('common.msg.enable_success'));

                return;
            }

            message.error(t('common.msg.enable_fail'));
        });
    }, [refresh, t]);

    const disableTask = useCallback(id => {
        api.manage.disableTask(id).then(res => {
            if (res.status === 200) {
                setRefresh(!refresh);
                message.success(t('common.msg.disable_success'));

                return;
            }

            message.error(t('common.msg.disable_fail'));
        });
    }, [refresh, t]);

    const deleteTask = useCallback(id => {
        setLoading(true);
        api.manage.deleteTask(id).then(res => {
            setLoading(false);
            if (res.status === 200) {
                setRefresh(!refresh);
                message.success(t('common.msg.delete_success'));

                return;
            }

            message.error(t('common.msg.delete_fail'));
        });
    }, [refresh, t]);

    const editTask = useCallback(row => {
        setDetail(row);
        setEditLayer(true);
    }, []);

    const viewTask = useCallback(row => {
        setDetail(row);
        setViewLayer(true);
    }, []);

    const handleBack = useCallback(() => {
        navigate('/task/edit');
    }, [navigate]);

    const handleRefresh = useCallback(() => {
        setRefresh(!refresh);
    }, [refresh]);

    const retryList = useCallback(() => setListRetryToken(value => value + 1), []);
    const retryMetrics = useCallback(() => setMetricsRetryToken(value => value + 1), []);

    const loadDemo = useCallback(dataset => {
        const {graphspace, graph} = readWorkbenchGraphContext();
        if (!graphspace || !graph) {
            return;
        }
        Modal.confirm({
            title: t(`graph.sample.${dataset}_title`),
            content: t(`graph.sample.${dataset}_description`, {graph}),
            okText: t('graph.sample.confirm'),
            cancelText: t('common.action.cancel'),
            onOk: async () => {
                const token = Symbol('task-demo');
                demoRequest.current = token;
                setDemoLoading(dataset);
                try {
                    const res = await api.manage.loadSampleGraph(
                        graphspace,
                        graph,
                        dataset,
                        {suppressBusinessErrorToast: true}
                    );
                    const currentTarget = readWorkbenchGraphContext();
                    if (!mounted.current || demoRequest.current !== token
                        || currentTarget.graphspace !== graphspace
                        || currentTarget.graph !== graph) {
                        return;
                    }
                    if (res.status !== 200) {
                        throw new Error(res.message || t('graph.sample.failed'));
                    }
                    message.success(t('graph.sample.success', {
                        vertices: res.data.vertices,
                        edges: res.data.edges,
                    }));
                }
                catch (error) {
                    if (mounted.current && demoRequest.current === token) {
                        message.error(error.message || t('graph.sample.failed'));
                    }
                }
                finally {
                    if (mounted.current && demoRequest.current === token) {
                        demoRequest.current = null;
                        setDemoLoading('');
                    }
                }
            },
        });
    }, [t]);
    const loadHlmDemo = useCallback(() => loadDemo('hlm'), [loadDemo]);
    const loadLoaderDemo = useCallback(() => loadDemo('loader'), [loadDemo]);
    const chooseDemoGraph = useCallback(() => navigate('/graphspace'), [navigate]);

    const handleHideEditLayer = useCallback(() => setEditLayer(false), []);

    const handleHideViewLayer = useCallback(() => setViewLayer(false), []);

    const rowKey = useCallback(record => record.task_id, []);

    const columns = [
        {
            title: t('task.col.name'),
            dataIndex: 'task_name',
            width: 220,
            ellipsis: true,
            render: task_name => (
                <Text
                    style={{display: 'block', maxWidth: '100%'}}
                    ellipsis={{tooltip: task_name}}
                >
                    {task_name}
                </Text>
            ),
        },
        {
            title: t('task.col.source_type'),
            dataIndex: 'ingestion_mapping',
            render: val => {
                const {structs} = val ?? {};
                if (!structs?.length) {
                    return t('common.label.unknown');
                }
                const type = structs[0]?.input?.type;
                return sourceTypes.find(item => item.value === type)?.label
                       ?? t('common.label.unknown');
            },
        },
        {
            title: t('task.col.target_space'),
            dataIndex: 'ingestion_option',
            render: val => val.graphspace,
        },
        {
            title: t('task.col.target_graph'),
            dataIndex: 'ingestion_option',
            render: val => val.graph,
        },
        {
            title: t('task.col.create_time'),
            dataIndex: 'create_time',
        },
        {
            title: t('account.col.id'),
            dataIndex: 'creator',
        },
        {
            title: t('task.col.status'),
            dataIndex: 'last_metrics',
            align: 'center',
            width: 120,
            render: val => <StatusField status={val} />,
        },
        {
            title: t('task.col.sync_type'),
            dataIndex: 'task_schedule_type',
            render: val => {
                return syncTypes.find(item => item.value === val)?.label ?? val;
            },
        },
        {
            title: t('graphspace.col.operation'),
            align: 'center',
            width: 160,
            render: row => {
                return (
                    <TaskActions
                        row={row}
                        onView={viewTask}
                        onEdit={editTask}
                        onEnable={enableTask}
                        onDisable={disableTask}
                        onDelete={deleteTask}
                    />
                );
            },
        },
    ];

    useEffect(() => {
        const token = Symbol('task-list');
        listRequest.current = token;
        listPending.current = true;
        setListLoading(true);
        api.manage.getTaskList({
            query: searchName,
            page_no: pagination.current,
        }).then(res => {
            if (listRequest.current !== token) {
                return;
            }
            if (res.status === 200) {
                setData(res.data.records);
                setPagination(value => ({
                    ...value,
                    total: res.data.total,
                    pageSize: res.data.size,
                }));
                listFailed.current = false;
                setListError(false);
                return;
            }
            setData([]);
            listFailed.current = true;
            setListError(true);
        }).catch(() => {
            if (listRequest.current === token) {
                setData([]);
                listFailed.current = true;
                setListError(true);
            }
        }).finally(() => {
            if (listRequest.current === token) {
                listPending.current = false;
                setListLoading(false);
            }
        });

        return () => {
            if (listRequest.current === token) {
                listRequest.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchName, refresh, listRetryToken, listPollToken, pagination.current]);

    useEffect(() => {
        const token = Symbol('task-metrics');
        metricsRequest.current = token;
        metricsPending.current = true;
        api.manage.getMetricsTask().then(res => {
            if (metricsRequest.current !== token) {
                return;
            }
            if (res.status === 200) {
                setMetricsData(res.data);
                metricsFailed.current = false;
                setMetricsError(false);
                setMetricsAvailable(true);
                return;
            }
            setMetricsData({});
            metricsFailed.current = true;
            setMetricsError(true);
            setMetricsAvailable(false);
        }).catch(() => {
            if (metricsRequest.current === token) {
                setMetricsData({});
                metricsFailed.current = true;
                setMetricsError(true);
                setMetricsAvailable(false);
            }
        }).finally(() => {
            if (metricsRequest.current === token) {
                metricsPending.current = false;
            }
        });

        return () => {
            if (metricsRequest.current === token) {
                metricsRequest.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refresh, metricsRetryToken, metricsPollToken]);

    useEffect(() => {
        let id = setInterval(() => {
            if (!listPending.current && !listFailed.current) {
                setListPollToken(value => value + 1);
            }
            if (!metricsPending.current && !metricsFailed.current) {
                setMetricsPollToken(value => value + 1);
            }
        }, 12000);

        return () => clearInterval(id);
    }, []);

    return (
        <>
            <PageHeader
                ghost={false}
                onBack={false}
                title={t('task.title')}
            >
                <TopStatistic data={metricsData} available={metricsAvailable} />
                <Row justify='end' style={{paddingTop: 16}}>
                    <Col>
                        <Input.Search
                            placeholder={t('task.search_placeholder')}
                            onSearch={search}
                        />
                    </Col>
                </Row>
            </PageHeader>

            <DataPreparationNav active='task' />

            <div className='container'>
                <Alert
                    showIcon
                    type='info'
                    message={t('task.demo.title')}
                    description={demoTarget.graph
                        ? t('task.demo.target', {
                            graphspace: demoTarget.graphspace,
                            graph: demoTarget.graph,
                        })
                        : t('task.demo.choose_graph')}
                    action={demoTarget.graph ? (
                        <Space wrap>
                            <Button
                                loading={demoLoading === 'hlm'}
                                disabled={Boolean(demoLoading)}
                                onClick={loadHlmDemo}
                            >
                                {t('graph.menu.load_hlm_sample')}
                            </Button>
                            <Button
                                loading={demoLoading === 'loader'}
                                disabled={Boolean(demoLoading)}
                                onClick={loadLoaderDemo}
                            >
                                {t('graph.menu.load_loader_sample')}
                            </Button>
                        </Space>
                    ) : (
                        <Button onClick={chooseDemoGraph}>
                            {t('task.demo.select_graph')}
                        </Button>
                    )}
                />
                {metricsError && (
                    <Alert
                        showIcon
                        type='error'
                        message={t('task.metrics_failed')}
                        action={(
                            <Button size='small' onClick={retryMetrics}>
                                {t('task.retry_metrics')}
                            </Button>
                        )}
                    />
                )}
                {listError && (
                    <Alert
                        showIcon
                        type='error'
                        message={t('task.load_failed')}
                        action={(
                            <Button size='small' onClick={retryList}>
                                {t('task.retry')}
                            </Button>
                        )}
                    />
                )}
                <Spin spinning={loading || listLoading}>
                    <TableHeader>
                        <Button type='primary' onClick={handleBack}>
                            {t('task.create')}
                        </Button>
                    </TableHeader>
                    <Table
                        columns={columns}
                        rowKey={rowKey}
                        dataSource={data}
                        pagination={pagination}
                        onChange={handleTable}
                    />
                </Spin>
                <EditLayer
                    visible={editLayer}
                    data={detail}
                    onCancel={handleHideEditLayer}
                    refresh={handleRefresh}
                />
                <ViewLayer
                    visible={viewLayer}
                    task_id={detail.task_id}
                    onCancel={handleHideViewLayer}
                />
            </div>
        </>
    );
};

export default Task;
