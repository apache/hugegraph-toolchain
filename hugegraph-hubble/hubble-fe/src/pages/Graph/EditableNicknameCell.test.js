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

import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import EditableNicknameCell from './EditableNicknameCell';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return {promise, reject, resolve};
};

test('keeps the graph path name read-only and hides editing without permission', () => {
    render(
        <EditableNicknameCell
            canEdit={false}
            name='movie_graph'
            nickname='Movie graph'
            onSave={jest.fn()}
        />
    );

    expect(screen.getByText('Movie graph')).toBeInTheDocument();
    expect(screen.getByText('movie_graph')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /common.action.edit/}))
        .not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

test('saves explicitly with Enter and displays the server value', async () => {
    const onSave = jest.fn().mockResolvedValue('Movies from server');
    render(
        <EditableNicknameCell
            canEdit
            name='movie_graph'
            nickname='Movie graph'
            onSave={onSave}
        />
    );

    fireEvent.click(screen.getByRole('button', {name: /common.action.edit/}));
    const input = screen.getByRole('textbox', {name: 'graph.form.nickname'});
    fireEvent.change(input, {target: {value: 'Movies'}});
    fireEvent.blur(input);
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.keyDown(input, {key: 'Enter'});

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Movies'));
    expect(await screen.findByText('Movies from server')).toBeInTheDocument();
    expect(screen.getByText('movie_graph')).toBeInTheDocument();
});

test('cancels with Escape without saving', () => {
    const onSave = jest.fn();
    render(
        <EditableNicknameCell
            canEdit
            name='movie_graph'
            nickname='Movie graph'
            onSave={onSave}
        />
    );

    fireEvent.click(screen.getByRole('button', {name: /common.action.edit/}));
    const input = screen.getByRole('textbox', {name: 'graph.form.nickname'});
    fireEvent.change(input, {target: {value: 'Discard me'}});
    fireEvent.keyDown(input, {key: 'Escape'});

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Movie graph')).toBeInTheDocument();
});

test('locks the editor while saving to prevent duplicate requests', async () => {
    const save = deferred();
    const onSave = jest.fn(() => save.promise);
    render(
        <EditableNicknameCell
            canEdit
            name='movie_graph'
            nickname='Movie graph'
            onSave={onSave}
        />
    );

    fireEvent.click(screen.getByRole('button', {name: /common.action.edit/}));
    const input = screen.getByRole('textbox', {name: 'graph.form.nickname'});
    fireEvent.change(input, {target: {value: 'Movies'}});
    fireEvent.keyDown(input, {key: 'Enter'});
    fireEvent.keyDown(input, {key: 'Enter'});

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', {name: 'common.action.save'})).toBeDisabled();

    save.resolve('Movies');
    expect(await screen.findByText('Movies')).toBeInTheDocument();
});

test('retains the draft and shows a visible error after a failed save', async () => {
    const onSave = jest.fn().mockRejectedValue(new Error('Nickname update failed'));
    render(
        <EditableNicknameCell
            canEdit
            name='movie_graph'
            nickname='Movie graph'
            onSave={onSave}
        />
    );

    fireEvent.click(screen.getByRole('button', {name: /common.action.edit/}));
    const input = screen.getByRole('textbox', {name: 'graph.form.nickname'});
    fireEvent.change(input, {target: {value: 'Keep this draft'}});
    fireEvent.click(screen.getByRole('button', {name: 'common.action.save'}));

    expect(await screen.findByRole('alert')).toHaveTextContent('Nickname update failed');
    expect(screen.getByRole('textbox')).toHaveValue('Keep this draft');
    expect(screen.getByRole('button', {name: 'common.action.save'})).toBeEnabled();
});
