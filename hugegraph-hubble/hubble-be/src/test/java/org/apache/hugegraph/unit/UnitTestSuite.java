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

import org.apache.hugegraph.controller.auth.AccountMutationAuthorizationTest;
import org.apache.hugegraph.controller.auth.GraphSpaceAuthMutationAuthorizationTest;
import org.apache.hugegraph.controller.auth.GraphSpaceAuthOwnershipTest;
import org.apache.hugegraph.controller.ingest.IngestControllerTest;
import org.apache.hugegraph.controller.langchain.LangChainControllerSecurityTest;
import org.apache.hugegraph.controller.query.Text2GqlControllerTest;
import org.apache.hugegraph.controller.query.Text2GqlStreamTransportTest;
import org.apache.hugegraph.controller.schema.SchemaControllerSecurityTest;
import org.apache.hugegraph.controller.space.GraphSpaceControllerTest;
import org.apache.hugegraph.controller.space.SchemaTemplateControllerSecurityTest;
import org.apache.hugegraph.handler.ResponseAdvisorStatusTest;
import org.apache.hugegraph.service.algorithm.OlapAlgoServiceTest;
import org.apache.hugegraph.service.load.IngestTransactionIntegrationTest;
import org.apache.hugegraph.service.auth.AuthContextServiceTest;
import org.apache.hugegraph.service.auth.AuthModeServiceTest;
import org.apache.hugegraph.service.auth.GraphSpaceUserServiceTest;
import org.apache.hugegraph.service.auth.StandaloneAccountPermissionServiceTest;
import org.apache.hugegraph.service.space.GraphSpaceServiceTest;
import org.apache.hugegraph.service.op.DefaultOperationsDataServiceTest;
import org.apache.hugegraph.service.op.LiveOperationsCollectorTest;
import org.apache.hugegraph.service.op.OperationsCapabilityServiceTest;
import org.apache.hugegraph.service.op.OperationsHttpClientTest;
import org.apache.hugegraph.service.op.OperationsIdentityContractTest;
import org.apache.hugegraph.service.op.OperationsPayloadParserTest;
import org.apache.hugegraph.service.query.Text2GqlServiceTest;
import org.apache.hugegraph.service.query.Text2GqlStreamTest;
import org.apache.hugegraph.service.query.Text2GqlHttpClientTest;
import org.apache.hugegraph.controller.query.Text2GqlSettingsControllerTest;
import org.apache.hugegraph.service.query.Text2GqlSettingsServiceTest;
import org.apache.hugegraph.service.query.Text2GqlSecretStoreTest;
import org.apache.hugegraph.service.query.Text2GqlPersistenceTest;
import org.junit.runner.RunWith;
import org.junit.runners.Suite;

@RunWith(Suite.class)
@Suite.SuiteClasses({
    AccountMutationAuthorizationTest.class,
    AsyncConfigLifecycleTest.class,
    AsyncLoadShutdownTest.class,
    AuthContextServiceTest.class,
    AuthModeServiceTest.class,
    AuthSecurityTest.class,
    AppTypeTest.class,
    AuthzRouteRegistrationTest.class,
    BusinessAssertTest.class,
    BaseControllerGremlinClientTest.class,
    ConsolePrintTest.class,
    ConfigControllerTest.class,
    EmptyCatchTest.class,
    FileMappingSchemaTest.class,
    FileUploadControllerTest.class,
    FileUtilTest.class,
    GraphServiceImportTest.class,
    GraphMetricsControllerTest.class,
    HugeClientPoolServiceTest.class,
    H2StartupTest.class,
    AvaticaRuntimeTest.class,
    JaxbRuntimeTest.class,
    GraphSpaceControllerTest.class,
    GraphSpaceAuthMutationAuthorizationTest.class,
    GraphSpaceAuthOwnershipTest.class,
    GraphSpaceServiceTest.class,
    GraphSpaceUserServiceTest.class,
    StandaloneAccountPermissionServiceTest.class,
    GraphsControllerCanonicalTest.class,
    GremlinUtilTest.class,
    ReadOnlyGremlinTest.class,
    ReadOnlyCypherTest.class,
    CypherHistoryFailureTest.class,
    Text2GqlControllerTest.class,
    Text2GqlStreamTransportTest.class,
    Text2GqlServiceTest.class,
    Text2GqlStreamTest.class,
    Text2GqlHttpClientTest.class,
    Text2GqlSettingsControllerTest.class,
    Text2GqlSettingsServiceTest.class,
    Text2GqlSecretStoreTest.class,
    Text2GqlPersistenceTest.class,
    GremlinHistoryFailureTest.class,
    HubbleOptionsTest.class,
    IngestControllerTest.class,
    IngestTransactionIntegrationTest.class,
    org.apache.hugegraph.service.load.JobAdmissionIntegrationTest.class,
    LangChainControllerSecurityTest.class,
    LegacyFacadeRemovalTest.class,
    MessageSourceHandlerTest.class,
    OlapAlgoServiceTest.class,
    SchemaControllerSecurityTest.class,
    SchemaTemplateControllerSecurityTest.class,
    GroovySchemaCompatibilityTest.class,
    JobManagerServiceTest.class,
    K8sTokenEndpointSecurityTest.class,
    LoadTaskServiceTest.class,
    LoadTaskCheckpointTest.class,
    LoaderScopeControllerTest.class,
    LoginAttemptGuardTest.class,
    OltpAlgoControllerTest.class,
    OltpAlgoServiceTest.class,
    OperationsCapabilityServiceTest.class,
    OperationsControllerTest.class,
    OperationsAccessContractTest.class,
    OperationsHttpClientTest.class,
    OperationsIdentityContractTest.class,
    OperationsPayloadParserTest.class,
    DefaultOperationsDataServiceTest.class,
    LiveOperationsCollectorTest.class,
    PriorityFixTest.class,
    QueryServiceTest.class,
    ResponseAdvisorStatusTest.class,
    UrlUtilTest.class,
    EntityUtilTest.class,
    HubbleUtilTest.class
})
public class UnitTestSuite {
}
