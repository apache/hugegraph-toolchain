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

import PageHeader from '../../components/PageHeader';
import {Alert, Button, Spin, Table, Tooltip} from 'antd';
import {useState, useEffect, useCallback, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {useNavigate, useParams} from 'react-router-dom';
import * as api from '../../api';
import DataPreparationNav from '../../components/DataPreparationNav';
import FormHelpLabel from '../../components/FormHelpLabel';
import {TaskStatus} from '../Task/status';
import style from './index.module.scss';

const createColumns = t => [
    {
        title: t('task.detail.job_id'),
        dataIndex: 'job_id',
        className: style.no_wrap,
        width: 110,
        ellipsis: true,
        render: val => (val === null || val === undefined ? '-' : val.toString()),
    },
    {
        title: t('task.detail.status'),
        dataIndex: 'job_status',
        className: style.no_wrap,
        align: 'center',
        width: 110,
        render: val => <TaskStatus status={val} />,
    },
    {
        title: <FormHelpLabel
            label={t('task.detail.import_count')}
            help={t('task.detail.input_count_help')}
        />,
        dataIndex: 'job_metrics',
        className: style.no_wrap,
        align: 'right',
        width: 170,
        ellipsis: true,
        render: val => val?.total_count ?? '-',
    },
    {
        title: <FormHelpLabel label={t('task.detail.confirmed_vertices')}
            help={t('task.detail.confirmed_writes_help')} />,
        dataIndex: 'job_metrics',
        className: style.no_wrap,
        align: 'right',
        width: 180,
        render: val => val?.confirmed_vertex_writes ?? '-',
    },
    {
        title: <FormHelpLabel label={t('task.detail.confirmed_edges')}
            help={t('task.detail.confirmed_writes_help')} />,
        dataIndex: 'job_metrics',
        className: style.no_wrap,
        align: 'right',
        width: 180,
        render: val => val?.confirmed_edge_writes ?? '-',
    },
    {
        title: t('task.detail.create_time'),
        dataIndex: 'create_time',
        className: style.no_wrap,
        align: 'center',
        width: 180,
        ellipsis: true,
    },
    {
        title: t('task.detail.average_rate'),
        dataIndex: 'job_metrics',
        className: style.no_wrap,
        align: 'right',
        width: 150,
        ellipsis: true,
        render: (val, row) => {
            if (val) {
                const rate = row.job_status?.toLowerCase() === 'running' ? val.cur_rate : val.avg_rate;
                return t('task.detail.records_per_second', {rate});
            }

            return '-';
        },
    },
    {
        title: t('task.detail.duration'),
        dataIndex: 'job_metrics',
        className: style.no_wrap,
        align: 'right',
        width: 120,
        ellipsis: true,
        render: val => {
            if (val) {
                return t('task.detail.seconds', {seconds: val.total_time / 1000});
            }

            return '-';
        },
    },
    {
        title: t('task.detail.other'),
        className: style.no_wrap,
        width: 240,
        ellipsis: true,
        align: 'center',
        dataIndex: 'job_message',
        render: val => (
            val ? <Tooltip title={val}><span>{val}</span></Tooltip> : '-'
        ),
    },
];

const getRowKey = record => record.id ?? record.job_id;

const TaskDetail = () => {
    const {t} = useTranslation();
    const columns = createColumns(t);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [retryToken, setRetryToken] = useState(0);
    const [dataTaskId, setDataTaskId] = useState(null);
    const request = useRef(null);
    const {taskid} = useParams();
    const navigate = useNavigate();

    const handleBack = useCallback(() => navigate('/task'), [navigate]);
    const retry = useCallback(() => setRetryToken(value => value + 1), []);

    useEffect(() => {
        const token = Symbol('task-detail-jobs');
        request.current = token;
        setLoading(true);
        api.manage.getJobsList({taskid}, {
            suppressBusinessErrorToast: true,
        }).then(res => {
            if (request.current !== token) {
                return;
            }
            if (res.status === 200) {
                setData(res.data.records);
                setDataTaskId(taskid);
                setLoadError(false);
                return;
            }
            setData([]);
            setDataTaskId(taskid);
            setLoadError(true);
        }).catch(() => {
            if (request.current === token) {
                setData([]);
                setDataTaskId(taskid);
                setLoadError(true);
            }
        }).finally(() => {
            if (request.current === token) {
                setLoading(false);
            }
        });

        return () => {
            if (request.current === token) {
                request.current = null;
            }
        };
    }, [taskid, retryToken]);

    const visibleData = dataTaskId === taskid ? data : [];

    return (
        <>
            <PageHeader
                onBack={handleBack}
                title={t('task.detail.title')}
            />

            <DataPreparationNav active='task' />

            <div className='container'>
                {loadError && dataTaskId === taskid && (
                    <Alert
                        showIcon
                        type='error'
                        title={t('task.detail.load_failed')}
                        action={(
                            <Button size='small' onClick={retry}>
                                {t('task.detail.retry')}
                            </Button>
                        )}
                    />
                )}
                <Spin spinning={loading}>
                    <Table
                        className={style.task_detail_table}
                        rowKey={getRowKey}
                        columns={columns}
                        dataSource={visibleData}
                        scroll={{x: 'max-content'}}
                    />
                </Spin>
            </div>
        </>
    );
};

export default TaskDetail;
