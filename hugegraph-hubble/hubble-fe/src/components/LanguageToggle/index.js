/*
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

import {Button} from 'antd';
import {useCallback, useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {getCurrentLanguage} from '../../utils/language';
import style from './index.module.scss';

const TARGET_LANGUAGE = {
    'en-US': {label: '中', value: 'zh-CN'},
    'zh-CN': {label: 'EN', value: 'en-US'},
};

const resolveLanguage = i18n => {
    const language = i18n.resolvedLanguage ?? i18n.language ?? getCurrentLanguage();
    return language === 'zh-CN' || language?.startsWith('zh') ? 'zh-CN' : 'en-US';
};

const LanguageToggle = ({className = '', tone = 'light'}) => {
    const {t, i18n} = useTranslation();
    const [language, setLanguage] = useState(() => resolveLanguage(i18n));
    const target = TARGET_LANGUAGE[language] ?? TARGET_LANGUAGE['en-US'];

    useEffect(() => {
        const syncLanguage = nextLanguage => {
            setLanguage(resolveLanguage({language: nextLanguage}));
        };
        setLanguage(resolveLanguage(i18n));
        i18n.on?.('languageChanged', syncLanguage);
        return () => i18n.off?.('languageChanged', syncLanguage);
    }, [i18n]);

    const toggleLanguage = useCallback(() => {
        localStorage.setItem('languageType', target.value);
        setLanguage(target.value);
        i18n.changeLanguage(target.value);
    }, [i18n, target.value]);

    return (
        <Button
            type='text'
            className={`${style.toggle} ${style[tone]} ${className}`}
            aria-label={t('workbench.language_switch', {language: target.label})}
            title={t('workbench.language_switch', {language: target.label})}
            onClick={toggleLanguage}
        >
            <span key={target.value} className={style.label}>{target.label}</span>
        </Button>
    );
};

export default LanguageToggle;
