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

import {Layout} from 'antd';
import Sidebar from './components/Sidebar/index.ant';
import Topbar from './components/Topbar/index.ant';
import {Outlet, useLocation} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {getWorkbenchPageTitleKey} from './utils/workbenchNavigation';
import {useCallback} from 'react';
import ShortcutHelp from './components/ShortcutHelp';
import 'antd/dist/antd.css';

const LayoutAnt = () => {
    const location = useLocation();
    const {t} = useTranslation();
    const pageTitle = t(getWorkbenchPageTitleKey(location.pathname));
    const routeSection = location.pathname.split('/')[1] || 'navigation';
    const focusWorkspace = useCallback(event => {
        const workspace = document.getElementById('workbench-main');
        if (workspace) {
            event.preventDefault();
            workspace.focus();
        }
    }, []);

    return (
        <Layout>
            <a
                className="workbench-skip-link"
                href="#workbench-main"
                onClick={focusWorkspace}
            >
                {t('workbench.skip_to_workspace')}
            </a>
            <Topbar />
            <ShortcutHelp />
            <Layout className="main">
                <Sidebar />
                <Layout>
                    <Layout.Content
                        id="workbench-main"
                        className={`content workbench-route-${routeSection}`}
                        tabIndex={-1}
                    >
                        <h1 className="workbench-page-title">{pageTitle}</h1>
                        <Outlet />
                    </Layout.Content>
                </Layout>
            </Layout>
        </Layout>
    );
};

export default LayoutAnt;
