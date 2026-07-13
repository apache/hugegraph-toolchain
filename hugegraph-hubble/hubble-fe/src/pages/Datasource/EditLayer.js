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
import FormHelpLabel from '../../components/FormHelpLabel';

export const BUILTIN_DATASOURCE_TEMPLATES = {
    local_csv: {
        type: 'FILE',
        datasource_name: 'local_csv_example',
        format: 'CSV',
        header: 'id,name,age',
        charset: 'UTF-8',
        time_zone: 'GMT+8',
        compression: 'NONE',
    },
    hdfs_csv: {
        type: 'HDFS',
        datasource_name: 'hdfs_csv_example',
        path: 'hdfs://127.0.0.1:8020/data/vertices.csv',
        format: 'CSV',
        header: 'id,name,age',
        charset: 'UTF-8',
        time_zone: 'GMT+8',
        compression: 'NONE',
    },
    kafka_json: {
        type: 'KAFKA',
        datasource_name: 'kafka_json_example',
        format: 'JSON',
        'bootstrap-server': '127.0.0.1:9092',
        topic: 'graph-events',
        charset: 'UTF-8',
        'from-beginning': false,
    },
    jdbc_mysql: {
        type: 'JDBC',
        datasource_name: 'mysql_table_example',
        vendor: 'MySQL',
        driver: 'com.mysql.cj.jdbc.Driver',
        url: 'jdbc:mysql://127.0.0.1:3306',
        database: 'example',
        table: 'person',
        username: 'root',
        batch_size: 500,
    },
};

export const DATASOURCE_FIELD_HELP_KEYS = {
    common: ['template', 'name', 'type'],
    file: [
        'file_type', 'header', 'delimiter', 'charset', 'date_format',
        'time_zone', 'skipped_line', 'compression', 'local_file',
    ],
    hdfs: [
        'hdfs_path', 'core_site', 'hdfs_site', 'file_type', 'header',
        'delimiter', 'charset', 'date_format', 'time_zone', 'skipped_line',
        'compression', 'auth_type', 'keytab_file', 'conf_file', 'principal',
    ],
    kafka: [
        'kafka_servers', 'kafka_topic', 'from_beginning', 'file_type',
        'header', 'delimiter', 'charset', 'date_format', 'time_zone',
        'skipped_line',
    ],
    jdbc: [
        'db_type', 'jdbc_driver', 'jdbc_url', 'database', 'database_schema',
        'table', 'username', 'password', 'where', 'auth_type', 'krb5_conf',
        'principal', 'user_name', 'user_keytab', 'zk_quorum',
    ],
};

const HelpLabel = ({t, labelKey, helpKey = `${labelKey}_help`}) => (
    <FormHelpLabel
        label={t(labelKey)}
        help={t(helpKey, {label: t(labelKey)})}
    />
);

const TextHelpLabel = ({t, label, helpKey}) => (
    <FormHelpLabel label={label} help={t(helpKey)} />
);

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

const SOURCE_CONFIG_FIELDS = [
    'path', 'core_site_path', 'hdfs_site_path', 'format', 'header', 'delimiter',
    'date_format', 'time_zone', 'skipped_line', 'charset', 'compression',
    'bootstrap-server', 'topic', 'from-beginning', 'vendor', 'driver', 'url',
    'database', 'schema', 'table', 'username', 'password', 'batch_size', 'where',
    'kerberos_config', 'principals',
];

