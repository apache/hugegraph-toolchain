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

import {Modal, Button, Form, Input, Typography, Select,
    Divider, Upload, Radio, AutoComplete, Checkbox, message, Space} from 'antd';
import {useState, useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import * as api from '../../api';
import * as rules from '../../utils/rules';
import {resolveJdbcConnectionStatus} from './connectionStatus';

const compressionOptions = [
    'NONE',
    'GZIP',
    'BZ2',
    'XZ',
    'LZMA',
    'SNAPPY_RAW',
    'SNAPPY_FRAMED',
    'Z',
    'DEFLATE',
    'LZ4_BLOCK',
    'LZ4_FRAMED',
    'ORC',
    'PARQUET',
];

const fileAccept = {
    CSV: '.csv',
    TEXT: '.txt',
    JSON: '.json',
    GZIP: '.gz,.gzip',
    BZ2: '.bz2',
    XZ: '.xz',
    LZMA: '.lzma',
    SNAPPY_RAW: '.snappy',
    SNAPPY_FRAMED: '.snappy',
    Z: '.z',
    DEFLATE: '.deflate',
    ORC: '.orc',
    PARQUET: '.parquet',
    LZ4_FRAMED: '.lz4',
    LZ4_BLOCK: '.lz4',
};

const fileTypeOptions = [
    {label: '*.CSV', value: 'CSV'},
    {label: '*.TEXT', value: 'TEXT'},
    {label: '*.JSON', value: 'JSON'},
];

const charsetOptions = [
    {label: 'UTF-8', value: 'UTF-8'},
    {label: 'GBK', value: 'GBK'},
    {label: 'ISO-8859-1', value: 'ISO-8859-1'},
    {label: 'US-ASCII', value: 'US-ASCII'},
];

const dateformatOptions = [
    {label: 'yyyy-MM-dd', value: 'yyyy-MM-dd'},
    {label: 'yyyy-MM-dd HH:mm:ss', value: 'yyyy-MM-dd HH:mm:ss'},
    {label: 'yyyy-MM-dd HH:mm:ss.SSS', value: 'yyyy-MM-dd HH:mm:ss.SSS'},
];

const driverList = {
    'MySQL': 'com.mysql.cj.jdbc.Driver',
    'PostgreSQL': 'org.postgresql.Driver',
    'Oracle': 'oracle.jdbc.driver.OracleDriver',
    'SQLServer': 'com.microsoft.sqlserver.jdbc.SQLServerDriver',
    'HIVE': 'org.apache.hive.jdbc.HiveDriver',
};

const normFile = e => {
    if (Array.isArray(e)) {
        return e;
    }

    const {fileList} = e;
    if (fileList.length === 0) {
        return null;
    }

    if (fileList[0].status === 'error') {
        return 'error';
    }

    if (fileList[0].status !== 'done') {
        return null;
    }

    if (fileList[0].response.status !== 200) {
        return 'error';
    }

    return fileList[0]?.response?.data?.file;
};

const formatDatasource = values => {
    const datasource_config = {...values};
    const datasource_name = datasource_config.datasource_name;
    datasource_config.header = datasource_config.header ? datasource_config.header.split(',') : null;
    delete datasource_config.datasource_name;

    return {datasource_name, datasource_config};
};

const requiredRule = (t, label) => rules.required(t('datasource.form.required', {label}));
const requiredUploadRule = (t, label) => rules.required(t('datasource.form.required_upload', {label}));

const UploadForm = ({label, name, accept, extra}) => {
    const {t} = useTranslation();
    const [visible, setVisible] = useState(true);

    const handleChange = useCallback(e => {
        setVisible(e.fileList.length === 0);
    }, []);

    return (
        <Form.Item
            label={label}
            rules={[
                requiredUploadRule(t, label),
                () => ({
                    validator(_, value) {
                        if (value === 'error') {
                            return Promise.reject(t('datasource.form.upload_failed'));
                        }

                        return Promise.resolve();
                    },
                }),
            ]}
            name={name}
            extra={extra}
            valuePropName='file'
            getValueFromEvent={normFile}
        >
            <Upload
                action={api.manage.datasourceUploadUrl}
                maxCount={1}
                onChange={handleChange}
                accept={accept}
            >
                <Button type='link' disabled={!visible}>{t('datasource.form.upload')}</Button>
            </Upload>
        </Form.Item>
    );
};

const CertForm = ({isHive}) => {
    const {t} = useTranslation();
    const [authType, setAuthType] = useState(0);

    const authTypeList = [
        {label: t('datasource.form.auth_none'), value: 0},
        {label: t('datasource.form.auth_kerberos'), value: 1},
    ];

    const handleAuthType = useCallback(e => setAuthType(e.target.value), []);

    return (
        <>
            <Divider />
            <Typography.Title level={5}>{t('datasource.form.auth_info')}</Typography.Title>
            <Form.Item
                label={t('datasource.form.auth_type')}
                rules={[requiredRule(t, t('datasource.form.auth_type'))]}
            >
                <Radio.Group
                    onChange={handleAuthType}
                    options={authTypeList}
                    value={authType}
                />
            </Form.Item>
            {authType === 1 && !isHive
            && (
                <>
                    <UploadForm label={t('datasource.form.keytab_file')} name={['kerberos_config', 'keytab']} />
                    <UploadForm label={t('datasource.form.conf_file')} name={['kerberos_config', 'krb5_conf']} />
                    <Form.Item
                        label='principal'
                        rules={[requiredRule(t, 'principal')]}
                        name={['kerberos_config', 'principal']}
                    >
                        <Input showCount maxLength={50} />
                    </Form.Item>
                    <Form.Item name={['kerberos_config', 'enable']} hidden />
                </>
            )}
            {authType === 1 && isHive
            && (
                <>
                    <UploadForm label='krb5.conf' name={['principals', 'krb5.conf']} />
                    <Form.Item
                        label='principal'
                        rules={[requiredRule(t, 'principal')]}
                        name={['principals', 'principal']}
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item
                        label='user.name'
                        rules={[requiredRule(t, 'user.name')]}
                        name={['principals', 'user.name']}
                    >
                        <Input />
                    </Form.Item>
                    <UploadForm label='user.keytab' name={['principals', 'user.keytab']} />
                    <Form.Item
                        label='zk.quorum'
                        rules={[requiredRule(t, 'zk.quorum')]}
                        name={['principals', 'zk.quorum']}
                    >
                        <Input />
                    </Form.Item>
                </>
            )}
        </>
    );
};

const LocalFileForm = () => {
    const {t} = useTranslation();
    const [fileType, setFileType] = useState('CSV');
    const [accept, setAccept] = useState('.csv');
    const [compression, setCompression] = useState('NONE');

    const handleCompression = useCallback(val => {
        setCompression(val);

        if (val === 'NONE') {
            setAccept(fileAccept[fileType]);
        }
        else {
            setAccept(fileAccept[val]);
        }
    }, [fileType]);

    const handleFormat = useCallback(val => {
        setFileType(val);

        if (compression === 'NONE') {
            setAccept(fileAccept[val]);
        }
    }, [compression]);

    return (
        <>
            <Divider />
            <Typography.Title level={5}>{t('datasource.form.config_info')}</Typography.Title>
            <Form.Item
                label={t('datasource.form.file_type')}
                wrapperCol={{span: 4}}
                rules={[requiredRule(t, t('datasource.form.file_type'))]}
                name='format'
            >
                <Select
                    options={fileTypeOptions}
                    onChange={handleFormat}
                    placeholder={t('datasource.form.select')}
                />
            </Form.Item>
            <Form.Item
                label={t('datasource.form.header')}
                extra={t('datasource.form.header_help')}
                name='header'
            >
                <Input placeholder={t('datasource.form.header_placeholder')} />
            </Form.Item>
            {(fileType === 'TEXT')
            && (
                <Form.Item label={t('datasource.form.delimiter')} wrapperCol={{span: 2}} name='delimiter'>
                    <Input />
                </Form.Item>
            )}
            <details>
                <summary>{t('datasource.form.advanced_config')}</summary>
                <Form.Item
                    label={t('datasource.form.charset')}
                    wrapperCol={{span: 6}}
                    rules={[requiredRule(t, t('datasource.form.charset'))]}
                    name='charset'
                >
                    <AutoComplete options={charsetOptions} />
                </Form.Item>
                <Form.Item
                    label={t('datasource.form.date_format')}
                    wrapperCol={{span: 10}}
                    rules={[requiredRule(t, t('datasource.form.date_format'))]}
                    name='date_format'
                >
                    {/* <Input placeholder='yyyy-MM-dd HH:mm:ss' /> */}
                    <AutoComplete options={dateformatOptions} />
                </Form.Item>
                <Form.Item
                    label={t('datasource.form.time_zone')}
                    wrapperCol={{span: 4}}
                    rules={[requiredRule(t, t('datasource.form.time_zone'))]}
                    name='time_zone'
                >
                    <Select
                        options={[...new Array(25).keys()].map(item => {
                            const str = item === 11 ? '' : (item > 11 ? `+${item - 12}` : item - 12);
                            return {label: `GMT${str}`, value: `GMT${str}`};
                        })}
                    />
                </Form.Item>
                <Form.Item
                    label={t('datasource.form.skipped_line')}
                    wrapperCol={{span: 8}}
                    rules={[requiredRule(t, t('datasource.form.skipped_line'))]}
                    name={['skipped_line', 'regex']}
                >
                    <Input placeholder='(^#|^//).*' />
                </Form.Item>
                <Form.Item
                    label={t('datasource.form.compression')}
                    wrapperCol={{span: 8}}
                    rules={[requiredRule(t, t('datasource.form.compression'))]}
                    name='compression'
                >
                    <Select
                        options={compressionOptions.map(item => ({label: item, value: item}))}
                        onChange={handleCompression}
                    />
                </Form.Item>
            </details>
            <UploadForm
                label={t('datasource.form.local_file')}
                name={'path'}
                accept={accept}
                extra={t('datasource.form.local_file_help')}
            />
            <Typography.Paragraph type='secondary'>
                <a
                    href='https://hugegraph.apache.org/docs/quickstart/toolchain/hugegraph-loader/'
                    target='_blank'
                    rel='noreferrer'
                >
                    {t('datasource.form.loader_docs')}
                </a>
            </Typography.Paragraph>
        </>
    );
};

const HdfsForm = () => {
    const {t} = useTranslation();
    const [fileType, setFileType] = useState('');

    const handleFileType = useCallback(val => setFileType(val), []);

    return (
        <>
            <Divider />
            <Typography.Title level={5}>{t('datasource.form.config_info')}</Typography.Title>
            <Form.Item
                label={t('datasource.form.hdfs_path')}
                extra={t('datasource.form.hdfs_path_help')}
                rules={[requiredRule(t, t('datasource.form.hdfs_path'))]}
                name='path'
            >
                <Input placeholder={t('datasource.form.hdfs_path_placeholder')} />
            </Form.Item>
            <UploadForm
                label={t('datasource.form.core_site')}
                name={'core_site_path'}
                accept='.xml'
                extra={t('datasource.form.core_site_help')}
            />
            <UploadForm
                label={t('datasource.form.hdfs_site')}
                name={'hdfs_site_path'}
                accept='.xml'
                extra={t('datasource.form.hdfs_site_help')}
            />
            <Form.Item
                label={t('datasource.form.file_type')}
                wrapperCol={{span: 4}}
                rules={[requiredRule(t, t('datasource.form.file_type'))]}
                name='format'
            >
                <Select
                    options={fileTypeOptions}
                    onChange={handleFileType}
                    placeholder={t('datasource.form.select')}
                />
            </Form.Item>
            <Form.Item
                label={t('datasource.form.header')}
                extra={t('datasource.form.header_help')}
                name='header'
            >
                <Input placeholder={t('datasource.form.header_placeholder')} />
            </Form.Item>
            <Typography.Paragraph type='secondary'>
                <a
                    href='https://hugegraph.apache.org/docs/quickstart/toolchain/hugegraph-loader/'
                    target='_blank'
                    rel='noreferrer'
                >
                    {t('datasource.form.hdfs_docs')}
                </a>
            </Typography.Paragraph>
            {(fileType === 'TEXT')
            && (
                <Form.Item label={t('datasource.form.delimiter')} wrapperCol={{span: 2}} name='delimiter'>
                    <Input />
                </Form.Item>
            )}
            <details>
                <summary>{t('datasource.form.advanced_config')}</summary>
                <Form.Item
                    label={t('datasource.form.charset')}
                    wrapperCol={{span: 6}}
                    rules={[requiredRule(t, t('datasource.form.charset'))]}
                    name='charset'
                >
                    <AutoComplete options={charsetOptions} />
                </Form.Item>
                <Form.Item
                    label={t('datasource.form.date_format')}
                    wrapperCol={{span: 10}}
                    rules={[requiredRule(t, t('datasource.form.date_format'))]}
                    name='date_format'
                >
                    <AutoComplete options={dateformatOptions} />
                </Form.Item>
                <Form.Item
                    label={t('datasource.form.time_zone')}
                    wrapperCol={{span: 4}}
                    rules={[requiredRule(t, t('datasource.form.time_zone'))]}
                    name='time_zone'
                >
                    <Select
                        options={[...new Array(25).keys()].map(item => {
                            const str = item === 11 ? '' : (item > 11 ? `+${item - 12}` : item - 12);
                            return {label: `GMT${str}`, value: `GMT${str}`};
                        })}
                    />
                </Form.Item>
                <Form.Item
                    label={t('datasource.form.skipped_line')}
                    wrapperCol={{span: 8}}
                    rules={[requiredRule(t, t('datasource.form.skipped_line'))]}
                    name={['skipped_line', 'regex']}
                >
                    <Input placeholder='(^#|^//).*' />
                </Form.Item>
                <Form.Item
                    label={t('datasource.form.compression')}
                    wrapperCol={{span: 8}}
                    rules={[requiredRule(t, t('datasource.form.compression'))]}
                    name='compression'
                >
                    <Select
                        options={compressionOptions.map(item => ({label: item, value: item}))}
                    />
                </Form.Item>
                <CertForm />
            </details>
        </>
    );
};

const KafkaForm = () => {
    const {t} = useTranslation();
    const [fileType, setFileType] = useState('');

    const handleFileType = useCallback(val => setFileType(val), []);

    return (
        <>
            <Divider />
            <Typography.Title level={5}>{t('datasource.form.config_info')}</Typography.Title>
            <Form.Item
                label={t('datasource.form.kafka_servers')}
                extra={t('datasource.form.kafka_servers_help')}
                rules={[requiredRule(t, t('datasource.form.kafka_servers'))]}
                name='bootstrap-server'
            >
                <Input placeholder={t('datasource.form.server_placeholder')} />
            </Form.Item>
            <Form.Item
                label={t('datasource.form.kafka_topic')}
                extra={t('datasource.form.kafka_topic_help')}
                rules={[requiredRule(t, t('datasource.form.kafka_topic'))]}
                name='topic'
            >
                <Input placeholder={t('datasource.form.topic_placeholder')} />
            </Form.Item>
            <Form.Item label={t('datasource.form.from_beginning')} name='from-beginning' valuePropName='checked'>
                <Checkbox />
            </Form.Item>
            <Form.Item
                label={t('datasource.form.file_type')}
                wrapperCol={{span: 4}}
                rules={[requiredRule(t, t('datasource.form.file_type'))]}
                name='format'
            >
                <Select
                    options={fileTypeOptions}
                    onChange={handleFileType}
                    placeholder={t('datasource.form.select')}
                />
            </Form.Item>
            <Form.Item
                label={t('datasource.form.header')}
                extra={t('datasource.form.header_help')}
                name='header'
            >
                <Input placeholder={t('datasource.form.header_placeholder')} />
            </Form.Item>
            {(fileType === 'TEXT')
            && (
                <Form.Item label={t('datasource.form.delimiter')} wrapperCol={{span: 2}} name='delimiter'>
                    <Input />
                </Form.Item>
            )}
            <details>
                <summary>{t('datasource.form.advanced_config')}</summary>
                <Form.Item
                    label={t('datasource.form.charset')}
                    wrapperCol={{span: 6}}
                    rules={[requiredRule(t, t('datasource.form.charset'))]}
                    name='charset'
                >
                    <AutoComplete options={charsetOptions} />
                </Form.Item>
                <Form.Item
                    label={t('datasource.form.date_format')}
                    wrapperCol={{span: 10}}
                    rules={[requiredRule(t, t('datasource.form.date_format'))]}
                    name='date_format'
                >
                    {/* <Input placeholder='yyyy-MM-dd HH:mm:ss' /> */}
                    <AutoComplete options={dateformatOptions} />
                </Form.Item>
                <Form.Item
                    label={t('datasource.form.time_zone')}
                    wrapperCol={{span: 4}}
                    rules={[requiredRule(t, t('datasource.form.time_zone'))]}
                    name='time_zone'
                >
                    <Select
                        options={[...new Array(25).keys()].map(item => {
                            const str = item === 11 ? '' : (item > 11 ? `+${item - 12}` : item - 12);
                            return {label: `GMT${str}`, value: `GMT${str}`};
                        })}
                    />
                </Form.Item>
                <Form.Item
                    label={t('datasource.form.skipped_line')}
                    wrapperCol={{span: 8}}
                    rules={[requiredRule(t, t('datasource.form.skipped_line'))]}
                    name={['skipped_line', 'regex']}
                >
                    <Input placeholder='(^#|^//).*' />
                </Form.Item>
            </details>
            <Typography.Paragraph type='secondary'>
                <a
                    href='https://hugegraph.apache.org/docs/quickstart/toolchain/hugegraph-loader/'
                    target='_blank'
                    rel='noreferrer'
                >
                    {t('datasource.form.loader_docs')}
                </a>
            </Typography.Paragraph>
        </>
    );
};

const JDBCForm = ({setField, form}) => {
    const {t} = useTranslation();
    const [vendor, setVendor] = useState('');
    const [status, setStatus] = useState({type: '', message: ''});

    const vendorOptions = [
        {label: 'MySQL', value: 'MySQL'},
        {label: 'PostgreSQL', value: 'PostgreSQL'},
        {label: 'Oracle', value: 'Oracle'},
        {label: 'SQLServer', value: 'SQLServer'},
        {label: 'HIVE', value: 'HIVE'},
    ];

    const handleTest = useCallback(() => {
        form.validateFields([
            'type', 'vendor', 'driver', 'url', 'database',
            'schema', 'table', 'username', 'password', 'batch_size', 'where',
        ]).then(values => {
            const formatData = formatDatasource(values);
            api.manage.checkJDBC(formatData).then(res => {
                const nextStatus = resolveJdbcConnectionStatus(res, t);
                setStatus(nextStatus);

                if (res.status !== 200) {
                    message.error(nextStatus.message);
                    return;
                }
            });
        });
    }, [form, t]);

    const handleVendor = useCallback(val => {
        setField({'driver': driverList[val]});
        setVendor(val);
    }, [setField]);

    return (
        <>
            <Divider />
            <Typography.Title level={5}>{t('datasource.form.config_info')}</Typography.Title>
            <Form.Item
                label={t('datasource.form.db_type')}
                rules={[requiredRule(t, t('datasource.form.db_type'))]}
                name='vendor'
            >
                <Select
                    options={vendorOptions}
                    onChange={handleVendor}
                    placeholder={t('datasource.form.select_db_type')}
                />
            </Form.Item>
            <Form.Item label={t('datasource.form.jdbc_driver')} name='driver'>
                <Input readOnly />
            </Form.Item>
            <Form.Item
                label='URL'
                extra={t('datasource.form.jdbc_url_help')}
                rules={[requiredRule(t, 'URL'), rules.isJDBC(t('datasource.form.url_rule'))]}
                name='url'
            >
                <Input placeholder={t('datasource.form.url_placeholder')} />
            </Form.Item>
            <Form.Item
                label={t('datasource.form.database')}
                rules={[requiredRule(t, t('datasource.form.database'))]}
                name='database'
            >
                <Input placeholder={t('datasource.form.database_placeholder')} />
            </Form.Item>
            {(vendor === 'Oracle' || vendor === 'PostgreSQL') && (
                <Form.Item label={t('datasource.form.database_schema')} name='schema'>
                    <Input placeholder={t('datasource.form.schema_placeholder')} />
                </Form.Item>)
            }
            {vendor === 'SQLServer' && (
                <Form.Item
                    label={t('datasource.form.database_schema')}
                    name='schema'
                    rules={[requiredRule(t, t('datasource.form.database_schema'))]}
                >
                    <Input placeholder={t('datasource.form.schema_placeholder')} />
                </Form.Item>)
            }
            <Form.Item
                label={t('datasource.form.table')}
                rules={[requiredRule(t, t('datasource.form.table'))]}
                name='table'
            >
                <Input placeholder={t('datasource.form.table_placeholder')} />
            </Form.Item>
            <Form.Item
                label={t('datasource.form.username')}
                rules={[requiredRule(t, t('datasource.form.username'))]}
                name='username'
            >
                <Input placeholder={t('datasource.form.username_placeholder')} />
            </Form.Item>
            <Form.Item
                label={t('datasource.form.password')}
                rules={[requiredRule(t, t('datasource.form.password'))]}
                name='password'
            >
                <Input.Password placeholder={t('datasource.form.password_placeholder')} autoComplete='new-password' />
            </Form.Item>
            <Form.Item label={t('datasource.form.page_size')} name='batch_size' wrapperCol={{span: 4}} hidden>
                <Input />
            </Form.Item>
            {vendor === 'HIVE'
            && (
                <>
                    <Form.Item label={t('datasource.form.where')} name='where'>
                        <Input placeholder={t('datasource.form.where_placeholder')} />
                    </Form.Item>
                    <CertForm isHive />
                </>
            )}
            <Form.Item wrapperCol={{offset: 5}}>
                <Space>
                    <Button onClick={handleTest}>{t('datasource.form.test_connection')}</Button>
                    <Typography.Text type={status.type === 'success' ? 'success' : 'danger'}>
                        {status.message}
                    </Typography.Text>
                </Space>
            </Form.Item>
            <Typography.Paragraph type='secondary'>
                <a
                    href='https://hugegraph.apache.org/docs/quickstart/toolchain/hugegraph-loader/'
                    target='_blank'
                    rel='noreferrer'
                >
                    {t('datasource.form.loader_docs')}
                </a>
            </Typography.Paragraph>
        </>
    );
};

const EditLayer = ({edit, visible, onCancel, refresh}) => {
    const {t} = useTranslation();
    const [sourceType, setSourceType] = useState('');
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();

    const sourceTypeOptions = [
        {label: 'HDFS', value: 'HDFS'},
        {label: t('datasource.form.local_upload'), value: 'FILE'},
        {label: 'Kafka', value: 'KAFKA'},
        {label: 'JDBC', value: 'JDBC'},
    ];

    const onFinish = useCallback(() => {
        if (loading) {
            return;
        }

        form.validateFields().then(values => {
            const formatData = formatDatasource(values);
            // return;
            setLoading(true);
            api.manage.addDatasource(formatData).then(res => {
                setLoading(false);

                if (res.status === 200) {
                    message.success(t('common.msg.create_success'));
                    onCancel();
                    refresh();
                    return;
                }

                message.error(res.message);
            });
        });
    }, [form, loading, onCancel, refresh, t]);

    const handleClose = useCallback(() => setSourceType(''), []);

    const handleType = useCallback(val => setSourceType(val), []);

    return (
        <Modal
            title={edit ? t('datasource.form.title_edit') : t('datasource.form.title_create')}
            onCancel={onCancel}
            open={visible}
            width={600}
            onOk={onFinish}
            confirmLoading={loading}
            afterClose={handleClose}
            destroyOnClose
        >
            <Form
                form={form}
                labelCol={{span: 5}}
                initialValues={{
                    batch_size: 500,
                    split: ',',
                    date_format: 'yyyy-MM-dd HH:mm:ss',
                    skipped_line: {
                        regex: '(^#|^//).*',
                    },
                    charset: 'UTF-8',
                    time_zone: 'GMT+8',
                    compression: 'NONE',
                    kerberos_config: {
                        enable: true,
                    },
                    delimiter: ',',
                    'from-beginning': false,
                    format: 'CSV',
                }}
            >
                <Typography.Title level={5}>{t('datasource.form.basic_info')}</Typography.Title>
                <Form.Item
                    label={t('datasource.form.name')}
                    name='datasource_name'
                    rules={[
                        requiredRule(t, t('datasource.form.name')),
                        {type: 'string', max: 50},
                        rules.isPropertyName(t('datasource.form.name_rule')),
                    ]}
                >
                    <Input showCount maxLength={50} placeholder={t('datasource.form.name_placeholder')} />
                </Form.Item>
                <Form.Item
                    label={t('datasource.form.type')}
                    name='type'
                    rules={[requiredRule(t, t('datasource.form.type'))]}
                >
                    <Select
                        options={sourceTypeOptions}
                        onChange={handleType}
                        placeholder={t('datasource.form.select_type')}
                    />
                </Form.Item>

                {(sourceType === 'FILE')
                && (
                    <LocalFileForm />
                )}

                {sourceType === 'KAFKA'
                && (
                    <KafkaForm />
                )}

                {sourceType === 'HDFS'
                && (
                    <HdfsForm />
                )}

                {sourceType === 'JDBC'
                && (
                    <JDBCForm setField={form.setFieldsValue} form={form} />
                )}
            </Form>
        </Modal>
    );
};

export default EditLayer;
