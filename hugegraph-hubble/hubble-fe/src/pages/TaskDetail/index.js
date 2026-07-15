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

import {Alert, Button, PageHeader, Spin, Table} from 'antd';
import {useState, useEffect, useCallback, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {useNavigate, useParams} from 'react-router-dom';
import * as api from '../../api';
import {StatusField} from '../../components/Status';
import DataPreparationNav from '../../components/DataPreparationNav';

const createColumns = t => [
    {
        title: t('task.detail.job_id'),
        dataIndex: 'job_id',
        render: val => val.toString(),
    },
    {
        title: t('task.detail.import_count'),
        dataIndex: 'job_metrics',
        align: 'right',
        render: val => val?.total_count,
    },
    {
        title: t('task.detail.create_time'),
        dataIndex: 'create_time',
        align: 'center',
    },
    {
        title: t('task.detail.average_rate'),
        dataIndex: 'job_metrics',
        align: 'right',
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
        align: 'right',
        render: val => {
            if (val) {
                return t('task.detail.seconds', {seconds: val.total_time / 1000});
            }

            return '-';
        },
    },
    {
        title: t('task.detail.status'),
        dataIndex: 'job_status',
        align: 'center',
        render: val => <StatusField status={val} />,
    },
    {
        title: t('task.detail.other'),
        width: 400,
        align: 'center',
        dataIndex: 'job_message',
        render: val => val ?? '-',
    },
];

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
                ghost={false}
                onBack={handleBack}
                title={t('task.detail.title')}
            />

            <DataPreparationNav active='task' />

            <div className='container'>
                {loadError && dataTaskId === taskid && (
                    <Alert
                        showIcon
                        type='error'
                        message={t('task.detail.load_failed')}
                        action={(
                            <Button size='small' onClick={retry}>
                                {t('task.detail.retry')}
                            </Button>
                        )}
                    />
                )}
                <Spin spinning={loading}>
                    <Table
                        rowKey='job_id'
                        columns={columns}
                        dataSource={visibleData}
                    />
                </Spin>
            </div>
        </>
    );
};

export default TaskDetail;