export const applyDatasourceTemplate = (form, key) => {
    const template = BUILTIN_DATASOURCE_TEMPLATES[key];
    form.resetFields(['datasource_name', ...SOURCE_CONFIG_FIELDS]);
    form.setFieldsValue(template);
    return template.type;
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

const UploadForm = ({label, validationLabel, name, accept, extra, required = true}) => {
    const {t} = useTranslation();
    const [visible, setVisible] = useState(true);

    const handleChange = useCallback(e => {
        setVisible(e.fileList.length === 0);
    }, []);

    return (
        <Form.Item
            label={label}
            rules={[
                ...(required ? [requiredUploadRule(t, validationLabel)] : []),
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
                label={<HelpLabel t={t} labelKey='datasource.form.auth_type' />}
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
                    <UploadForm
                        label={<HelpLabel t={t} labelKey='datasource.form.keytab_file' />}
                        validationLabel={t('datasource.form.keytab_file')}
                        name={['kerberos_config', 'keytab']}
                    />
                    <UploadForm
                        label={<HelpLabel t={t} labelKey='datasource.form.conf_file' />}
                        validationLabel={t('datasource.form.conf_file')}
                        name={['kerberos_config', 'krb5_conf']}
                    />
                    <Form.Item
                        label={(
                            <TextHelpLabel
                                t={t}
                                label='principal'
                                helpKey='datasource.form.principal_help'
                            />
                        )}
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
                    <UploadForm
                        label={(
                            <TextHelpLabel
                                t={t}
                                label='krb5.conf'
                                helpKey='datasource.form.krb5_conf_help'
                            />
                        )}
                        validationLabel='krb5.conf'
                        name={['principals', 'krb5.conf']}
                    />
                    <Form.Item
                        label={(
                            <TextHelpLabel
                                t={t}
                                label='principal'
                                helpKey='datasource.form.principal_help'
                            />
                        )}
                        rules={[requiredRule(t, 'principal')]}
                        name={['principals', 'principal']}
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item
                        label={(
                            <TextHelpLabel
                                t={t}
                                label='user.name'
                                helpKey='datasource.form.user_name_help'
                            />
                        )}
                        rules={[requiredRule(t, 'user.name')]}
                        name={['principals', 'user.name']}
                    >
                        <Input />
                    </Form.Item>
                    <UploadForm
                        label={(
                            <TextHelpLabel
                                t={t}
                                label='user.keytab'
                                helpKey='datasource.form.user_keytab_help'
                            />
                        )}
                        validationLabel='user.keytab'
                        name={['principals', 'user.keytab']}
                    />
                    <Form.Item
                        label={(
                            <TextHelpLabel
                                t={t}
                                label='zk.quorum'
                                helpKey='datasource.form.zk_quorum_help'
                            />
                        )}
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
                label={<HelpLabel t={t} labelKey='datasource.form.file_type' />}
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
                label={<HelpLabel t={t} labelKey='datasource.form.header' helpKey='datasource.form.header_help' />}
                extra={t('datasource.form.header_help')}
                name='header'
            >
                <Input placeholder={t('datasource.form.header_placeholder')} />
            </Form.Item>
            {(fileType === 'TEXT')
            && (
                <Form.Item
                    label={<HelpLabel t={t} labelKey='datasource.form.delimiter' />}
                    wrapperCol={{span: 2}}
                    name='delimiter'
                >
                    <Input />
                </Form.Item>
            )}
            <details>
                <summary>{t('datasource.form.advanced_config')}</summary>
                <Form.Item
                    label={<HelpLabel t={t} labelKey='datasource.form.charset' />}
                    wrapperCol={{span: 6}}
                    rules={[requiredRule(t, t('datasource.form.charset'))]}
                    name='charset'
                >
                    <AutoComplete options={charsetOptions} />
                </Form.Item>
                <Form.Item
                    label={<HelpLabel t={t} labelKey='datasource.form.date_format' />}
                    wrapperCol={{span: 10}}
                    rules={[requiredRule(t, t('datasource.form.date_format'))]}
                    name='date_format'
                >
                    {/* <Input placeholder='yyyy-MM-dd HH:mm:ss' /> */}
                    <AutoComplete options={dateformatOptions} />
                </Form.Item>
                <Form.Item
                    label={<HelpLabel t={t} labelKey='datasource.form.time_zone' />}
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
                    label={<HelpLabel t={t} labelKey='datasource.form.skipped_line' />}
                    wrapperCol={{span: 8}}
                    rules={[requiredRule(t, t('datasource.form.skipped_line'))]}
                    name={['skipped_line', 'regex']}
                >
                    <Input placeholder='(^#|^//).*' />
                </Form.Item>
                <Form.Item
                    label={<HelpLabel t={t} labelKey='datasource.form.compression' />}
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
                label={(
                    <HelpLabel
                        t={t}
                        labelKey='datasource.form.local_file'
                        helpKey='datasource.form.local_file_help'
                    />
                )}
                validationLabel={t('datasource.form.local_file')}
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
                label={(
                    <HelpLabel
                        t={t}
                        labelKey='datasource.form.hdfs_path'
                        helpKey='datasource.form.hdfs_path_help'
                    />
                )}
                extra={t('datasource.form.hdfs_path_help')}
                rules={[requiredRule(t, t('datasource.form.hdfs_path'))]}
                name='path'
            >
                <Input placeholder={t('datasource.form.hdfs_path_placeholder')} />
            </Form.Item>
            <UploadForm
                label={(
                    <HelpLabel
                        t={t}
                        labelKey='datasource.form.core_site'
                        helpKey='datasource.form.core_site_help'
                    />
                )}
                validationLabel={t('datasource.form.core_site')}
                name={'core_site_path'}
                accept='.xml'
                extra={t('datasource.form.core_site_help')}
            />
            <UploadForm
                label={(
                    <HelpLabel
                        t={t}
                        labelKey='datasource.form.hdfs_site'
                        helpKey='datasource.form.hdfs_site_help'
                    />
                )}
                validationLabel={t('datasource.form.hdfs_site')}
                name={'hdfs_site_path'}
                accept='.xml'
                extra={t('datasource.form.hdfs_site_help')}
                required={false}
            />
            <Form.Item
                label={<HelpLabel t={t} labelKey='datasource.form.file_type' />}
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
                label={<HelpLabel t={t} labelKey='datasource.form.header' helpKey='datasource.form.header_help' />}
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
                <Form.Item
                    label={<HelpLabel t={t} labelKey='datasource.form.delimiter' />}
                    wrapperCol={{span: 2}}
                    name='delimiter'
                >
                    <Input />
                </Form.Item>
            )}
            <details>
                <summary>{t('datasource.form.advanced_config')}</summary>
                <Form.Item
                    label={<HelpLabel t={t} labelKey='datasource.form.charset' />}
                    wrapperCol={{span: 6}}
                    rules={[requiredRule(t, t('datasource.form.charset'))]}
                    name='charset'
                >
                    <AutoComplete options={charsetOptions} />
                </Form.Item>
                <Form.Item
                    label={<HelpLabel t={t} labelKey='datasource.form.date_format' />}
                    wrapperCol={{span: 10}}
                    rules={[requiredRule(t, t('datasource.form.date_format'))]}
                    name='date_format'
                >
                    <AutoComplete options={dateformatOptions} />
                </Form.Item>
                <Form.Item
                    label={<HelpLabel t={t} labelKey='datasource.form.time_zone' />}
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
                    label={<HelpLabel t={t} labelKey='datasource.form.skipped_line' />}
                    wrapperCol={{span: 8}}
                    rules={[requiredRule(t, t('datasource.form.skipped_line'))]}
                    name={['skipped_line', 'regex']}
                >
                    <Input placeholder='(^#|^//).*' />
                </Form.Item>
                <Form.Item
                    label={<HelpLabel t={t} labelKey='datasource.form.compression' />}
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
                label={(
                    <HelpLabel
                        t={t}
                        labelKey='datasource.form.kafka_servers'
                        helpKey='datasource.form.kafka_servers_help'
                    />
                )}
                extra={t('datasource.form.kafka_servers_help')}
                rules={[requiredRule(t, t('datasource.form.kafka_servers'))]}
                name='bootstrap-server'
            >
                <Input placeholder={t('datasource.form.server_placeholder')} />
            </Form.Item>
            <Form.Item
                label={(
                    <HelpLabel
                        t={t}
                        labelKey='datasource.form.kafka_topic'
                        helpKey='datasource.form.kafka_topic_help'
                    />
                )}
                extra={t('datasource.form.kafka_topic_help')}
                rules={[requiredRule(t, t('datasource.form.kafka_topic'))]}
                name='topic'
            >
                <Input placeholder={t('datasource.form.topic_placeholder')} />
            </Form.Item>
            <Form.Item
                label={<HelpLabel t={t} labelKey='datasource.form.from_beginning' />}
                name='from-beginning'
                valuePropName='checked'
            >
                <Checkbox />
            </Form.Item>
            <Form.Item
                label={<HelpLabel t={t} labelKey='datasource.form.file_type' />}
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
                label={<HelpLabel t={t} labelKey='datasource.form.header' helpKey='datasource.form.header_help' />}
                extra={t('datasource.form.header_help')}
                name='header'
            >
                <Input placeholder={t('datasource.form.header_placeholder')} />
            </Form.Item>
            {(fileType === 'TEXT')
            && (
                <Form.Item
                    label={<HelpLabel t={t} labelKey='datasource.form.delimiter' />}
                    wrapperCol={{span: 2}}
                    name='delimiter'
                >
                    <Input />
                </Form.Item>
            )}
            <details>
                <summary>{t('datasource.form.advanced_config')}</summary>
                <Form.Item
                    label={<HelpLabel t={t} labelKey='datasource.form.charset' />}
                    wrapperCol={{span: 6}}
                    rules={[requiredRule(t, t('datasource.form.charset'))]}
                    name='charset'
                >
                    <AutoComplete options={charsetOptions} />
                </Form.Item>
                <Form.Item
                    label={<HelpLabel t={t} labelKey='datasource.form.date_format' />}
                    wrapperCol={{span: 10}}
                    rules={[requiredRule(t, t('datasource.form.date_format'))]}
                    name='date_format'
                >
                    {/* <Input placeholder='yyyy-MM-dd HH:mm:ss' /> */}
                    <AutoComplete options={dateformatOptions} />
                </Form.Item>
                <Form.Item
                    label={<HelpLabel t={t} labelKey='datasource.form.time_zone' />}
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
                    label={<HelpLabel t={t} labelKey='datasource.form.skipped_line' />}
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
    const vendor = Form.useWatch('vendor', form) || '';
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
    }, [setField]);

    return (
        <>
            <Divider />
            <Typography.Title level={5}>{t('datasource.form.config_info')}</Typography.Title>
            <Form.Item
                label={<HelpLabel t={t} labelKey='datasource.form.db_type' />}
                rules={[requiredRule(t, t('datasource.form.db_type'))]}
                name='vendor'
            >
                <Select
                    options={vendorOptions}
                    onChange={handleVendor}
                    placeholder={t('datasource.form.select_db_type')}
                />
            </Form.Item>
            <Form.Item
                label={<HelpLabel t={t} labelKey='datasource.form.jdbc_driver' />}
                name='driver'
            >
                <Input readOnly />
            </Form.Item>
            <Form.Item
                label={<FormHelpLabel label='URL' help={t('datasource.form.jdbc_url_help')} />}
                extra={t('datasource.form.jdbc_url_help')}
                rules={[requiredRule(t, 'URL'), rules.isJDBC(t('datasource.form.url_rule'))]}
                name='url'
            >
                <Input placeholder={t('datasource.form.url_placeholder')} />
            </Form.Item>
            <Form.Item
                label={<HelpLabel t={t} labelKey='datasource.form.database' />}
                rules={[requiredRule(t, t('datasource.form.database'))]}
                name='database'
            >
                <Input placeholder={t('datasource.form.database_placeholder')} />
            </Form.Item>
            {(vendor === 'Oracle' || vendor === 'PostgreSQL') && (
                <Form.Item
                    label={<HelpLabel t={t} labelKey='datasource.form.database_schema' />}
                    name='schema'
                >
                    <Input placeholder={t('datasource.form.schema_placeholder')} />
                </Form.Item>)
            }
            {vendor === 'SQLServer' && (
                <Form.Item
                    label={<HelpLabel t={t} labelKey='datasource.form.database_schema' />}
                    name='schema'
                    rules={[requiredRule(t, t('datasource.form.database_schema'))]}
                >
                    <Input placeholder={t('datasource.form.schema_placeholder')} />
                </Form.Item>)
            }
            <Form.Item
                label={<HelpLabel t={t} labelKey='datasource.form.table' />}
                rules={[requiredRule(t, t('datasource.form.table'))]}
                name='table'
            >
                <Input placeholder={t('datasource.form.table_placeholder')} />
            </Form.Item>
            <Form.Item
                label={<HelpLabel t={t} labelKey='datasource.form.username' />}
                rules={[requiredRule(t, t('datasource.form.username'))]}
                name='username'
            >
                <Input placeholder={t('datasource.form.username_placeholder')} />
            </Form.Item>
            <Form.Item
                label={<HelpLabel t={t} labelKey='datasource.form.password' />}
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
                    <Form.Item
                        label={<HelpLabel t={t} labelKey='datasource.form.where' />}
                        name='where'
                    >
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
    const [selectedTemplate, setSelectedTemplate] = useState(undefined);
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

    const handleClose = useCallback(() => {
        form.resetFields();
        setSourceType('');
        setSelectedTemplate(undefined);
    }, [form]);

    const handleType = useCallback(val => {
        form.resetFields(SOURCE_CONFIG_FIELDS);
        form.setFieldsValue({type: val});
        setSourceType(val);
        setSelectedTemplate(undefined);
    }, [form]);
    const applyBuiltinTemplate = useCallback(key => {
        setSourceType(applyDatasourceTemplate(form, key));
        setSelectedTemplate(key);
    }, [form]);

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
                preserve={false}
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
                {!edit && (
                    <Form.Item
                        label={(
                            <HelpLabel
                                t={t}
                                labelKey='datasource.form.template'
                                helpKey='datasource.form.template_help'
                            />
                        )}
                    >
                        <Select
                            placeholder={t('datasource.form.template_placeholder')}
                            onSelect={applyBuiltinTemplate}
                            value={selectedTemplate}
                            options={Object.keys(BUILTIN_DATASOURCE_TEMPLATES).map(key => ({
                                value: key,
                                label: t(`datasource.form.templates.${key}`),
                            }))}
                        />
                    </Form.Item>
                )}
                <Form.Item
                    label={<HelpLabel t={t} labelKey='datasource.form.name' />}
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
                    label={<HelpLabel t={t} labelKey='datasource.form.type' />}
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
