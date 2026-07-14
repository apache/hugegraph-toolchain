/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    Alert,
    Button,
    Form,
    Input,
    message,
    Modal,
    Select,
    Space,
    Table,
    Tabs,
    Tag,
    Typography,
} from 'antd';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import * as api from '../../api';
import TableHeader from '../../components/TableHeader';
import {useAuthContext} from '../../auth/AuthContext';

const PAGE_ERROR_CONFIG = {suppressBusinessErrorToast: true};
const PAGE_PARAMS = {query: '', page_no: 1, page_size: 200};
const PERMISSIONS = ['READ', 'WRITE', 'DELETE', 'EXECUTE'];
const DEFAULT_RESOURCES = JSON.stringify([
    {type: 'GREMLIN', label: '*', properties: null},
], null, 2);

const responseRecords = response => response?.data?.records ?? [];
const responseList = response => (Array.isArray(response?.data) ? response.data : []);
const accessRowKey = row => `${row.role_id}:${row.target_id}`;

const RowAction = ({row, onAction, children}) => {
    const handleClick = useCallback(() => onAction(row), [onAction, row]);

    return <Button type="link" onClick={handleClick}>{children}</Button>;
};

const useScopedResource = (graphSpace, contextVersion, loader, selector) => {
    const request = useRef(null);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [revision, setRevision] = useState(0);

    const retry = useCallback(() => setRevision(value => value + 1), []);

    useEffect(() => {
        if (!graphSpace) {
            request.current = null;
            setData([]);
            setLoading(false);
            setError(false);
            return undefined;
        }
        const token = Symbol(graphSpace);
        request.current = token;
        setData([]);
        setLoading(true);
        setError(false);
        loader(graphSpace).then(response => {
            if (request.current !== token) {
                return;
            }
            if (response?.status !== 200) {
                setError(true);
                return;
            }
            setData(selector(response));
        }).catch(() => {
            if (request.current === token) {
                setError(true);
            }
        }).finally(() => {
            if (request.current === token) {
                setLoading(false);
            }
        });
        return () => {
            if (request.current === token) {
                request.current = null;
            }
        };
    }, [contextVersion, graphSpace, loader, revision, selector]);

    return {data, loading, error, retry};
};

const ErrorAlert = ({error, retry, t}) => (error ? (
    <Alert
        type="error"
        showIcon
        message={t('account.space_access.load_error')}
        action={(
            <Button size="small" onClick={retry}>
                {t('common.action.retry')}
            </Button>
        )}
    />
) : null);

