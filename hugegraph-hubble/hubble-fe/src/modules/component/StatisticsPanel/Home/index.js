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
 * @file  统计Panel Home
 */

import React, {useCallback, useState} from 'react';
import {Radio} from 'antd';
import {useTranslation} from 'react-i18next';
import LabelStatistics from '../LabelStatistics';
import GraphStatistics from '../GraphStatistics/Home';
import classnames from 'classnames';
import c from './index.module.scss';

const StaticsTab = {
    LABEL: 0,
    GRAPH: 1,
};

const {LABEL, GRAPH} = StaticsTab;

const StatisticPanel = props => {
    const {open, ...args} = props;
    const {t} = useTranslation();

    const [activePanel, setActivePanel] = useState(LABEL);

    const settingClassName = classnames(
        c.statistics,
        {[c.statisticsHidden]: !open}
    );

    const handleRadioChange = useCallback(
        e => {
            setActivePanel(e.target.value);
        },
        []
    );

    return (
        <div className={settingClassName}>
            <Radio.Group
                role='radiogroup'
                aria-label={t('analysis.canvas.statistics_panel.view_mode')}
                defaultValue={LABEL}
                onChange={handleRadioChange}
                size="middle"
                buttonStyle="solid"
            >
                <Radio.Button value={LABEL}>{t('analysis.canvas.statistics_panel.label_statistics')}</Radio.Button>
                <Radio.Button value={GRAPH}>{t('analysis.canvas.statistics_panel.graph_statistics')}</Radio.Button>
            </Radio.Group>
            {open && (activePanel === LABEL ? <LabelStatistics {...args} /> : <GraphStatistics {...args} />)}
        </div>
    );
};

export default StatisticPanel;
