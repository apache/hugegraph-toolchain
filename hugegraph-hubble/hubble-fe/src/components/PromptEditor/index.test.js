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

import {fireEvent, render, screen} from '@testing-library/react';
import PromptEditor from './index';

jest.mock('react-i18next', () => ({useTranslation: () => ({t: key => key})}));
beforeAll(() => {
    window.matchMedia = window.matchMedia || (() => ({matches: false,
        addListener: jest.fn(), removeListener: jest.fn()}));
});
const values = {gremlin: 'Gremlin shared examples', cypher: 'Cypher shared examples'};
const defaults = {gremlin: 'Gremlin default', cypher: 'Cypher default'};
const show = overrides => {
    const props = {values, defaults, onApply: jest.fn(), onCancel: jest.fn(), ...overrides};
    render(<PromptEditor {...props} />);
    return props;
};
const editor = () => screen.getByRole('textbox');

test('keeps both language drafts and only applies on confirmation', () => {
    const props = show();
    fireEvent.change(editor(), {target: {value: 'new Gremlin few-shot'}});
    fireEvent.click(screen.getByRole('tab', {name: 'Cypher'}));
    expect(editor()).toHaveValue(values.cypher);
    fireEvent.change(editor(), {target: {value: 'new Cypher few-shot'}});
    fireEvent.click(screen.getByRole('tab', {name: 'Gremlin'}));
    expect(editor()).toHaveValue('new Gremlin few-shot');
    expect(props.onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', {name: 'analysis.prompt.apply'}));
    expect(props.onApply).toHaveBeenCalledWith({gremlin: 'new Gremlin few-shot', cypher: 'new Cypher few-shot'});
});

test('restores only the current language and keeps changes local until Apply', () => {
    const props = show({language: 'cypher'});
    fireEvent.click(screen.getByRole('button', {name: 'analysis.prompt.reset_default'}));
    expect(editor()).toHaveValue(defaults.cypher);
    expect(props.onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', {name: 'analysis.prompt.apply'}));
    expect(props.onApply).toHaveBeenCalledWith({...values, cypher: defaults.cypher});
});

test('cancel discards edits without applying and temporary mode explains inheritance', () => {
    const props = show({temporary: true});
    fireEvent.change(editor(), {target: {value: 'discarded'}});
    expect(screen.getByText('analysis.prompt.temporary_hint')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'analysis.prompt.reset_shared'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'analysis.prompt.cancel'}));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onApply).not.toHaveBeenCalled();
});

test('rejects blank templates and limits oversized input', () => {
    const props = show();
    fireEvent.change(editor(), {target: {value: '   '}});
    expect(editor()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', {name: 'analysis.prompt.apply'})).toBeDisabled();
    fireEvent.change(editor(), {target: {value: 'x'.repeat(16001)}});
    expect(editor().value).toHaveLength(16000);
    expect(props.onApply).not.toHaveBeenCalled();
});

test('busy state prevents editing, applying and resetting', () => {
    show({disabled: true});
    expect(editor()).toBeDisabled();
    expect(screen.getByRole('button', {name: 'analysis.prompt.apply'})).toBeDisabled();
    expect(screen.getByRole('button', {name: 'analysis.prompt.reset_default'})).toBeDisabled();
});
