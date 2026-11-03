/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {useCallback, useContext, useEffect, useRef, useState} from 'react';
import {Alert, Input, InputNumber, Select} from 'antd';
import {NodeIndexOutlined} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import Form from '../../PersistentForm';
import AlgorithmPanel from '../../AlgorithmPanel';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import useAlgorithmPending from '../../useAlgorithmPending';
import GraphAnalysisContext from '../../../../Context';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {ALGORITHM_NAME, GRAPH_LOAD_STATUS, GRAPH_STATUS, TEXT_PATH} from '../../../../../utils/constants';

const PATH = TEXT_PATH.OLAP + '.vermeer_advanced';

export const validFilterPair = (expr, properties) => {
    let parsed;
    try {
        parsed = JSON.parse(properties || '[]');
    }
    catch {
        return false;
    }
    return Array.isArray(parsed) && parsed.every(item => typeof item === 'string' && item.trim())
        && Boolean(expr?.trim()) === (parsed.length > 0);
};

const AdvancedVermeer = ({kind, handleFormSubmit, searchValue, currentAlgorithm, updateCurrentAlgorithm}) => {
    const {t} = useTranslation();
    const nonnegativeInteger = (_, value) => Number.isInteger(value) && value >= 0
        ? Promise.resolve() : Promise.reject(new Error(t(PATH + '.nonnegative_integer')));
    const positiveInteger = (_, value) => Number.isInteger(value) && value > 0
        ? Promise.resolve() : Promise.reject(new Error(t(PATH + '.positive_integer')));
    const nonnegativeNumber = (_, value) => typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? Promise.resolve() : Promise.reject(new Error(t(PATH + '.nonnegative_number')));
    const cycle = kind === 'cycle_detection';
    const weighted = kind === 'louvain_weighted';
    const name = cycle ? ALGORITHM_NAME.CYCLE_DETECTION_VERMEER
        : weighted ? ALGORITHM_NAME.LOUVAIN_WEIGHTED : ALGORITHM_NAME.LOUVAIN;
    const {graphSpace, graph, graphStatus} = useContext(GraphAnalysisContext);
    const [enabled, setEnabled] = useState(graphStatus === GRAPH_LOAD_STATUS.LOADED);
    const [running, beginRequiring] = useAlgorithmPending();
    const [form] = Form.useForm();
    const cycleMode = Form.useWatch('cycle.mode', form) || 'limit';
    const vertexExpr = Form.useWatch('filter.vertex_expr', form);
    const edgeExpr = Form.useWatch('filter.edge_expr', form);
    const edgeWeight = Form.useWatch('louvain.edge_weight_property', form);
    const validationSequence = useRef(0);
    const validate = useCallback(() => {
        const sequence = ++validationSequence.current;
        form.validateFields().then(() => {
            if (sequence === validationSequence.current) setEnabled(true);
        }).catch(() => {
            if (sequence === validationSequence.current) setEnabled(false);
        });
    }, [form]);
    const invalidateValidation = useCallback(() => { validationSequence.current++; }, []);
    useEffect(() => {
        if (cycle || weighted) validate();
        return invalidateValidation;
    }, [cycle, weighted, cycleMode, vertexExpr, edgeExpr, edgeWeight, invalidateValidation, validate]);
    useEffect(() => { setEnabled(graphStatus === GRAPH_LOAD_STATUS.LOADED); }, [graphStatus]);
    const submit = useCallback(async values => {
        const finish = beginRequiring();
        updateCurrentAlgorithm(name);
        const complete = handleFormSubmit(GRAPH_STATUS.LOADING);
        try {
            const params = {'compute.algorithm': kind, ...values};
            if (cycle && params['cycle.mode'] !== 'limit') {
                delete params['cycle.max_cycles'];
            }
            const response = await api.analysis.runOlapVermeer(graphSpace, graph, removeNilKeys(params));
            if (response?.status === 200) {
                complete(GRAPH_STATUS.SUCCESS, response.data?.task_id, response.message);
            }
            else {
                complete(GRAPH_STATUS.FAILED, '', response?.message);
            }
        }
        catch (error) {
            complete(GRAPH_STATUS.FAILED, '', error?.message);
        }
        finally { finish(); }
    }, [beginRequiring, cycle, graphSpace, graph, handleFormSubmit, kind, name, updateCurrentAlgorithm]);
    const validatePair = field => (_, value) => {
        const expr = form.getFieldValue(`filter.${field}_expr`);
        return validFilterPair(expr, value) ? Promise.resolve()
            : Promise.reject(new Error(t(PATH + '.invalid_properties')));
    };
    const noProperty = (_, value) => !value?.trim() ? Promise.resolve()
        : Promise.reject(new Error(t(PATH + '.properties_unavailable')));
    const status = enabled && graphStatus === GRAPH_LOAD_STATUS.LOADED;
    return <AlgorithmPanel title={<AlgorithmNameHeader icon={<NodeIndexOutlined />} name={name}
        description={t(PATH + (cycle ? '.cycle_desc' : weighted ? '.weighted_desc' : '.louvain_desc'))}
        isRunning={running} isDisabled={!status} handleRunning={event => { event.stopPropagation(); form.submit(); }}
        searchValue={searchValue} highlightName={currentAlgorithm === name} />} forceRender>
        <Form form={form} isDisabled={!status} isRunning={running} disabled={graphStatus !== GRAPH_LOAD_STATUS.LOADED}
            onFinish={submit} onValuesChange={validate} layout='vertical'>
            <Form.Item name='compute.parallel' label='compute.parallel' initialValue={1}
                tooltip={t(PATH + '.parallel')} rules={[{validator: positiveInteger}]}><InputNumber /></Form.Item>
            <Form.Item name='compute.max_step' label='compute.max_step' initialValue={10}
                tooltip={t(PATH + '.max_step')} rules={[{validator: (_, value) =>
                    Number.isInteger(value) && value >= (weighted ? 3 : 2) ? Promise.resolve()
                        : Promise.reject(new Error(t(PATH + '.max_step')))}]}><InputNumber /></Form.Item>
            {cycle ? <>
                <Form.Item name='cycle.mode' label='cycle.mode' initialValue='limit' tooltip={t(PATH + '.mode')}
                    rules={[{required: true}]}><Select options={['all', 'limit', 'boolean'].map(value => ({value}))} /></Form.Item>
                <Form.Item name='cycle.min_length' label='cycle.min_length' initialValue={0}
                    tooltip={t(PATH + '.min_length')} rules={[{validator: nonnegativeInteger}]}><InputNumber /></Form.Item>
                <Form.Item name='cycle.max_length' label='cycle.max_length' initialValue={5}
                    tooltip={t(PATH + '.max_length')} dependencies={['cycle.min_length']} rules={[
                        {validator: positiveInteger}, {validator: (_, value) => value >= form.getFieldValue('cycle.min_length')
                            ? Promise.resolve() : Promise.reject(new Error(t(PATH + '.invalid_range')))},
                    ]}><InputNumber /></Form.Item>
                {cycleMode === 'all' && <Alert type='warning' showIcon message={t(PATH + '.all_warning')} />}
                {cycleMode === 'limit' && <Form.Item name='cycle.max_cycles' label='cycle.max_cycles' initialValue={10}
                    tooltip={t(PATH + '.max_cycles')} rules={[{validator: positiveInteger}]}><InputNumber /></Form.Item>}
                <Alert type='warning' showIcon message={t(PATH + '.properties_unavailable')} />
                {['vertex', 'edge'].map(field => <div key={field}>
                    <Form.Item name={`filter.${field}_expr`} label={`filter.${field}_expr`}
                        tooltip={t(PATH + '.filter_expr')} rules={[{validator: noProperty}]}><Input /></Form.Item>
                    <Form.Item name={`filter.${field}_properties`} label={`filter.${field}_properties`}
                        initialValue='[]' dependencies={[`filter.${field}_expr`]} tooltip={t(PATH + '.filter_properties')}
                        rules={[{validator: validatePair(field)}]}><Input /></Form.Item>
                </div>)}
            </> : <>
                <Form.Item name='louvain.resolution' label='louvain.resolution' initialValue={1}
                    tooltip={t(PATH + '.resolution')} rules={[{validator: nonnegativeNumber}]}><InputNumber /></Form.Item>
                <Form.Item name='louvain.threshold' label='louvain.threshold' initialValue={0.0000001}
                    tooltip={t(PATH + '.threshold')} rules={[{validator: nonnegativeNumber}]}><InputNumber /></Form.Item>
                <Form.Item name='louvain.step' label='louvain.step' initialValue={10}
                    tooltip={t(PATH + '.step')} rules={[{validator: positiveInteger}]}><InputNumber /></Form.Item>
                {weighted && <>
                    <Alert type='warning' showIcon message={t(PATH + '.properties_unavailable')} />
                    <Form.Item name='louvain.edge_weight_property' label='louvain.edge_weight_property'
                        tooltip={t(PATH + '.edge_weight')} rules={[{validator: noProperty}]}><Input /></Form.Item>
                </>}
            </>}
        </Form>
    </AlgorithmPanel>;
};
export default AdvancedVermeer;
