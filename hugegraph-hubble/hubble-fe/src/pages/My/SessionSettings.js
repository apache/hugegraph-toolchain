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

import {QuestionCircleOutlined} from '@ant-design/icons';
import {Alert, Button, Card, InputNumber, Radio, Space, Tooltip, message} from 'antd';
import {useCallback, useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import * as api from '../../api';

const UNIT_SECONDS = {hours: 3600, days: 86400};
const toWholeUnits = (seconds, unit) => (
    Number.isInteger(seconds / unit) && seconds > 0 ? seconds / unit : null
);

const SessionSettings = () => {
    const {t} = useTranslation();
    const [settings, setSettings] = useState(null);
    const [seconds, setSeconds] = useState(null);
    const [unit, setUnit] = useState('hours');
    const [failed, setFailed] = useState(false);
    const [saving, setSaving] = useState(false);
    const requestRef = useRef(null);
    const load = useCallback(async () => {
        const request = Symbol('session-settings');
        requestRef.current = request;
        setFailed(false);
        try {
            const res = await api.auth.getSessionSettings();
            if (requestRef.current !== request) {
                return;
            }
            if (res?.status !== 200) {
                throw new Error('session settings unavailable');
            }
            setSettings(res.data);
            setSeconds(res.data.idle_timeout_seconds);
        }
        catch {
            if (requestRef.current === request) {
                setFailed(true);
            }
        }
    }, []);
    useEffect(() => {
        load();
        return () => { requestRef.current = null; };
    }, [load]);
    const save = async () => {
        const request = Symbol('session-save');
        requestRef.current = request;
        setSaving(true);
        try {
            const res = await api.auth.updateSessionSettings(seconds);
            if (requestRef.current === request && res?.status === 200) {
                setSettings(res.data);
                setSeconds(res.data.idle_timeout_seconds);
                message.success(t('my.session.saved'));
            }
        }
        catch {
            // The API layer displays save errors; keep the user's input for retry.
        }
        finally {
            if (requestRef.current === request) {
                setSaving(false);
            }
        }
    };
    const unitSeconds = UNIT_SECONDS[unit];
    const value = toWholeUnits(seconds, unitSeconds);
    const min = Math.max(1, Math.ceil(settings?.min_idle_seconds / unitSeconds));
    const max = Math.floor(settings?.max_idle_seconds / unitSeconds);
    const readOnly = settings && max < min;
    const valid = Number.isInteger(value) && value >= min && value <= max;
    const hint = settings && (readOnly ? t('my.session.deploymentOnly')
        : `${t('my.session.description')} ${t(unit === 'hours' ? 'my.session.range' : 'my.session.rangeDays', {min, max})}`);
    return (
        <Card title={t('my.session.title')} style={{width: 'min(100%, 780px)'}}>
            {failed ? <Alert type='error' title={t('my.session.unavailable')}
                action={<Button onClick={load}>{t('my.load.retry')}</Button>} /> : (
                <Space wrap>
                    <label htmlFor='session-idle-timeout'>{t(unit === 'hours' ? 'my.session.hours' : 'my.session.days')}</label>
                    <InputNumber id='session-idle-timeout' value={value}
                        onChange={next => setSeconds(next === null ? null : next * unitSeconds)}
                        min={min} max={max} step={1} placeholder={settings ? t('my.session.deploymentValue') : ''}
                        disabled={!settings || saving || readOnly} />
                    <Radio.Group value={unit} onChange={event => setUnit(event.target.value)}
                        disabled={!settings || saving} aria-label={t('my.session.unit')} buttonStyle='solid'>
                        <Radio.Button value='hours'>{t('my.session.unitHours')}</Radio.Button>
                        <Radio.Button value='days'>{t('my.session.unitDays')}</Radio.Button>
                    </Radio.Group>
                    <Button type='primary' onClick={save} loading={saving}
                        disabled={!valid || seconds === settings?.idle_timeout_seconds}>
                        {t('common.action.save')}
                    </Button>
                    <Tooltip title={hint} trigger={['hover', 'focus']}>
                        <Button type='text' size='small' aria-label={t('my.session.help')}
                            icon={<QuestionCircleOutlined />} />
                    </Tooltip>
                </Space>
            )}
        </Card>
    );
};
export default SessionSettings;
