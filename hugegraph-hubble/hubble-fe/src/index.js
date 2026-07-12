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

import React from 'react';
import ReactDOM from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {ConfigProvider} from 'antd';
// FIXME: Consolidate moment into date-fns after replacing filter comparisons
// and Ant Design date values together; removing it piecemeal changes semantics.
import 'moment/locale/zh-cn';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import zhCN from 'antd/lib/locale/zh_CN';
import enUS from 'antd/lib/locale/en_US';
import './i18n';
import {getCurrentLanguage} from './utils/language';

const languageType = getCurrentLanguage() === 'zh-CN' ? zhCN : enUS;
const routerFuture = {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
};
const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
    <BrowserRouter future={routerFuture}>
        <ConfigProvider locale={languageType}>
            <App />
        </ConfigProvider>
    </BrowserRouter>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
