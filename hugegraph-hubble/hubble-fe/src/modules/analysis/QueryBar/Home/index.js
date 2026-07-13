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

import React, {useCallback, useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Alert, Input, Tabs, Tag} from 'antd';
import CodeEditor from '../../../../components/CodeEditor';
import {ANALYSIS_TYPE} from '../../../../utils/constants';
import ContentCommon from '../ContentCommon';
import c from './index.module.scss';

const {GREMLIN, CYPHER, TEXT2GQL} = ANALYSIS_TYPE;

const isFavoritePopoverOpen = (visible, activeTab, tabKey) => {
    return visible && activeTab === tabKey;
};

const QueryBar = props => {
    const {t} = useTranslation();
    const {...args} = props;

    const {codeEditorContent, setCodeEditorContent, activeTab, onTabsChange} = args;

    const [isEmptyQuery, setIsEmptyQuery] = useState(() => !codeEditorContent);
    const [favoriteCardVisible, setFavoriteCardVisible] = useState(false);

    useEffect(() => {
        setIsEmptyQuery(!codeEditorContent);
    }, [codeEditorContent]);

    const handleCodeEditorChange = useCallback(
        value => {
            const existQuery = Boolean(value);
            setCodeEditorContent(value);
            setIsEmptyQuery(!existQuery);
            if (!existQuery) {
                setFavoriteCardVisible(false);
            }
        },
        [setCodeEditorContent]
    );

    const handleTabsChange = useCallback(
        nextTab => {
            setFavoriteCardVisible(false);
            onTabsChange(nextTab);
        },
        [onTabsChange]
    );

    const tabItems = [
        {
            label: t('analysis.query.gremlin_tab'),
            key: GREMLIN,
            children: (
                <ContentCommon
                    {...args}
                    isEmptyQuery={isEmptyQuery}
                    favoriteCardVisible={isFavoritePopoverOpen(
                        favoriteCardVisible,
                        activeTab,
                        GREMLIN
                    )}
                    setFavoriteCardVisible={setFavoriteCardVisible}
                >
                    <CodeEditor
                        value={codeEditorContent}
                        onChange={handleCodeEditorChange}
                        lang={'gremlin'}
                    />
                </ContentCommon>
            ),
        },
        {
            label: t('analysis.query.cypher_tab'),
            key: CYPHER,
            children: (
                <ContentCommon
                    {...args}
                    isEmptyQuery={isEmptyQuery}
                    favoriteCardVisible={isFavoritePopoverOpen(
                        favoriteCardVisible,
                        activeTab,
                        CYPHER
                    )}
                    setFavoriteCardVisible={setFavoriteCardVisible}
                >
                    <CodeEditor
                        value={codeEditorContent}
                        onChange={handleCodeEditorChange}
                        lang={'cypher'}
                    />
                </ContentCommon>
            ),
        },
        {
            label: (
                <span>
                    {t('analysis.query.text2gql_tab')}
                    <Tag color='blue'>
                        {t('analysis.query.text2gql_badge')}
                    </Tag>
                </span>
            ),
            key: TEXT2GQL,
            children: (
                <div className={c.text2gqlPlaceholder}>
                    <Alert
                        showIcon
                        type='info'
                        message={t('analysis.query.text2gql_title')}
                        description={t('analysis.query.text2gql_description')}
                    />
                    {/* TODO(text2gql): connect a reviewed backend contract before
                        enabling input, generation, or execution. */}
                    <Input.TextArea
                        aria-label={t('analysis.query.text2gql_title')}
                        placeholder={t('analysis.query.text2gql_placeholder')}
                        disabled
                        rows={5}
                    />
                    <p>{t('analysis.query.text2gql_privacy')}</p>
                </div>
            ),
        },
    ];

    return (
        <div className={c.queryBar} id='queryBar'>
            <Tabs
                defaultActiveKey={GREMLIN}
                activeKey={activeTab}
                type="card"
                onChange={handleTabsChange}
                items={tabItems}
                size='small'
            />
        </div>
    );
};

export {isFavoritePopoverOpen};
export default QueryBar;
