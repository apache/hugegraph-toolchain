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

package org.apache.hugegraph.unit;

import org.apache.hugegraph.controller.ingest.IngestControllerTest;
import org.apache.hugegraph.controller.langchain.LangChainControllerSecurityTest;
import org.apache.hugegraph.controller.schema.SchemaControllerSecurityTest;
import org.apache.hugegraph.controller.space.GraphSpaceControllerTest;
import org.junit.runner.RunWith;
import org.junit.runners.Suite;

@RunWith(Suite.class)
@Suite.SuiteClasses({
    AuthSecurityTest.class,
    AppTypeTest.class,
    AuthzRouteRegistrationTest.class,
    BusinessAssertTest.class,
    BaseControllerGremlinClientTest.class,
    ConsolePrintTest.class,
    EmptyCatchTest.class,
    FileMappingSchemaTest.class,
    FileUploadControllerTest.class,
    FileUtilTest.class,
    GraphServiceImportTest.class,
    GraphMetricsControllerTest.class,
    GraphSpaceControllerTest.class,
    GraphsControllerCanonicalTest.class,
    GremlinHistoryFailureTest.class,
    HubbleOptionsTest.class,
    IngestControllerTest.class,
    LangChainControllerSecurityTest.class,
    LegacyFacadeRemovalTest.class,
    MessageSourceHandlerTest.class,
    SchemaControllerSecurityTest.class,
    GroovySchemaCompatibilityTest.class,
    JobManagerServiceTest.class,
    K8sTokenEndpointSecurityTest.class,
    LoadTaskServiceTest.class,
    LoaderScopeControllerTest.class,
    LoginAttemptGuardTest.class,
    OltpAlgoControllerTest.class,
    OltpAlgoServiceTest.class,
    PriorityFixTest.class,
    QueryServiceTest.class,
    UrlUtilTest.class
})
public class UnitTestSuite {
}
