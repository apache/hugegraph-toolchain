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
    Alert, Table, Space, PageHeader, Row, Col, Input, Button, message, Modal, Spin, Empty,
    Card, Typography, Tag, Divider,
} from 'antd';
import EditLayer from './EditLayer';
import {useParams, useNavigate} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import * as api from '../../api/index';
import DataPreparationNav from '../../components/DataPreparationNav';
import {getResourceDisplayName} from '../../utils/displayName';
import CodeEditor from '../../components/CodeEditor';
import {BUILTIN_SCHEMA_TEMPLATES} from './builtinSchemaTemplates';
import {isPdEnabled} from '../../utils/config';
import {readWorkbenchGraphContext} from '../../utils/workbenchGraphContext';

const PAGE_ERROR_CONFIG = {suppressBusinessErrorToast: true};
const HIDDEN_BUILTINS_KEY = 'hubble.schema.hiddenBuiltinStartingPoints.v1';
const SCHEMA_DESIGN_URL = 'https://hugegraph.apache.org/docs/guides/desgin-concept/';

const loadHiddenBuiltins = () => {
    try {
        const stored = JSON.parse(window.localStorage.getItem(HIDDEN_BUILTINS_KEY));
        return Array.isArray(stored) ? stored : [];
    }
    catch (error) {
        return [];
    }
};

const saveHiddenBuiltins = names => {
    try {
        window.localStorage.setItem(HIDDEN_BUILTINS_KEY, JSON.stringify(names));
    }
    catch (error) {
        // The starting points still work when browser storage is unavailable.
    }
};

const SchemaActions = ({row, onEdit, onDelete}) => {
    const {t} = useTranslation();
    const handleEdit = useCallback(() => onEdit(row), [onEdit, row]);
    const handleDelete = useCallback(() => onDelete(row), [onDelete, row]);
    const stopPropagation = useCallback(event => event.stopPropagation(), []);

    return (
        <Space onClick={stopPropagation}>
            <Button
                type='link'
                aria-label={t('schema_template.action.edit_named', {name: row.name})}
                onClick={handleEdit}
            >
                {t('schema_template.action.edit')}
            </Button>
            <Button
                type='link'
                aria-label={t('schema_template.action.delete_named', {name: row.name})}
                onClick={handleDelete}
            >
                {t('schema_template.action.delete')}
            </Button>
        </Space>
    );
};

