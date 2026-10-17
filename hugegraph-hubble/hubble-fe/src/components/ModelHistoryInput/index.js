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

import {useCallback, useEffect, useState} from 'react';
import {AutoComplete, Input} from 'antd';
import {DownOutlined} from '@ant-design/icons';
import {getBaseUrlHistory, getModelHistory} from '../../utils/modelHistory';
import {USER_CHANGE_EVENT} from '../../utils/user';

const ModelHistoryInput = ({baseUrl, field = 'model', onChange, onFocus, onBlur, placeholder,
    'aria-label': ariaLabel, value = '',
    maxLength = field === 'baseUrl' ? 2048 : 256, style, ...inputProps}) => {
    const readOptions = useCallback(() => (field === 'baseUrl' ? getBaseUrlHistory() : getModelHistory(baseUrl)),
        [baseUrl, field]);
    const [history, setHistory] = useState(readOptions);
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    useEffect(() => {
        const reload = () => {
            setHistory(readOptions());
            setSearch('');
            setOpen(false);
        };
        reload();
        window.addEventListener(USER_CHANGE_EVENT, reload);
        return () => window.removeEventListener(USER_CHANGE_EVENT, reload);
    }, [readOptions]);

    const handleFocus = useCallback(event => {
        setHistory(readOptions());
        setSearch('');
        setOpen(true);
        onFocus?.(event);
    }, [onFocus, readOptions]);
    const handleBlur = useCallback(event => {
        setSearch('');
        setOpen(false);
        onBlur?.(event);
    }, [onBlur]);
    const handleSearch = useCallback(text => {
        setSearch(text);
        setOpen(true);
    }, []);
    const handleChange = useCallback(next => {
        onChange?.({target: {value: next}});
    }, [onChange]);
    const handleSelect = useCallback(() => {
        setSearch('');
        setOpen(false);
    }, []);
    const options = history.filter(item => item.toLowerCase().includes(search.toLowerCase()))
        .map(item => ({value: item}));
    return (
        <AutoComplete
            {...inputProps}
            style={{width: '100%', ...style}}
            value={value}
            options={options}
            maxLength={maxLength}
            filterOption={false}
            virtual={false}
            open={open && options.length > 0 && !inputProps.disabled}
            onDropdownVisibleChange={setOpen}
            onSearch={handleSearch}
            onChange={handleChange}
            onSelect={handleSelect}
            onFocus={handleFocus}
            onBlur={handleBlur}
        >
            <Input
                {...inputProps}
                aria-label={ariaLabel}
                placeholder={placeholder}
                suffix={inputProps.suffix || <span>{history.length ? <DownOutlined aria-hidden='true' /> : null}</span>}
            />
        </AutoComplete>
    );
};

export default ModelHistoryInput;
