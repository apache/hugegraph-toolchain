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

import {Result} from 'antd';
import {Link} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import c from './index.module.scss';

const Error404 = () => {
    const {t} = useTranslation();

    return (
        <div className={c.pageCanvas}>
            <section className={c.surface} data-testid='not-found-surface'>
                <Result
                    status={404}
                    title={404}
                    subTitle={t('not_found.subtitle')}
                    extra={(
                        <Link className={c.primaryAction} to='/navigation'>
                            {t('not_found.home')}
                        </Link>
                    )}
                />
            </section>
        </div>
    );
};

export default Error404;
