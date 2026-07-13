/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 */

import {fireEvent, render, screen} from '@testing-library/react';
import ColumnSettings, {
    applyColumnPreferences,
    normalizeColumnPreferences,
    useColumnSettings,
} from './index';

const columns = [
    {key: 'time', title: 'Time'},
    {key: 'action', title: 'Action'},
    {key: 'type', title: 'Type'},
];
const labels = {
    title: 'Columns',
    moveUp: 'Move up',
    moveDown: 'Move down',
    reset: 'Reset',
};

const Harness = () => {
    const settings = useColumnSettings(columns, 'column-test', ['action']);
    return (
        <div>
            <span data-testid='visible-columns'>
                {settings.columns.map(column => column.key).join(',')}
            </span>
            <ColumnSettings
                columns={columns}
                preferences={settings.preferences}
                setPreferences={settings.setPreferences}
                reset={settings.reset}
                requiredKeys={['action']}
                labels={labels}
            />
        </div>
    );
};

beforeAll(() => {
    window.matchMedia = window.matchMedia || (() => ({
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

beforeEach(() => window.localStorage.clear());

test('restores a valid saved column order and visibility', () => {
    const preferences = normalizeColumnPreferences(columns, {
        order: ['type', 'missing', 'time'],
        hidden: ['time', 'action'],
    }, ['action']);

    expect(preferences).toEqual({
        order: ['type', 'time', 'action'],
        hidden: ['time'],
    });
    expect(applyColumnPreferences(columns, preferences).map(column => column.key))
        .toEqual(['type', 'action']);
});

test('uses declared order and shows every column by default', () => {
    const preferences = normalizeColumnPreferences(columns, {});

    expect(preferences).toEqual({
        order: ['time', 'action', 'type'],
        hidden: [],
    });
});

test('persists hidden columns and can reset them without a drag dependency', () => {
    const first = render(<Harness />);
    fireEvent.click(screen.getByRole('button', {name: /Columns/}));
    fireEvent.click(screen.getByRole('checkbox', {name: 'Time'}));
    expect(screen.getByTestId('visible-columns')).toHaveTextContent('action,type');
    expect(JSON.parse(window.localStorage.getItem('column-test')).hidden).toEqual(['time']);

    first.unmount();
    render(<Harness />);
    expect(screen.getByTestId('visible-columns')).toHaveTextContent('action,type');
    fireEvent.click(screen.getByRole('button', {name: /Columns/}));
    fireEvent.click(screen.getByRole('button', {name: 'Reset'}));
    expect(screen.getByTestId('visible-columns')).toHaveTextContent('time,action,type');
    expect(window.localStorage.getItem('column-test')).toBeNull();
});
