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

import {Alert, Button, Skeleton} from 'antd';
import {useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import {Navigate} from 'react-router-dom';
import {isPdEnabled} from '../../utils/config';
import {useOperationsCapabilities} from './capabilities';

const OperationsRoute = ({required, children}) => {
    const {t} = useTranslation();
    const {loading, capabilities, error, refresh} = useOperationsCapabilities();
    const retry = useCallback(
        () => Promise.resolve(refresh?.()).catch(() => undefined),
        [refresh]
    );

    if (loading) {
        return <Skeleton active aria-label={t('operations.loading')} />;
    }
    if (error) {
        return (
            <Alert
                type='error'
                showIcon
                message={t('operations.load_failed')}
                action={(
                    <Button
                        size='small'
                        onClick={retry}
                    >
                        {t('common.action.retry')}
                    </Button>
                )}
            />
        );
    }
    if (!capabilities.includes(required)) {
        return (
            <Alert
                type='warning'
                showIcon
                message={t('operations.permission_denied')}
                description={t('operations.permission_required', {capability: required})}
            />
        );
    }
    return children;
};

const OperationsOverviewRoute = ({children}) => {
    if (!isPdEnabled()) {
        return <Navigate to='/operations/nodes' replace />;
    }
    return (
        <OperationsRoute required='operations_health_read'>
            {children}
        </OperationsRoute>
    );
};

export {OperationsOverviewRoute};
export default OperationsRoute;
