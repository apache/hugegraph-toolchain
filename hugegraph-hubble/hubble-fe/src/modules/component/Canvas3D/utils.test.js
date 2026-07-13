/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import {
    escapeTooltipHtml,
    formatTooltipProperties,
    observeCanvasSize,
} from './utils';

test('escapes graph-controlled tooltip content', () => {
    expect(escapeTooltipHtml('<img src=x onerror="alert(1)"> & \'x\''))
        .toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;x&#39;');
    expect(formatTooltipProperties({'<key>': '<script>x</script>'}))
        .toBe('<div>&lt;key&gt;: &lt;script&gt;x&lt;/script&gt;</div>');
});

test('resizes the graph with its container and disconnects on cleanup', () => {
    let callback;
    const observer = {observe: jest.fn(), disconnect: jest.fn()};
    const ResizeObserverClass = jest.fn(fn => {
        callback = fn;
        return observer;
    });
    const graph = {
        width: jest.fn().mockReturnThis(),
        height: jest.fn().mockReturnThis(),
    };
    const element = {};

    const cleanup = observeCanvasSize(element, graph, ResizeObserverClass);
    callback([{contentRect: {width: 960, height: 540}}]);

    expect(observer.observe).toHaveBeenCalledWith(element);
    expect(graph.width).toHaveBeenCalledWith(960);
    expect(graph.height).toHaveBeenCalledWith(540);
    cleanup();
    expect(observer.disconnect).toHaveBeenCalled();
});
