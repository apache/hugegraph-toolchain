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
 * @file gremlin表格 执行记录
 */

import {useState, useCallback} from 'react';
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

const FAILURE_REASON_KEYS = new Set([
    'GREMLIN_EXECUTION_FAILED',
]);

export function failureReasonDescription(rowData, t) {
    if (rowData.status !== 'FAILED'
        || !FAILURE_REASON_KEYS.has(rowData.failure_reason)) {
        return null;
    }
    return t(`analysis.logs.failure_reason.${rowData.failure_reason}`);
}

function getRowKey(item) {
    return item.id;
}

const ExecuteLogActions = props => {
    const {
        text, rowData, index, favoriteContent, onAddFavorite, onFavoriteCard,
        loadStatements, disabledFavorite, t,
    } = props;
    const handleAddFavorite = useCallback(
        () => onAddFavorite(rowData.content),
        [onAddFavorite, rowData.content]
    );
    const handleLoadStatements = useCallback(
        () => loadStatements(text, rowData, index),
        [index, loadStatements, rowData, text]
    );

    return (
        <div className={c.manipulation}>
            <Popconfirm
                placement="left"
                title={favoriteContent(rowData)}
                onConfirm={handleAddFavorite}
                okButtonProps={{disabled: disabledFavorite}}
                okText={t('analysis.logs.action.favorite')}
                cancelText={t('common.action.cancel')}
            >
                <Button type='link' onClick={onFavoriteCard}>
                    {t('analysis.logs.action.favorite')}
                </Button>
            </Popconfirm>
            <Button type='link' style={{marginLeft: '8px'}} onClick={handleLoadStatements}>
                {t('analysis.logs.action.load_statement')}
            </Button>
        </div>
    );
};

const ExecuteLog = props => {
    const {t} = useTranslation();
    const {
        executeLogsDataRecords,
        executeLogsDataTotal,
        isLoading,
        pageExecute,
        pageSize,
        onExecutePageChange,
        onAddCollection,
        onLoadContent,
    } = props;

    const [favoriteName, setFavoriteName] = useState();

    const loadStatements = useCallback(
        (text, rowData, index) => {
            onLoadContent(rowData.content);
            const headerTabNode = document.getElementById('queryBar');
            window.scrollTo(0, headerTabNode.offsetTop);
        },
        [onLoadContent]
    );

    const onFavoraiteName = useCallback(
        e => {
            setFavoriteName(e.target.value);
        },
        []
    );

    const onFavoriteCard = useCallback(
        () => {
            setFavoriteName('');
        },
        []
    );

    const updateAddCollection = useCallback(
        content => {
            onAddCollection(content, favoriteName);
        },
        [favoriteName, onAddCollection]
    );

    const onAddFavorite = useCallback(
        content => {
            updateAddCollection(content);
        },
        [updateAddCollection]
    );

    const favoriteContent = useCallback(
        () => (
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
        ),
        [favoriteName, onFavoraiteName, t]
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
                return text.split('\n')[1] ? (
                    <ExecutionContent
                        content={text}
                        highlightText=""
                    />
                ) : (
                    <div className={c.breakWord}>
                        {text}
                    </div>
                );
            },
        },
        {
            title: t('analysis.logs.column.status'),
            dataIndex: 'status',
            width: '10%',
            render: (status, rowData) => {
                const failureReason = failureReasonDescription(rowData, t);
                return (
                    <>
                        <Space>
                            <Tag color={statusColor[status]} key={status}>
                                {statusDesc(status)}
                            </Tag>
                        </Space>
                        {failureReason && (
                            <div className={c.breakWord}>{failureReason}</div>
                        )}
                    </>
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
                    <ExecuteLogActions
                        text={text}
                        rowData={rowData}
                        index={index}
                        favoriteContent={favoriteContent}
                        onAddFavorite={onAddFavorite}
                        onFavoriteCard={onFavoriteCard}
                        loadStatements={loadStatements}
                        disabledFavorite={!isValidFavoriteName(favoriteName)}
                        t={t}
                    />
                );
            },
        },
    ];


    return (
        <Table
            columns={executeLogColumns}
            dataSource={executeLogsDataRecords}
            rowKey={getRowKey}
            pagination={{
                onChange: onExecutePageChange,
                position: ['bottomRight'],
                total: executeLogsDataTotal,
                showSizeChanger: executeLogsDataTotal > 10,
                current: pageExecute,
                pageSize: pageSize,
            }}
            loading={isLoading}
        />
    );
};

export default ExecuteLog;
