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

import {
    ALGORITHM_NAME,
    getCanonicalAlgorithmName,
} from '../../../utils/constants';

const TRAVERSER_DOC = 'https://hugegraph.apache.org/docs/clients/restful-api/traverser/';
const RANK_DOC = 'https://hugegraph.apache.org/docs/clients/restful-api/rank/';
const COMPUTER_DOC
    = 'https://hugegraph.apache.org/docs/quickstart/hugegraph-computer/'
    + '#4-built-in-algorithms-document';
const SERVER_SOURCE
    = 'https://github.com/apache/hugegraph/blob/'
    + 'b12425c2032bf0d21a97b8221f42a18055c2982f/'
    + 'hugegraph-server/hugegraph-api/src/main/java/org/apache/hugegraph/'
    + 'api/traversers/';
const CLIENT_SOURCE
    = 'https://github.com/apache/hugegraph-toolchain/blob/'
    + '50a839469b1ad779115e371d0df378116638e9e1/'
    + 'hugegraph-client/src/main/java/org/apache/hugegraph/api/traverser/';

const OLTP_DOC_ANCHORS = {
    K_OUT: '#321-k-out-api-get-basic-version',
    KOUT_POST: '#322-k-out-api-post-advanced-version',
    K_NEIGHBOR: '#323-k-neighbor-get-basic-version',
    KNEIGHBOR_POST: '#324-k-neighbor-api-post-advanced-version',
    SAME_NEIGHBORS: '#325-same-neighbors',
    JACCARD_SIMILARITY: '#326-jaccard-similarity-get',
    JACCARD_SIMILARITY_POST: '#327-jaccard-similarity-post',
    SHORTEST_PATH: '#328-shortest-path',
    FINDSHORTESTPATH: '#329-all-shortest-paths',
    ALLPATHS: '#329-all-shortest-paths',
    FINDSHORTESTPATHWITHWEIGHT: '#3210-weighted-shortest-path',
    SINGLESOURCESHORTESTPATH: '#3211-single-source-shortest-path',
    MULTINODESSHORTESTPATH: '#3212-multi-node-shortest-path',
    PATHS: '#3214-paths-post-advanced-version',
    CUSTOMIZEDPATHS: '#3215-customized-paths',
    TEMPLATEPATHS: '#3216-template-paths',
    CROSSPOINTS: '#3217-crosspoints',
    CUSTOMIZED_CROSSPOINTS: '#3218-customized-crosspoints',
    RINGS: '#3219-rings',
    RAYS: '#3220-rays',
    FUSIFORM_SIMILARITY: '#3221-fusiform-similarity',
};

const docsByAlgorithm = Object.fromEntries(
    Object.entries(OLTP_DOC_ANCHORS).map(([key, anchor]) => (
        [ALGORITHM_NAME[key], `${TRAVERSER_DOC}${anchor}`]
    ))
);

const sourceByAlgorithm = {
    [ALGORITHM_NAME.ADAMIC_ADAR]: `${SERVER_SOURCE}AdamicAdarAPI.java#L52-L88`,
    [ALGORITHM_NAME.RESOURCE_ALLOCATION]:
        `${SERVER_SOURCE}ResourceAllocationAPI.java#L52-L89`,
    [ALGORITHM_NAME.SAME_NEIGHBORS_BATCH]:
        `${SERVER_SOURCE}SameNeighborsAPI.java#L100-L140`,
    [ALGORITHM_NAME.EGONET]: `${CLIENT_SOURCE}EgonetAPI.java#L25-L40`,
};
Object.assign(docsByAlgorithm, sourceByAlgorithm);

[ALGORITHM_NAME.RANK_API, ALGORITHM_NAME.NEIGHBOR_RANK_API].forEach(name => {
    docsByAlgorithm[name] = RANK_DOC;
});

const OLAP_KEYS = [
    'PAGE_RANK', 'WEAKLY_CONNECTED_COMPONENT', 'DEGREE_CENTRALIT',
    'CLOSENESS_CENTRALITY', 'TRIANGLE_COUNT', 'RINGS_DETECTION',
    'FILTERED_RINGS_DETECTION', 'LINKS', 'CLUSTER_COEFFICIENT',
    'BETWEENNESS_CENTRALITY', 'LABEL_PROPAGATION_ALGORITHM', 'LOUVAIN',
    'FILTER_SUBGRAPH_MATCHING', 'K_CORE', 'PERSONAL_PAGE_RANK', 'SSSP',
];
OLAP_KEYS.forEach(key => {
    docsByAlgorithm[ALGORITHM_NAME[key]] = COMPUTER_DOC;
});

export const getAlgorithmDocumentationUrl = name => (
    docsByAlgorithm[getCanonicalAlgorithmName(name)] || TRAVERSER_DOC
);

export const isAlgorithmImplementationSource = name => (
    Object.prototype.hasOwnProperty.call(
        sourceByAlgorithm,
        getCanonicalAlgorithmName(name)
    )
);
