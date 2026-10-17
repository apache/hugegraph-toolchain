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

import React, {useEffect, useId, useState} from 'react';
import {useTranslation} from 'react-i18next';
import ResizeHandle from '../../../components/ResizeHandle';
import c from './index.module.scss';

const MIN_RESULT_HEIGHT = 240;
// Reserve the same compact preview below the graph at the initial fold.
const HISTORY_PREVIEW_HEIGHT = 160;
const HANDLE_HEIGHT = 14;
const clampResultHeight = (height, maximum) => Math.max(MIN_RESULT_HEIGHT, Math.min(height, maximum));

// Resize only the graph slot; records flow below it in the browser document.
const ResultsLayout = ({renderResult, history}) => {
    const {t} = useTranslation();
    const id = useId();
    const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
    const [preferredHeight, setPreferredHeight] = useState(null);
    const defaultHeight = Math.max(440, Math.min(900, viewportHeight * 0.72))
        - HISTORY_PREVIEW_HEIGHT - HANDLE_HEIGHT;
    const maximumHeight = Math.max(MIN_RESULT_HEIGHT, viewportHeight);
    const resultHeight = clampResultHeight(preferredHeight ?? defaultHeight, maximumHeight);

    useEffect(() => {
        const updateHeight = () => setViewportHeight(window.innerHeight);
        window.addEventListener('resize', updateHeight);
        return () => window.removeEventListener('resize', updateHeight);
    }, []);

    return (
        <div
            className={c.layout}
            style={{gridTemplateRows: `${resultHeight}px ${HANDLE_HEIGHT}px auto`}}
        >
            <div id={`${id}-result`} className={c.result}>
                {renderResult(resultHeight)}
            </div>
            <ResizeHandle
                value={resultHeight}
                min={MIN_RESULT_HEIGHT}
                max={maximumHeight}
                onChange={setPreferredHeight}
                label={t('analysis.query.resize_results')}
                controls={`${id}-result ${id}-history`}
                title={t('analysis.query.resize_results')}
            />
            <div id={`${id}-history`} className={c.history}>{history}</div>
        </div>
    );
};

export default ResultsLayout;
