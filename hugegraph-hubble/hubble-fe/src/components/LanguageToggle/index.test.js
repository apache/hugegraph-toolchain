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

import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LanguageToggle from './index';

const mockChangeLanguage = jest.fn(language => Promise.resolve(language));
const mockLanguageListeners = new Set();
const mockI18n = {
    language: 'en-US',
    resolvedLanguage: 'en-US',
    changeLanguage: mockChangeLanguage,
    on: jest.fn((event, listener) => {
        if (event === 'languageChanged') {
            mockLanguageListeners.add(listener);
        }
    }),
    off: jest.fn((event, listener) => {
        if (event === 'languageChanged') {
            mockLanguageListeners.delete(listener);
        }
    }),
};

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, values) => `${key}:${values?.language ?? ''}`,
        i18n: mockI18n,
    }),
}));

describe('LanguageToggle', () => {
    beforeEach(() => {
        mockChangeLanguage.mockClear();
        mockI18n.language = 'en-US';
        mockI18n.resolvedLanguage = 'en-US';
        mockI18n.on.mockClear();
        mockI18n.off.mockClear();
        mockLanguageListeners.clear();
        localStorage.clear();
    });

    it('shows only the current language and switches immediately', async () => {
        render(<LanguageToggle />);

        const english = screen.getByRole('button', {name: /中/});
        expect(english).toHaveTextContent('EN');
        expect(screen.queryByText('中')).not.toBeInTheDocument();

        await userEvent.click(english);

        expect(mockChangeLanguage).toHaveBeenCalledWith('zh-CN');
        expect(localStorage.getItem('languageType')).toBe('zh-CN');
        expect(screen.getByRole('button', {name: /EN/})).toHaveTextContent('中');
        expect(screen.queryByText('EN')).not.toBeInTheDocument();
    });

    it('shows the active Chinese language while offering English accessibly', () => {
        mockI18n.language = 'zh-CN';
        mockI18n.resolvedLanguage = 'zh-CN';

        render(<LanguageToggle />);

        expect(screen.getByRole('button', {name: /EN/})).toHaveTextContent('中');
        expect(screen.queryByText('EN')).not.toBeInTheDocument();
    });

    it('follows language changes made outside the toggle', () => {
        render(<LanguageToggle />);
        expect(screen.getByRole('button', {name: /中/})).toHaveTextContent('EN');

        act(() => {
            mockI18n.language = 'zh-CN';
            mockI18n.resolvedLanguage = 'zh-CN';
            const languageChanged = mockI18n.on.mock.calls[0][1];
            languageChanged('zh-CN');
        });

        expect(screen.getByRole('button', {name: /EN/})).toHaveTextContent('中');
    });
});
