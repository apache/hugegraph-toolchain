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

import {useCallback, useState, useEffect, useRef} from 'react';
import {
    Alert, Table, Space, PageHeader, Row, Col, Input, Button, message, Modal, Spin,
} from 'antd';
import EditLayer from './EditLayer';
import {useParams, useNavigate} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import * as api from '../../api/index';
import DataPreparationNav from '../../components/DataPreparationNav';

const PAGE_ERROR_CONFIG = {suppressBusinessErrorToast: true};

const SchemaActions = ({row, onView, onEdit, onDelete}) => {
    const {t} = useTranslation();
    const handleView = useCallback(() => onView(row), [onView, row]);
    const handleEdit = useCallback(() => onEdit(row), [onEdit, row]);
    const handleDelete = useCallback(() => onDelete(row), [onDelete, row]);

    return (
        <Space>
            <Button type='link' onClick={handleView}>{t('schema_template.action.view')}</Button>
            <Button type='link' onClick={handleEdit}>{t('schema_template.action.edit')}</Button>
            <Button type='link' onClick={handleDelete}>{t('schema_template.action.delete')}</Button>
        </Space>
    );
};

const Schema = () => {
    const {t} = useTranslation();
    const [data, setData] = useState([]);
    const [detail, setDetail] = useState({});
    const [mode, setMode] = useState('view');
    const [editLayer, setEditLayer] = useState(false);
    const [refresh, setRefresh] = useState(false);
    const [pagination, setPagination] = useState({current: 1, pageSize: 10});
    const [query, setQuery] = useState('');
    const [graphspaceInfo, setGraphspaceInfo] = useState({});
    const [graphspaceLoading, setGraphspaceLoading] = useState(true);
    const [listLoading, setListLoading] = useState(true);
    const [graphspaceError, setGraphspaceError] = useState(false);
    const [listError, setListError] = useState(false);
    const [graphspaceRetry, setGraphspaceRetry] = useState(0);
    const [listRetry, setListRetry] = useState(0);
    const [graphspaceDataKey, setGraphspaceDataKey] = useState(null);
    const [listDataKey, setListDataKey] = useState(null);
    const graphspaceRequest = useRef(null);
    const listRequest = useRef(null);
    const {graphspace} = useParams();
    const navigate = useNavigate();
    const {current} = pagination;
    const listKey = JSON.stringify([graphspace, query, current]);

    const viewSchema = useCallback(data => {
        setMode('view');
        setDetail(data);
        setEditLayer(true);
    }, []);

    const editSchema = useCallback(data => {
        setMode('edit');
        setDetail(data);
        setEditLayer(true);
    }, []);

    const createSchema = useCallback(() => {
        setMode('create');
        setDetail({});
        setEditLayer(true);
    }, []);

    const handleTable = useCallback(newPagination => {
        setPagination(newPagination);
    }, []);

    const onSearch = useCallback(val => {
        setQuery(val);
    }, []);

    const deleteSchema = useCallback(row => {
        Modal.confirm({
            title: t('schema_template.delete_confirm', {name: row.name}),
            onOk: () => {
                return api.manage.delSchema(graphspace, row.name, PAGE_ERROR_CONFIG).then(res => {
                    if (res.status === 200) {
                        message.success(t('schema_template.delete_success'));
                        setRefresh(value => !value);
                        return;
                    }

                    message.error(t('common.msg.operation_failed'));
                }).catch(() => message.error(t('common.msg.operation_failed')));
            },
        });
    }, [graphspace, t]);

    const handleBack = useCallback(() => navigate('/graphspace'), [navigate]);
    const hideEditLayer = useCallback(() => setEditLayer(false), []);
    const handleRefresh = useCallback(() => setRefresh(value => !value), []);
    const retryGraphspace = useCallback(() => setGraphspaceRetry(value => value + 1), []);
    const retryList = useCallback(() => setListRetry(value => value + 1), []);

    const columns = [
        {
            title: t('schema_template.column.name'),
            dataIndex: 'name',
        },
        {
            title: t('schema_template.column.created_at'),
            dataIndex: 'create_time',
        },
        {
            title: t('schema_template.column.updated_at'),
            dataIndex: 'update_time',
        },
        {
            title: t('schema_template.column.creator'),
            dataIndex: 'creator',
        },
        {
            title: t('schema_template.column.operation'),
            render: row => (
                <SchemaActions
                    row={row}
                    onView={viewSchema}
                    onEdit={editSchema}
                    onDelete={deleteSchema}
                />
            ),
        },
    ];

    useEffect(() => {
        const token = Symbol('schema-graphspace');
        graphspaceRequest.current = token;
        setGraphspaceLoading(true);
        setGraphspaceError(false);
        api.manage.getGraphSpace(graphspace, PAGE_ERROR_CONFIG).then(res => {
            if (graphspaceRequest.current !== token) {
                return;
            }
            if (res.status === 200) {
                setGraphspaceInfo(res.data);
                setGraphspaceDataKey(graphspace);
                return;
            }

            setGraphspaceInfo({});
            setGraphspaceDataKey(graphspace);
            setGraphspaceError(true);
        }).catch(() => {
            if (graphspaceRequest.current === token) {
                setGraphspaceInfo({});
                setGraphspaceDataKey(graphspace);
                setGraphspaceError(true);
            }
        }).finally(() => {
            if (graphspaceRequest.current === token) {
                setGraphspaceLoading(false);
            }
        });

        return () => {
            if (graphspaceRequest.current === token) {
                graphspaceRequest.current = null;
            }
        };
    }, [graphspace, graphspaceRetry]);

    useEffect(() => {
        const token = Symbol('schema-list');
        listRequest.current = token;
        setListLoading(true);
        setListError(false);
        api.manage.getSchemaList(graphspace, {
            query,
            page_no: current,
        }, PAGE_ERROR_CONFIG).then(res => {
            if (listRequest.current !== token) {
                return;
            }
            if (res.status === 200) {
                setData(res.data.records);
                setListDataKey(listKey);
                setPagination(value => ({...value, total: res.data.total}));
                return;
            }
            setData([]);
            setListDataKey(listKey);
            setListError(true);
        }).catch(() => {
            if (listRequest.current === token) {
                setData([]);
                setListDataKey(listKey);
                setListError(true);
            }
        }).finally(() => {
            if (listRequest.current === token) {
                setListLoading(false);
            }
        });

        return () => {
            if (listRequest.current === token) {
                listRequest.current = null;
            }
        };
    }, [graphspace, refresh, listRetry, current, query, listKey]);

    const visibleGraphspaceInfo = graphspaceDataKey === graphspace
        ? graphspaceInfo
        : {};
    const visibleData = listDataKey === listKey ? data : [];

    return (
        <>
            <Spin spinning={graphspaceLoading || listLoading}>
                <PageHeader
                    ghost={false}
                    onBack={handleBack}
                    title={t('schema_template.title', {
                        name: visibleGraphspaceInfo.nickname ?? graphspace,
                    })}
                >
                    <Row justify='space-between'>
                        <Col>
                            <Space>
                                <Button type='primary' onClick={createSchema}>
                                    {t('schema_template.create')}
                                </Button>
                            </Space>
                        </Col>
                        <Col>
                            <Input.Search
                                placeholder={t('schema_template.search_placeholder')}
                                onSearch={onSearch}
                            />
                        </Col>
                    </Row>
                </PageHeader>

                <DataPreparationNav active='schema' graphspace={graphspace} />

                <div className='container'>
                    {graphspaceError && graphspaceDataKey === graphspace && (
                        <Alert
                            showIcon
                            type='error'
                            message={t('schema_template.graphspace_failed')}
                            action={(
                                <Button size='small' onClick={retryGraphspace}>
                                    {t('schema_template.retry_graphspace')}
                                </Button>
                            )}
                        />
                    )}
                    {listError && listDataKey === listKey && (
                        <Alert
                            showIcon
                            type='error'
                            message={t('schema_template.load_failed')}
                            action={(
                                <Button size='small' onClick={retryList}>
                                    {t('schema_template.retry')}
                                </Button>
                            )}
                        />
                    )}
                    <Table
                        columns={columns}
                        dataSource={visibleData}
                        bordered
                        size='small'
                        pagination={pagination}
                        onChange={handleTable}
                    />
                    <EditLayer
                        visible={editLayer}
                        detail={detail}
                        mode={mode}
                        onCancel={hideEditLayer}
                        graphspace={graphspace}
                        refresh={handleRefresh}
                    />
                </div>
            </Spin>
        </>
    );
};

export default Schema;
