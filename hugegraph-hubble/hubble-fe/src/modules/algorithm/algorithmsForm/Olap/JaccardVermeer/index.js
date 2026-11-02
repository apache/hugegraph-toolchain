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
import {Input, InputNumber} from 'antd';
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

const JaccardVermeer = ({name, handleFormSubmit, searchValue, currentAlgorithm, updateCurrentAlgorithm}) => {
    const {t} = useTranslation();
    const {graphSpace, graph, graphStatus} = useContext(GraphAnalysisContext);
    const [enabled, setEnabled] = useState(false);
    const [pending, beginPending] = useAlgorithmPending();
    const [form] = Form.useForm();
    const textPath = TEXT_PATH.OLAP + '.jaccard_vermeer';

    useEffect(() => {
        setEnabled(graphStatus === GRAPH_LOAD_STATUS.LOADED && Boolean(form.getFieldValue('jaccard.source')));
    }, [form, graphStatus]);

    const submit = useCallback(async values => {
        const finish = beginPending();
        updateCurrentAlgorithm(name);
        const complete = handleFormSubmit(GRAPH_STATUS.LOADING);
        try {
            const response = await api.analysis.runOlapVermeer(graphSpace, graph,
                removeNilKeys({'compute.algorithm': 'jaccard', ...values}));
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

    return <AlgorithmPanel title={<AlgorithmNameHeader icon={<NodeIndexOutlined />} name={name}
        description={t(textPath + '.desc')} isRunning={pending}
        isDisabled={!enabled || graphStatus !== GRAPH_LOAD_STATUS.LOADED}
        handleRunning={event => { event.stopPropagation(); form.submit(); }}
        searchValue={searchValue} highlightName={currentAlgorithm === name} />} forceRender>
        <Form form={form} isDisabled={!enabled} isRunning={pending}
            disabled={graphStatus !== GRAPH_LOAD_STATUS.LOADED} onFinish={submit}
            onValuesChange={_.debounce(validate, 300)} layout='vertical'>
            <Form.Item label='jaccard.source' name='jaccard.source'
                tooltip={t(textPath + '.source')} rules={[{required: true, whitespace: true}]}>
                <Input />
            </Form.Item>
            <Form.Item label='compute.max_step' name='compute.max_step' initialValue={10}
                tooltip={t(textPath + '.max_step')}
                rules={[{validator: (_, value) => Number.isInteger(value) && value >= 2
                    ? Promise.resolve() : Promise.reject(new Error(t(textPath + '.max_step_invalid')))}]}>
                <InputNumber min={2} precision={0} />
            </Form.Item>
            <Form.Item label='compute.parallel' name='compute.parallel' initialValue={1}
                tooltip={t(TEXT_PATH.ALGORITHM_COMMON + '.worker_num')}
                rules={[{validator: positiveIntegerValidator}]}>
                <InputNumber />
            </Form.Item>
        </Form>
    </AlgorithmPanel>;
};

export default JaccardVermeer;
