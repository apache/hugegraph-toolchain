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
 * @file Gremlin语法分析 Header
 */

import React, {useCallback, useState, useContext} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, Tooltip, Dropdown, Popover, message, Space} from 'antd';
import {UpOutlined, DownOutlined, QuestionCircleOutlined} from '@ant-design/icons';
import {GREMLIN_EXECUTES_MODE} from '../../../../utils/constants';
import GraphAnalysisContext from '../../../Context';
import classnames from 'classnames';
import {isValidFavoriteName} from '../../../../utils/rules';
import FavoriteNameInput from '../../../../components/FavoriteNameInput';
import c from './index.module.scss';
import * as api from '../../../../api/index';
import KeyboardAction from '../../../../components/KeyboardAction';

const FAVORITE_TYPE  = {
    Gremlin: 'GREMLIN',
    Algorithms: 'ALGORITHM',
    Cypher: 'CYPHER',
};

const {QUERY, TASK} = GREMLIN_EXECUTES_MODE;

const ContentCommon = props => {
    const {t} = useTranslation();
    const {
        codeEditorContent,
        setCodeEditorContent,
        executeMode,
        onExecuteModeChange,
        activeTab,
        onExecute,
        onRefresh,
        isEmptyQuery,
        favoriteCardVisible,
        setFavoriteCardVisible,
    } = props;

    const context = useContext(GraphAnalysisContext);
    const isQueryMode = executeMode === QUERY;

    const [isShowMore, setShowMore] = useState(true);
    const [favoriteName, setFavoriteName] = useState();
    const [disabledFavorite, setDisabledFavorite]  = useState(true);

    const queryDesc = t('analysis.query.execute_mode_desc');
    const emptyDesc = t('analysis.query.empty_query');

    const onToggleCollapse = useCallback(
        () => {
            setShowMore(prev => !prev);
        },
        []
    );

    const renderCollapseHeader = () => {
        const icon = isShowMore ? <UpOutlined /> : <DownOutlined />;
        const iconName = isShowMore
            ? <span>{t('analysis.query.collapse')}</span>
            : <span>{t('analysis.query.expand')}</span>;
        return (
            <div>{icon}{iconName}</div>
        );
    };

    const onClear = useCallback(
        () => {
            setCodeEditorContent('');
        },
        [setCodeEditorContent]
    );

    const onFavoriteCard = useCallback(
        () => {
            setFavoriteCardVisible(true);
            setDisabledFavorite(true);
            setFavoriteName('');
        },
        [setFavoriteCardVisible]
    );

    const saveFavoriteList = useCallback(
        () => {
            const {graphSpace, graph} = context;
            const params = {
                content: codeEditorContent,
                name: favoriteName,
                type: FAVORITE_TYPE[activeTab],
            };
            api.analysis.addFavoriate(graphSpace, graph, params)
                .then(res => {
                    const {status, message: errMsg} = res;
                    if (status === 200) {
                        message.success(t('analysis.query.favorite_success'));
                        onRefresh();
                    }
                    else {
                        !errMsg && message.error(t('analysis.query.favorite_failed'));
                    }
                });
        },
        [activeTab, codeEditorContent, context, favoriteName, onRefresh, t]
    );

    const onOkFavorite = useCallback(
        () => {
            saveFavoriteList();
            setFavoriteCardVisible(false);
        },
        [saveFavoriteList, setFavoriteCardVisible]
    );

    const onHideFavorite = useCallback(
        () => {
            setFavoriteCardVisible(false);
        },
        [setFavoriteCardVisible]
    );

    const onChangeFavoraiteName = useCallback(
        e => {
            const favoriteName = e.target.value;
            setFavoriteName(favoriteName);
            setDisabledFavorite(!isValidFavoriteName(favoriteName));
        },
        []
    );

    const favoriteContent = (
        <>
            <FavoriteNameInput
                placeholder={t('analysis.query.favorite_name_placeholder')}
                value={favoriteName}
                onChange={onChangeFavoraiteName}
            />
            <Space style={{marginTop: '24px'}}>
                <Button type='primary' onClick={onOkFavorite} disabled={disabledFavorite}>
                    {t('analysis.query.favorite')}
                </Button>
                <Button onClick={onHideFavorite}>{t('common.action.cancel')}</Button>
            </Space>
        </>
    );

    const tabClassName = classnames(
        c.tabContent,
        {[c.tabContentCollpased]: !isShowMore}
    );

    const onSwitchExecuteMenu = useCallback(
        e => {
            if (e.key === QUERY) {
                onExecuteModeChange(QUERY);
            }
            else {
                onExecuteModeChange(TASK);
            }
        },
        [onExecuteModeChange]
    );

    const onExecution = useCallback(
        () => {
            onExecute(activeTab);
        },
        [activeTab, onExecute]
    );

    const executeMenu = {
        onClick: onSwitchExecuteMenu,
        items: [
            {label: t('analysis.query.execute_query'), key: QUERY},
            {label: t('analysis.query.execute_task'), key: TASK},
        ],
    };

    return (
        <div className={tabClassName}>
            <div className={c.leftHeader}>
                {props.children}
                <div className={c.btnGroup}>
                    <Tooltip placement="bottom" title={isEmptyQuery ? emptyDesc : ''}>
                        <Dropdown.Button
                            menu={executeMenu}
                            disabled={isEmptyQuery}
                            onClick={onExecution}
                            size='small'
                        >
                            {isQueryMode ? t('analysis.query.execute_query') : t('analysis.query.execute_task')}
                        </Dropdown.Button>
                    </Tooltip>
                    <Tooltip placement="bottom" title={queryDesc} className={c.questionCircleIcon}>
                        <QuestionCircleOutlined />
                    </Tooltip>
                    <Popover
                        placement="bottom"
                        trigger='click'
                        overlayClassName={c.favoriteModel}
                        title={t('analysis.query.favorite_statement')}
                        content={favoriteContent}
                        open={favoriteCardVisible}
                    >
                        <Tooltip placement="bottom" title={isEmptyQuery ? emptyDesc : ''}>
                            <Button
                                className={c.btn}
                                disabled={isEmptyQuery}
                                onClick={onFavoriteCard}
                                size='small'
                            >
                                {t('analysis.query.favorite')}
                            </Button>
                        </Tooltip>
                    </Popover>
                    <Button className={c.btn} onClick={onClear} size='small'>
                        {t('common.action.clear')}
                    </Button>
                </div>
            </div>
            <KeyboardAction
                className={c.showMoreButton}
                onAction={onToggleCollapse}
                aria-expanded={isShowMore}
            >
                {renderCollapseHeader()}
            </KeyboardAction>
        </div>
    );
};

export default ContentCommon;
