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
import {Button, Result} from 'antd';
import i18n from '../../i18n';
import {sanitizePublicError} from '../../utils/publicError';

class RouteErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {failed: false};
        this.reload = this.reload.bind(this);
    }

    static getDerivedStateFromError() {
        return {failed: true};
    }

    componentDidCatch(error) {
        console.error(
            'hubble.route_render_failed',
            sanitizePublicError(error?.message, 'route render failed')
        );
    }

    reload() {
        window.location.reload();
    }

    render() {
        if (this.state.failed) {
            return (
                <Result
                    status='error'
                    title={i18n.t('workbench.route_error.title')}
                    extra={(
                        <Button onClick={this.reload}>
                            {i18n.t('workbench.route_error.reload')}
                        </Button>
                    )}
                />
            );
        }
        return this.props.children;
    }
}

export default RouteErrorBoundary;
