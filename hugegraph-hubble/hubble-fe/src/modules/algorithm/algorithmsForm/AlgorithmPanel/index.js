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

import {createContext, use, useState} from 'react';
import {Collapse} from 'antd';
import {AlgorithmPersistenceContext} from '../algorithmFormPersistence';

const ExpandedAlgorithmContext = createContext(null);

export const AlgorithmPanelGroup = ({children, className, onSelect}) => {
    const [active, setActive] = useState(null);
    return <ExpandedAlgorithmContext value={{active, setActive, onSelect}}>
        <div className={className}>{children}</div>
    </ExpandedAlgorithmContext>;
};

const AlgorithmPanel = ({title, children, forceRender = false}) => {
    const algorithm = use(AlgorithmPersistenceContext);
    const group = use(ExpandedAlgorithmContext);
    const [expanded, setExpanded] = useState(false);
    const active = group ? group.active === algorithm : expanded;
    const handleChange = keys => {
        const next = keys.length > 0;
        if (group) {
            group.setActive(next ? algorithm : null);
            if (next) group.onSelect?.(algorithm);
        }
        else {
            setExpanded(next);
        }
    };
    return <Collapse ghost activeKey={active ? [algorithm] : []} onChange={handleChange}
        items={[{key: algorithm, label: title, children, forceRender}]} />;
};

export default AlgorithmPanel;