const SpaceAccess = () => {
    const {t} = useTranslation();
    const {context} = useAuthContext();
    const contextVersion = context?.context_version;
    const scopes = context?.scopes ?? {};
    const memberActions = context?.actions?.members ?? [];
    const roleActions = context?.actions?.roles ?? [];
    const authorizationActions = context?.actions?.authorizations ?? [];
    const canAddMember = memberActions.includes('add');
    const canRemoveMember = memberActions.includes('remove');
    const canCreateRole = roleActions.includes('create');
    const canUpdateRole = roleActions.includes('update');
    const canDeleteRole = roleActions.includes('delete');
    const canGrant = authorizationActions.includes('grant');
    const canRevoke = authorizationActions.includes('revoke');
    const [selectedSpace, setSelectedSpace] = useState('');
    const [allSpaces, setAllSpaces] = useState([]);
    const [spacesLoading, setSpacesLoading] = useState(false);
    const [spacesError, setSpacesError] = useState(false);
    const [spacesRevision, setSpacesRevision] = useState(0);
    const spacesRequest = useRef(null);
    const [memberDialog, setMemberDialog] = useState(null);
    const [roleDialog, setRoleDialog] = useState(null);
    const [targetDialog, setTargetDialog] = useState(null);
    const [accessDialog, setAccessDialog] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [memberForm] = Form.useForm();
    const [roleForm] = Form.useForm();
    const [targetForm] = Form.useForm();
    const [accessForm] = Form.useForm();

    const scopedSpaces = useMemo(
        () => scopes.admin_graphspaces ?? [],
        [scopes.admin_graphspaces]
    );

    useEffect(() => {
        if (!scopes.all_graphspaces) {
            spacesRequest.current = null;
            setAllSpaces([]);
            setSpacesLoading(false);
            setSpacesError(false);
            return undefined;
        }
        const token = Symbol('graphspaces');
        spacesRequest.current = token;
        setSpacesLoading(true);
        setSpacesError(false);
        api.manage.getGraphSpaceList(PAGE_PARAMS, PAGE_ERROR_CONFIG)
            .then(response => {
                if (spacesRequest.current !== token) {
                    return;
                }
                if (response?.status !== 200) {
                    setSpacesError(true);
                    return;
                }
                setAllSpaces(responseRecords(response).map(space => space.name));
            })
            .catch(() => {
                if (spacesRequest.current === token) {
                    setSpacesError(true);
                }
            })
            .finally(() => {
                if (spacesRequest.current === token) {
                    setSpacesLoading(false);
                }
            });
        return () => {
            if (spacesRequest.current === token) {
                spacesRequest.current = null;
            }
        };
    }, [contextVersion, scopes.all_graphspaces, spacesRevision]);

    const spaces = scopes.all_graphspaces ? allSpaces : scopedSpaces;
    const graphSpace = spaces.includes(selectedSpace) ? selectedSpace : spaces[0];
    const loadMembers = useCallback(space => api.auth.getSpaceMembers(
        space, PAGE_PARAMS, PAGE_ERROR_CONFIG
    ), []);
    const loadRoles = useCallback(space => api.auth.getSpaceRoles(
        space, PAGE_PARAMS, PAGE_ERROR_CONFIG
    ), []);
    const loadTargets = useCallback(space => api.auth.getSpaceTargets(
        space, PAGE_PARAMS, PAGE_ERROR_CONFIG
    ), []);
    const loadAccesses = useCallback(space => api.auth.getSpaceAccesses(
        space, {}, PAGE_ERROR_CONFIG
    ), []);
    const members = useScopedResource(
        graphSpace, contextVersion, loadMembers, responseRecords
    );
    const roles = useScopedResource(
        graphSpace, contextVersion, loadRoles, responseRecords
    );
    const targets = useScopedResource(
        graphSpace, contextVersion, loadTargets, responseRecords
    );
    const accesses = useScopedResource(
        graphSpace, contextVersion, loadAccesses, responseList
    );

    const refreshAll = useCallback(() => {
        members.retry();
        roles.retry();
        targets.retry();
        accesses.retry();
    }, [accesses, members, roles, targets]);

    const runMutation = useCallback(async (operation, close) => {
        if (submitting) {
            return;
        }
        setSubmitting(true);
        try {
            const response = await operation();
            if (response?.status !== 200) {
                message.error(t('common.msg.operation_failed'));
                return;
            }
            message.success(t('common.msg.success'));
            close();
            refreshAll();
        }
        catch (error) {
            message.error(t('common.msg.operation_failed'));
        }
        finally {
            setSubmitting(false);
        }
    }, [refreshAll, submitting, t]);

    const openMember = useCallback(row => {
        memberForm.setFieldsValue({
            user_id: row?.user_id,
            roles: row?.roles?.map(role => role.role_id) ?? [],
        });
        setMemberDialog(row ?? {});
    }, [memberForm]);
    const openRole = useCallback(row => {
        roleForm.setFieldsValue({
            role_name: row?.role_name ?? row?.role_nickname,
            role_description: row?.role_description,
        });
        setRoleDialog(row ?? {});
    }, [roleForm]);
    const openTarget = useCallback(row => {
        targetForm.setFieldsValue({
            target_name: row?.target_name,
            target_graph: row?.target_graph,
            target_description: row?.target_description,
            target_resources: row?.target_resources
                ? JSON.stringify(row.target_resources, null, 2)
                : DEFAULT_RESOURCES,
        });
        setTargetDialog(row ?? {});
    }, [targetForm]);
    const openAccess = useCallback(row => {
        accessForm.setFieldsValue({
            role_id: row?.role_id,
            target_id: row?.target_id,
            permissions: row?.permissions ?? [],
        });
        setAccessDialog(row ?? {});
    }, [accessForm]);

    const closeMember = useCallback(() => {
        setMemberDialog(null);
        memberForm.resetFields();
    }, [memberForm]);
    const closeRole = useCallback(() => {
        setRoleDialog(null);
        roleForm.resetFields();
    }, [roleForm]);
    const closeTarget = useCallback(() => {
        setTargetDialog(null);
        targetForm.resetFields();
    }, [targetForm]);
    const closeAccess = useCallback(() => {
        setAccessDialog(null);
        accessForm.resetFields();
    }, [accessForm]);

    const submitMember = useCallback(values => {
        const roleLookup = new Map(roles.data.map(role => [role.id, role]));
        const payload = {
            user_id: values.user_id,
            roles: values.roles.map(id => ({
                role_id: id,
                role_name: roleLookup.get(id)?.role_name
                           ?? roleLookup.get(id)?.role_nickname ?? id,
            })),
        };
        const operation = memberDialog?.user_id
            ? () => api.auth.updateSpaceMember(
                graphSpace, memberDialog.user_id, payload, PAGE_ERROR_CONFIG
            )
            : () => api.auth.addSpaceMember(
                graphSpace, payload, PAGE_ERROR_CONFIG
            );
        runMutation(operation, closeMember);
    }, [closeMember, graphSpace, memberDialog, roles.data, runMutation]);

    const submitRole = useCallback(values => {
        const operation = roleDialog?.id
            ? () => api.auth.updateSpaceRole(
                graphSpace, roleDialog.id, values, PAGE_ERROR_CONFIG
            )
            : () => api.auth.addSpaceRole(
                graphSpace, values, PAGE_ERROR_CONFIG
            );
        runMutation(operation, closeRole);
    }, [closeRole, graphSpace, roleDialog, runMutation]);

    const submitTarget = useCallback(values => {
        let resources;
        try {
            resources = JSON.parse(values.target_resources);
            if (!Array.isArray(resources)) {
                throw new Error('resources must be an array');
            }
        }
        catch (error) {
            targetForm.setFields([{
                name: 'target_resources',
                errors: [t('account.space_access.target.resources_invalid')],
            }]);
            return;
        }
        const payload = {
            target_name: values.target_name,
            target_graph: values.target_graph,
            target_description: values.target_description,
            target_resources: resources,
        };
        const operation = targetDialog?.id
            ? () => api.auth.updateSpaceTarget(
                graphSpace, targetDialog.id, payload, PAGE_ERROR_CONFIG
            )
            : () => api.auth.addSpaceTarget(
                graphSpace, payload, PAGE_ERROR_CONFIG
            );
        runMutation(operation, closeTarget);
    }, [closeTarget, graphSpace, runMutation, t, targetDialog, targetForm]);

    const submitAccess = useCallback(values => {
        runMutation(() => api.auth.saveSpaceAccess(graphSpace, values,
            PAGE_ERROR_CONFIG), closeAccess);
    }, [closeAccess, graphSpace, runMutation]);

    const confirmDelete = useCallback((title, operation) => {
        Modal.confirm({
            title,
            onOk: () => runMutation(operation, () => undefined),
        });
    }, [runMutation]);

    const editMember = useCallback(row => openMember(row), [openMember]);
    const deleteMember = useCallback(row => confirmDelete(
        t('account.space_access.member.remove_confirm'),
        () => api.auth.deleteSpaceMember(
            graphSpace, row.user_id, PAGE_ERROR_CONFIG
        )
    ), [confirmDelete, graphSpace, t]);
    const editRole = useCallback(row => openRole(row), [openRole]);
    const deleteRole = useCallback(row => confirmDelete(
        t('account.space_access.role.delete_confirm'),
        () => api.auth.deleteSpaceRole(graphSpace, row.id, PAGE_ERROR_CONFIG)
    ), [confirmDelete, graphSpace, t]);
    const editTarget = useCallback(row => openTarget(row), [openTarget]);
    const deleteTarget = useCallback(row => confirmDelete(
        t('account.space_access.target.delete_confirm'),
        () => api.auth.deleteSpaceTarget(graphSpace, row.id, PAGE_ERROR_CONFIG)
    ), [confirmDelete, graphSpace, t]);
    const editAccess = useCallback(row => openAccess(row), [openAccess]);
    const deleteAccess = useCallback(row => confirmDelete(
        t('account.space_access.authorization.delete_confirm'),
        () => api.auth.deleteSpaceAccess(
            graphSpace, row.role_id, row.target_id, PAGE_ERROR_CONFIG
        )
    ), [confirmDelete, graphSpace, t]);
    const addMember = useCallback(() => openMember(), [openMember]);
    const addRole = useCallback(() => openRole(), [openRole]);
    const addTarget = useCallback(() => openTarget(), [openTarget]);
    const addAccess = useCallback(() => openAccess(), [openAccess]);
    const retrySpaces = useCallback(
        () => setSpacesRevision(value => value + 1), []
    );
    const submitMemberForm = useCallback(() => memberForm.submit(), [memberForm]);
    const submitRoleForm = useCallback(() => roleForm.submit(), [roleForm]);
    const submitTargetForm = useCallback(() => targetForm.submit(), [targetForm]);
    const submitAccessForm = useCallback(() => accessForm.submit(), [accessForm]);

    const memberColumns = [
        {title: t('account.space_access.member.id'), dataIndex: 'user_id'},
        {title: t('account.space_access.member.name'), dataIndex: 'user_name'},
        {
            title: t('account.space_access.member.roles'),
            dataIndex: 'roles',
            render: value => value?.map(role => (
                <Tag key={role.role_id}>{role.role_name}</Tag>
            )),
        },
        ...((canAddMember || canRemoveMember) ? [{
            title: t('common.operation'),
            render: row => (
                <Space>
                    {canAddMember && (
                        <RowAction row={row} onAction={editMember}>
                            {t('common.action.edit')}
                        </RowAction>
                    )}
                    {canRemoveMember && (
                        <RowAction row={row} onAction={deleteMember}>
                            {t('common.action.delete')}
                        </RowAction>
                    )}
                </Space>
            ),
        }] : []),
    ];

    const roleColumns = [
        {title: t('account.space_access.role.name'), dataIndex: 'role_name'},
        {
            title: t('account.space_access.role.description'),
            dataIndex: 'role_description',
        },
        ...((canUpdateRole || canDeleteRole) ? [{
            title: t('common.operation'),
            render: row => (
                <Space>
                    {canUpdateRole && (
                        <RowAction row={row} onAction={editRole}>
                            {t('common.action.edit')}
                        </RowAction>
                    )}
                    {canDeleteRole && (
                        <RowAction row={row} onAction={deleteRole}>
                            {t('common.action.delete')}
                        </RowAction>
                    )}
                </Space>
            ),
        }] : []),
    ];

    const targetColumns = [
        {title: t('account.space_access.target.name'), dataIndex: 'target_name'},
        {title: t('account.space_access.target.graph'), dataIndex: 'target_graph'},
        {
            title: t('account.space_access.target.description'),
            dataIndex: 'target_description',
        },
        ...((canGrant || canRevoke) ? [{
            title: t('common.operation'),
            render: row => (
                <Space>
                    {canGrant && (
                        <RowAction row={row} onAction={editTarget}>
                            {t('common.action.edit')}
                        </RowAction>
                    )}
                    {canRevoke && (
                        <RowAction row={row} onAction={deleteTarget}>
                            {t('common.action.delete')}
                        </RowAction>
                    )}
                </Space>
            ),
        }] : []),
    ];

    const accessColumns = [
        {title: t('account.space_access.role.name'), dataIndex: 'role_name'},
        {title: t('account.space_access.target.name'), dataIndex: 'target_name'},
        {
            title: t('account.space_access.authorization.permissions'),
            dataIndex: 'permissions',
            render: value => value?.map(permission => (
                <Tag key={permission}>{permission}</Tag>
            )),
        },
        ...((canGrant || canRevoke) ? [{
            title: t('common.operation'),
            render: row => (
                <Space>
                    {canGrant && (
                        <RowAction row={row} onAction={editAccess}>
                            {t('common.action.edit')}
                        </RowAction>
                    )}
                    {canRevoke && (
                        <RowAction row={row} onAction={deleteAccess}>
                            {t('common.action.delete')}
                        </RowAction>
                    )}
                </Space>
            ),
        }] : []),
    ];

    const table = (resource, columns, rowKey, addLabel, onAdd, canAdd) => (
        <>
            <ErrorAlert error={resource.error} retry={resource.retry} t={t} />
            <TableHeader>
                {canAdd && (
                    <Button type="primary" onClick={onAdd}>{addLabel}</Button>
                )}
            </TableHeader>
            <Table
                columns={columns}
                dataSource={resource.data}
                rowKey={rowKey}
                loading={resource.loading}
                pagination={{pageSize: 10, showSizeChanger: false}}
            />
        </>
    );

    if (spacesError) {
        return (
            <ErrorAlert
                error
                retry={retrySpaces}
                t={t}
            />
        );
    }

    if (!spacesLoading && spaces.length === 0) {
        return (
            <Alert
                type="info"
                showIcon
                message={t('account.space_access.no_spaces')}
            />
        );
    }

    return (
        <>
            <Space align="center" wrap>
                <Typography.Text strong>
                    {t('account.space_access.graphspace')}
                </Typography.Text>
                <Select
                    aria-label={t('account.space_access.graphspace')}
                    value={graphSpace}
                    onChange={setSelectedSpace}
                    loading={spacesLoading}
                    options={spaces.map(space => ({label: space, value: space}))}
                    style={{minWidth: 240}}
                />
            </Space>
            <Tabs
                items={[
                    {
                        key: 'members',
                        label: t('account.space_access.tabs.members'),
                        children: table(
                            members, memberColumns, 'user_id',
                            t('account.space_access.member.add'),
                            addMember, canAddMember
                        ),
                    },
                    {
                        key: 'roles',
                        label: t('account.space_access.tabs.roles'),
                        children: table(
                            roles, roleColumns, 'id',
                            t('account.space_access.role.add'),
                            addRole, canCreateRole
                        ),
                    },
                    {
                        key: 'targets',
                        label: t('account.space_access.tabs.targets'),
                        children: table(
                            targets, targetColumns, 'id',
                            t('account.space_access.target.add'),
                            addTarget, canGrant
                        ),
                    },
                    {
                        key: 'authorizations',
                        label: t('account.space_access.tabs.authorizations'),
                        children: table(
                            accesses, accessColumns,
                            accessRowKey,
                            t('account.space_access.authorization.add'),
                            addAccess, canGrant
                        ),
                    },
                ]}
            />

            <Modal
                open={memberDialog !== null}
                title={t('account.space_access.member.dialog')}
                onCancel={closeMember}
                onOk={submitMemberForm}
                confirmLoading={submitting}
                destroyOnClose
            >
                <Form form={memberForm} layout="vertical" onFinish={submitMember}>
                    <Form.Item
                        name="user_id"
                        label={t('account.space_access.member.id')}
                        rules={[{required: true}]}
                    >
                        <Input disabled={Boolean(memberDialog?.user_id)} />
                    </Form.Item>
                    <Form.Item
                        name="roles"
                        label={t('account.space_access.member.roles')}
                        rules={[{required: true, type: 'array', min: 1}]}
                    >
                        <Select
                            mode="multiple"
                            options={roles.data.map(role => ({
                                value: role.id,
                                label: role.role_name ?? role.role_nickname,
                            }))}
                        />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                open={roleDialog !== null}
                title={t('account.space_access.role.dialog')}
                onCancel={closeRole}
                onOk={submitRoleForm}
                confirmLoading={submitting}
                destroyOnClose
            >
                <Form form={roleForm} layout="vertical" onFinish={submitRole}>
                    <Form.Item
                        name="role_name"
                        label={t('account.space_access.role.name')}
                        rules={[{required: true}]}
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item
                        name="role_description"
                        label={t('account.space_access.role.description')}
                    >
                        <Input />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                open={targetDialog !== null}
                title={t('account.space_access.target.dialog')}
                onCancel={closeTarget}
                onOk={submitTargetForm}
                confirmLoading={submitting}
                destroyOnClose
            >
                <Form form={targetForm} layout="vertical" onFinish={submitTarget}>
                    <Form.Item
                        name="target_name"
                        label={t('account.space_access.target.name')}
                        rules={[{required: true}]}
                    >
                        <Input disabled={Boolean(targetDialog?.id)} />
                    </Form.Item>
                    <Form.Item
                        name="target_graph"
                        label={t('account.space_access.target.graph')}
                        rules={[{required: true}]}
                    >
                        <Input disabled={Boolean(targetDialog?.id)} />
                    </Form.Item>
                    <Form.Item
                        name="target_description"
                        label={t('account.space_access.target.description')}
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item
                        name="target_resources"
                        label={t('account.space_access.target.resources')}
                        rules={[{required: true}]}
                    >
                        <Input.TextArea autoSize={{minRows: 5, maxRows: 12}} />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                open={accessDialog !== null}
                title={t('account.space_access.authorization.dialog')}
                onCancel={closeAccess}
                onOk={submitAccessForm}
                confirmLoading={submitting}
                destroyOnClose
            >
                <Form form={accessForm} layout="vertical" onFinish={submitAccess}>
                    <Form.Item
                        name="role_id"
                        label={t('account.space_access.role.name')}
                        rules={[{required: true}]}
                    >
                        <Select
                            disabled={Boolean(accessDialog?.role_id)}
                            options={roles.data.map(role => ({
                                value: role.id,
                                label: role.role_name ?? role.role_nickname,
                            }))}
                        />
                    </Form.Item>
                    <Form.Item
                        name="target_id"
                        label={t('account.space_access.target.name')}
                        rules={[{required: true}]}
                    >
                        <Select
                            disabled={Boolean(accessDialog?.target_id)}
                            options={targets.data.map(target => ({
                                value: target.id,
                                label: target.target_name,
                            }))}
                        />
                    </Form.Item>
                    <Form.Item
                        name="permissions"
                        label={t('account.space_access.authorization.permissions')}
                        rules={[{required: true, type: 'array', min: 1}]}
                    >
                        <Select
                            mode="multiple"
                            options={PERMISSIONS.map(permission => ({
                                value: permission,
                                label: permission,
                            }))}
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
};

export default SpaceAccess;
