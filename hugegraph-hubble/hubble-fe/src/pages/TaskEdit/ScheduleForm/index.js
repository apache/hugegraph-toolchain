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

import {Alert, Typography, Form, Radio, Input, Space, Button, Select} from 'antd';
import {useCallback, useState} from 'react';
import {useTranslation} from 'react-i18next';
import * as rules from '../../../utils/rules';
import FormHelpLabel from '../../../components/FormHelpLabel';

const ScheduleForm = ({prev, visible, datasource, loading}) => {
    const {t} = useTranslation();
    const [scheduleForm] = Form.useForm();
    const [syncType, setSyncType] = useState(0);
    // console.log(datasource);
    const datasourceType = datasource?.datasource_config?.type;
    const scheduleOptions = datasourceType === 'KAFKA'
        ? [{label: t('task.edit.schedule_realtime'), value: 'REALTIME'}]
        : [
            {label: t('task.edit.schedule_once'), value: 'ONCE'},
            {label: t('task.edit.schedule_realtime'), value: 'REALTIME', disabled: true},
            {label: t('task.edit.schedule_cron'), value: 'CRON'},
        ];
    const showLoadType = syncType === 'CRON'
        && ['KAFKA', 'JDBC'].includes(datasourceType);

    const handleSyncTypeChange = useCallback(event => {
        setSyncType(event.target.value);
    }, []);

    return (
        <div style={{display: visible ? '' : 'none'}}>
            <Form
                form={scheduleForm}
                name='schedule_form'
                initialValues={{
                    task_schedule_type: 'ONCE',
                    task_schedule_status: 'ENABLE',
                    task_load_type: 'FULL',
                }}
            >
                <Typography.Title level={5}>{t('task.edit.sync_type')}</Typography.Title>
                <Alert
                    showIcon
                    type='info'
                    message={t('task.edit.schedule_help_title')}
                    description={t('task.edit.schedule_help')}
                />
                <Form.Item
                    label={(
                        <FormHelpLabel
                            label={t('task.edit.sync_type')}
                            help={t('task.edit.sync_type_help')}
                        />
                    )}
                    required
                    name='task_schedule_type'
                >
                    <Radio.Group
                        options={scheduleOptions}
                        onChange={handleSyncTypeChange}
                    />
                </Form.Item>
                {syncType === 'CRON'
                && (
                    <>
                        <Form.Item
                            label={(
                                <FormHelpLabel
                                    label={t('task.edit.cron_expression')}
                                    help={t('task.edit.cron_extra')}
                                />
                            )}
                            wrapperCol={{span: 14}}
                            name='task_schedule_extend'
                            rules={[
                                rules.required(t('task.edit.cron_required')),
                                rules.isCron(t('task.edit.cron_rule')),
                            ]}
                        >
                            <Input placeholder={t('task.edit.cron_placeholder')} />
                        </Form.Item>
                    </>
                )
                }
                {showLoadType ? (
                    <Form.Item
                        label={(
                            <FormHelpLabel
                                label={t('task.edit.load_type')}
                                help={t('task.edit.load_type_help')}
                            />
                        )}
                        name='task_load_type'
                        wrapperCol={{span: 4}}
                    >
                        <Select
                            options={[
                                {label: t('task.edit.load_full'), value: 'FULL'},
                                {label: t('task.edit.load_incremental'), value: 'INCREMENTAL'},
                            ]}
                        />
                    </Form.Item>
                ) : (
                    <Form.Item name='task_load_type' hidden>
                        <Input type='hidden' />
                    </Form.Item>
                )}
                <Form.Item name='task_schedule_status' hidden>
                    <Input type='hidden' />
                </Form.Item>

                <Form.Item wrapperCol={{offset: 4}}>
                    <Space>
                        <Button onClick={prev}>{t('common.action.back')}</Button>
                        <Button type='primary' htmlType='submit' loading={loading}>
                            {t('common.action.confirm')}
                        </Button>
                    </Space>
                </Form.Item>
            </Form>
        </div>
    );
};

export default ScheduleForm;
