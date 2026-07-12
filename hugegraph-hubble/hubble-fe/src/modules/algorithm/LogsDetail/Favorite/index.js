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
 * @file 图算法 收藏
 */

import React, {useState, useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import Highlighter from 'react-highlight-words';
import {Button, Table, Input, Popconfirm, Modal} from 'antd';
import ExecutionContent from '../../../../components/ExecutionContent';
import FavoriteNameInput from '../../../../components/FavoriteNameInput';
import {isValidFavoriteName} from '../../../../utils/rules';
import c from './index.module.scss';

const createValueHandler = (handler, value) => () => handler(value);
const getRowKey = item => item.id;

const Favorite = props => {
    const {t} = useTranslation();
    const {
        isLoading,
        pageFavorite,
        pageSize,
        onFavoritePageChange,
        onChangeFavorSearch,
        onSortChange,
        onEditCollection,
        onDel,
        favoriteQueriesDataRecords,
        favoriteQueriesDataTotal,
    } = props;

    const [favoriteName, setFavoriteName] = useState();
    const [searchCache, setSearchCache] = useState('');
    const [search, setSearch] = useState('');

    const changeCollection = useCallback(
        rowData => {
            onEditCollection(rowData, favoriteName);
        },
        [favoriteName, onEditCollection]
    );

    const onSaveEditFavorite = useCallback(
        rowData => {
            setFavoriteName('');
            changeCollection(rowData);
        }, [changeCollection]);

    const onEditFavorite = useCallback(
        rowData => {
            const {name} = rowData;
            setFavoriteName(name);
        }, []);

    const onChangeFavoraiteName = useCallback(
        e => {
            setFavoriteName(e.target.value);
        }, []);

    const onConfirm = id => {
        Modal.confirm({
            title: t('analysis.logs.confirm_delete'),
            content: t('analysis.logs.delete_favorite_confirm'),
            okText: t('common.action.confirm'),
            cancelText: t('common.action.cancel'),
            onOk: () => onDel(id),
        });
    };

    const editFavoriteForm = (
        <>
            <div style={{marginBottom: '16px'}}>
                {t('analysis.logs.edit_name')}
            </div>
            <FavoriteNameInput
                style={{marginBottom: '18px'}}
                placeholder={t('analysis.logs.favorite_name_placeholder')}
                value={favoriteName}
                onChange={onChangeFavoraiteName}
            />
        </>
    );

    const queryFavoriteColumns = [
        {
            title: t('analysis.logs.column.time'),
            dataIndex: 'create_time',
            width: '25%',
            sorter: true,
        },
        {
            title: t('analysis.logs.column.name'),
            dataIndex: 'name',
            width: '15%',
            sorter: true,
            render: text => {
                return (
                    <Highlighter
                        highlightClassName={c.highlight}
                        searchWords={[search]}
                        autoEscape
                        textToHighlight={text}
                    />
                );
            },
        },
        {
            title: t('analysis.logs.column.favorite_statement'),
            dataIndex: 'content',
            width: '40%',
            render(text, rowData) {
                return text.split('\n')[1] ? (
                    <ExecutionContent
                        content={text}
                        highlightText={search}
                    />
                ) : (
                    <div className={c.breakWord}>
                        <Highlighter
                            highlightClassName={c.highlight}
                            searchWords={[search]}
                            autoEscape
                            textToHighlight={text}
                        />
                    </div>
                );
            },
        },
        {
            title: t('analysis.logs.column.action'),
            dataIndex: 'manipulation',
            width: '20%',
            render(_, rowData, index) {
                return (
                    <div className={c.manipulation}>
                        <Popconfirm
                            placement="left"
                            className={c.favoriteModel}
                            title={editFavoriteForm}
                            onConfirm={createValueHandler(onSaveEditFavorite, rowData)}
                            okText={t('analysis.logs.action.save')}
                            okButtonProps={{disabled: !isValidFavoriteName(favoriteName)}}
                            cancelText={t('common.action.cancel')}
                        >
                            <Button
                                type='link'
                                style={{marginLeft: '8px'}}
                                onClick={createValueHandler(onEditFavorite, rowData)}
                            >
                                {t('analysis.logs.action.edit_name')}
                            </Button>
                        </Popconfirm>
                        <Button
                            type='link'
                            style={{marginLeft: '8px'}}
                            onClick={createValueHandler(onConfirm, rowData.id)}
                        >
                            {t('common.action.delete')}
                        </Button>
                    </div>
                );
            },
        },
    ];

    const onSearchChange = useCallback(
        e => {
            const value = e.target.value;
            setSearchCache(value);
            if (!value) {
                setSearch(value);
            }
            onChangeFavorSearch(value);
        },
        [onChangeFavorSearch]
    );

    const onSearch = useCallback(
        () => {
            if (searchCache !== search) {
                setSearch(searchCache);
            }
            onChangeFavorSearch(searchCache);
        },
        [search, searchCache, onChangeFavorSearch]
    );

    return (
        <>
            <div className={c.searchBar}>
                <Input.Search
                    value={searchCache}
                    onChange={onSearchChange}
                    onSearch={onSearch}
                    placeholder={t('analysis.logs.search_placeholder')}
                    allowClear
                    style={{width: '215px'}}
                />
            </div>
            <Table
                columns={queryFavoriteColumns}
                dataSource={favoriteQueriesDataRecords}
                rowKey={getRowKey}
                onChange={onSortChange}
                pagination={{
                    onChange: onFavoritePageChange,
                    position: ['bottomRight'],
                    total: favoriteQueriesDataTotal,
                    showSizeChanger: favoriteQueriesDataTotal > 10,
                    current: pageFavorite,
                    pageSize: pageSize,
                }}
                loading={isLoading}
            />
        </>
    );
};

export default Favorite;
