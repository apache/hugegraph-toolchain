/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
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
        if (width > 0 && height > 0) {
            graph.width(width).height(height);
        }
    });
    observer.observe(element);
    return () => observer.disconnect();
};
