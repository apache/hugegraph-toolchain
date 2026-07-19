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
import {Alert, Button, Input, Tabs, Tag} from 'antd';
import {DownOutlined, UpOutlined} from '@ant-design/icons';
import CodeEditor from '../../../../components/CodeEditor';
import {ANALYSIS_TYPE} from '../../../../utils/constants';
import {PrimaryActions, SecondaryActions} from '../ContentCommon';
import c from './index.module.scss';

const {GREMLIN, CYPHER, TEXT2GQL} = ANALYSIS_TYPE;

const QueryBar = props => {
    const {t} = useTranslation();
    const {...args} = props;

    const {
        codeEditorContent,
        setCodeEditorContent,
        activeTab,
        onTabsChange,
        onExecute,
        isExecuting,
    } = args;

    const [isEmptyQuery, setIsEmptyQuery] = useState(() => !codeEditorContent);
    const [favoriteCardVisible, setFavoriteCardVisible] = useState(false);
    const [isEditorExpanded, setEditorExpanded] = useState(true);
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

    const onExecution = useCallback(
        () => {
            if (!isEmptyQuery && !isExecuting) {
                onExecute(activeTab);
            }
        },
        [activeTab, isEmptyQuery, isExecuting, onExecute]
    );

    const toggleEditor = useCallback(() => {
        setEditorExpanded(expanded => !expanded);
    }, []);

    const renderEditor = language => (
        <div className={c.editorRegion}>
            <Button
                className={c.editorToggle}
                type='text'
                size='small'
                icon={isEditorExpanded ? <UpOutlined /> : <DownOutlined />}
                onClick={toggleEditor}
                aria-expanded={isEditorExpanded}
                aria-controls={`query-editor-${language}`}
            >
                {isEditorExpanded
                    ? t('analysis.query.collapse')
                    : t('analysis.query.expand')}
            </Button>
            {isEditorExpanded && (
                <div className={c.editorShell} id={`query-editor-${language}`}>
                    <CodeEditor
                        value={codeEditorContent}
                        onChange={handleCodeEditorChange}
                        onExecutionShortcut={onExecution}
                        lang={language}
                        minHeight={64}
                        placeholder={language === 'gremlin'
                            ? t('analysis.query.gremlin_placeholder')
                            : t('analysis.query.cypher_placeholder')}
                    />
                    <div className={c.editorShortcutHints} aria-hidden='true'>
                        <span>{t('analysis.query.shortcut_hint')}</span>
                    </div>
                </div>
            )}
        </div>
    );

    const commonActionProps = {
        ...args,
        isEmptyQuery,
        favoriteCardVisible,
        setFavoriteCardVisible,
    };

    const tabItems = [
        {
            label: t('analysis.query.gremlin_tab'),
            key: GREMLIN,
            children: renderEditor('gremlin'),
        },
        {
            label: t('analysis.query.cypher_tab'),
            key: CYPHER,
            children: renderEditor('cypher'),
        },
        {
            label: (
                <span>
                    {t('analysis.query.text2gql_tab')}
                    <Tag className={c.text2gqlBadge}>
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

    const queryActions = activeTab === TEXT2GQL ? undefined : {
        right: (
            <div className={c.queryActions}>
                <SecondaryActions
                    {...commonActionProps}
                    favoriteCardVisible={favoriteCardVisible}
                />
                <PrimaryActions {...commonActionProps} />
            </div>
        ),
    };

    return (
        <div className={c.queryBar} id='queryBar'>
            <Tabs
                defaultActiveKey={GREMLIN}
                activeKey={activeTab}
                type="card"
                onChange={handleTabsChange}
                items={tabItems}
                size='small'
                tabBarExtraContent={queryActions}
            />
        </div>
    );
};

export default QueryBar;
