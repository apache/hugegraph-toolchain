/*
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

import React, {useCallback, useContext, useEffect} from 'react';
import {Form as AntForm} from 'antd';
import {useTranslation} from 'react-i18next';
import GraphAnalysisContext from '../../../Context';
import {
    AlgorithmPersistenceContext,
    algorithmFormStorageKey,
} from '../algorithmFormPersistence';

const readPersistedValues = key => {
    try {
        const value = JSON.parse(window.localStorage.getItem(key));
        return value && typeof value === 'object' ? value : null;
    }
    catch {
        return null;
    }
};

const EXAMPLE_VALUES = {
    algorithm: 'page_rank',
    alpha: '0.85',
    sample_rate: '1.0',
    use_endpoint: 'false',
    max_super_step: '30',
    max_step: '30',
    parallel: '2',
    source: '1:marko',
    sources: '1:marko,2:vadas',
    target: '2:lop',
    targets: '2:lop,4:josh',
    vertex: '1:marko',
    vertex_list: '1:marko,2:vadas,4:josh,6:peter',
    vertices: '1:marko,2:vadas',
    other: '1:josh',
    ids: '1:marko,2:vadas',
    label: 'knows',
    labels: 'knows,created',
    properties: 'weight=0.1',
    property_filter: '$element.weight > 0.1',
    weight: 'weight',
    weight_by: 'weight',
    default_weight: '1.0',
    weight_property: 'weight',
    wf_improved: 'true',
    weightkey: 'weight',
    direction: 'BOTH',
    worker: '1',
    worker_cpu: '2',
    computer_cpu: '2',
    worker_memory: '2Gi',
    worker_request_memory: '1Gi',
    workerRequestMemory: '1Gi',
    master_memory: '2Gi',
    master_request_memory: '1Gi',
    jvm_options: '-Xms512m -Xmx1g',
    group_property: '3',
    limit_edges_in_one_vertex: '100',
    minimum_edges_use_superedge_cache: '1000',
    use_id_fixlength: 'true',
    degree_k: '3',
    k: '3',
    max_times: '2',
    sample: '100',
    analyze_config: '{"degree":true,"clustering_coefficient":true}',
    max_diff: '0.001',
    min_groups: '1',
    min_neighbors: '2',
    min_similars: '2',
    nearest: 'true',
    damping: '0.85',
    diff_threshold: '0.0001',
    l1DiffThreshold: '0.0001',
    query_graph_config: '{"vertex_label":"person","edge_label":"knows"}',
    max_ring_length: '6',
    min_ring_length: '3',
    source_in_ring: 'true',
    skip_degree: '100000',
    sort_by: 'DEGREE',
    top: '10',
    with_intermediary: 'false',
    with_label: 'true',
};

const getFieldName = name => {
    const value = Array.isArray(name) ? name[name.length - 1] : name;
    return String(value || '').split('.').pop();
};

export const inferExampleValue = fieldName => {
    if (EXAMPLE_VALUES[fieldName]) {
        return EXAMPLE_VALUES[fieldName];
    }
    if (/property|filter|pattern|config|option/.test(fieldName)) {
        return '{}';
    }
    if (/count|depth|degree|limit|max|min|size|step|top|capacity|alpha|threshold/.test(
        fieldName
    )) {
        return '10';
    }
    return null;
};

const PersistentFormItem = props => {
    const {t} = useTranslation();
    const {children, initialValue, name} = props;
    const fieldName = getFieldName(name);
    const example = inferExampleValue(fieldName);
    const canAddExample = example && initialValue === undefined
        && React.isValidElement(children) && !children.props.placeholder;
    const field = canAddExample
        ? React.cloneElement(children, {
            placeholder: t('analysis.algorithm.parameter_example', {value: example}),
        })
        : children;
    return <AntForm.Item {...props}>{field}</AntForm.Item>;
};

const PersistentForm = props => {
    const {graphSpace, graph} = useContext(GraphAnalysisContext);
    const algorithmName = useContext(AlgorithmPersistenceContext);
    const [fallbackForm] = AntForm.useForm();
    const {
        form = fallbackForm,
        onValuesChange,
        ...formProps
    } = props;
    const storageKey = algorithmFormStorageKey(graphSpace, graph, algorithmName);

    useEffect(() => {
        form.resetFields();
        const values = readPersistedValues(storageKey);
        if (values) {
            form.setFieldsValue(values);
        }
    }, [form, storageKey]);

    const handleValuesChange = useCallback(
        (changedValues, allValues) => {
            try {
                window.localStorage.setItem(storageKey, JSON.stringify(allValues));
            }
            catch {
                // Form editing remains available when browser storage is blocked.
            }
            onValuesChange?.(changedValues, allValues);
        },
        [onValuesChange, storageKey]
    );

    return (
        <AntForm
            {...formProps}
            form={form}
            onValuesChange={handleValuesChange}
        />
    );
};

PersistentForm.Item = PersistentFormItem;
PersistentForm.List = AntForm.List;
PersistentForm.ErrorList = AntForm.ErrorList;
PersistentForm.Provider = AntForm.Provider;
PersistentForm.useForm = AntForm.useForm;
PersistentForm.useWatch = AntForm.useWatch;

export default PersistentForm;
