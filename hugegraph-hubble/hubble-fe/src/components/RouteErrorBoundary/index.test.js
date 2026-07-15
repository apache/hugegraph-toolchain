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

import {render, screen} from '@testing-library/react';
import i18n from '../../i18n';
import RouteErrorBoundary from '.';

const PRIVATE_VALUE = 'boundary-secret-canary';

const ThrowingRoute = () => {
    throw new Error(
        `password=${PRIVATE_VALUE} Authorization: Bearer ${PRIVATE_VALUE}`
    );
};

describe('RouteErrorBoundary', () => {
    let consoleError;

    beforeEach(async () => {
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        await i18n.changeLanguage('en-US');
    });

    afterEach(() => {
        consoleError.mockRestore();
    });

    afterAll(async () => {
        await i18n.changeLanguage('zh-CN');
    });

    test('renders a localized fallback and logs only sanitized diagnostics', () => {
        render(
            <RouteErrorBoundary>
                <ThrowingRoute />
            </RouteErrorBoundary>
        );

        expect(screen.getByText('This page could not be displayed')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Reload page'})).toBeInTheDocument();

        const boundaryCalls = consoleError.mock.calls.filter(
            ([event]) => event === 'hubble.route_render_failed'
        );
        expect(boundaryCalls).toHaveLength(1);
        expect(boundaryCalls[0]).toHaveLength(2);
        expect(boundaryCalls[0].join(' ')).not.toContain(PRIVATE_VALUE);
        expect(boundaryCalls[0].join(' ')).toContain('[REDACTED]');
    });

    test('renders the fallback in Chinese', async () => {
        await i18n.changeLanguage('zh-CN');

        render(
            <RouteErrorBoundary>
                <ThrowingRoute />
            </RouteErrorBoundary>
        );

        expect(screen.getByText('此页面暂时无法显示')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: '重新加载页面'})).toBeInTheDocument();
    });
});