const Schema = () => {
    const {t} = useTranslation();
    const [data, setData] = useState([]);
    const [detail, setDetail] = useState({});
    const [mode, setMode] = useState('create');
    const [editLayer, setEditLayer] = useState(false);
    const [refresh, setRefresh] = useState(false);
    const [pagination, setPagination] = useState({current: 1, pageSize: 10});
    const [query, setQuery] = useState('');
    const [searchDraft, setSearchDraft] = useState('');
    const [graphspaceInfo, setGraphspaceInfo] = useState({});
    const [graphspaceLoading, setGraphspaceLoading] = useState(true);
    const [listLoading, setListLoading] = useState(true);
    const [graphspaceError, setGraphspaceError] = useState(false);
    const [listError, setListError] = useState(false);
    const [graphspaceRetry, setGraphspaceRetry] = useState(0);
    const [listRetry, setListRetry] = useState(0);
    const [graphspaceDataKey, setGraphspaceDataKey] = useState(null);
    const [listDataKey, setListDataKey] = useState(null);
    const [hiddenBuiltins, setHiddenBuiltins] = useState(loadHiddenBuiltins);
    const graphspaceRequest = useRef(null);
    const listRequest = useRef(null);
    const {graphspace} = useParams();
    const navigate = useNavigate();
    const pdMode = isPdEnabled();
    const workbenchContext = readWorkbenchGraphContext();
    const currentGraph = workbenchContext.graphspace === graphspace
        ? workbenchContext.graph
        : undefined;
    const templateApplyPath = currentGraph
        ? `/graphspace/${encodeURIComponent(graphspace)}`
            + `/graph/${encodeURIComponent(currentGraph)}/meta`
        : `/graphspace/${encodeURIComponent(graphspace)}`;
    const {current} = pagination;
    const listKey = JSON.stringify([graphspace, query, current]);

    const editSchema = useCallback(data => {
        setMode('edit');
        setDetail(data);
        setEditLayer(true);
    }, []);

    const createSchema = useCallback((startingPoint = {}) => {
        setMode('create');
        setDetail(startingPoint);
        setEditLayer(true);
    }, []);

    const applyBuiltin = useCallback(name => {
        createSchema({name, schema: BUILTIN_SCHEMA_TEMPLATES[name]});
    }, [createSchema]);

    const hideBuiltin = useCallback(name => {
        setHiddenBuiltins(value => {
            const next = [...new Set([...value, name])];
            saveHiddenBuiltins(next);
            return next;
        });
    }, []);

    const restoreBuiltins = useCallback(() => {
        saveHiddenBuiltins([]);
        setHiddenBuiltins([]);
    }, []);
    const openCreate = useCallback(() => createSchema(), [createSchema]);
    const applyBuiltinFromEvent = useCallback(event => {
        applyBuiltin(event.currentTarget.dataset.template);
    }, [applyBuiltin]);
    const hideBuiltinFromEvent = useCallback(event => {
        hideBuiltin(event.currentTarget.dataset.template);
    }, [hideBuiltin]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (pdMode && params.get('create') === 'true') {
            createSchema();
        }
    }, [createSchema, pdMode]);

    const handleTable = useCallback(newPagination => {
        setPagination(newPagination);
    }, []);

    const onSearch = useCallback(val => {
        setQuery(val);
        setPagination(value => ({...value, current: 1}));
    }, []);
    const onSearchDraftChange = useCallback(event => {
        setSearchDraft(event.target.value);
    }, []);

    const clearSearch = useCallback(() => {
        setSearchDraft('');
        setQuery('');
        setPagination(value => ({...value, current: 1}));
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
    ];
    if (pdMode) {
        columns.push({
            title: t('schema_template.column.operation'),
            render: row => (
                <SchemaActions
                    row={row}
                    onEdit={editSchema}
                    onDelete={deleteSchema}
                />
            ),
        });
    }

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
    const visibleBuiltins = Object.entries(BUILTIN_SCHEMA_TEMPLATES).filter(
        ([name]) => !pdMode || !hiddenBuiltins.includes(name)
    );
    const visibleGraphspaceName = graphspace === 'DEFAULT'
        ? t('graphspace.default_name')
        : getResourceDisplayName(
            graphspace,
            visibleGraphspaceInfo.nickname
        );

    return (
        <>
            <Spin spinning={graphspaceLoading || listLoading}>
                <PageHeader
                    ghost={false}
                    onBack={handleBack}
                    title={t(
                        pdMode
                            ? 'schema_template.title'
                            : 'schema_template.read_only.page_title',
                        {name: visibleGraphspaceName}
                    )}
                >
                    <Row justify='space-between'>
                        <Col>
                            {pdMode && (
                                <Space>
                                    <Button type='primary' onClick={openCreate}>
                                        {t('schema_template.create')}
                                    </Button>
                                </Space>
                            )}
                        </Col>
                        <Col>
                            <Input.Search
                                placeholder={t('schema_template.search_placeholder')}
                                value={searchDraft}
                                onChange={onSearchDraftChange}
                                onSearch={onSearch}
                                allowClear
                            />
                        </Col>
                    </Row>
                </PageHeader>

                <DataPreparationNav active='schema' graphspace={graphspace} />

                <div className='container'>
                    {!pdMode && (
                        <Alert
                            showIcon
                            type='info'
                            message={t('schema_template.read_only.title')}
                            description={t('schema_template.read_only.description')}
                            action={(
                                <Button type='primary' href={templateApplyPath}>
                                    {currentGraph
                                        ? t('schema_template.read_only.apply_to_graph', {
                                            graph: currentGraph,
                                        })
                                        : t('schema_template.read_only.choose_graph')}
                                </Button>
                            )}
                        />
                    )}
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
                    <Typography.Title level={4} id='schema-user-templates-heading'>
                        {t('schema_template.user_section.title')}
                    </Typography.Title>
                    <Typography.Paragraph type='secondary'>
                        {t('schema_template.user_section.description')}
                    </Typography.Paragraph>
                    <Table
                        aria-labelledby='schema-user-templates-heading'
                        columns={columns}
                        dataSource={visibleData}
                        rowKey='name'
                        bordered
                        size='small'
                        pagination={pagination}
                        onChange={handleTable}
                        expandable={{
                            expandRowByClick: true,
                            expandedRowRender: row => (
                                <div style={{padding: '16px 24px'}}>
                                    <CodeEditor
                                        value={row.schema || ''}
                                        lang='groovy'
                                        readOnly
                                        minHeight={240}
                                        ariaLabel={t('schema_template.row.expand', {
                                            name: row.name,
                                        })}
                                    />
                                </div>
                            ),
                            rowExpandable: row => Boolean(row.schema),
                        }}
                        locale={{
                            emptyText: query ? (
                                <Empty description={t('schema_template.no_matches')}>
                                    <Button onClick={clearSearch}>
                                        {t('schema_template.clear_search')}
                                    </Button>
                                </Empty>
                            ) : (
                                <Empty description={t('schema_template.empty')}>
                                    {pdMode && (
                                        <Button type='primary' onClick={openCreate}>
                                            {t('schema_template.create')}
                                        </Button>
                                    )}
                                </Empty>
                            ),
                        }}
                    />

                    <Divider />
                    <section aria-labelledby='schema-builtins-heading'>
                        <Row justify='space-between' align='middle'>
                            <Col>
                                <Typography.Title level={4} id='schema-builtins-heading'>
                                    {t('schema_template.builtin_section.title')}
                                </Typography.Title>
                                <Typography.Paragraph type='secondary'>
                                    {t('schema_template.builtin_section.description')}
                                </Typography.Paragraph>
                            </Col>
                            {pdMode && hiddenBuiltins.length > 0 && (
                                <Col>
                                    <Button onClick={restoreBuiltins}>
                                        {t('schema_template.builtin_section.restore')}
                                    </Button>
                                </Col>
                            )}
                        </Row>
                        <Row gutter={[16, 16]}>
                            {visibleBuiltins.map(([name, schema]) => (
                                <Col xs={24} lg={12} key={name}>
                                    <Card
                                        size='small'
                                        title={t(`schema_template.builtin.${name}`)}
                                        extra={pdMode ? (
                                            <Space size={4}>
                                                <Button
                                                    type='link'
                                                    size='small'
                                                    data-template={name}
                                                    aria-label={t(
                                                        'schema_template.builtin_section.use_named',
                                                        {name: t(`schema_template.builtin.${name}`)}
                                                    )}
                                                    onClick={applyBuiltinFromEvent}
                                                >
                                                    {t('schema_template.builtin_section.use')}
                                                </Button>
                                                <Button
                                                    type='link'
                                                    size='small'
                                                    data-template={name}
                                                    aria-label={t(
                                                        'schema_template.builtin_section'
                                                            + '.remove_named',
                                                        {name: t(`schema_template.builtin.${name}`)}
                                                    )}
                                                    onClick={hideBuiltinFromEvent}
                                                >
                                                    {t('schema_template.builtin_section.remove')}
                                                </Button>
                                                <Tag>
                                                    {t('schema_template.builtin_section.unsaved')}
                                                </Tag>
                                            </Space>
                                        ) : <Tag>{t('schema_template.read_only.builtin')}</Tag>}
                                    >
                                        <Typography.Paragraph type='secondary'>
                                            {t(`schema_template.builtin_description.${name}`)}
                                        </Typography.Paragraph>
                                        {!pdMode && (
                                            <CodeEditor
                                                value={schema}
                                                lang='groovy'
                                                readOnly
                                                minHeight={240}
                                                ariaLabel={t('schema_template.row.expand', {
                                                    name: t(`schema_template.builtin.${name}`),
                                                })}
                                            />
                                        )}
                                    </Card>
                                </Col>
                            ))}
                        </Row>
                    </section>
                    <Typography.Paragraph style={{marginTop: 20}}>
                        {t('schema_template.docs.intro')}{' '}
                        <a href={SCHEMA_DESIGN_URL} target='_blank' rel='noreferrer'>
                            {t('schema_template.docs.link')}
                        </a>
                    </Typography.Paragraph>
                    {pdMode && (
                        <EditLayer
                            visible={editLayer}
                            detail={detail}
                            mode={mode}
                            onCancel={hideEditLayer}
                            graphspace={graphspace}
                            refresh={handleRefresh}
                        />
                    )}
                </div>
            </Spin>
        </>
    );
};

export default Schema;
