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
 * @file 图分析组件 算法标题
 */

import React from 'react';
import Highlighter from 'react-highlight-words';
import {Typography, Tooltip, Button} from 'antd';
import c from './index.module.scss';
import classnames from 'classnames';
import {useTranslation} from 'react-i18next';
import {
    getAlgorithmDisplayName,
    isAlgorithmNameMatched,
} from '../../../../utils/constants';
import {
    getAlgorithmDocumentationUrl,
    isAlgorithmImplementationSource,
} from '../algorithmDocs';

const {Text} = Typography;

import {
    QuestionCircleOutlined,
    CaretRightOutlined,
    LinkOutlined,
} from '@ant-design/icons';

const AlgorithmNameHeader = props => {
    const {t} = useTranslation();
    const {
        icon,
        name,
        searchValue,
        description,
        isRunning,
        isDisabled,
        handleRunning,
        highlightName,
    } = props;

    const iconClassName = classnames(
        c.panelHeaderIcon,
        {[c.panelHeaderIconHighlight]: highlightName}

    );
    const displayName = getAlgorithmDisplayName(name, t);
    const documentationUrl = getAlgorithmDocumentationUrl(name);
    const helpLinkLabel = t(isAlgorithmImplementationSource(name)
        ? 'analysis.algorithm.api_source'
        : 'analysis.algorithm.api_docs');

    const renderAlgorithmName = name => {
        let res;
        if (isAlgorithmNameMatched(name, searchValue, t)) {
            res = (
                <Text
                    ellipsis={{
                        tooltip: displayName,
                    }}
                >
                    <Highlighter
                        highlightClassName={c.highlight}
                        searchWords={[searchValue]}
                        autoEscape
                        textToHighlight={displayName}
                    />
                </Text>
            );
        }
        else {
            res = (
                <Text
                    ellipsis={{
                        tooltip: displayName,
                    }}
                >
                    {displayName}
                </Text>
            );
        }
        if (highlightName) {
            res = (
                <Text
                    ellipsis={{
                        tooltip: displayName,
                    }}
                >
                    <Highlighter
                        highlightClassName={c.highlight}
                        searchWords={[displayName]}
                        autoEscape
                        textToHighlight={displayName}
                    />
                </Text>
            );
        }
        return res;
    };

    const renderRunningButton = () => {
        if (!isDisabled) {
            return (
                <Tooltip
                    placement="rightTop"
                    title={<span style={{color: '#000'}}>{t('analysis.algorithm.run')}</span>}
                    color={'#fff'}
                >
                    <Button
                        className={c.panelHeaderRunningButton}
                        type="primary"
                        size='small'
                        loading={isRunning}
                        disabled={isDisabled}
                        icon={<CaretRightOutlined />}
                        onClick={handleRunning}
                    />
                </Tooltip>
            );
        }
        return (
            <Button
                className={c.panelHeaderRunningButton}
                type="primary"
                size='small'
                loading={isRunning}
                disabled={isDisabled}
                icon={<CaretRightOutlined />}
                onClick={handleRunning}
            />
        );
    };

    return (
        <div className={c.panelHeader}>
            <div className={iconClassName}>
                {icon}
            </div>
            <div className={c.panelHeaderName}>
                {renderAlgorithmName(name)}
            </div>
            <div className={c.panelHeaderRight}>
                <Tooltip title={helpLinkLabel}>
                    <span onClickCapture={event => event.stopPropagation()}>
                        <a
                            href={documentationUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`${displayName} ${helpLinkLabel}`}
                        >
                            <LinkOutlined />
                        </a>
                    </span>
                </Tooltip>
                <Tooltip placement="rightTop" title={description}>
                    <QuestionCircleOutlined />
                </Tooltip>
                {renderRunningButton()}
            </div>
        </div>
    );
};

export default AlgorithmNameHeader;
