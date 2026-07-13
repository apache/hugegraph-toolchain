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
    PageHeader,
    Button,
    Space,
    Table,
    message,
    Tooltip,
    Modal,
    Tag,
} from 'antd';
import {useCallback, useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import TableHeader from '../../components/TableHeader';
import EditLayer from './EditLayer';
import * as api from '../../api';
import {getUser} from '../../utils/user';
import {getAccountLevel} from './level';

const PAGE_ERROR_CONFIG = {suppressBusinessErrorToast: true};

const RowAction = ({onAction, row, children}) => {
    const handleClick = useCallback(() => onAction(row), [onAction, row]);

    return <Button type='link' onClick={handleClick}>{children}</Button>;
};

const Account = () => {
    const {t} = useTranslation();
    const currentUser = getUser();
    const canManageAccounts = Boolean(currentUser.is_superadmin);
    const [editLayerVisible, setEditLayerVisible] = useState(false);
    const [op, setOp] = useState('detail');
    const [detail, setDetail] = useState({});
    const [data, setData] = useState([]);
    const [listLoading, setListLoading] = useState(true);
    const [listError, setListError] = useState(false);
    const listRequest = useRef(null);
    const [refresh, setRefresh] = useState(false);
    const [pagination, setPagination] = useState({toatal: 0, current: 1, pageSize: 10});

    const showDetail = useCallback(row => {
        setDetail(row);
        setOp('detail');
        setEditLayerVisible(true);
    }, []);

    const showEdit = useCallback(row => {
        setDetail(row);
        setOp('edit');
        setEditLayerVisible(true);
    }, []);

    const showAuth = useCallback(row => {
        setDetail(row);
        setOp('auth');
        setEditLayerVisible(true);
    }, []);

    const showAdd = useCallback(() => {
        setDetail({});
        setOp('create');
        setEditLayerVisible(true);
    }, []);

    const handleRefresh = useCallback(() => {
        setRefresh(value => !value);
    }, []);

    const handleHideLayer = useCallback(() => {
        setEditLayerVisible(false);
    }, []);

    const handleDelete = useCallback(row => {
        Modal.confirm({
            title: t('account.delete_confirm', {name: row.user_name}),
            onOk: () => {
                return api.auth.delUser(row.id, PAGE_ERROR_CONFIG).then(res => {
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

    const handleTable = useCallback(page => {
        setPagination(value => ({...value, ...page}));
    }, []);

    const columns = [
        {
            title: t('account.col.id'),
            dataIndex: 'user_name',
        },
        {
            title: t('account.col.name'),
            dataIndex: 'user_nickname',
        },
        {
            title: t('account.col.remark'),
            dataIndex: 'user_description',
            ellipsis: {showTitle: false},
            render: val => <Tooltip title={val} placement='bottomLeft'>{val}</Tooltip>,
        },
        {
            title: t('account.col.level'),
            width: 140,
            render: row => {
                const level = getAccountLevel(row);
                const color = level === 'ADMIN' ? 'red'
                    : level === 'SPACEADMIN' ? 'blue' : 'default';
                return <Tag color={color}>{t(`account.level.${level}`)}</Tag>;
            },
        },
        {
            title: t('account.col.resource'),
            dataIndex: 'spacenum',
            width: 120,
        },
        {
            title: t('account.col.create_time'),
            dataIndex: 'user_create',
            align: 'center',
            width: 200,
        },
        {
            title: t('common.operation'),
            width: canManageAccounts ? 300 : 100,
            align: 'center',
            render: row => (
                <Space>
                    <RowAction onAction={showDetail} row={row}>
                        {t('common.action.detail')}
                    </RowAction>
                    {canManageAccounts && (
                        <>
                            <RowAction onAction={showEdit} row={row}>
                                {t('common.action.edit')}
                            </RowAction>
                            <RowAction onAction={showAuth} row={row}>
                                {t('common.action.assign_permission')}
                            </RowAction>
                        </>
                    )}
                    {canManageAccounts
                        && row.user_name !== 'admin'
                        && row.user_name !== currentUser.id && (
                        <RowAction onAction={handleDelete} row={row}>
                            {t('common.action.delete')}
                        </RowAction>
                    )}
                </Space>
            ),
        },
    ];

    const rowKey = useCallback(item => item.user_name, []);
    const {current, pageSize} = pagination;

    const loadAccounts = useCallback(async () => {
        const token = Symbol('account-list');
        listRequest.current = token;
        setListLoading(true);
        setListError(false);
        setData([]);
        try {
            const res = await api.auth.getAllUserList({
                query: '',
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
                setListLoading(false);
            }
        }
    }, [current, pageSize]);

    useEffect(() => {
        loadAccounts();
        return () => {
            listRequest.current = null;
        };
    }, [refresh, loadAccounts]);

    return (
        <>
            <PageHeader
                ghost={false}
                onBack={false}
                title={t('account.title')}
            />

            <div className='container'>
                {listError && (
                    <Alert
                        type='error'
                        showIcon
                        message={t('account.load.unavailable')}
                        action={(
                            <Button size='small' onClick={loadAccounts}>
                                {t('account.load.retry')}
                            </Button>
                        )}
                    />
                )}
                <TableHeader>
                    <Space>
                        <Button onClick={showAdd} type='primary'>{t('account.create')}</Button>
                    </Space>
                </TableHeader>

                <Table
                    columns={columns}
                    dataSource={data}
                    rowKey={rowKey}
                    pagination={pagination}
                    onChange={handleTable}
                    loading={listLoading}
                />
            </div>

            <EditLayer
                visible={editLayerVisible}
                op={op}
                data={detail}
                onCancel={handleHideLayer}
                refresh={handleRefresh}
            />
        </>
    );
};

export default Account;
