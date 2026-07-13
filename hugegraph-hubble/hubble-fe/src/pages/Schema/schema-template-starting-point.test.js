/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditLayer, {BUILTIN_SCHEMA_TEMPLATES} from './EditLayer';

jest.mock('../../api/index', () => ({
    manage: {
        addSchema: jest.fn(),
        updateSchema: jest.fn(),
    },
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
    initReactI18next: {
        type: '3rdParty',
        init: jest.fn(),
    },
}));

beforeAll(() => {
    window.matchMedia = window.matchMedia || (() => ({
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

test('offers built-in starting points in create mode and fills an empty draft', async () => {
    render(
        <EditLayer
            visible
            mode='create'
            detail={{}}
            graphspace='DEFAULT'
            onCancel={jest.fn()}
            refresh={jest.fn()}
        />
    );

    const startingPoint = screen.getByRole('combobox');
    expect(startingPoint).toBeEnabled();
    await userEvent.click(startingPoint);
    await userEvent.click(screen.getByText('schema_template.builtin.people_network'));

    expect(screen.getByPlaceholderText('schema_template.form.name_placeholder'))
        .toHaveValue('people_network');
    expect(screen.getByPlaceholderText('schema_template.form.schema_placeholder'))
        .toHaveValue(BUILTIN_SCHEMA_TEMPLATES.people_network);
    expect(startingPoint).toBeDisabled();
});

test('does not show the starting-point selector while editing', () => {
    render(
        <EditLayer
            visible
            mode='edit'
            detail={{name: 'existing', schema: 'schema = graph.schema()'}}
            graphspace='DEFAULT'
            onCancel={jest.fn()}
            refresh={jest.fn()}
        />
    );

    expect(screen.queryByText('schema_template.form.starting_point')).not.toBeInTheDocument();
});
