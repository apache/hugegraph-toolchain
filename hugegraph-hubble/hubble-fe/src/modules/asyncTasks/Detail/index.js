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

/**
 * @file 任务管理 table页面
 */

import React, {useState, useCallback, useContext} from 'react';
import {Table, Tag, Spin, message, Button, Typography, Modal} from 'antd';
import GraphAnalysisContext from '../../Context';
import {CloseOutlined} from '@ant-design/icons';
import * as api from '../../../api/index';
import formatTimeDuration from '../../../utils/formatTimeDuration';
import {
    Async_Task_Type,
    Async_Taskt_Status,
    Filter_Task_Status,
    Status_Color,
    getTranslatedAsyncTaskConstants,
} from '../../../utils/constants';
import {intersection, size} from 'lodash-es';
import {format} from 'date-fns';
import {useTranslation} from 'react-i18next';
import c from './index.module.scss';
const {Text} = Typography;

const {FAILED, SUCCESS, DELETING, CANCELLING} = Async_Taskt_Status;

const TaskAction = ({onAction, args, children}) => {
    const handleClick = useCallback(() => onAction(...args), [args, onAction]);

    return (
        <Button type='link' style={{margin: '10px'}} onClick={handleClick}>
            {children}
        </Button>
    );
};

const AsyncTaskDetail = props => {
    const {t} = useTranslation();
    const {
        page,
        pageSize,
        onPageChange,
        getAsynTaskList,
        asyncManageTaskData,
        loading,
    } = props;

    const {graphSpace: currentGraphSpace, graph: currentGraph, isVermeer} = useContext(GraphAnalysisContext);
    const {records: asyncManageTaskDataRecords, total: asyncManageTaskDataTotal} = asyncManageTaskData || {};
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const {
        taskTypeNames,
        taskStatusNames,
        taskManipulations,
    } = getTranslatedAsyncTaskConstants(t);

    const onSelectChange = (rowKey, selectedRows) => {
        setSelectedRowKeys(rowKey);
    };

    const rowSelection = {
        selectedRowKeys,
        onChange: onSelectChange,
        getCheckboxProps: record => {
            const checkboxProps = ['scheduling', 'scheduled', 'queued', 'running', 'restoring', 'deleting'];
            return {
                disabled: checkboxProps.includes(record.task_status),
                task_status: record.task_status,
            };

        },
    };

    const currentSelectedRowKeys = intersection(
        selectedRowKeys,
        asyncManageTaskDataRecords?.map(({id}) => id)
    );

    const onRefresh = useCallback(() => {
        getAsynTaskList();
    }, [getAsynTaskList]);

    const renderTaskTypeFilters = () => {
        const res = [];
        const keys = Object.keys(Async_Task_Type);
        for (let i = 0; i < keys.length; i++) {
            const item = keys[i];
            const text = taskTypeNames[item] || item;
            if (!item.includes('vermeer')) {
                res.push({text, value: item});
            }
            else if (isVermeer) {
                res.push({text, value: item});
            }
        }
        return res;
    };

    const renderTaskStatusFilters = () => {
        const res = [];
        const keys = Object.keys(Filter_Task_Status);
        for (let i = 0; i < keys.length; i++) {
            const item = keys[i];
            res.push({text: taskStatusNames[item] || item, value: item});
        }
        return res;
    };

    const viewResult = useCallback(
        (text, rowData, index) => {
            window.open(`/asyncTasks/result/${currentGraphSpace}/${currentGraph}/${rowData.id}`);
        }, [currentGraph, currentGraphSpace]);

    const deleteTaskByIds = useCallback(
        taskIdArr => {
            const parmas  = {ids: taskIdArr};
            api.analysis.deleteAsyncTask(currentGraphSpace, currentGraph, parmas)
                .then(res => {
                    const {status, message: errMsg} = res;
                    if (status === 200) {
                        onRefresh();
                    }
                    else {
                        !errMsg && message.error(t('analysis.async_task.delete_failed'));
                    }
                });
        }, [currentGraph, currentGraphSpace, onRefresh, t]);

    const abortAsyncTaskById = useCallback(
        async taskId => {
            const response  = await api.analysis.abortAsyncTask(currentGraphSpace, currentGraph, taskId);
            const {status, message: abortAsyncTaskMessage} = response || {};
            if (status === 200) {
                onRefresh();
            }
            else {
                !abortAsyncTaskMessage && message.error(t('analysis.async_task.abort_failed'));
            }
        }, [currentGraphSpace, currentGraph, onRefresh, t]);

    const onAbortTaskHandler = useCallback(taskId => {
        abortAsyncTaskById(taskId);
    }, [abortAsyncTaskById]);

    const onDeleteConfirm = useCallback(id => {
        Modal.confirm({
            title: t('analysis.async_task.delete_confirm_title'),
            content: t('analysis.async_task.delete_confirm_content'),
            okText: t('common.action.confirm'),
            cancelText: t('common.action.cancel'),
            onOk: () => deleteTaskByIds([id]),
        });
    }, [deleteTaskByIds, t]);

    const onMassDeleteConfirm = useCallback(() => {
        Modal.confirm({
            title: t('analysis.async_task.batch_delete_title'),
            content: t('analysis.async_task.batch_delete_content'),
            okText: t('common.action.confirm'),
            cancelText: t('common.action.cancel'),
            onOk: () => deleteTaskByIds(currentSelectedRowKeys),
        });
    }, [currentSelectedRowKeys, deleteTaskByIds, t]);

    const clearSelectedRowKeys = useCallback(() => {
        setSelectedRowKeys([]);
    }, []);

    const columns = [
        {
            title: t('analysis.async_task.column.task_id'),
            dataIndex: 'id',
            fixed: 'left',
        },
        {
            title: t('analysis.async_task.column.task_name'),
            dataIndex: 'task_name',
            width: 220,
            ellipsis: true,
            render: (task_name, rowData, index) => {
                return (
                    <Text className={c.taskName} ellipsis={{tooltip: task_name}}>
                        {task_name}
                    </Text>
                );
            },
        },
        {
            title: t('analysis.async_task.column.task_type'),
            dataIndex: 'task_type',
            filters: renderTaskTypeFilters(),
            filterMultiple: false,
            render: (task_type, rowData, index) => {
                return (<>{taskTypeNames[task_type] || task_type}</>);
            },
        },
        {
            title: t('analysis.async_task.column.create_time'),
            dataIndex: 'task_create',
            render: (task_create, rowData, index) => {
                const convertedDate = format(new Date(task_create), 'yyyy-MM-dd H:m:ss');
                return (<>{convertedDate}</>);
            },
        },
        {
            title: t('analysis.async_task.column.duration'),
            dataIndex: 'task_progress',
            render: (task_progress, rowData, index) => {
                const {task_update, task_create} = rowData;
                const duration = formatTimeDuration(task_create, task_update);
                return <div style={{whiteSpace: 'nowrap'}}>{duration}</div>;
            },
        },
        {
            title: t('analysis.async_task.column.status'),
            dataIndex: 'task_status',
            filterMultiple: false,
            filters: renderTaskStatusFilters(),
            render: (task_status, rowData, index) => {
                return (
                    <Tag color={Status_Color[task_status]}>
                        {taskStatusNames[task_status] || task_status}
                    </Tag>
                );
            },
        },
        {
            title: t('analysis.async_task.column.action'),
            dataIndex: 'manipulation',
            render: (result, rowData, index) => {
                const {'task_status': status, 'task_type': type, id: taskId}  = rowData;
                const allowCheckResTypeArr = ['gremlin', 'computer-dis', 'cypher'];
                const isAllowCheckRes = status === SUCCESS && allowCheckResTypeArr.includes(type);
                const allowAbortStatusArr = ['scheduling', 'scheduled', 'queued', 'running', 'restoring'];
                const isAllowAbort = allowAbortStatusArr.includes(status);
                const {
                    'check_reason': reason,
                    'check_result': resultText,
                    'delete': delText,
                    abort,
                    aborting,
                } = taskManipulations;
                return (
                    <div style={{whiteSpace: 'nowrap'}}>
                        {status === FAILED && (
                            <a
                                style={{margin: '10px'}}
                                href={`/asyncTasks/result/${currentGraphSpace}/${currentGraph}/${taskId}`}
                            >
                                {reason}
                            </a>

                        )}
                        {isAllowCheckRes && (
                            <TaskAction onAction={viewResult} args={[result, rowData, index]}>
                                {resultText}
                            </TaskAction>
                        )}
                        {!isAllowAbort && (
                            status === DELETING
                                ? <Spin type="strong" />
                                : (
                                    <TaskAction onAction={onDeleteConfirm} args={[taskId]}>
                                        {delText}
                                    </TaskAction>
                                )
                        )}
                        {isAllowAbort && (
                            <TaskAction onAction={onAbortTaskHandler} args={[taskId]}>
                                {abort}
                            </TaskAction>
                        )}
                        {status === CANCELLING && (
                            <div><span style={{margin: '10px'}}>{aborting}</span></div>
                        )}
                    </div>
                );
            },
        },
    ];

    return (
        <div className={c.gremlinAsyncTaskDetail}>
            {size(currentSelectedRowKeys) !== 0 && (
                <div className={c.massDelete}>
                    <div className={c.left}>
                        <span style={{marginRight: '12px'}}>
                            {t('analysis.async_task.selected_count', {count: size(currentSelectedRowKeys)})}
                        </span>
                        <Button onClick={onMassDeleteConfirm}>
                            {t('analysis.async_task.batch_delete')}
                        </Button>
                    </div>
                    <Button
                        type='text'
                        className={c.clearSelection}
                        aria-label={t('analysis.async_task.clear_selection')}
                        title={t('analysis.async_task.clear_selection')}
                        icon={<CloseOutlined />}
                        onClick={clearSelectedRowKeys}
                    />
                </div>
            )}
            <Table
                rowKey='id'
                scroll={{x: 1000}}
                rowSelection={rowSelection}
                columns={columns}
                dataSource={asyncManageTaskDataRecords}
                onChange={onPageChange}
                pagination={{
                    position: ['bottomRight'],
                    total: asyncManageTaskDataTotal,
                    showSizeChanger: asyncManageTaskDataTotal > 10,
                    current: page,
                    pageSize: pageSize,
                }}
                loading={loading}
            />
        </div>
    );
};

export default AsyncTaskDetail;
