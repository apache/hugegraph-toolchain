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

import {render, screen, waitFor} from '@testing-library/react';
import {
    TOPBAR_PAGE_CONTEXT_ID,
    TopbarPageContextHost,
    TopbarPageContextSlot,
} from './PageContextSlot';

describe('TopbarPageContextSlot', () => {
    it('keeps the host empty when a page provides no context', () => {
        render(<TopbarPageContextHost />);

        expect(document.getElementById(TOPBAR_PAGE_CONTEXT_ID)).toBeEmptyDOMElement();
    });

    it('portals page-owned context into the shared host', async () => {
        render(
            <>
                <TopbarPageContextHost />
                <main><TopbarPageContextSlot>Schema</TopbarPageContextSlot></main>
            </>
        );

        await waitFor(() => expect(document.getElementById(TOPBAR_PAGE_CONTEXT_ID))
            .toHaveTextContent('Schema'));
        expect(screen.getByText('Schema')).toHaveAttribute('id', TOPBAR_PAGE_CONTEXT_ID);
    });
});
