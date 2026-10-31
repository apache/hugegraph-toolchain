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

import {act, fireEvent, render, screen} from '@testing-library/react';
import {useState} from 'react';
import AlgorithmFormHome from './index';

let mockFinishOltp;
jest.mock('../OltpHome', () => {
    const React = jest.requireActual('react');
    return function MockOltpHome(props) {
        const [pending, setPending] = React.useState(false);
        const submit = () => {
            if (pending) {
                return;
            }
            setPending(true);
            const complete = props.onOltpFormSubmit?.('loading');
            if (typeof complete !== 'function') {
                throw new TypeError('Algorithm submit handler must return a completion callback');
            }
            mockFinishOltp = (...args) => {
                complete(...args);
                setPending(false);
            };
        };
        return <button type='button' disabled={pending} onClick={submit}>OLTP forms</button>;
    };
});
jest.mock('../OlapHome', () => props => (
    <div>
        <div data-testid='olap-readiness'>{String(props.canRunLouvain)}</div>
        <button type='button' onClick={() => props.onOlapFormSubmit?.('olap')}>
            OLAP forms
        </button>
    </div>
));
jest.mock('../../AlgorithmSearch', () => ({disabled}) => (
    <input aria-label='algorithm search' disabled={disabled} />
));
jest.mock('react-router-dom', () => ({
    Link: ({to, children}) => <a href={to}>{children}</a>,
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

beforeEach(() => {
    mockFinishOltp = undefined;
});

test('enables catalog search only after both graph scope components resolve', () => {
    const view = render(<AlgorithmFormHome graphSpace={null} graph={null} />);
    expect(screen.getByRole('textbox', {name: 'algorithm search'})).toBeDisabled();

    view.rerender(<AlgorithmFormHome graphSpace='DEFAULT' graph={undefined} />);
    expect(screen.getByRole('textbox', {name: 'algorithm search'})).toBeDisabled();

    view.rerender(<AlgorithmFormHome graphSpace='DEFAULT' graph='hugegraph' />);
    expect(screen.getByRole('textbox', {name: 'algorithm search'})).toBeEnabled();

    view.rerender(<AlgorithmFormHome graphSpace='DEFAULT' graph={undefined} />);
    expect(screen.getByRole('textbox', {name: 'algorithm search'})).toBeDisabled();

    view.rerender(<AlgorithmFormHome graphSpace='DEFAULT' graph='another' />);
    expect(screen.getByRole('textbox', {name: 'algorithm search'})).toBeEnabled();
});

const renderForm = graphNums => render(
    <AlgorithmFormHome
        engine='olap'
        graphNums={graphNums}
        graphSpace='DEFAULT'
        graph='hugegraph'
    />
);

test('keeps data preparation guidance out of the algorithm list column', () => {
    renderForm({vertexCount: 0, edgeCount: 0});

    expect(screen.queryByText('analysis.algorithm.guide')).not.toBeInTheDocument();
    expect(screen.queryByText('analysis.algorithm.empty_graph_title')).not.toBeInTheDocument();
});

test('only confirmed zero edges prevent Louvain', () => {
    const view = renderForm({vertexCount: 3, edgeCount: 0});
    expect(screen.getByTestId('olap-readiness')).toHaveTextContent('false');

    view.rerender(
        <AlgorithmFormHome
            engine='olap'
            graphNums={{vertexCount: 3, edgeCount: 2}}
            graphSpace='DEFAULT'
            graph='hugegraph'
        />
    );
    expect(screen.getByTestId('olap-readiness')).toHaveTextContent('true');
});


test.each([null, undefined, -1])('lets the server validate Louvain when edge counts are unknown (%s)', edgeCount => {
    renderForm({vertexCount: null, edgeCount});
    expect(screen.getByTestId('olap-readiness')).toHaveTextContent('true');
});

test.each([0, '0'])('lets the server validate Louvain after an approximate zero snapshot (%s)', edgeCount => {
    renderForm({vertexCount: 0, edgeCount, approximate: true, scan_limit: 100000});
    expect(screen.getByTestId('olap-readiness')).toHaveTextContent('true');
});

test('keeps generic guides and documentation out of the compact sidebar', () => {
    renderForm({vertexCount: 1, edgeCount: 1});
    expect(screen.queryByRole('link', {name: 'analysis.algorithm.vermeer_docs'})).not.toBeInTheDocument();
    expect(screen.queryByRole('link', {name: 'analysis.algorithm.traverser_docs'})).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'analysis.algorithm.reset_parameters'})).toBeVisible();
});


const Home = ({submitOltp, submitOlap}) => {
    const [engine, setEngine] = useState('oltp');
    return <AlgorithmFormHome engine={engine} onEngineChange={setEngine}
        handleOltpFormSubmit={submitOltp} handleOlapFormSubmit={submitOlap}
        graphSpace='DEFAULT' graph='g' />;
};

test('starts with OLTP and lets the user switch to a separate OLAP catalog', () => {
    render(<Home />);
    expect(screen.getByText('OLTP forms')).toBeVisible();
    expect(screen.getByTestId('olap-readiness')).not.toBeVisible();
    expect(screen.queryByText('analysis.algorithm.oltp_guide')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', {name: 'analysis.algorithm.traverser_docs'})).not.toBeInTheDocument();
    expect(screen.queryByRole('link', {name: 'analysis.algorithm.vermeer_docs'})).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', {name: 'analysis.algorithm.olap_tab'}));
    expect(screen.getByText('OLTP forms')).not.toBeVisible();
    expect(screen.getByTestId('olap-readiness')).toBeVisible();
    expect(screen.queryByText('analysis.algorithm.olap_guide')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', {name: 'analysis.algorithm.vermeer_docs'})).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', {name: 'analysis.algorithm.oltp_tab'}));
    expect(screen.getByText('OLTP forms')).toBeVisible();
    expect(screen.getByTestId('olap-readiness')).not.toBeVisible();
});

test('preserves the synchronous completion callback and pending state across tab switches', () => {
    const complete = jest.fn();
    const submit = jest.fn(() => complete);
    render(<Home submitOltp={submit} submitOlap={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', {name: 'OLTP forms'}));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', {name: 'OLTP forms'})).toBeDisabled();

    fireEvent.click(screen.getByRole('tab', {name: 'analysis.algorithm.olap_tab'}));
    fireEvent.click(screen.getByRole('tab', {name: 'analysis.algorithm.oltp_tab'}));
    const run = screen.getByRole('button', {name: 'OLTP forms'});
    expect(run).toBeDisabled();
    fireEvent.click(run);
    expect(submit).toHaveBeenCalledTimes(1);

    act(() => mockFinishOltp('success', 'task-1'));
    expect(complete).toHaveBeenCalledWith('success', 'task-1');
    expect(run).toBeEnabled();

    fireEvent.click(run);
    expect(submit).toHaveBeenCalledTimes(2);
});
