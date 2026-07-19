/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import {render, screen} from '@testing-library/react';
import AlgorithmFormHome from './index';

jest.mock('../OltpHome', () => () => <div>OLTP forms</div>);
jest.mock('../OlapHome', () => props => (
    <div data-testid='olap-readiness'>{String(props.canRunLouvain)}</div>
));
jest.mock('../../AlgorithmSearch', () => () => <div>algorithm search</div>);
jest.mock('react-router-dom', () => ({
    Link: ({to, children}) => <a href={to}>{children}</a>,
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

const renderForm = graphNums => render(
    <AlgorithmFormHome
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

test('requires at least one edge before enabling Louvain', () => {
    const view = renderForm({vertexCount: 3, edgeCount: 0});
    expect(screen.getByTestId('olap-readiness')).toHaveTextContent('false');

    view.rerender(
        <AlgorithmFormHome
            graphNums={{vertexCount: 3, edgeCount: 2}}
            graphSpace='DEFAULT'
            graph='hugegraph'
        />
    );
    expect(screen.getByTestId('olap-readiness')).toHaveTextContent('true');
});
