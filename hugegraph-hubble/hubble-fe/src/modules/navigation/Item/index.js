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

/**
 * @file 子项块
 */


import {Button} from 'antd';

import ModuleButton from '../ModuleButton';
import {useNavigate} from 'react-router-dom';
import {useCallback} from 'react';

import style from './index.module.scss';

const Item = props => {
    const {
        btnTitle,
        btnIndex,
        listData,
        embedded = false,
    } = props;

    const navigate = useNavigate();

    const onItemClick = useCallback(event => {
        const value = event.currentTarget.dataset.url;
        if (!value) {
            return;
        }
        else if (value.startsWith('/')) {
            navigate(value);
        }
        else {
            window.open(value);
        }
    }, [navigate]);

    const renderList = () => {
        const res = [];
        for (let item of listData) {
            const {
                title,
                url,
                disabled = false,
                reason = '',
                badge = '',
                onClick,
            } = item;
            const disabledDescription = [title, badge, reason]
                .filter(Boolean)
                .join(', ');
            const content = (
                <div
                    className={style.item}
                    key={title}
                    role={disabled ? 'group' : undefined}
                    tabIndex={disabled ? 0 : undefined}
                    aria-label={disabled ? disabledDescription : undefined}
                >
                    <Button
                        block
                        type={'primary'}
                        data-url={url}
                        onClick={onClick || onItemClick}
                        disabled={disabled}
                        title={reason}
                        aria-label={title}
                    >
                        {title}
                        {badge && (
                            <span className={style.badge} aria-hidden='true'>{badge}</span>
                        )}
                    </Button>
                </div>
            );
            res.push(content);
        }
        const reasons = [...new Set(listData
            .filter(item => item.disabled && item.reason)
            .map(item => item.reason))];
        if (reasons.length > 0) {
            res.push(
                <div className={style.reason} role='status' key='disabled-reason'>
                    {reasons.join('; ')}
                </div>
            );
        }
        return res;
    };
    return (
        <div className={`${style.container} ${embedded ? style.embedded : ''}`}>
            <ModuleButton index={embedded ? undefined : btnIndex} title={btnTitle} />
            <div className={style.itemList}>
                {renderList()}
            </div>
        </div>
    );
};

export default Item;
