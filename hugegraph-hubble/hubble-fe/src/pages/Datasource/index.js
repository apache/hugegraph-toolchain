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
    Alert, Button, Empty, Row, Col, PageHeader, Input, Modal, Table, Space, Spin, Tag,
    message,
} from 'antd';
import {LinkOutlined} from '@ant-design/icons';
import {useState, useEffect, useCallback, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import EditLayer from './EditLayer';
import TableHeader from '../../components/TableHeader';
import {LOADER_DOCS_URL, sourceTypeOptions} from './config';
import * as api from '../../api';
import RowActionButton from '../../components/RowActionButton';
import DataPreparationNav from '../../components/DataPreparationNav';
import styles from './index.module.scss';

const Datasource = () => {
    const {t} = useTranslation();
    const [data, setData] = useState([]);
    const [selectedItems, setSelectedItems] = useState([]);
    const [editLayer, setEditLayer] = useState(false);
    const [refresh, setRefresh] = useState(false);
    const [query, setQuery] = useState('');
    const [pagination, setPagination] = useState({pageSize: 10, current: 1});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [reloadToken, setReloadToken] = useState(0);
    const listRequest = useRef(null);

    const delDatasource = useCallback(datasourceID => {
        api.manage.delDatasource(datasourceID).then(res => {
            if (res.status === 200) {
                message.success(t('common.msg.delete_success'));
                setRefresh(value => !value);
                return;
            }

            message.error(res.message);
        });
    }, [t]);

    const confirmDelete = useCallback(datasourceID => {
        Modal.confirm({
            title: t('datasource.delete_title'),
            content: t('datasource.delete_content'),
            onOk() {
                delDatasource(datasourceID);
            },
        });
    }, [delDatasource, t]);

    const delBatchDatasource = useCallback(list => {
        api.manage.delBatchDatasource(list).then(res => {
            if (res.status === 200) {
                message.success(t('common.msg.delete_success'));
                setRefresh(!refresh);

                return;
            }

            message.error(res.message);
        });
    }, [refresh, t]);

    const handleTable = useCallback(newPagination => {
        setPagination(newPagination);
    }, []);

    const handleSearch = useCallback(val => setQuery(val), []);

    const handleShowLayer = useCallback(() => setEditLayer(true), []);

    const handleHideLayer = useCallback(() => setEditLayer(false), []);

    const handleRefresh = useCallback(() => setRefresh(!refresh), [refresh]);

    const retryList = useCallback(() => setReloadToken(value => value + 1), []);

    const rowKey = useCallback(record => record.datasource_id, []);

    const columns = [
        {
            title: t('datasource.col.name'),
            dataIndex: 'datasource_name',
        },
        {
            title: t('datasource.col.type'),
            dataIndex: 'datasource_config',
            width: 200,
            align: 'center',
            render: config => {
                const option = sourceTypeOptions.find(item => item.value === config.type);
                return option?.labelKey ? t(option.labelKey) : option?.label;
            },
        },
        {
            title: t('datasource.col.creator'),
            dataIndex: 'creator',
            align: 'center',
            width: 200,
        },
        {
            title: t('datasource.col.create_time'),
            dataIndex: 'create_time',
            width: 240,
            align: 'center',
        },
        {
            title: t('datasource.col.operation'),
            dataIndex: 'datasource_id',
            align: 'center',
            width: 140,
            render: val => {
                return (
                    <Space>
                        <RowActionButton onAction={confirmDelete} value={val}>
                            {t('common.action.delete')}
                        </RowActionButton>
                    </Space>
                );
            },
        },
    ];

    const delBatch = useCallback(() => {
        if (selectedItems.length === 0) {
            message.error(t('common.msg.select_one'));
            return;
        }

        Modal.confirm({
            title: t('datasource.delete_title'),
            content: t('datasource.delete_content'),
            onOk() {
                // delDatasource(val);
                delBatchDatasource(selectedItems);
                setSelectedItems([]);
            },
        });
    }, [delBatchDatasource, selectedItems, t]);

    useEffect(() => {
        const token = Symbol('datasource-list');
        listRequest.current = token;
        setLoading(true);
        setLoadError(false);
        api.manage.getDatasourceList({
            query,
            page_no: pagination.current,
        }).then(res => {
            if (listRequest.current !== token) {
                return;
            }
            if (res.status === 200) {
                setData(res.data.records);
                setPagination(value => ({...value, total: res.data.total}));
                return;
            }
            setData([]);
            setLoadError(true);
        }).catch(() => {
            if (listRequest.current === token) {
                setData([]);
                setLoadError(true);
            }
        }).finally(() => {
            if (listRequest.current === token) {
                setLoading(false);
            }
        });

        return () => {
            if (listRequest.current === token) {
                listRequest.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refresh, reloadToken, query, pagination.current]);

    return (
        <>
            <PageHeader
                ghost={false}
                onBack={false}
                title={t('datasource.title')}
            >
                <Row justify='space-between' align='middle' gutter={[12, 12]}>
                    <Col>
                        <Button
                            type='link'
                            href={LOADER_DOCS_URL}
                            target='_blank'
                            rel='noopener noreferrer'
                            icon={<LinkOutlined />}
                        >
                            {t('datasource.form.loader_docs')}
                        </Button>
                    </Col>
                    <Col><Input.Search placeholder={t('datasource.search_placeholder')} onSearch={handleSearch} /></Col>
                </Row>
            </PageHeader>

            <DataPreparationNav active='datasource' />

            <div className='container'>
                {loadError && (
                    <Alert
                        showIcon
                        type='error'
                        message={t('datasource.load_failed')}
                        action={(
                            <Button size='small' onClick={retryList}>
                                {t('datasource.retry')}
                            </Button>
                        )}
                    />
                )}
                <TableHeader>
                    <Space>
                        <Button type='primary' onClick={handleShowLayer}>{t('datasource.create')}</Button>
                        <Button disabled={selectedItems.length === 0} onClick={delBatch}>
                            {t('datasource.delete')}
                        </Button>
                        <span>{t('datasource.selected_count', {
                            selected: selectedItems.length,
                            total: data.length,
                        })}
                        </span>
                    </Space>
                </TableHeader>
                <Spin spinning={loading}>
                    <Table
                        columns={columns}
                        rowKey={rowKey}
                        dataSource={data}
                        rowSelection={{
                            type: 'checkbox',
                            onChange: selectedRowKeys => {
                                setSelectedItems(selectedRowKeys);
                            },
                        }}
                        pagination={pagination}
                        onChange={handleTable}
                        locale={{
                            emptyText: (
                                <Empty
                                    description={(
                                        <div>
                                            <strong>{t('datasource.empty_title')}</strong>
                                            <p>{t('datasource.empty_description')}</p>
                                            <div className={styles.supportedSources}>
                                                <span>{t('datasource.supported_types')}</span>
                                                <Space size={[6, 6]} wrap>
                                                    {sourceTypeOptions.map(option => (
                                                        <Tag key={option.value}>
                                                            {option.labelKey
                                                                ? t(option.labelKey)
                                                                : option.label}
                                                        </Tag>
                                                    ))}
                                                </Space>
                                            </div>
                                            <a
                                                href={LOADER_DOCS_URL}
                                                target='_blank'
                                                rel='noopener noreferrer'
                                            >
                                                {t('datasource.form.loader_docs')}
                                            </a>
                                        </div>
                                    )}
                                >
                                    <Button type='primary' onClick={handleShowLayer}>
                                        {t('datasource.create')}
                                    </Button>
                                </Empty>
                            ),
                        }}
                    />
                </Spin>
                <EditLayer
                    visible={editLayer}
                    onCancel={handleHideLayer}
                    refresh={handleRefresh}
                />
            </div>
        </>
    );
};

export default Datasource;
