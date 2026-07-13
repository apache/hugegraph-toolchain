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

import {ALGORITHM_NAME} from '../../../utils/constants';
import {
    getAlgorithmDocumentationUrl,
    isAlgorithmImplementationSource,
} from './algorithmDocs';

test('links interactive algorithms to their exact official API sections', () => {
    expect(getAlgorithmDocumentationUrl(ALGORITHM_NAME.K_OUT))
        .toMatch(/#321-k-out-api-get-basic-version$/);
    expect(getAlgorithmDocumentationUrl(ALGORITHM_NAME.KNEIGHBOR_POST))
        .toMatch(/#324-k-neighbor-api-post-advanced-version$/);
    expect(getAlgorithmDocumentationUrl(ALGORITHM_NAME.FINDSHORTESTPATHWITHWEIGHT))
        .toMatch(/#3210-weighted-shortest-path$/);
});

test('links rank and batch algorithms to their official documentation', () => {
    expect(getAlgorithmDocumentationUrl(ALGORITHM_NAME.RANK_API))
        .toContain('/restful-api/rank/');
    expect(getAlgorithmDocumentationUrl(ALGORITHM_NAME.PAGE_RANK))
        .toContain('/quickstart/hugegraph-computer/#4-built-in-algorithms-document');
});

test.each([
    ['ADAMIC_ADAR', 'apache/hugegraph/blob/b12425c2032bf0d21a97b8221f42a18055c2982f/',
        'AdamicAdarAPI.java#L52-L88'],
    ['RESOURCE_ALLOCATION',
        'apache/hugegraph/blob/b12425c2032bf0d21a97b8221f42a18055c2982f/',
        'ResourceAllocationAPI.java#L52-L89'],
    ['SAME_NEIGHBORS_BATCH',
        'apache/hugegraph/blob/b12425c2032bf0d21a97b8221f42a18055c2982f/',
        'SameNeighborsAPI.java#L100-L140'],
    ['EGONET',
        'apache/hugegraph-toolchain/blob/50a839469b1ad779115e371d0df378116638e9e1/',
        'EgonetAPI.java#L25-L40'],
])('links %s to its stable official API implementation', (key, repository, source) => {
    const name = ALGORITHM_NAME[key];
    const url = getAlgorithmDocumentationUrl(name);

    expect(url).toContain(repository);
    expect(url).toContain(source);
    expect(url).not.toMatch(/#322[2-5]-/);
    expect(isAlgorithmImplementationSource(name)).toBe(true);
});

test('maps every supported algorithm without falling back to the traverser index', () => {
    Object.values(ALGORITHM_NAME).forEach(name => {
        expect(getAlgorithmDocumentationUrl(name))
            .not.toBe('https://hugegraph.apache.org/docs/clients/restful-api/traverser/');
    });
});
