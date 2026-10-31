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
import {
    Table,
    Space,
    Row,
    Col,
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
import {CloneLayer, EditLayer, ViewLayer} from './EditLayer';
import {PlusOutlined} from '@ant-design/icons';
import {Link, useParams, useNavigate} from 'react-router-dom';
import style from './index.module.scss';
import * as api from '../../api';
import {isGraphCreateEnabled, isPdEnabled, isSchemaCloneEnabled} from '../../utils/config';
import {
    DEFAULT_GRAPHSPACE,
    isGraphDefaultMutationEnabled,
} from '../../utils/productMode';
import dayjs from 'dayjs';
import GraphCard from './Card';
import ClearGraphConfirmModal from './ClearGraphConfirmModal';
import KeyboardAction from '../../components/KeyboardAction';
import {getResourceDisplayName} from '../../utils/displayName';
import {sanitizePublicError} from '../../utils/publicError';
import EditableNicknameCell from './EditableNicknameCell';
import {TopbarPageContextSlot} from '../../components/Topbar/PageContextSlot';
import {useAuthContext} from '../../auth/AuthContext';
import {useGraphspaceAccess} from '../../auth/graphspaceAccess';

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
    const [cloneLayer, setCloneLayer] = useState(false);
    const [selectGraph, setSelectGraph] = useState('');
    const [listType, setListType] = useState('image');
    const [refresh, setRefresh] = useState(false);
    const [pagination, setPagination] = useState({current: 1, pageSize: 11});
    const {current: page, pageSize} = pagination;
    const [loading, setLoading] = useState(false);
    const [listUnavailable, setListUnavailable] = useState(false);
    const [clearSelection, setClearSelection] = useState(null);
    const [sampleLoading, setSampleLoading] = useState('');
    const {graphspace} = useParams();
    const navigate = useNavigate();
    const pdMode = isPdEnabled();
    const graphCreateEnabled = isGraphCreateEnabled();
    const schemaCloneEnabled = isSchemaCloneEnabled();
    const graphCreateUnavailableHint = t('graph.server_upgrade_hint');
    const cloneUnavailableHint = t('graph.clone.unavailable');
    const graphDefaultMutationEnabled = isGraphDefaultMutationEnabled(pdMode);
    const {canManage, canWrite} = useGraphspaceAccess(graphspace);
    const {context: authContext, identityEpoch} = useAuthContext();
    const [vermeerEnabled, setVermeerEnabled] = useState(false);
    const canUseGraphCompute = authContext?.role === 'SUPERADMIN' || authContext?.mode === 'NON_AUTH';
    useEffect(() => {
        let active = true;
        setVermeerEnabled(false);
        if (canUseGraphCompute) {
            api.auth.getVermeer({suppressBusinessErrorToast: true}).then(response => {
                if (active) setVermeerEnabled(response?.status === 200 && response.data?.statistics_available === true);
            }).catch(() => {});
        }
        return () => { active = false; };
    }, [canUseGraphCompute, identityEpoch]);


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

    const showClone = useCallback(graph => {
        setSelectGraph(graph);
        setCloneLayer(true);
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

    const loadSample = useCallback((graph, dataset) => {
        Modal.confirm({
            title: t(`graph.sample.${dataset}_title`),
            content: t(`graph.sample.${dataset}_description`, {graph}),
            okText: t('graph.sample.confirm'),
            cancelText: t('common.action.cancel'),
            onOk: async () => {
                setSampleLoading(`${graph}:${dataset}`);
                try {
                    const res = await api.manage.loadSampleGraph(
                        graphspace,
                        graph,
                        dataset,
                        {suppressBusinessErrorToast: true}
                    );
                    if (res.status !== 200) {
                        throw new Error(res.message || t('graph.sample.failed'));
                    }
                    message.success(t('graph.sample.success', {
                        vertices: res.data.vertices,
                        edges: res.data.edges,
                    }));
                    setRefresh(value => !value);
                }
                catch (error) {
                    message.error(error.message || t('graph.sample.failed'));
                }
                finally {
                    setSampleLoading('');
                }
            },
        });
    }, [graphspace, t]);

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
            throw new Error(sanitizePublicError(errorMessage, fallbackError), {cause: error});
        }
    }, [graphspace, t]);

    const emptyState = (
        <Empty
            description={hasFilters
                ? t('graph.empty.filtered_description')
                : canManage
                    ? t('graph.empty.description')
                    : t('graph.empty.read_only_description')}
        >
            {hasFilters ? (
                <Button onClick={handleClearFilters}>
                    {t('graph.empty.clear_filters')}
                </Button>
            ) : canManage ? (
                <Space orientation='vertical' size={8}>
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
            ) : null}
        </Empty>
    );

    const columns = [
        {
            title: t('graph.col.name'),
            render: row => (
                <GraphNicknameColumn
                    canEdit={canManage}
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
            render: val => (val ? dayjs(val).format('YYYY-MM-DD') : '--'),
        },
        {
            title: t('graph.detail.update_data'),
            dataIndex: 'update_time',
            align: 'center',
            width: 140,
            render: val => (val ? dayjs(val).format('YYYY-MM-DD') : '--'),
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
                        {(row.default || !canManage)
                            ? <span className={style.disable}>{t('graph.menu.clear_graph')}</span>
                            : (
                                <GraphRowAction onAction={clearGraph} graph={row.name}>
                                    {t('graph.menu.clear_graph')}
                                </GraphRowAction>
                            )}
                        {(row.graphspace === 'neizhianli' || !canManage
                          || !graphCreateEnabled)
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
                            row.default || !canManage
                                ? <span className={style.disable}>{t('graph.menu.set_default')}</span>
                                : (
                                    <GraphRowAction onAction={handleSetDefault} graph={row.name}>
                                        {t('graph.menu.set_default')}
                                    </GraphRowAction>
                                )
                        )}
                        {canManage && schemaCloneEnabled
                            ? <GraphRowAction onAction={showClone} graph={row.name}>
                                {t('graph.menu.clone')}
                            </GraphRowAction>
                            : <Tooltip title={!schemaCloneEnabled ? cloneUnavailableHint : undefined}>
                                <span className={style.disable}>{t('graph.menu.clone')}</span>
                            </Tooltip>}
                    </Space>
                );
            },
        },
    ];

    const getMenus = item => {
        const itemGraphspace = item.graphspace || graphspace;
        const immutable = itemGraphspace === 'neizhianli';
        const sampleDisabled = immutable || !canWrite || Boolean(sampleLoading);
        return [
            {
                key: 'clear',
                danger: true,
                disabled: item.default || !canManage,
                label: item.default || !canManage
                    ? <span className={style.disable}>{t('graph.menu.clear_graph')}</span>
                    : t('graph.menu.clear_graph'),
                onClick: item.default || !canManage
                    ? undefined : () => clearGraph(item.name),
            },
            graphDefaultMutationEnabled && {
                key: 'default',
                disabled: item.default || !canManage,
                label: item.default || !canManage
                    ? <span className={style.disable}>{t('graph.menu.set_default')}</span>
                    : t('graph.menu.set_default'),
                onClick: item.default || !canManage
                    ? undefined : () => handleSetDefault(item.name),
            },
            {
                key: 'edit',
                disabled: immutable || !canManage,
                label: immutable || !canManage
                    ? <span className={style.disable}>{t('common.action.edit')}</span>
                    : t('common.action.edit'),
                onClick: immutable || !canManage
                    ? undefined : () => editGraph(item.name),
            },
            {
                key: 'sample-hlm',
                disabled: sampleDisabled,
                label: sampleLoading === `${item.name}:hlm`
                    ? t('graph.sample.loading') : t('graph.menu.load_hlm_sample'),
                onClick: sampleDisabled ? undefined : () => loadSample(item.name, 'hlm'),
            },
            {
                key: 'sample-rank',
                disabled: sampleDisabled,
                label: sampleLoading === `${item.name}:rank`
                    ? t('graph.sample.loading') : t('graph.menu.load_rank_sample'),
                onClick: sampleDisabled ? undefined : () => loadSample(item.name, 'rank'),
            },
            {
                key: 'sample-loader',
                disabled: sampleDisabled,
                label: sampleLoading === `${item.name}:loader`
                    ? t('graph.sample.loading') : t('graph.menu.load_loader_sample'),
                onClick: sampleDisabled ? undefined : () => loadSample(item.name, 'loader'),
            },
            {
                key: 'delete',
                danger: true,
                disabled: immutable || !canManage || !graphCreateEnabled,
                label: immutable || !canManage || !graphCreateEnabled
                    ? <span className={style.disable}>{t('common.action.delete')}</span>
                    : t('common.action.delete'),
                onClick: immutable || !canManage || !graphCreateEnabled
                    ? undefined : () => deleteGraph(item.name),
            },
            {
                key: 'clone',
                disabled: !canManage || !schemaCloneEnabled,
                label: !schemaCloneEnabled
                    ? <Tooltip title={cloneUnavailableHint}>{t('graph.menu.clone')}</Tooltip>
                    : t('graph.menu.clone'),
                onClick: canManage && schemaCloneEnabled ? () => showClone(item.name) : undefined,
            },
        ].filter(Boolean);
    };

    useEffect(() => {
        setLoading(true);
        setListUnavailable(false);

        api.manage.getGraphList(graphspace, {
            create_time: dateData,
            query: graphname,
            page_no: page,
            page_size: pageSize,
        }, {suppressBusinessErrorToast: true}).then(res => {
            if (res.status === 200) {
                setData(res.data.records);
                setPagination(value => ({...value, total: res.data.total}));

                return;
            }
            setListUnavailable(true);
        }).catch(() => {
            setListUnavailable(true);
        }).finally(() => {
            setLoading(false);
        });

    }, [refresh, page, pageSize, listType, dateData, graphspace, graphname]);

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
                onBack={handleBack}
                title={t('graph.title')}
            >
                <Row justify='space-between'>
                    <Col>
                        <DatePicker
                            value={dateData ? dayjs(dateData) : null}
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
                        title={t('graph.unavailable')}
                        action={(
                            <Button size='small' onClick={handleRefresh}>
                                {t('common.action.retry')}
                            </Button>
                        )}
                    />
                )}
                {!graphCreateEnabled && (
                    <Alert
                        showIcon
                        type='info'
                        title={graphCreateUnavailableHint}
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
                                                canMutate={canWrite}
                                                canComputeStatistics={vermeerEnabled}
                                            />
                                        </Col>
                                    );
                                })}
                                {graphCreateEnabled && canManage
                                    && data.length > 0 && (
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
                            {graphCreateEnabled && canManage && (
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
                                scroll={{x: 'max-content'}}
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
                <CloneLayer open={cloneLayer} onCancel={() => setCloneLayer(false)}
                    refresh={handleRefresh} graphspace={graphspace} graph={selectGraph} />
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
