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

import {useState, useCallback, useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, Table, Space, Tag, Popconfirm, Tooltip, message} from 'antd';
import ExecutionContent from '../../../../components/ExecutionContent';
import FavoriteNameInput from '../../../../components/FavoriteNameInput';
import ColumnSettings, {
    useColumnSettings,
} from '../../../../components/ColumnSettings';
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
const REQUIRED_EXECUTE_COLUMNS = ['action'];
const DEFAULT_EXECUTE_COLUMN_PREFERENCES = {hidden: ['type']};

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

export async function copyStatement(content, t) {
    try {
        await navigator.clipboard.writeText(content);
        message.success(t('analysis.logs.copy_success'));
    }
    catch (error) {
        message.error(t('analysis.logs.copy_failed'));
    }
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
    const handleCopyStatement = useCallback(
        () => copyStatement(rowData.content, t),
        [rowData.content, t]
    );

    return (
        <div className={c.manipulation}>
            <Button type='link' onClick={handleLoadStatements}>
                {t('analysis.logs.action.load_statement')}
            </Button>
            <Button type='link' onClick={handleCopyStatement}>
                {t('analysis.logs.action.copy_statement')}
            </Button>
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

    const typeDesc = useCallback(type => {
        const typeKey = EXECUTE_TYPE_KEY[type];
        return typeKey ? t(`analysis.logs.type.${typeKey}`) : type;
    }, [t]);

    const statusDesc = useCallback(status => {
        const statusKey = EXECUTE_STATUS_KEY[status];
        return statusKey ? t(`analysis.logs.status.${statusKey}`) : status;
    }, [t]);

    const executeLogColumns = useMemo(() => [
        {
            key: 'time',
            title: t('analysis.logs.column.time'),
            dataIndex: 'create_time',
            width: '20%',
        },
        {
            key: 'content',
            title: t('analysis.logs.column.content'),
            dataIndex: 'content',
            width: '30%',
            render: (text, rowData, index) => {
                return (
                    <Tooltip
                        placement='top'
                        title={t('analysis.logs.click_to_copy')}
                    >
                        <button
                            type='button'
                            className={c.statementCell}
                            aria-label={`${t('analysis.logs.click_to_copy')}: ${text}`}
                            onClick={() => copyStatement(text, t)}
                        >
                            {text.split('\n')[1] ? (
                                <ExecutionContent
                                    content={text}
                                    highlightText=""
                                />
                            ) : (
                                <span className={c.breakWord}>
                                    {text}
                                </span>
                            )}
                        </button>
                    </Tooltip>
                );
            },
        },
        {
            key: 'status',
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
            key: 'duration',
            title: t('analysis.logs.column.duration'),
            dataIndex: 'duration',
            width: '10%',
        },
        {
            key: 'action',
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
        {
            key: 'type',
            title: t('analysis.logs.column.type'),
            dataIndex: 'type',
            width: '15%',
            render: type => typeDesc(type),
        },
    ], [favoriteContent, favoriteName, loadStatements, onAddFavorite,
        onFavoriteCard, statusDesc, t, typeDesc]);

    const columnSettings = useColumnSettings(
        executeLogColumns,
        'hubble.analysis.execution-log.columns.v2',
        REQUIRED_EXECUTE_COLUMNS,
        DEFAULT_EXECUTE_COLUMN_PREFERENCES
    );
    const columnSettingsLabels = useMemo(
        () => ({
            title: t('analysis.logs.column_settings.title'),
            moveUp: t('analysis.logs.column_settings.move_up'),
            moveDown: t('analysis.logs.column_settings.move_down'),
            reset: t('analysis.logs.column_settings.reset'),
        }),
        [t]
    );
    const displayedColumns = useMemo(
        () => columnSettings.columns.map((column, index) => {
            if (index !== columnSettings.columns.length - 1) {
                return column;
            }
            return {
                ...column,
                title: (
                    <div className={c.columnHeaderTools}>
                        <span>{column.title}</span>
                        <ColumnSettings
                            columns={executeLogColumns}
                            preferences={columnSettings.preferences}
                            setPreferences={columnSettings.setPreferences}
                            reset={columnSettings.reset}
                            requiredKeys={REQUIRED_EXECUTE_COLUMNS}
                            labels={columnSettingsLabels}
                        />
                    </div>
                ),
            };
        }),
        [columnSettings.columns, columnSettings.preferences, columnSettings.reset,
            columnSettings.setPreferences, columnSettingsLabels, executeLogColumns]
    );


    return (
        <Table
            columns={displayedColumns}
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
            scroll={{y: 360}}
            loading={isLoading}
        />
    );
};

export default ExecuteLog;
