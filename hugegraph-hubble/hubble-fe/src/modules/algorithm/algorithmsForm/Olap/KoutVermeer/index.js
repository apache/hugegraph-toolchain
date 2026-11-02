/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {useCallback, useContext, useEffect, useState} from 'react';
import {Input, InputNumber, Select} from 'antd';
import {NodeIndexOutlined} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import _ from 'lodash';
import Form from '../../PersistentForm';
import AlgorithmPanel from '../../AlgorithmPanel';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import useAlgorithmPending from '../../useAlgorithmPending';
import GraphAnalysisContext from '../../../../Context';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {GRAPH_STATUS, GRAPH_LOAD_STATUS, TEXT_PATH} from '../../../../../utils/constants';
import {positiveIntegerValidator} from '../../utils';

// The implementation stores distance as uint8 (zero means not reached).
// Restrict max_step to 254 so step + 1 can never wrap to zero.
const MAX_STEPS = 254;
export const isValidKoutMaxSteps = value => Number.isInteger(value) && value >= 1 && value <= MAX_STEPS;

const KoutVermeer = ({name, handleFormSubmit, searchValue, currentAlgorithm, updateCurrentAlgorithm}) => {
    const {t} = useTranslation();
    const {graphSpace, graph, graphStatus} = useContext(GraphAnalysisContext);
    const [enabled, setEnabled] = useState(false);
    const [pending, beginPending] = useAlgorithmPending();
    const [form] = Form.useForm();
    const textPath = TEXT_PATH.OLAP + '.kout_vermeer';

    useEffect(() => {
        setEnabled(graphStatus === GRAPH_LOAD_STATUS.LOADED);
    }, [graphStatus]);

    const submit = useCallback(async values => {
        const finish = beginPending();
        updateCurrentAlgorithm(name);
        const complete = handleFormSubmit(GRAPH_STATUS.LOADING);
        try {
            const response = await api.analysis.runOlapVermeer(graphSpace, graph,
                removeNilKeys({'compute.algorithm': 'kout', ...values}));
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
        finally {
            finish();
        }
    }, [beginPending, graph, graphSpace, handleFormSubmit, name, updateCurrentAlgorithm]);

    const validate = useCallback(() => {
        form.validateFields().then(() => setEnabled(true)).catch(() => setEnabled(false));
    }, [form]);
    const maxSteps = (_, value) => isValidKoutMaxSteps(value)
        ? Promise.resolve() : Promise.reject(new Error(t(textPath + '.max_step_invalid')));

    return <AlgorithmPanel title={<AlgorithmNameHeader icon={<NodeIndexOutlined />} name={name}
        description={t(textPath + '.desc')} isRunning={pending}
        isDisabled={!enabled || graphStatus !== GRAPH_LOAD_STATUS.LOADED}
        handleRunning={event => { event.stopPropagation(); form.submit(); }}
        searchValue={searchValue} highlightName={currentAlgorithm === name} />} forceRender>
        <Form form={form} isDisabled={!enabled} isRunning={pending}
            disabled={graphStatus !== GRAPH_LOAD_STATUS.LOADED} onFinish={submit}
            onValuesChange={_.debounce(validate, 300)} layout='vertical'>
            <Form.Item label='kout.source' name='kout.source' initialValue='1'
                tooltip={t(textPath + '.source')} rules={[{required: true, whitespace: true}]}>
                <Input />
            </Form.Item>
            <Form.Item label='kout.direction' name='kout.direction' initialValue='both'
                tooltip={t(textPath + '.direction')} rules={[{required: true}]}>
                <Select options={['in', 'out', 'both'].map(value => ({value, label: value}))} />
            </Form.Item>
            <Form.Item label='compute.max_step' name='compute.max_step' initialValue={10}
                tooltip={t(textPath + '.max_step')} rules={[{validator: maxSteps}]}>
                <InputNumber min={1} max={MAX_STEPS} precision={0} />
            </Form.Item>
            <Form.Item label='compute.parallel' name='compute.parallel' initialValue={1}
                tooltip={t(TEXT_PATH.ALGORITHM_COMMON + '.worker_num')}
                rules={[{validator: positiveIntegerValidator}]}>
                <InputNumber />
            </Form.Item>
        </Form>
    </AlgorithmPanel>;
};

export default KoutVermeer;
