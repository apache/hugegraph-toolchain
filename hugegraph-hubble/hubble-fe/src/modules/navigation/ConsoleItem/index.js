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
import {message} from 'antd';
import {useCallback, useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';

import * as api from '../../../api';
import Item from '../Item';
import {normalizeDashboardUrl, probeDashboard} from './dashboard';

const ConsoleItem = () => {

    const {t} = useTranslation();
    const [dashboard, setDashboard] = useState({status: 'loading', url: ''});

    useEffect(() => {
        let cancelled = false;
        api.auth.getDashboard().then(res => {
            if (cancelled) {
                return;
            }
            if (res?.status !== 200) {
                setDashboard({status: 'unavailable', url: ''});
            }
            else if (!res.data?.configured) {
                setDashboard({status: 'unconfigured', url: ''});
            }
            else {
                const url = normalizeDashboardUrl(
                    res.data.address, res.data.protocol
                );
                setDashboard({status: 'configured', url});
            }
        }).catch(() => {
            if (!cancelled) {
                setDashboard({status: 'unavailable', url: ''});
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const openDashboard = useCallback(async url => {
        const popup = window.open('about:blank', '_blank');
        if (!popup) {
            message.error(t('navigation_page.dashboard_popup_blocked'));
            return;
        }
        popup.opener = null;
        setDashboard(current => ({...current, status: 'checking'}));
        if (!await probeDashboard(url)) {
            popup.close();
            setDashboard(current => ({...current, status: 'unavailable'}));
            message.error(t('navigation_page.dashboard_unavailable'));
            return;
        }
        setDashboard(current => ({...current, status: 'configured'}));
        popup.location.replace(url);
    }, [t]);

    const configured = Boolean(dashboard.url);
    const reason = dashboard.status === 'loading'
        ? t('navigation_page.dashboard_checking')
        : dashboard.status === 'unconfigured'
            ? t('navigation_page.dashboard_unconfigured')
            : dashboard.status === 'unavailable'
                ? t('navigation_page.dashboard_unavailable')
                : '';
    const item = (titleKey, path = '') => ({
        title: t(titleKey),
        url: configured ? dashboard.url + path : '',
        disabled: !configured || dashboard.status === 'checking',
        reason,
        badge: dashboard.status === 'unconfigured'
            ? t('navigation_page.not_configured') : '',
        onClick: configured
            ? () => openDashboard(dashboard.url + path)
            : undefined,
    });

    return (
        <Item
            btnIndex={4}
            btnTitle={t('navigation_page.operation_manage')}
            listData={[
                item('navigation_page.cluster_manage'),
                item('navigation_page.monitor_manage', '/monitor/machine'),
                item('navigation_page.node_manage', '/operate/node'),
                item('navigation_page.alert_manage', '/alert/rule'),
            ]}
        />
    );
};

export default ConsoleItem;
