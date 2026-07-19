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

import {Button, Input, Space, Typography} from 'antd';
import {CheckOutlined, CloseOutlined, EditOutlined} from '@ant-design/icons';
import {useCallback, useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {getResourceAlias, getResourceDisplayName} from '../../utils/displayName';
import style from './index.module.scss';

const EditableNicknameCell = ({canEdit, name, nickname, onSave, renderValue}) => {
    const {t} = useTranslation();
    const [value, setValue] = useState(() => getResourceAlias(name, nickname));
    const [draft, setDraft] = useState(() => getResourceAlias(name, nickname));
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const editingRef = useRef(false);
    const savingRef = useRef(false);

    useEffect(() => {
        if (!editingRef.current) {
            const nextValue = getResourceAlias(name, nickname);
            setValue(nextValue);
            setDraft(nextValue);
        }
    }, [name, nickname]);

    const startEditing = useCallback(() => {
        setDraft(value);
        setError('');
        editingRef.current = true;
        setEditing(true);
    }, [value]);

    const cancelEditing = useCallback(() => {
        if (savingRef.current) {
            return;
        }
        setDraft(value);
        setError('');
        editingRef.current = false;
        setEditing(false);
    }, [value]);

    const save = useCallback(async () => {
        if (savingRef.current) {
            return;
        }
        savingRef.current = true;
        setSaving(true);
        setError('');
        try {
            const savedValue = await onSave(draft);
            const nextValue = typeof savedValue === 'string' ? savedValue : draft;
            setValue(getResourceAlias(name, nextValue));
            setDraft(getResourceAlias(name, nextValue));
            editingRef.current = false;
            setEditing(false);
        }
        catch (saveError) {
            setError(saveError?.message || t('common.msg.operation_failed'));
        }
        finally {
            savingRef.current = false;
            setSaving(false);
        }
    }, [draft, name, onSave, t]);

    const handleKeyDown = useCallback(event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            save();
        }
        else if (event.key === 'Escape') {
            event.preventDefault();
            cancelEditing();
        }
    }, [cancelEditing, save]);

    const handleChange = useCallback(event => {
        setDraft(event.target.value);
    }, []);

    return (
        <div className={style.nickname_cell}>
            {editing ? (
                <>
                    <Space size={4}>
                        <Input
                            autoFocus
                            aria-label={t('graph.form.nickname')}
                            disabled={saving}
                            maxLength={48}
                            onChange={handleChange}
                            onKeyDown={handleKeyDown}
                            value={draft}
                        />
                        <Button
                            aria-label={t('common.action.save')}
                            disabled={saving}
                            icon={<CheckOutlined />}
                            loading={saving}
                            onClick={save}
                            size='small'
                            type='text'
                        />
                        <Button
                            aria-label={t('common.action.cancel')}
                            disabled={saving}
                            icon={<CloseOutlined />}
                            onClick={cancelEditing}
                            size='small'
                            type='text'
                        />
                    </Space>
                    {error && (
                        <Typography.Text className={style.nickname_error} role='alert' type='danger'>
                            {error}
                        </Typography.Text>
                    )}
                </>
            ) : (
                <Space size={4}>
                    {renderValue
                        ? renderValue(getResourceDisplayName(name, value))
                        : <span>{getResourceDisplayName(name, value)}</span>}
                    {canEdit && (
                        <Button
                            aria-label={`${t('common.action.edit')} ${t('graph.form.nickname')}`}
                            icon={<EditOutlined />}
                            onClick={startEditing}
                            size='small'
                            type='text'
                        />
                    )}
                </Space>
            )}
            {value && (
                <Typography.Text className={style.graph_path_name} type='secondary'>
                    {name}
                </Typography.Text>
            )}
        </div>
    );
};

export default EditableNicknameCell;
