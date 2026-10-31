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

import {act, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SessionSettings from './SessionSettings';
import * as api from '../../api';

jest.mock('react-i18next', () => ({useTranslation: () => ({t: key => key})}));
jest.mock('../../api', () => ({auth: {
    getSessionSettings: jest.fn(), updateSessionSettings: jest.fn(),
}}));
const settings = seconds => ({status: 200, data: {
    idle_timeout_seconds: seconds, min_idle_seconds: 900, max_idle_seconds: 172800,
}});
beforeEach(() => {
    jest.clearAllMocks();
    window.matchMedia = jest.fn().mockReturnValue({matches: false,
        addListener: jest.fn(), removeListener: jest.fn()});
    api.auth.getSessionSettings.mockResolvedValue(settings(172800));
});
test('loads the actual default and applies the selected whole hours to this session', async () => {
    api.auth.updateSessionSettings.mockResolvedValue(settings(3600));
    render(<SessionSettings />);
    const input = screen.getByRole('spinbutton', {name: 'my.session.hours'});
    await waitFor(() => expect(input).toHaveValue('48'));
    await userEvent.clear(input);
    await userEvent.type(input, '1');
    await userEvent.click(screen.getByRole('button', {name: 'common.action.save'}));
    expect(api.auth.updateSessionSettings).toHaveBeenCalledWith(3600);
    await waitFor(() => expect(screen.getByRole('button', {name: 'common.action.save'})).toBeDisabled());
});
test('keeps an unavailable settings error visible and supports retry', async () => {
    api.auth.getSessionSettings.mockRejectedValueOnce(new Error('offline'));
    render(<SessionSettings />);
    expect(await screen.findByText('my.session.unavailable')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'my.load.retry'}));
    await waitFor(() => expect(screen.getByRole('spinbutton')).toHaveValue('48'));
    expect(screen.queryByText('my.session.unavailable')).not.toBeInTheDocument();
});
test('uses the administrator ceiling returned by the server', async () => {
    api.auth.getSessionSettings.mockResolvedValue({status: 200, data: {
        idle_timeout_seconds: 3600, min_idle_seconds: 900, max_idle_seconds: 7200,
    }});
    render(<SessionSettings />);
    const input = screen.getByRole('spinbutton');
    await waitFor(() => expect(input).toHaveValue('1'));
    expect(input).toHaveAttribute('aria-valuemax', '2');
    await userEvent.clear(input);
    await userEvent.type(input, '3');
    expect(screen.getByRole('button', {name: 'common.action.save'})).toBeDisabled();
    expect(api.auth.updateSessionSettings).not.toHaveBeenCalled();
});
test.each([600, 0, -1])('keeps read-only deployment timeout %s visible without enabling editing', async seconds => {
    api.auth.getSessionSettings.mockResolvedValue({status: 200, data: {
        idle_timeout_seconds: seconds, min_idle_seconds: 900, max_idle_seconds: Math.max(seconds, 0),
    }});
    render(<SessionSettings />);
    expect(await screen.findByPlaceholderText('my.session.deploymentValue')).toBeDisabled();
    await userEvent.hover(screen.getByRole('button', {name: 'my.session.help'}));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('my.session.deploymentOnly');
    expect(screen.getByRole('spinbutton')).toBeDisabled();
    expect(screen.getByRole('button', {name: 'common.action.save'})).toBeDisabled();
    expect(api.auth.updateSessionSettings).not.toHaveBeenCalled();
});
test('keeps the pending value on failed save so the user can retry', async () => {
    api.auth.updateSessionSettings.mockRejectedValueOnce(new Error('offline'));
    render(<SessionSettings />);
    const input = screen.getByRole('spinbutton');
    await waitFor(() => expect(input).toHaveValue('48'));
    await userEvent.clear(input);
    await userEvent.type(input, '1');
    const save = screen.getByRole('button', {name: 'common.action.save'});
    await userEvent.click(save);
    await waitFor(() => expect(save).toBeEnabled());
    expect(input).toHaveValue('1');
});


test('ignores a previous identity settings response after the session panel remounts', async () => {
    let finishOld;
    api.auth.getSessionSettings.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }));
    const {rerender} = render(<SessionSettings key='old-user' />);
    api.auth.getSessionSettings.mockResolvedValueOnce(settings(3600));
    rerender(<SessionSettings key='new-user' />);
    await waitFor(() => expect(screen.getByRole('spinbutton')).toHaveValue('1'));
    await act(async () => finishOld(settings(172800)));
    expect(screen.getByRole('spinbutton')).toHaveValue('1');
});

