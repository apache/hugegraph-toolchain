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
 * @file 运维管理子项块
 */
import {useTranslation} from 'react-i18next';

import Item from '../Item';

const ConsoleItem = () => {

    const {t} = useTranslation();
    const item = titleKey => ({
        title: t(titleKey),
        url: '',
        disabled: true,
        reason: t('navigation_page.coming_soon'),
        badge: t('navigation_page.coming_soon'),
    });

    return (
        <Item
            btnIndex={4}
            btnTitle={t('navigation_page.operation_manage')}
            listData={[
                item('navigation_page.cluster_manage'),
                item('navigation_page.monitor_manage'),
                item('navigation_page.node_manage'),
                item('navigation_page.alert_manage'),
            ]}
        />
    );
};

export default ConsoleItem;
