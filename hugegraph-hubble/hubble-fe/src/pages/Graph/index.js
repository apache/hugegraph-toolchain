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
    Table,
    Space,
    Row,
    Col,
    PageHeader,
    Button,
    Input,
    Radio,
    DatePicker,
    Card,
    Modal,
    message,
    Pagination,
    Spin,
    Alert,
    Tooltip,
    Empty,
} from 'antd';
import {useState, useEffect, useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import {EditLayer, ViewLayer} from './EditLayer';
import {PlusOutlined} from '@ant-design/icons';
import {Link, useParams, useNavigate} from 'react-router-dom';
import style from './index.module.scss';
import * as api from '../../api';
import {isPdEnabled} from '../../utils/config';
import {
    DEFAULT_GRAPHSPACE,
    isGraphCreateEnabled,
    isGraphDefaultMutationEnabled,
} from '../../utils/productMode';
import moment from 'moment';
import GraphCard from './Card';
import ClearGraphConfirmModal from './ClearGraphConfirmModal';
import KeyboardAction from '../../components/KeyboardAction';
import {getResourceDisplayName} from '../../utils/displayName';
import {useAuthContext} from '../../auth/AuthContext';
import {sanitizePublicError} from '../../utils/publicError';
import EditableNicknameCell from './EditableNicknameCell';
import {TopbarPageContextSlot} from '../../components/Topbar/PageContextSlot';

const GraphRowAction = ({onAction, graph, children}) => {
    const handleClick = useCallback(() => onAction(graph), [graph, onAction]);

    return <Button type='link' onClick={handleClick}>{children}</Button>;
};

const GraphNicknameColumn = ({canEdit, onSave, row, t}) => {
    const handleSave = useCallback(nickname => onSave(row, nickname), [onSave, row]);
    const renderValue = useCallback(displayName => (
        <Link to={`/gremlin/${row.graphspace || 'DEFAULT'}/${row.name}`}>
            {displayName}
            {row.default && (
                <span className={style.default}>
                    {t('common.label.default')}
                </span>
            )}
        </Link>
    ), [row, t]);

    return (
        <EditableNicknameCell
            canEdit={canEdit}
            name={row.name}
            nickname={row.nickname}
            onSave={handleSave}
            renderValue={renderValue}
        />
    );
};

const Graph = () => {
    const {t} = useTranslation();
    const [data, setData] = useState([]);
    const [dateData, setDateData] = useState('');
    const [graphname, setGraphname] = useState('');
    const [searchText, setSearchText] = useState('');
    const [editLayer, setEditLayer] = useState(false);
    const [viewLayer, setViewLayer] = useState(false);
    const [selectGraph, setSelectGraph] = useState('');
    const [listType, setListType] = useState('image');
    const [refresh, setRefresh] = useState(false);
    const [pagination, setPagination] = useState({current: 1, pageSize: 11});
    const [loading, setLoading] = useState(false);
    const [listUnavailable, setListUnavailable] = useState(false);
    const [clearSelection, setClearSelection] = useState(null);
    const {graphspace} = useParams();
    const navigate = useNavigate();
    const {context: authContext} = useAuthContext();
    const pdMode = isPdEnabled();
    const graphCreateEnabled = isGraphCreateEnabled(pdMode);
    const graphDefaultMutationEnabled = isGraphDefaultMutationEnabled(pdMode);
    const adminGraphspaces = authContext?.scopes?.admin_graphspaces ?? [];
    const canUpdateGraphspace = value => authContext?.role === 'SUPERADMIN'
        || authContext?.scopes?.all_graphspaces === true
        || adminGraphspaces.includes(value);

    const handlePagination = useCallback(current => {
        setPagination({...pagination, current});
    }, [pagination]);

    const handleTable = useCallback(pagination => {
        setPagination(pagination);
    }, []);

    const handleListType = useCallback(e => {
        setListType(e.target.value);
        setPagination({...pagination, current: 1, pageSize: e.target.value === 'image' ? 11 : 10});
    }, [pagination]);

    const handleSearch = useCallback(val => {
        setGraphname(val);
        setRefresh(!refresh);
    }, [refresh]);

    const handleSearchTextChange = useCallback(event => {
        setSearchText(event.target.value);
    }, []);

    const handleClearFilters = useCallback(() => {
        setDateData('');
        setGraphname('');
        setSearchText('');
        setPagination(value => ({...value, current: 1}));
        setRefresh(value => !value);
    }, []);

    const showEditLayer = useCallback(() => {
        setEditLayer(true);
        setSelectGraph('');
    }, []);

    const editGraph = useCallback(graph => {
        setSelectGraph(graph);
        setEditLayer(true);
    }, []);

    const clearGraph = useCallback(graph => {
        setClearSelection({graph});
    }, []);

    const handleClearSuccess = useCallback(() => {
        message.success(t('common.msg.success'));
        setClearSelection(null);
        setRefresh(value => !value);
    }, [t]);

    const handleClearCancel = useCallback(() => {
        setClearSelection(null);
    }, []);

    const handleClearConfirm = useCallback(() => {
        return api.manage.clearGraph(graphspace, clearSelection.graph);
    }, [clearSelection, graphspace]);

    const showSchema = useCallback(graph => {
        setViewLayer(true);
        setSelectGraph(graph);
    }, []);

    const deleteGraph = useCallback(graph => {
        Modal.confirm({
            title: t('graph.delete_confirm.title'),
            content: t('graph.delete_confirm.irreversible'),
            onOk: () => {
                const hide = message.loading(t('graph.delete_confirm.deleting'), 0);
                api.manage.delGraph(graphspace, graph).then(res => {
                    hide();
                    if (res.status === 200) {
                        message.success(t('graph.delete_confirm.success'));
                        setRefresh(value => !value);
                        return;
                    }

                    message.error(t('graph.delete_confirm.failed'));
                });
            },
        });
    }, [graphspace, t]);

    const setDefault = useCallback(graph => {
        const hide = message.loading(t('graph.set_default.setting'), 0);
        return api.manage.setDefaultGraph(graphspace, graph, {
            suppressBusinessErrorToast: true,
        }).then(res => {
            hide();
            if (res.status === 200) {
                message.success(t('graph.set_default.success'));
                setRefresh(value => !value);
                return;
            }
            message.error(t('common.msg.operation_failed'));
        }).catch(() => {
            hide();
            message.error(t('common.msg.operation_failed'));
        });
    }, [graphspace, t]);

    const handleSetDefault = useCallback(graph => {
        api.manage.getDefaultGraph(graphspace, {
            suppressBusinessErrorToast: true,
        }).then(res => {
            if (res.status !== 200) {
                message.error(t('common.msg.operation_failed'));
                return;
            }

            const value = res.data.default_graph;
            const defaults = Array.isArray(value) ? value : [value].filter(Boolean);
            if (defaults.some(defaultGraph => defaultGraph !== graph)) {
                Modal.confirm({
                    title: t('graph.set_default_confirm'),
                    onOk: () => setDefault(graph),
                });

                return;
            }

            setDefault(graph);
        }).catch(() => message.error(t('common.msg.operation_failed')));
    }, [graphspace, setDefault, t]);

    const handleBack = useCallback(() => {
        if (isPdEnabled()) {
            navigate('/graphspace');
        }
        else {
            navigate('/navigation');
        }
    }, [navigate]);

    const handleHideEditLayer = useCallback(() => {
        setEditLayer(false);
    }, []);

    const handleRefresh = useCallback(() => {
        setRefresh(!refresh);
    }, [refresh]);

    const handleHideViewLayer = useCallback(() => {
        setViewLayer(false);
    }, []);

    const handleDatePickerChange = useCallback((_, val) => setDateData(val), []);
    const hasFilters = Boolean(dateData || graphname);

    const saveNickname = useCallback(async (row, nickname) => {
        const rowGraphspace = row.graphspace || graphspace;
        const fallbackError = t('common.msg.operation_failed');
        try {
            const update = await api.manage.updateGraph(
                rowGraphspace,
                row.name,
                {nickname},
                {suppressBusinessErrorToast: true}
            );
            if (update.status !== 200) {
                throw new Error(sanitizePublicError(update.message, fallbackError));
            }

            const detail = await api.manage.getGraph(rowGraphspace, row.name, {
                suppressBusinessErrorToast: true,
            });
            if (detail.status !== 200) {
                throw new Error(sanitizePublicError(detail.message, fallbackError));
            }

            const serverNickname = detail.data?.nickname ?? '';
            setData(current => current.map(item => (
                item.name === row.name && (item.graphspace || graphspace) === rowGraphspace
                    ? {...item, ...detail.data, nickname: serverNickname}
                    : item
            )));
            return serverNickname;
        }
        catch (error) {
            const errorMessage = error?.response?.data?.message || error?.message;
            throw new Error(sanitizePublicError(errorMessage, fallbackError));
        }
    }, [graphspace, t]);

    const emptyState = (
        <Empty
            description={hasFilters
                ? t('graph.empty.filtered_description')
                : t('graph.empty.description')}
        >
            {hasFilters ? (
                <Button onClick={handleClearFilters}>
                    {t('graph.empty.clear_filters')}
                </Button>
            ) : (
                <Space direction='vertical' size={8}>
                    {graphCreateEnabled && (
                        <Button type='primary' onClick={showEditLayer}>
                            {t('graph.empty.create')}
                        </Button>
                    )}
                    <span className={style.empty_demo_hint}>
                        {t('graph.empty.demo_prerequisite')}
                    </span>
                    <Link to='/task'>{t('graph.empty.view_demo')}</Link>
                </Space>
            )}
        </Empty>
    );

    const columns = [
        {
            title: t('graph.col.name'),
            render: row => (
                <GraphNicknameColumn
                    canEdit={canUpdateGraphspace(row.graphspace || graphspace)}
                    onSave={saveNickname}
                    row={row}
                    t={t}
                />
            ),
        },
        {
            title: t('graph.detail.graphspace'),
            dataIndex: 'graphspace_nickname',
            render: (nickname, row) => {
                const graphspaceName = row.graphspace || graphspace;
                return graphspaceName === DEFAULT_GRAPHSPACE
                    ? t('graphspace.default_name')
                    : getResourceDisplayName(graphspaceName, nickname);
            },
        },
        {
            title: t('graph.col.create_time'),
            dataIndex: 'create_time',
            align: 'center',
            width: 140,
            render: val => moment(val).format('YYYY-MM-DD'),
        },
        {
            title: t('graph.detail.update_data'),
            dataIndex: 'update_time',
            align: 'center',
            width: 140,
            render: val => moment(val).format('YYYY-MM-DD'),
        },
        {
            title: t('graph.col.creator'),
            dataIndex: 'creator',
            align: 'center',
            width: 140,
        },
        {
            title: t('graph.col.operation'),
            width: 420,
            align: 'center',
            render: row => {
                return (
                    <Space>
                        <Link to={`/graphspace/${graphspace}/graph/${row.name}/meta`}>
                            {t('graph.menu.meta_config')}
                        </Link>
                        {(row.default)
                            ? <span className={style.disable}>{t('graph.menu.clear_graph')}</span>
                            : (
                                <GraphRowAction onAction={clearGraph} graph={row.name}>
                                    {t('graph.menu.clear_graph')}
                                </GraphRowAction>
                            )}
                        {(row.graphspace === 'neizhianli')
                            ? <span className={style.disable}>{t('common.action.delete')}</span>
                            : (
                                <GraphRowAction onAction={deleteGraph} graph={row.name}>
                                    {t('common.action.delete')}
                                </GraphRowAction>
                            )}
                        <GraphRowAction onAction={showSchema} graph={row.name}>
                            {t('graph.menu.view_schema')}
                        </GraphRowAction>
                        {graphDefaultMutationEnabled && (
                            row.default
                                ? <span className={style.disable}>{t('graph.menu.set_default')}</span>
                                : (
                                    <GraphRowAction onAction={handleSetDefault} graph={row.name}>
                                        {t('graph.menu.set_default')}
                                    </GraphRowAction>
                                )
                        )}
                        {graphCreateEnabled && (
                            <Tooltip title={t('graph.clone.unavailable')}>
                                <span
                                    className={style.disable}
                                    role='button'
                                    aria-disabled='true'
                                    aria-label={`${t('graph.menu.clone')}: ${t('graph.clone.unavailable')}`}
                                    tabIndex={0}
                                >
                                    {t('graph.menu.clone')}
                                </span>
                            </Tooltip>
                        )}
                    </Space>
                );
            },
        },
    ];

    const getMenus = item => [
        {
            key: 'clear',
            danger: true,
            disabled: item.default,
            label: item.default
                ? <span className={style.disable}>{t('graph.menu.clear_graph')}</span>
                : t('graph.menu.clear_graph'),
            onClick: item.default ? undefined : () => clearGraph(item.name),
        },
        graphDefaultMutationEnabled && {
            key: 'default',
            disabled: item.default,
            label: item.default
                ? <span className={style.disable}>{t('graph.menu.set_default')}</span>
                : t('graph.menu.set_default'),
            onClick: item.default ? undefined : () => handleSetDefault(item.name),
        },
        {
            key: 'edit',
            disabled: item.graphspace === 'neizhianli',
            label: item.graphspace === 'neizhianli'
                ? <span className={style.disable}>{t('common.action.edit')}</span>
                : t('common.action.edit'),
            onClick: item.graphspace === 'neizhianli'
                ? undefined : () => editGraph(item.name),
        },
        {
            key: 'delete',
            danger: true,
            disabled: item.graphspace === 'neizhianli',
            label: item.graphspace === 'neizhianli'
                ? <span className={style.disable}>{t('common.action.delete')}</span>
                : t('common.action.delete'),
            onClick: item.graphspace === 'neizhianli'
                ? undefined : () => deleteGraph(item.name),
        },
        graphCreateEnabled && {
            key: 'clone',
            disabled: true,
            label: (
                <Tooltip title={t('graph.clone.unavailable')}>
                    <span
                        aria-label={`${t('graph.menu.clone')}: ${t('graph.clone.unavailable')}`}
                    >
                        {t('graph.menu.clone')}
                    </span>
                </Tooltip>
            ),
        },
    ].filter(Boolean);

    useEffect(() => {
        setLoading(true);
        setListUnavailable(false);

        api.manage.getGraphList(graphspace, {
            create_time: dateData,
            query: graphname,
            page_no: pagination.current,
            page_size: pagination.pageSize,
        }, {suppressBusinessErrorToast: true}).then(res => {
            if (res.status === 200) {
                setData(res.data.records);
                setPagination({...pagination, total: res.data.total});

                return;
            }
            setListUnavailable(true);
        }).catch(() => {
            setListUnavailable(true);
        }).finally(() => {
            setLoading(false);
        });

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refresh, pagination.current, listType, dateData, graphspace, graphname]);

    return (
        <Spin spinning={loading}>
            <TopbarPageContextSlot>
                <Radio.Group
                    role='radiogroup'
                    aria-label={t('graph.view_mode')}
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
            <PageHeader
                ghost={false}
                onBack={handleBack}
                title={t('graph.title')}
            >
                <Row justify='space-between'>
                    <Col>
                        <DatePicker
                            value={dateData ? moment(dateData) : null}
                            onChange={handleDatePickerChange}
                        />
                    </Col>
                    <Col>
                        <Space>
                            <Input.Search
                                onSearch={handleSearch}
                                onChange={handleSearchTextChange}
                                value={searchText}
                                placeholder={t('graph.search_placeholder')}
                            />
                        </Space>
                    </Col>
                </Row>
            </PageHeader>

            <div className='container'>
                {listUnavailable && (
                    <Alert
                        showIcon
                        type='error'
                        message={t('graph.unavailable')}
                        action={(
                            <Button size='small' onClick={handleRefresh}>
                                {t('common.action.retry')}
                            </Button>
                        )}
                    />
                )}
                {listType === 'image'
                    ? (
                        <>
                            {!listUnavailable && data.length === 0 && emptyState}
                            <Row gutter={[10, 10]} justify='start'>
                                {data.map(item => {
                                    const menus = getMenus(item);

                                    return (
                                        <Col span={8} key={item.name}>
                                            <GraphCard
                                                item={item}
                                                menus={menus}
                                            />
                                        </Col>
                                    );
                                })}
                                {graphCreateEnabled && data.length > 0 && (
                                    <Col span={8} key='add'>
                                        <KeyboardAction
                                            onAction={showEditLayer}
                                            aria-label={t('graph.create')}
                                        >
                                            <Card className={style.add_card}>
                                                <Space><PlusOutlined />{t('graph.create')}</Space>
                                            </Card>
                                        </KeyboardAction>
                                    </Col>
                                )}
                            </Row>
                            <br />
                            <Row justify='end'>
                                <Col>
                                    <Pagination
                                        current={pagination.current}
                                        pageSize={pagination.pageSize}
                                        total={pagination.total}
                                        onChange={handlePagination}
                                        showSizeChanger={false}
                                    />
                                </Col>
                            </Row>
                        </>
                    )
                    : (
                        <>
                            {graphCreateEnabled && (
                                <>
                                    <Row>
                                        <Col>
                                            <Button onClick={showEditLayer} type='primary'>
                                                {t('graph.create')}
                                            </Button>
                                        </Col>
                                    </Row>
                                    <br />
                                </>
                            )}
                            <Table
                                columns={columns}
                                dataSource={data}
                                rowKey='name'
                                locale={{emptyText: listUnavailable ? null : emptyState}}
                                pagination={pagination}
                                onChange={handleTable}
                            />
                        </>
                    )
                }
                <EditLayer
                    visible={editLayer}
                    onCancel={handleHideEditLayer}
                    graphspace={graphspace}
                    refresh={handleRefresh}
                    graph={selectGraph}
                />
                <ViewLayer
                    visible={viewLayer}
                    onCancel={handleHideViewLayer}
                    graph={selectGraph}
                    graphspace={graphspace}
                />
                <ClearGraphConfirmModal
                    open={Boolean(clearSelection)}
                    graphspace={graphspace}
                    graph={clearSelection?.graph || ''}
                    onCancel={handleClearCancel}
                    onSuccess={handleClearSuccess}
                    onConfirm={handleClearConfirm}
                />
            </div>
        </Spin>
    );
};

export default Graph;
