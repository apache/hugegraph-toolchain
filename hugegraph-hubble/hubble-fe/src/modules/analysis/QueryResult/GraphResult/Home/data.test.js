/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import {nextResultRevision} from './data';

test('advances only for a new query-result object, not metadata refreshes', () => {
    const queryResult = {vertices: [{id: '1'}], edges: []};

    expect(nextResultRevision(queryResult, queryResult, 4)).toBe(4);
    expect(nextResultRevision(queryResult, {...queryResult}, 4)).toBe(5);
});
