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
 * @file TaskNavigateView
 */

import React, {useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import {useNavigate} from 'react-router-dom';
import {Button} from 'antd';
import {ArrowRightOutlined, CheckCircleFilled} from '@ant-design/icons';
import c from './index.module.scss';

const TaskNavigateView = props => {
    const {t} = useTranslation();
    const {message, taskId} = props;
    const title = t('analysis.canvas.task_navigation.title');
    const submissionDetail = message && message !== title
        && message !== t('analysis.canvas.task_navigation.success_alt') ? message : null;
    const navigate = useNavigate();

    const onClickDetail = useCallback(
        () => {
            navigate(`/asyncTasks/${taskId}`);
        },
        [navigate, taskId]
    );

    return (
        <div className={c.taskView}>
            <section className={c.taskCard}>
                <div className={c.taskHeader} role='status'>
                    <span className={c.successIcon} aria-hidden='true'>
                        <CheckCircleFilled />
                    </span>
                    <div>
                        <h3 className={c.title}>{title}</h3>
                        <p className={c.description}>
                            {t('analysis.canvas.task_navigation.description')}
                        </p>
                        {submissionDetail && <p className={c.submissionDetail}>{submissionDetail}</p>}
                    </div>
                </div>
                <dl className={c.taskIdentity}>
                    <dt>{t('analysis.canvas.task_navigation.task_id')}</dt>
                    <dd>{taskId}</dd>
                </dl>
                <Button type='primary' className={c.viewButton} onClick={onClickDetail}>
                    {t('analysis.canvas.task_navigation.view')}
                    <ArrowRightOutlined aria-hidden='true' />
                </Button>
            </section>
        </div>
    );
};

export default TaskNavigateView;
