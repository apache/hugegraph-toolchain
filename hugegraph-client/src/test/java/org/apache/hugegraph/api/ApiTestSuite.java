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

package org.apache.hugegraph.api;

import org.apache.hugegraph.api.auth.AccessApiTest;
import org.apache.hugegraph.api.auth.BelongApiTest;
import org.apache.hugegraph.api.auth.GroupApiTest;
import org.apache.hugegraph.api.auth.LoginApiTest;
import org.apache.hugegraph.api.auth.LogoutApiTest;
import org.apache.hugegraph.api.auth.ProjectApiTest;
import org.apache.hugegraph.api.auth.TargetApiTest;
import org.apache.hugegraph.api.auth.TokenApiTest;
import org.apache.hugegraph.api.auth.UserApiTest;
import org.apache.hugegraph.api.traverser.AllShortestPathsApiTest;
import org.apache.hugegraph.api.traverser.CommonTraverserApiTest;
import org.apache.hugegraph.api.traverser.CountApiTest;
import org.apache.hugegraph.api.traverser.CustomizedPathsApiTest;
import org.apache.hugegraph.api.traverser.FusiformSimilarityApiTest;
import org.apache.hugegraph.api.traverser.JaccardSimilarityApiTest;
import org.apache.hugegraph.api.traverser.KneighborApiTest;
import org.apache.hugegraph.api.traverser.KoutApiTest;
import org.apache.hugegraph.api.traverser.MultiNodeShortestPathApiTest;
import org.apache.hugegraph.api.traverser.NeighborRankApiTest;
import org.apache.hugegraph.api.traverser.PathsApiTest;
import org.apache.hugegraph.api.traverser.PersonalRankApiTest;
import org.apache.hugegraph.api.traverser.RingsRaysApiTest;
import org.apache.hugegraph.api.traverser.SameNeighborsApiTest;
import org.apache.hugegraph.api.traverser.SameNeighborsBatchApiTest;
import org.apache.hugegraph.api.traverser.ShortestPathApiTest;
import org.apache.hugegraph.api.traverser.SingleSourceShortestPathApiTest;
import org.apache.hugegraph.api.traverser.TemplatePathsApiTest;
import org.apache.hugegraph.api.traverser.WeightedShortestPathApiTest;
import org.apache.hugegraph.api.traverser.EdgeExistenceAPITest;
import org.junit.runner.RunWith;
import org.junit.runners.Suite;

@RunWith(Suite.class)
@Suite.SuiteClasses({
        PropertyKeyApiTest.class,
        VertexLabelApiTest.class,
        EdgeLabelApiTest.class,
        IndexLabelApiTest.class,
        SchemaApiTest.class,

        VertexApiTest.class,
        EdgeApiTest.class,
        BatchUpdateElementApiTest.class,

        GremlinApiTest.class,
        VariablesApiTest.class,
        TaskApiTest.class,
        JobApiTest.class,
        RestoreApiTest.class,
        GraphsApiTest.class,

        CommonTraverserApiTest.class,
        KoutApiTest.class,
        KneighborApiTest.class,
        PathsApiTest.class,
        CountApiTest.class,
        RingsRaysApiTest.class,
        SameNeighborsApiTest.class,
        SameNeighborsBatchApiTest.class,
        JaccardSimilarityApiTest.class,
        ShortestPathApiTest.class,
        AllShortestPathsApiTest.class,
        SingleSourceShortestPathApiTest.class,
        WeightedShortestPathApiTest.class,
        MultiNodeShortestPathApiTest.class,
        CustomizedPathsApiTest.class,
        TemplatePathsApiTest.class,
        FusiformSimilarityApiTest.class,
        NeighborRankApiTest.class,
        PersonalRankApiTest.class,
        EdgeExistenceAPITest.class,

        TargetApiTest.class,
        GroupApiTest.class,
        UserApiTest.class,
        AccessApiTest.class,
        BelongApiTest.class,
        ProjectApiTest.class,
        LoginApiTest.class,
        LogoutApiTest.class,
        TokenApiTest.class
})

public class ApiTestSuite {
}
