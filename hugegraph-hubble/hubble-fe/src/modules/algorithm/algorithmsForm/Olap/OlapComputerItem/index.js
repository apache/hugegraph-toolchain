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

import React, {useContext} from 'react';
import {Input, InputNumber} from 'antd';
import Form from '../../PersistentForm';
import GraphAnalysisContext from '../../../../Context';
import {TEXT_PATH} from '../../../../../utils/constants';
import {useTranslation} from 'react-i18next';


const OWNED_TEXT_PATH = TEXT_PATH.OLAP + '.computer_item';
const OlapComputerItem = () => {
    const {t} = useTranslation();
    const {isVermeer} =  useContext(GraphAnalysisContext);
    const desp = {
        computer_cpu: t(`${OWNED_TEXT_PATH}.computer_cpu`),
        worker_cpu: t(`${OWNED_TEXT_PATH}.worker_cpu`),
        master_request_memory: t(`${OWNED_TEXT_PATH}.master_request_memory`),
        worker_request_memory: t(`${OWNED_TEXT_PATH}.worker_request_memory`),
        master_memory: t(`${OWNED_TEXT_PATH}.master_memory`),
        worker_memory: t(`${OWNED_TEXT_PATH}.worker_memory`),
    };
    const formItem = (
        <>
            <Form.Item
                label='k8s.computer_cpu'
                name='k8s.computer_cpu'
                tooltip={desp.computer_cpu}
            >
                <InputNumber />
            </Form.Item>
            <Form.Item
                label='k8s.worker_cpu'
                name='k8s.worker_cpu'
                tooltip={desp.worker_cpu}
            >
                <InputNumber />
            </Form.Item>
            <Form.Item
                label='k8s.master_request_memory'
                name='k8s.master_request_memory'
                tooltip={desp.master_request_memory}
            >
                <Input />
            </Form.Item>
            <Form.Item
                label='k8s.worker_request_memory'
                name='k8s.worker_request_memory'
                tooltip={desp.worker_request_memory}
            >
                <Input />
            </Form.Item>
            <Form.Item
                label='k8s.master_memory'
                name='k8s.master_memory'
                tooltip={desp.master_memory}
            >
                <Input />
            </Form.Item>
            <Form.Item
                label='k8s.worker_memory'
                name='k8s.worker_memory'
                tooltip={desp.worker_memory}
            >
                <Input />
            </Form.Item>
        </>
    );

    return (
        isVermeer ? null : formItem
    );
};

export default OlapComputerItem;
