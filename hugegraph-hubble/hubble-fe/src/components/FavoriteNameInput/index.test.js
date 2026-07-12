/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {fireEvent, render, screen} from '@testing-library/react';
import {useCallback, useState} from 'react';

import FavoriteNameInput from './index';

jest.mock('react-i18next', () => ({
    initReactI18next: {type: '3rdParty', init: jest.fn()},
    useTranslation: () => ({t: key => key}),
}));

test('explains invalid favorite names and clears the error for valid names', () => {
    const FavoriteNameEditor = () => {
        const [name, setName] = useState('');
        const onChange = useCallback(e => setName(e.target.value), []);
        return <FavoriteNameInput value={name} onChange={onChange} />;
    };
    render(<FavoriteNameEditor />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, {target: {value: 'query-name'}});
    expect(screen.getByRole('alert')).toHaveTextContent(
        'common.validation.favorite_name_rule'
    );

    fireEvent.change(input, {target: {value: 'query_name'}});
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