test.each([3599, 5400])('preserves a non-whole-hour timeout %s until the user selects whole hours', async seconds => {
    api.auth.getSessionSettings.mockResolvedValue(settings(seconds));
    api.auth.updateSessionSettings.mockResolvedValue(settings(3600));
    render(<SessionSettings />);
    const input = await screen.findByPlaceholderText('my.session.deploymentValue');
    expect(input).toHaveValue('');
    expect(api.auth.updateSessionSettings).not.toHaveBeenCalled();
    const save = screen.getByRole('button', {name: 'common.action.save'});
    expect(save).toBeDisabled();
    await userEvent.type(input, '0.5');
    expect(save).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, '1');
    await userEvent.click(save);
    expect(api.auth.updateSessionSettings).toHaveBeenCalledWith(3600);
    await waitFor(() => expect(input).toHaveValue('1'));
});

test('keeps a ceiling below one hour read-only without rounding it up', async () => {
    api.auth.getSessionSettings.mockResolvedValue({status: 200, data: {
        idle_timeout_seconds: 3599, min_idle_seconds: 900, max_idle_seconds: 3599,
    }});
    render(<SessionSettings />);
    const input = await screen.findByPlaceholderText('my.session.deploymentValue');
    expect(input).toBeDisabled();
    expect(input).toHaveValue('');
    expect(screen.getByRole('button', {name: 'common.action.save'})).toBeDisabled();
    expect(api.auth.updateSessionSettings).not.toHaveBeenCalled();
});

test('rounds the editable hours inward to respect second-based server limits', async () => {
    api.auth.getSessionSettings.mockResolvedValue({status: 200, data: {
        idle_timeout_seconds: 9000, min_idle_seconds: 5400, max_idle_seconds: 10799,
    }});
    api.auth.updateSessionSettings.mockResolvedValue(settings(7200));
    render(<SessionSettings />);
    const input = await screen.findByPlaceholderText('my.session.deploymentValue');
    expect(input).toHaveAttribute('aria-valuemin', '2');
    expect(input).toHaveAttribute('aria-valuemax', '2');
    const save = screen.getByRole('button', {name: 'common.action.save'});
    await userEvent.type(input, '1');
    expect(save).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, '3');
    expect(save).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, '2');
    await userEvent.click(save);
    expect(api.auth.updateSessionSettings).toHaveBeenCalledWith(7200);
});

test('shows the brief explanation and range only on the help tooltip', async () => {
    render(<SessionSettings />);
    await waitFor(() => expect(screen.getByRole('spinbutton')).toHaveValue('48'));
    expect(screen.queryByText('my.session.description', {exact: false})).not.toBeInTheDocument();
    expect(screen.queryByText('my.session.range', {exact: false})).not.toBeInTheDocument();
    await userEvent.hover(screen.getByRole('button', {name: 'my.session.help'}));
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('my.session.description');
    expect(tooltip).toHaveTextContent('my.session.range');
});

test('switches units without changing the pending timeout and saves 30 days', async () => {
    const data = {idle_timeout_seconds: 25 * 3600, min_idle_seconds: 900, max_idle_seconds: 30 * 86400};
    api.auth.getSessionSettings.mockResolvedValue({status: 200, data});
    api.auth.updateSessionSettings.mockResolvedValue({status: 200, data: {
        ...data, idle_timeout_seconds: 30 * 86400,
    }});
    render(<SessionSettings />);
    await waitFor(() => expect(screen.getByRole('spinbutton')).toHaveValue('25'));
    await userEvent.click(screen.getByText('my.session.unitDays'));
    expect(screen.getByRole('spinbutton')).toHaveValue('');
    expect(screen.getByRole('button', {name: 'common.action.save'})).toBeDisabled();
    await userEvent.click(screen.getByText('my.session.unitHours'));
    expect(screen.getByRole('spinbutton')).toHaveValue('25');
    await userEvent.click(screen.getByText('my.session.unitDays'));
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('aria-valuemax', '30');
    await userEvent.type(input, '30');
    await userEvent.click(screen.getByRole('button', {name: 'common.action.save'}));
    expect(api.auth.updateSessionSettings).toHaveBeenCalledWith(30 * 86400);
    await waitFor(() => expect(input).toHaveValue('30'));
});

test('respects an administrator ceiling when selecting days', async () => {
    api.auth.getSessionSettings.mockResolvedValue(settings(3600));
    render(<SessionSettings />);
    await waitFor(() => expect(screen.getByRole('spinbutton')).toHaveValue('1'));
    await userEvent.click(screen.getByText('my.session.unitDays'));
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('aria-valuemax', '2');
    await userEvent.type(input, '3');
    expect(screen.getByRole('button', {name: 'common.action.save'})).toBeDisabled();
    expect(api.auth.updateSessionSettings).not.toHaveBeenCalled();
});
