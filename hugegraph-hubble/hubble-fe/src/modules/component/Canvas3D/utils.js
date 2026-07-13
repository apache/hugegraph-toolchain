/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export const escapeTooltipHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const formatTooltipProperties = properties => Object.entries(properties || {})
    .map(([key, value]) => (
        `<div>${escapeTooltipHtml(key)}: ${escapeTooltipHtml(value)}</div>`
    ))
    .join('');

export const observeCanvasSize = (element, graph, ResizeObserverClass) => {
    if (!ResizeObserverClass) {
        return () => {};
    }
    const observer = new ResizeObserverClass(entries => {
        const {width, height} = entries[0]?.contentRect || {};
        if (width > 0 && height > 0 && graph && !graph.destroyed
            && typeof graph.width === 'function'
            && typeof graph.height === 'function') {
            graph.width(width);
            graph.height(height);
        }
    });
    observer.observe(element);
    return () => observer.disconnect();
};
