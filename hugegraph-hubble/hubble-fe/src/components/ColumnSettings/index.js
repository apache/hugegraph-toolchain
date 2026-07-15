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

import React, {useCallback, useMemo, useState} from 'react';
import {Button, Checkbox, Popover, Space, Tooltip} from 'antd';
import {
    DownOutlined,
    SettingOutlined,
    UpOutlined,
} from '@ant-design/icons';
import c from './index.module.scss';

const EMPTY_PREFERENCES = {};

const columnKey = column => String(column.key || column.dataIndex);

export const normalizeColumnPreferences = (columns, preferences, requiredKeys = []) => {
    const available = columns.map(columnKey);
    const savedOrder = Array.isArray(preferences?.order) ? preferences.order : [];
    const order = [
        ...savedOrder.filter((key, index) => (
            available.includes(key) && savedOrder.indexOf(key) === index
        )),
        ...available.filter(key => !savedOrder.includes(key)),
    ];
    const required = new Set(requiredKeys.map(String));
    const savedHidden = Array.isArray(preferences?.hidden) ? preferences.hidden : [];
    const hidden = savedHidden.filter((key, index) => (
        available.includes(key) && !required.has(key)
        && savedHidden.indexOf(key) === index
    ));
    return {order, hidden};
};

export const applyColumnPreferences = (columns, preferences) => {
    const byKey = new Map(columns.map(column => [columnKey(column), column]));
    const hidden = new Set(preferences.hidden);
    return preferences.order
        .filter(key => !hidden.has(key))
        .map(key => byKey.get(key))
        .filter(Boolean);
};

const readPreferences = storageKey => {
    try {
        return JSON.parse(window.localStorage.getItem(storageKey)) || {};
    }
    catch {
        return {};
    }
};

export const useColumnSettings = (
    columns,
    storageKey,
    requiredKeys = [],
    defaultPreferences = EMPTY_PREFERENCES
) => {
    const [preferences, setPreferences] = useState(() => normalizeColumnPreferences(
        columns,
        {
            ...defaultPreferences,
            ...readPreferences(storageKey),
        },
        requiredKeys
    ));

    const updatePreferences = useCallback(next => {
        setPreferences(current => {
            const value = normalizeColumnPreferences(
                columns,
                typeof next === 'function' ? next(current) : next,
                requiredKeys
            );
            try {
                window.localStorage.setItem(storageKey, JSON.stringify(value));
            }
            catch {
                // Column customization remains usable when storage is unavailable.
            }
            return value;
        });
    }, [columns, requiredKeys, storageKey]);

    return {
        columns: useMemo(
            () => applyColumnPreferences(columns, preferences),
            [columns, preferences]
        ),
        preferences,
        setPreferences: updatePreferences,
        reset: useCallback(() => {
            try {
                window.localStorage.removeItem(storageKey);
            }
            catch {
                // Ignore unavailable storage and still reset the visible state.
            }
            setPreferences(normalizeColumnPreferences(
                columns,
                defaultPreferences,
                requiredKeys
            ));
        }, [columns, defaultPreferences, requiredKeys, storageKey]),
    };
};

const ColumnSettingRow = props => {
    const {
        column,
        columnKey,
        index,
        count,
        checked,
        disabled,
        labels,
        onToggle,
        onMove,
    } = props;
    const handleToggle = useCallback(() => onToggle(columnKey), [columnKey, onToggle]);
    const handleMoveUp = useCallback(() => onMove(columnKey, -1), [columnKey, onMove]);
    const handleMoveDown = useCallback(() => onMove(columnKey, 1), [columnKey, onMove]);

    return (
        <div className={c.row}>
            <Checkbox checked={checked} disabled={disabled} onChange={handleToggle}>
                {column?.title}
            </Checkbox>
            <Space size={0}>
                <Button
                    aria-label={`${labels.moveUp}: ${column?.title}`}
                    disabled={index === 0}
                    icon={<UpOutlined />}
                    onClick={handleMoveUp}
                    size='small'
                    type='text'
                />
                <Button
                    aria-label={`${labels.moveDown}: ${column?.title}`}
                    disabled={index === count - 1}
                    icon={<DownOutlined />}
                    onClick={handleMoveDown}
                    size='small'
                    type='text'
                />
            </Space>
        </div>
    );
};

const ColumnSettings = props => {
    const {
        columns,
        preferences,
        setPreferences,
        reset,
        requiredKeys = [],
        labels,
    } = props;
    const byKey = new Map(columns.map(column => [columnKey(column), column]));
    const hidden = new Set(preferences.hidden);
    const required = new Set(requiredKeys.map(String));

    const toggle = useCallback(key => {
        setPreferences(current => ({
            ...current,
            hidden: current.hidden.includes(key)
                ? current.hidden.filter(item => item !== key)
                : [...current.hidden, key],
        }));
    }, [setPreferences]);

    const move = useCallback((key, offset) => {
        setPreferences(current => {
            const from = current.order.indexOf(key);
            const to = from + offset;
            if (from < 0 || to < 0 || to >= current.order.length) {
                return current;
            }
            const order = [...current.order];
            [order[from], order[to]] = [order[to], order[from]];
            return {...current, order};
        });
    }, [setPreferences]);

    const content = (
        <div className={c.panel}>
            {preferences.order.map((key, index) => (
                <ColumnSettingRow
                    key={key}
                    column={byKey.get(key)}
                    columnKey={key}
                    index={index}
                    count={preferences.order.length}
                    checked={!hidden.has(key)}
                    disabled={required.has(key)}
                    labels={labels}
                    onToggle={toggle}
                    onMove={move}
                />
            ))}
            <Button className={c.reset} onClick={reset} size='small' type='link'>
                {labels.reset}
            </Button>
        </div>
    );

    return (
        <Popover content={content} placement='bottomRight' title={labels.title} trigger='click'>
            <Tooltip title={labels.title}>
                <Button
                    aria-label={labels.title}
                    icon={<SettingOutlined />}
                    size='small'
                    type='text'
                />
            </Tooltip>
        </Popover>
    );
};

export default ColumnSettings;
