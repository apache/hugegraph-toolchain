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
    Alert,
    Card,
    Table,
    Space,
    Row,
    Col,
    PageHeader,
    Button,
    Input,
    Radio,
    DatePicker,
    Empty,
    message,
    Modal,
    Pagination,
    Spin,
} from 'antd';
import {PlusOutlined} from '@ant-design/icons';
import {useState, useEffect, useCallback, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {EditLayer} from './EditLayer';
import {Link} from 'react-router-dom';
import GraphSpaceCard from './Card';
import style from './index.module.scss';
import * as api from '../../api/index';
import {useAuthContext} from '../../auth/AuthContext';
import {getResourceDisplayName} from '../../utils/displayName';
import {TopbarPageContextSlot} from '../../components/Topbar/PageContextSlot';

const PAGE_ERROR_CONFIG = {suppressBusinessErrorToast: true};

const showText = (val, suffix, unlimited, empty) => (
    val > 99999 ? (empty === undefined ? unlimited : empty) : `${val}${suffix}`
);

const GraphSpaceRowAction = ({onAction, value, children}) => {
    const handleClick = useCallback(() => onAction(value), [onAction, value]);

    return <Button type='link' onClick={handleClick}>{children}</Button>;
};

const GraphSpace = () => {
    const [data, setData] = useState([]);
    const [detail, setDetail] = useState({});
    const [editLayer, setEditLayer] = useState(false);
    const [listType, setListType] = useState('image');
    const [refresh, setRefresh] = useState('false');
    const [dateData, setDateData] = useState('');
    const [graphspacename, setGraphspacename] = useState('');
    const [pagination, setPagination] = useState({total: 0, current: 1, pageSize: 11});
    const [loading, setLoading] = useState(false);
    const [listError, setListError] = useState(false);
    const listRequest = useRef(null);
    const {t} = useTranslation();
    const {context} = useAuthContext();
    const graphspaceActions = context?.actions?.graphspaces ?? [];
    const canCreateGraphspace = graphspaceActions.includes('create');
    const canUpdateGraphspace = graphspaceActions.includes('update');
    const canDeleteGraphspace = graphspaceActions.includes('delete');

    const handleCreate = useCallback(() => {
        setEditLayer(true);
        setDetail({});
    }, []);

    const handleCreateKeyDown = useCallback(event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleCreate();
        }
    }, [handleCreate]);

    const editGraphspace = useCallback(detail => {
        setDetail(detail);
        setEditLayer(true);
    }, []);

    const handleListType = useCallback(e => {
        setListType(e.target.value);
        setPagination(value => ({
            ...value,
            current: 1,
            pageSize: 11,
        }));
    }, []);

    const deleteGraphspace = useCallback(graphspace => {
        Modal.confirm({
            title: t('graphspace.delete_confirm'),
            content: t('graphspace.delete_content'),
            onOk: () => {
                return api.manage.delGraphSpace(graphspace, PAGE_ERROR_CONFIG).then(res => {
                    if (res.status === 200) {
                        message.success(t('common.msg.delete_success'));
                        setRefresh(value => !value);
                        return;
                    }
                    message.error(t('common.msg.operation_failed'));
                }).catch(() => message.error(t('common.msg.operation_failed')));
            },
        });
    }, [t]);

    const handlePage = useCallback(current => {
        setPagination(value => ({...value, current}));
    }, []);

    const handleTable = useCallback(pagination => {
        setPagination(pagination);
    }, []);

    const handleSearch = useCallback(value => {
        setGraphspacename(value);
        setRefresh(value => !value);
    }, []);

    const handleDatePickerChange = useCallback((_, val) => {
        setDateData(val);
        setRefresh(value => !value);
    }, []);

    const handleRefresh = useCallback(() => setRefresh(value => !value), []);

    const handleInit = useCallback(() => {
        api.manage.initBuiltin({init_space: true, init_hlm: true, init_covid19: true},
            PAGE_ERROR_CONFIG).then(res => {
            if (res.status === 200) {
                message.success(t('common.msg.init_success'));
                setRefresh(value => !value);
                return;
            }
            message.error(t('common.msg.operation_failed'));
        }).catch(() => message.error(t('common.msg.operation_failed')));
    }, [t]);

    const hideEditLayer = useCallback(() => {
        setEditLayer(false);
    }, []);

    const columns = [
        {
            title: t('graphspace.col.name'),
            render: row => (
                <>
                    <Link to={`/graphspace/${row.name}`}>
                        {getResourceDisplayName(row.name, row.nickname)}
                    </Link>
                    {row.default && <span className={style.default}>{t('common.label.default')}</span>}
                </>
            ),
        },
        {
            title: t('graphspace.col.auth'),
            dataIndex: 'auth',
            width: 120,
            align: 'center',
            render: val => t(val ? 'graphspace.auth_yes' : 'graphspace.auth_no'),
        },
        {
            title: t('graphspace.col.description'),
            dataIndex: 'description',
            ellipsis: true,
        },
        {
            title: t('graphspace.col.graph_service'),
            dataIndex: 'cpu_limit',
            // eslint-disable-next-line max-len
            render: (_, row) => `${showText(row.cpu_limit, t('graphspace.unit.cpu'), t('graphspace.unit.unlimited'))}/${showText(row.memory_limit, t('graphspace.unit.memory'), t('graphspace.unit.unlimited'))}/${row.oltp_namespace}`,
            ellipsis: true,
        },
        {
            title: t('graphspace.col.compute_task'),
            dataIndex: 'task',
            // eslint-disable-next-line max-len
            render: (_, row) => `${showText(row.compute_cpu_limit, t('graphspace.unit.cpu'), t('graphspace.unit.unlimited'))}/${showText(row.compute_memory_limit, t('graphspace.unit.memory'), t('graphspace.unit.unlimited'))}/${row.olap_namespace}`,
            ellipsis: true,
        },
        {
            title: t('graphspace.col.storage_limit'),
            dataIndex: 'storage_limit',
            width: 150,
            align: 'center',
            render: val => showText(val, t('graphspace.unit.memory'), t('graphspace.unit.unlimited')),
        },
        {
            title: t('graphspace.col.operation'),
            width: 280,
            align: 'center',
            render: row => {
                return (
                    row.name === 'neizhianli' ? (
                        <Space wrap>
                            <Link to={`/graphspace/${row.name}/schema`}>
                                {t('common.action.schema_manage')}
                            </Link>
                            {canCreateGraphspace && (
                                <Button type='link' onClick={handleInit}>
                                    {t('common.action.init')}
                                </Button>
                            )}
                        </Space>
                    ) : (
                        <Space wrap>
                            {!canUpdateGraphspace ? null : (row.default)
                                ? <span className={style.disable}>{t('common.action.edit')}</span>
                                : (
                                    <GraphSpaceRowAction onAction={editGraphspace} value={row}>
                                        {t('common.action.edit')}
                                    </GraphSpaceRowAction>
                                )
                            }
                            {!canDeleteGraphspace ? null : (row.default)
                                ? <span className={style.disable}>{t('common.action.delete')}</span>
                                : (
                                    <GraphSpaceRowAction
                                        onAction={deleteGraphspace}
                                        value={row.name}
                                    >
                                        {t('common.action.delete')}
                                    </GraphSpaceRowAction>
                                )
                            }
                            <Link to={`/graphspace/${row.name}/schema`}>
                                {t('common.action.schema_manage')}
                            </Link>
                        </Space>
                    )
                );
            },
        },
    ];

    const {current, pageSize} = pagination;

    const loadGraphspaces = useCallback(async () => {
        const token = Symbol('graphspace-list');
        listRequest.current = token;
        setLoading(true);
        setListError(false);
        setData([]);
        try {
            const res = await api.manage.getGraphSpaceList({
                create_time: dateData,
                query: graphspacename,
                page_no: current,
                page_size: pageSize,
            }, PAGE_ERROR_CONFIG);
            if (listRequest.current !== token) {
                return;
            }
            if (res.status === 200) {
                setData(res.data.records);
                setPagination(value => ({...value, total: res.data.total}));
                return;
            }
            setListError(true);
        }
        catch (error) {
            if (listRequest.current === token) {
                setListError(true);
            }
        }
        finally {
            if (listRequest.current === token) {
                setLoading(false);
            }
        }
    }, [current, dateData, graphspacename, pageSize]);

    useEffect(() => {
        loadGraphspaces();
        return () => {
            listRequest.current = null;
        };
    }, [refresh, listType, loadGraphspaces]);

    return (
        <>
            <PageHeader
                ghost={false}
                onBack={false}
                title={t('graphspace.title')}
            >
                <Row justify='space-between'>
                    <Col>
                        <Space>
                            {listType === 'list' && canCreateGraphspace
                                && !loading && !listError && (
                                <Button
                                    type='primary'
                                    icon={<PlusOutlined />}
                                    onClick={handleCreate}
                                    aria-label={t('graphspace.create')}
                                >
                                    {t('graphspace.create')}
                                </Button>
                            )}
                            <DatePicker onChange={handleDatePickerChange} />
                        </Space>
                    </Col>
                    <Col>
                        <Space>
                            <TopbarPageContextSlot>
                                <Radio.Group
                                    role='radiogroup'
                                    aria-label={t('graphspace.view_mode')}
                                    options={[
                                        {label: t('common.label.view_mode'), value: 'image'},
                                        {label: t('common.label.list_mode'), value: 'list'},
                                    ]}
                                    optionType='button'
                                    buttonStyle='solid'
                                    value={listType}
                                    onChange={handleListType}
                                />
                            </TopbarPageContextSlot>
                            <Input.Search
                                placeholder={t('graphspace.search_placeholder')}
                                onSearch={handleSearch}
                                allowClear
                            />
                        </Space>
                    </Col>
                </Row>
            </PageHeader>

            <div className='container'>
                {listError && (
                    <Alert
                        type='error'
                        showIcon
                        message={t('graphspace.load.unavailable')}
                        action={(
                            <Button size='small' onClick={loadGraphspaces}>
                                {t('graphspace.load.retry')}
                            </Button>
                        )}
                    />
                )}
                <Spin spinning={loading}>
                    {listType === 'image'
                        ? (
                            <>
                                <Row gutter={[10, 10]} justify='start'>
                                    {!loading && !listError && data.length === 0 && (
                                        <Col span={canCreateGraphspace ? 16 : 24}>
                                            <Empty
                                                description={t(graphspacename || dateData
                                                    ? 'graphspace.no_matches'
                                                    : 'graphspace.empty')}
                                            />
                                        </Col>
                                    )}
                                    {data.map(item => {
                                        return (
                                            <Col span={8} key={item.name}>
                                                <GraphSpaceCard
                                                    item={item}
                                                    deleteGraphspace={deleteGraphspace}
                                                    editGraphspace={editGraphspace}
                                                    handleInit={handleInit}
                                                    canUpdate={canUpdateGraphspace}
                                                    canDelete={canDeleteGraphspace}
                                                    canInit={canCreateGraphspace}
                                                />
                                            </Col>
                                        );
                                    })}
                                    {!loading && !listError && canCreateGraphspace && (
                                        <Col span={8} key='add'>
                                            <Card
                                                className={style.add_card}
                                                onClick={handleCreate}
                                                role='button'
                                                aria-label={t('graphspace.create')}
                                                tabIndex={0}
                                                onKeyDown={handleCreateKeyDown}
                                            >
                                                <Space>
                                                    <PlusOutlined />
                                                    {t('graphspace.create')}
                                                </Space>
                                            </Card>
                                        </Col>
                                    )}
                                </Row>
                                <br />
                                <Row justify='end'>
                                    <Col>
                                        <Pagination
                                            onChange={handlePage}
                                            total={pagination.total}
                                            pageSize={pagination.pageSize}
                                            current={pagination.current}
                                            showSizeChanger={false}
                                        />
                                    </Col>
                                </Row>
                            </>
                        ) : (
                            <>
                                <Table
                                    columns={columns}
                                    dataSource={data}
                                    rowKey='name'
                                    pagination={pagination}
                                    onChange={handleTable}
                                />
                            </>
                        )
                    }
                </Spin>
                <EditLayer
                    visible={editLayer}
                    onCancel={hideEditLayer}
                    detail={detail}
                    refresh={handleRefresh}
                />
            </div>
        </>
    );
};

export default GraphSpace;
