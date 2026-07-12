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
 * @file 图算法 执行记录
 */

import React, {useState, useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, Table, Space, Tag, Popconfirm} from 'antd';
import ExecutionContent from '../../../../components/ExecutionContent';
import FavoriteNameInput from '../../../../components/FavoriteNameInput';
import {isValidFavoriteName} from '../../../../utils/rules';
import c from './index.module.scss';

const EXECUTE_TYPE_KEY = {
    GREMLIN: 'GREMLIN',
    GREMLIN_ASYNC: 'GREMLIN_ASYNC',
    ALGORITHM: 'ALGORITHM',
    CYPHER: 'CYPHER',
};

const EXECUTE_STATUS_KEY = {
    SUCCESS: 'SUCCESS',
    ASYNC_TASK_SUCCESS: 'ASYNC_TASK_SUCCESS',
    ASYNC_TASK_RUNNING: 'ASYNC_TASK_RUNNING',
    RUNNING: 'RUNNING',
    FAILED: 'FAILED',
    ASYNC_TASK_FAILED: 'ASYNC_TASK_FAILED',
};

const statusColor =  {
    SUCCESS: 'green',
    ASYNC_TASK_SUCCESS: 'green',
    ASYNC_TASK_RUNNING: 'geekblue',
    RUNNING: 'geekblue',
    FAILED: 'volcano',
    ASYNC_TASK_FAILED: 'volcano',
};

const createValueHandler = (handler, value) => () => handler(value);
const getRowKey = item => item.id;

const ExecuteLog = props => {
    const {t} = useTranslation();
    const {
        isLoading,
        pageExecute,
        pageSize,
        onExecutePageChange,
        onAddCollection,
        executionLogsDataRecords,
        executionLogsDataTotal,
    } = props;

    const [favoriteName, setFavoriteName] = useState();

    const onFavoraiteName = useCallback(
        e => {
            setFavoriteName(e.target.value);
        }, []);

    const onFavoriteCard = useCallback(() => {
        setFavoriteName('');
    }, []);

    const updateAddCollection = useCallback(
        content => {
            onAddCollection(content, favoriteName);
        },
        [favoriteName, onAddCollection]
    );

    const onAddFavorite = useCallback(
        content => {
            updateAddCollection(content);
        }, [updateAddCollection]);

    const favoriteContent = rowData => (
        <>
            <div style={{marginBottom: '16px'}}>
                {t('analysis.logs.favorite_statement')}
            </div>
            <FavoriteNameInput
                style={{marginBottom: '18px'}}
                placeholder={t('analysis.logs.favorite_name_placeholder')}
                value={favoriteName}
                onChange={onFavoraiteName}
            />
        </>
    );

    const typeDesc = type => {
        const typeKey = EXECUTE_TYPE_KEY[type];
        return typeKey ? t(`analysis.logs.type.${typeKey}`) : type;
    };

    const statusDesc = status => {
        const statusKey = EXECUTE_STATUS_KEY[status];
        return statusKey ? t(`analysis.logs.status.${statusKey}`) : status;
    };

    const executeLogColumns = [
        {
            title: t('analysis.logs.column.time'),
            dataIndex: 'create_time',
            width: '20%',
        },
        {
            title: t('analysis.logs.column.type'),
            dataIndex: 'type',
            width: '15%',
            render: type => typeDesc(type),
        },
        {
            title: t('analysis.logs.column.content'),
            dataIndex: 'content',
            width: '30%',
            render: (text, rowData, index) => {
                return text.split('\n')[1] ? <ExecutionContent content={text} highlightText="" />
                    : <div className={c.breakWord}>{text}</div>;
            },
        },
        {
            title: t('analysis.logs.column.status'),
            dataIndex: 'status',
            width: '10%',
            render: status => {
                return (
                    <Space>
                        <Tag color={statusColor[status]} key={status}>
                            {statusDesc(status)}
                        </Tag>
                    </Space>
                );
            },
        },
        {
            title: t('analysis.logs.column.duration'),
            dataIndex: 'duration',
            width: '10%',
        },
        {
            title: t('analysis.logs.column.action'),
            dataIndex: 'manipulation',
            width: '15%',
            render: (text, rowData, index) => {
                return (
                    <div className={c.manipulation}>
                        <Popconfirm
                            placement="left"
                            title={favoriteContent(rowData)}
                            onConfirm={createValueHandler(onAddFavorite, rowData.content)}
                            okButtonProps={{disabled: !isValidFavoriteName(favoriteName)}}
                            okText={t('analysis.logs.action.favorite')}
                            cancelText={t('common.action.cancel')}
                        >
                            <Button type='link' onClick={onFavoriteCard}>
                                {t('analysis.logs.action.favorite')}
                            </Button>
                        </Popconfirm>
                    </div>
                );
            },
        },
    ];

    return (
        <Table
            columns={executeLogColumns}
            dataSource={executionLogsDataRecords}
            rowKey={getRowKey}
            pagination={{
                onChange: onExecutePageChange,
                position: ['bottomRight'],
                total: executionLogsDataTotal,
                showSizeChanger: executionLogsDataTotal > 10,
                current: pageExecute,
                pageSize: pageSize,
            }}
            loading={isLoading}
        />
    );
};

export default ExecuteLog;
