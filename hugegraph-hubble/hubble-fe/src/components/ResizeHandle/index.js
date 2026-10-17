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

import {useRef} from 'react';
import {HolderOutlined} from '@ant-design/icons';
import c from './index.module.scss';

const ResizeHandle = ({value, min, max, onChange, label, controls, title, className = ''}) => {
    const drag = useRef(null);
    const clamp = next => Math.max(min, Math.min(max, Math.round(next)));
    const start = event => {
        if (event.button !== 0 || event.isPrimary === false) {
            return;
        }
        event.preventDefault();
        drag.current = {pointer: event.pointerId, y: event.clientY, value};
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const move = event => {
        if (drag.current?.pointer === event.pointerId) {
            onChange(clamp(drag.current.value + event.clientY - drag.current.y));
        }
    };
    const stop = event => {
        if (drag.current?.pointer !== event.pointerId) {
            return;
        }
        drag.current = null;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };
    const resizeWithKeyboard = event => {
        const offsets = {ArrowUp: -16, ArrowDown: 16};
        if (event.key === 'Home' || event.key === 'End' || offsets[event.key]) {
            event.preventDefault();
            onChange(event.key === 'Home' ? min : event.key === 'End' ? max : clamp(value + offsets[event.key]));
        }
    };

    return (
        <div
            className={`${c.resizeHandle} ${className}`}
            role='separator'
            tabIndex={0}
            aria-label={label}
            aria-orientation='horizontal'
            aria-controls={controls}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={Math.round(value)}
            title={title}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={stop}
            onPointerCancel={stop}
            onLostPointerCapture={stop}
            onKeyDown={resizeWithKeyboard}
        >
            <HolderOutlined rotate={90} aria-hidden='true' />
        </div>
    );
};

export default ResizeHandle;
