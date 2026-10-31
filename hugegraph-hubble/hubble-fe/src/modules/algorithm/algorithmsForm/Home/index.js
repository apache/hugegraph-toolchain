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

/**
 * @file 算法表单目录Home
 */

import {useCallback, useState} from 'react';
import {Button, Tabs} from 'antd';
import OlapFormHome from '../OlapHome';
import OltpFormHome from '../OltpHome';
import AlgorithmSearch from '../../AlgorithmSearch';
import c from './index.module.scss';
import {useTranslation} from 'react-i18next';
import {clearPersistedAlgorithmForms} from '../algorithmFormPersistence';
import {isKnownZeroCount} from '../../../../utils/graphStatistics';

const AlgorithmFormHome = props => {
    const {
        handleOltpFormSubmit,
        handleOlapFormSubmit,
        currentAlgorithm,
        updateCurrentAlgorithm,
        graphNums,
        graphSpace,
        graph,
        computerStatus,
        engine = 'oltp',
        onEngineChange,
    } =  props;
    const {t} = useTranslation();
    const [search, setSearch] = useState('');
    const [formVersion, setFormVersion] = useState(0);

    const handleSearch = useCallback(value => {
        setSearch(value);
    }, []);
    const resetParameters = useCallback(() => {
        clearPersistedAlgorithmForms(graphSpace, graph);
        setFormVersion(value => value + 1);
    }, [graph, graphSpace]);

    const canRunLouvain = !isKnownZeroCount(graphNums?.edgeCount, graphNums);

    return (
        <div className={c.algorithmSidebar}>
            <Tabs
                className={c.engineTabs}
                activeKey={engine}
                onChange={onEngineChange}
                items={[
                    {key: 'oltp', label: t('analysis.algorithm.oltp_tab')},
                    {key: 'olap', label: t('analysis.algorithm.olap_tab')},
                ]}
            />
            <div className={c.searchBar}>
                <AlgorithmSearch onSearch={handleSearch} disabled={!graphSpace || !graph} />
                <Button type='link' onClick={resetParameters}>
                    {t('analysis.algorithm.reset_parameters')}
                </Button>
            </div>
            <div hidden={engine !== 'oltp'}>
                <OltpFormHome
                    key={`oltp-${formVersion}`}
                    onOltpFormSubmit={handleOltpFormSubmit}
                    search={search}
                    currentAlgorithm={currentAlgorithm}
                    updateCurrentAlgorithm={updateCurrentAlgorithm}
                />
            </div>
            <div hidden={engine !== 'olap'}>
                <OlapFormHome
                    key={`olap-${formVersion}`}
                    onOlapFormSubmit={handleOlapFormSubmit}
                    search={search}
                    currentAlgorithm={currentAlgorithm}
                    updateCurrentAlgorithm={updateCurrentAlgorithm}
                    canRunLouvain={canRunLouvain}
                    graphSpace={graphSpace}
                    graph={graph}
                    computerStatus={computerStatus}
                />
            </div>
        </div>
    );
};

export default AlgorithmFormHome;
