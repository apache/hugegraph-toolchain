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
import userEvent from '@testing-library/user-event';
import GraphSpace from './index';
import * as api from '../../api';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

jest.mock('../../api', () => ({
    manage: {
        getGraphSpaceList: jest.fn(),
        delGraphSpace: jest.fn(),
        initBuiltin: jest.fn(),
    },
}));

jest.mock('./Card', () => ({item}) => <div>{item.nickname}</div>);
jest.mock('./EditLayer', () => ({EditLayer: () => null}));

beforeEach(() => {
    jest.clearAllMocks();
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

test('keeps a failed GraphSpace request distinct from a valid empty list', async () => {
    api.manage.getGraphSpaceList
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValueOnce({
            status: 200,
            data: {records: [{name: 'space-a', nickname: 'Space A'}], total: 1},
        });

    render(<GraphSpace />);

    expect(await screen.findByText('graphspace.load.unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Space A')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'graphspace.create'}))
        .not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', {name: 'graphspace.load.retry'}));

    expect(await screen.findByText('Space A')).toBeInTheDocument();
    expect(screen.queryByText('graphspace.load.unavailable')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'graphspace.create'})).toBeEnabled();
});
