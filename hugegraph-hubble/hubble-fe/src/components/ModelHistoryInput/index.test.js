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

import {useCallback, useState} from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModelHistoryInput from './index';
import {rememberModel} from '../../utils/modelHistory';
import {setUser} from '../../utils/user';

beforeAll(() => {
    window.matchMedia = window.matchMedia || (() => ({
        matches: false, addListener: jest.fn(), removeListener: jest.fn(),
    }));
});
beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setUser({user_name: 'alice'});
    rememberModel('https://one.example/v1', 'alpha');
    rememberModel('https://one.example/v1', 'beta');
    rememberModel('https://two.example/v1', 'other');
});

const ControlledInput = ({onChange = () => {}, ...props}) => {
    const [value, setValue] = useState('alpha');
    const handleChange = useCallback(event => {
        setValue(event.target.value);
        onChange(event);
    }, [onChange]);
    return (
        <>
            <ModelHistoryInput
                {...props}
                value={value}
                onChange={handleChange}
            />
            <button>Other focus target</button>
        </>
    );
};

test('shows every recent model on focus, filters only while typing and selects through the Input event contract',
    async () => {
        const change = jest.fn();
        render(<ControlledInput baseUrl='https://one.example/v1' onChange={change} aria-label='Model' />);
        const input = screen.getByRole('combobox', {name: 'Model'});
        userEvent.click(input);
        expect(await screen.findByRole('option', {name: 'beta'})).toBeInTheDocument();
        expect(screen.getByText('alpha', {selector: '.ant-select-item-option-content'})).toBeInTheDocument();
        const options = [...document.querySelectorAll('.ant-select-item-option-content')];
        expect(options.map(option => option.textContent)).toEqual(['beta', 'alpha']);
        userEvent.clear(input);
        userEvent.type(input, 'bet');
        expect(screen.queryByText('alpha', {selector: '.ant-select-item-option-content'})).not.toBeInTheDocument();
        userEvent.click(screen.getByText('beta', {selector: '.ant-select-item-option-content'}));
        expect(input).toHaveValue('beta');
        expect(change).toHaveBeenLastCalledWith(expect.objectContaining({target: {value: 'beta'}}));
        userEvent.click(screen.getByRole('button', {name: 'Other focus target'}));
        userEvent.click(input);
        expect(await screen.findByText('alpha', {selector: '.ant-select-item-option-content'})).toBeInTheDocument();
    }
);

test('supports free input without recording unsuccessful model or URL values', () => {
    render(<ControlledInput baseUrl='https://one.example/v1' aria-label='Model' />);
    const before = localStorage.getItem('hubble.text2gql.models.alice');
    const input = screen.getByRole('combobox', {name: 'Model'});
    userEvent.clear(input);
    userEvent.type(input, 'not-a-known-model');
    expect(input).toHaveValue('not-a-known-model');
    expect(localStorage.getItem('hubble.text2gql.models.alice')).toBe(before);
});

test('uses the same successful records to offer recently used Base URLs', async () => {
    const change = jest.fn();
    render(<ControlledInput field='baseUrl' onChange={change} aria-label='Base URL' />);
    const input = screen.getByRole('combobox', {name: 'Base URL'});
    userEvent.click(input);
    expect(await screen.findByRole('option', {name: 'https://two.example/v1'})).toBeInTheDocument();
    userEvent.click(screen.getByText('https://one.example/v1', {selector: '.ant-select-item-option-content'}));
    expect(input).toHaveValue('https://one.example/v1');
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({target: {value: 'https://one.example/v1'}}));
});

test('preserves field attributes and reloads only the current account history', async () => {
    render(<ControlledInput
        baseUrl='https://one.example/v1'
        id='model-name'
        aria-label='Model'
        aria-required='true'
        aria-describedby='model-hint'
        status='error'
        placeholder='Choose or type'
        maxLength={17}
    />);
    const input = screen.getByRole('combobox', {name: 'Model'});
    expect(screen.getByLabelText('Model')).toBe(input);
    expect(input).toHaveAttribute('id', 'model-name');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'model-hint');
    expect(input).toHaveAttribute('placeholder', 'Choose or type');
    expect(input).toHaveAttribute('maxlength', '17');
    expect(input.closest('.ant-select')).toHaveClass('ant-select-status-error');
    act(() => setUser({user_name: 'bob'}));
    act(() => rememberModel('https://one.example/v1', 'bob-model'));
    fireEvent.focus(input);
    expect(await screen.findByRole('option', {name: 'bob-model'})).toBeInTheDocument();
    expect(screen.queryByText('alpha', {selector: '.ant-select-item-option-content'})).not.toBeInTheDocument();
});

test('keeps disabled inputs disabled and does not open history', () => {
    render(<ControlledInput baseUrl='https://one.example/v1' aria-label='Model' disabled />);
    const input = screen.getByRole('combobox', {name: 'Model'});
    expect(input).toBeDisabled();
    fireEvent.focus(input);
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
});


test('allows keyboard selection from history while preserving free input', () => {
    const change = jest.fn();
    render(<ControlledInput baseUrl='https://one.example/v1' onChange={change} aria-label='Model' />);
    const input = screen.getByRole('combobox', {name: 'Model'});
    userEvent.click(input);
    userEvent.keyboard('{ArrowDown}{Enter}');
    expect(input).toHaveValue('beta');
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({target: {value: 'beta'}}));
});

// AutoComplete and its custom Input must not both paint the same placeholder.
test('renders the empty field placeholder once, including while focused', () => {
    render(<ModelHistoryInput
        baseUrl='https://one.example/v1'
        value=''
        aria-label='Model'
        placeholder='Choose or type'
    />);
    const input = screen.getByRole('combobox', {name: 'Model'});
    expect(input).toHaveAttribute('placeholder', 'Choose or type');
    expect(screen.queryByText('Choose or type')).not.toBeInTheDocument();
    userEvent.click(input);
    expect(input).toHaveAttribute('placeholder', 'Choose or type');
    expect(screen.queryByText('Choose or type')).not.toBeInTheDocument();
});
