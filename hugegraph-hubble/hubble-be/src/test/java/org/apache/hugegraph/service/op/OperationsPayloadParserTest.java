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
package org.apache.hugegraph.service.op;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;

import org.apache.hugegraph.service.op.OperationsModels.Node;
import org.apache.hugegraph.service.op.OperationsModels.Topology;
import org.apache.hugegraph.testutil.Assert;

public class OperationsPayloadParserTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    public void testCompactRaftSummaryRequiresConsistentIntegralCounters() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);
        Assert.assertEquals(Map.of("groups", 12000L, "enabled_groups", 11999L),
                            parser.parseStoreMetrics("raft_summary", "{\"groups\":12000,\"enabled_groups\":11999}"));
        Assert.assertEquals(Map.of("groups", 0L, "enabled_groups", 0L),
                            parser.parseStoreMetrics("raft_summary", "{\"groups\":0,\"enabled_groups\":0}"));
        for (String body : new String[]{"{}", "null", "[]", "{\"0\":{\"enabled\":true}}",
                "{\"groups\":1,\"enabled_groups\":2}", "{\"groups\":-1,\"enabled_groups\":0}",
                "{\"groups\":1.5,\"enabled_groups\":1}", "{\"groups\":1,\"enabled_groups\":\"1\"}",
                "{\"groups\":9223372036854775808,\"enabled_groups\":1}"}) {
            Assert.assertThrows(MalformedUpstreamException.class,
                                () -> parser.parseStoreMetrics("raft_summary", body));
        }
    }

    @Test
    public void testReadinessRequiresExplicitKnownBodyAndPreservesSafeReasons() throws Exception {
        OperationsPayloadParser parser = new OperationsPayloadParser(new ObjectMapper());
        OperationsModels.Readiness ready = parser.parseReadiness("PD",
                "{\"ready\":true,\"state\":\"STATE_FOLLOWER\",\"isLeader\":false}", 200, 1L, "/probe-prefix/v1/ready");
        Assert.assertEquals("READY", ready.getStatus());
        Assert.assertEquals("STATE_FOLLOWER", ready.getState());
        Assert.assertEquals("/probe-prefix/v1/ready", ready.getDiagnostics().get("request_path"));
        for (String payload : new String[]{
                "{}", "[]", "null", "private host=/private-path", "{\"ready\":\"true\"}",
                "{\"ready\":true,\"state\":\"private-state\"}",
                "{\"ready\":true,\"state\":\"STATE_ERROR\"}"}) {
            OperationsModels.Readiness unknown = parser.parseReadiness("PD", payload, 200, 1L, "/probe-prefix/v1/ready");
            Assert.assertEquals("UNKNOWN", unknown.getStatus());
            Assert.assertEquals("readiness_response_unrecognized", unknown.getReason());
            Assert.assertFalse(new ObjectMapper().writeValueAsString(unknown).contains("private"));
        }
        OperationsModels.Readiness unauthorized = parser.parseReadiness("PD",
                "{\"status\":-1,\"error\":\"Unauthorized! private-details\"}", 200, 1L, "/probe-prefix/v1/ready");
        Assert.assertEquals("UNKNOWN", unauthorized.getStatus());
        Assert.assertEquals("readiness_auth_rejected", unauthorized.getReason());
        Assert.assertFalse(new ObjectMapper().writeValueAsString(unauthorized).contains("private"));
        Assert.assertEquals("UNKNOWN", parser.parseReadiness("PD",
                "{\"ready\":true,\"state\":\"STATE_LEADER\"}", 503, 1L, "/probe-prefix/v1/ready").getStatus());
        Assert.assertEquals("pd_quorum_not_ready", parser.parseReadiness("PD",
                "{\"ready\":false,\"state\":\"STATE_FOLLOWER\"}", 503, 1L, "/probe-prefix/v1/ready").getReason());
        Assert.assertEquals("NOT_READY", parser.parseReadiness("STORE",
                "{\"status\":0,\"text\":\"STOPPING\"}", 200, 1L, "/probe-prefix/v1/ready").getStatus());
        Assert.assertEquals("UNKNOWN", parser.parseReadiness("STORE",
                "{\"status\":1,\"text\":\"ONLINE\"}", 200, 1L, "/probe-prefix/v1/ready").getStatus());
    }

    @Test
    public void testStoreLifecycleAcceptsOnlyExplicitLifecycleStates() throws Exception {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);
        for (String state : new String[]{"STARTING", "STARTED", "STOPPING", "UNAVAILABLE"}) {
            OperationsModels.Lifecycle result = parser.parseStoreLifecycle(
                    "{\"status\":0,\"text\":\"" + state + "\"}", 200, 123L);
            Assert.assertEquals(state, result.getState());
            Assert.assertNull(result.getReason());
            Assert.assertEquals(Long.valueOf(123L), result.getObservedAt());
            Assert.assertFalse(result.isStale());
        }
        for (String body : new String[]{"null", "[]", "{}", "{\"status\":0,\"text\":\"ONLINE\"}",
                                        "{\"status\":1,\"text\":\"STARTED\"}",
                                        "{\"status\":4294967296,\"text\":\"STARTED\"}",
                                        "{\"status\":18446744073709551616,\"text\":\"STARTED\"}",
                                        "{\"status\":0,\"text\":\"private-secret\"}"}) {
            OperationsModels.Lifecycle result = parser.parseStoreLifecycle(body, 200, 123L);
            Assert.assertEquals("UNKNOWN", result.getState());
            Assert.assertEquals("response_unrecognized", result.getReason());
            Assert.assertFalse(MAPPER.writeValueAsString(result).contains("private-secret"));
        }
        Assert.assertEquals("UNKNOWN", parser.parseStoreLifecycle(
                "{\"status\":0,\"text\":\"STARTED\"}", 503, 123L).getState());
    }

    @Test
    public void testParsesPdWrapperAndRedactsInfrastructureFields()
           throws Exception {
        String cluster = "{\"status\":0,\"data\":{" +
                         "\"state\":\"Cluster_OK\"," +
                         "\"pdList\":[{\"restUrl\":\"http://pd-a:8620\"," +
                         "\"dataPath\":\"/secret/pd\",\"role\":\"Follower\"," +
                         "\"serviceVersion\":\"1.7.0\"}]," +
                         "\"pdLeader\":{\"restUrl\":\"http://pd-b:8620\"," +
                         "\"dataPath\":\"/secret/leader\",\"role\":\"Leader\"," +
                         "\"serviceVersion\":\"1.7.0\"}," +
                         "\"graphSize\":2,\"partitionSize\":12," +
                         "\"shardCount\":3,\"dataSize\":5}}";
        String stores = "{\"status\":0,\"data\":{\"stores\":[{" +
                        "\"storeId\":\"7\",\"address\":\"store-a:8500\"," +
                        "\"deployPath\":\"/secret/bin\"," +
                        "\"dataPath\":\"/secret/data\",\"state\":\"Up\"," +
                        "\"version\":\"1.7.0\",\"capacity\":1000," +
                        "\"available\":400,\"partitionCount\":12," +
                        "\"leaderCount\":4,\"lastHeartBeat\":100}]}}";

        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);
        Topology topology = parser.parseTopology(cluster, stores);

        Assert.assertEquals("UP", topology.getStatus());
        Assert.assertEquals(2L, topology.getFacts().get("graphs"));
        Assert.assertEquals(12L, topology.getFacts().get("partitions"));
        Assert.assertEquals(3L, topology.getFacts().get("replicas"));
        Assert.assertEquals(5120L,
                            topology.getFacts().get("data_size_bytes"));
        Assert.assertEquals(1000L,
                            topology.getFacts().get("capacity_total_bytes"));
        Assert.assertEquals(600L,
                            topology.getFacts().get("capacity_used_bytes"));
        List<Node> nodes = topology.getNodes();
        Assert.assertEquals(3, nodes.size());
        Assert.assertEquals("LEADER", nodes.get(1).getRole());
        Assert.assertTrue(nodes.get(2).getId().startsWith("store-"));
        Assert.assertTrue(nodes.get(2).getName().matches("Store [0-9a-f]{6}"));
        Assert.assertNotEquals("Store 7", nodes.get(2).getName());
        Assert.assertTrue(nodes.get(2).getMetrics().containsKey("backend"));
        String serialized = MAPPER.writeValueAsString(topology);
        Assert.assertTrue(serialized.contains("\"metric_statuses\""));
        Assert.assertTrue(serialized.contains("\"last_success_at\""));
        Assert.assertFalse(serialized.contains("store-a:8500"));
        Assert.assertFalse(serialized.contains("pd-a:8620"));
        Assert.assertFalse(serialized.contains("/secret"));
    }

    @Test
    public void testPdMetricIdentityCanonicalizesEndpointWithoutChangingStableNodeId() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);
        String[][] equivalent = {
                {"HTTP://PD.EXAMPLE:80", "http://pd.example:80"},
                {"http://pd.example", "http://PD.EXAMPLE:80/"},
                {"https://pd.example:443", "HTTPS://PD.EXAMPLE/"},
                {"http://pd.example:8620/pd", "HTTP://PD.EXAMPLE:8620/pd/"},
                {"http://pd.example:8620", "pd.example:8620"},
                {"https://pd.example:8620", "PD.EXAMPLE:8620"},
                {"https://pd.example", "pd.example:443"},
                {"http://[::1]:8620", "[::1]:8620"},
                {"http://[2001:DB8::1]:8620", "http://[2001:db8::1]:8620/"},
                {"https://pd.example:8620/pd", "pd.example:8620/pd"}
        };
        for (String[] urls : equivalent) {
            String cluster = pdCluster(urls[1]);
            String expectedId = parser.parseTopology(cluster,
                    "{\"status\":0,\"data\":{\"stores\":[]}}")
                    .getNodes().get(0).getId();

            Assert.assertEquals(expectedId, parser.pdMetricNodeId(cluster, urls[0]));
        }
    }

    @Test
    public void testPdMetricIdentityDoesNotGuessAliasesOrDifferentEndpoints() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);
        String cluster = pdCluster("http://pd.example:8620/pd");
        for (String configured : new String[]{"http://pd-alias.example:8620/pd",
                                             "https://pd.example:8620/pd",
                                             "http://pd.example:8621/pd",
                                             "http://pd.example:8620/other",
                                             "http://pd.example:8620/pd?token=private"}) {
            Assert.assertNull(parser.pdMetricNodeId(cluster, configured));
        }
        Assert.assertNull(parser.pdMetricNodeId(
                pdCluster("http://pd.example:8620", "HTTP://PD.EXAMPLE:8620"),
                "http://pd.example:8620"));
        Assert.assertNull(parser.pdMetricNodeId(pdCluster("not-a-uri"), "http://pd.example:8620"));
        Assert.assertNull(parser.pdMetricNodeId(pdCluster("pd.example:8620"), "https://pd-alias.example:8620"));
        Assert.assertNull(parser.pdMetricNodeId(pdCluster("http://pd.example:8620"), "https://pd.example:8620"));
        Assert.assertNull(parser.pdMetricNodeId(pdCluster("http://[::1]:8620"),
                                               "http://[0:0:0:0:0:0:0:1]:8620"));
    }

    private static String pdCluster(String... addresses) {
        List<Map<String, String>> members = new ArrayList<>();
        for (String address : addresses) {
            members.add(Map.of("restUrl", address, "state", "Up"));
        }
        return MAPPER.valueToTree(Map.of("status", 0, "data", Map.of("pdList", members))).toString();
    }

    @Test
    @SuppressWarnings("unchecked")
    public void testPdMappingDiagnosticsExplainMismatchWithoutExposingPrivateUrlParts() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);
        Map<String, Object> result = parser.pdMetricMappingDiagnostics(pdCluster(
                "http://pd-node:8620/private-base-path",
                "http://pd-service:8620/different-private-path",
                "http://private-user:private-password@pd-node:8620/path?token=private-query"),
                "http://pd-service:8620/private-base-path");

        Assert.assertEquals("no_match", result.get("status"));
        Assert.assertEquals("http://pd-service:8620", result.get("configured_origin"));
        Assert.assertEquals(0, result.get("matched_nodes"));
        Assert.assertEquals(3, result.get("discovered_nodes"));
        List<Map<String, Object>> members = (List<Map<String, Object>>) result.get("members");
        Assert.assertEquals(false, members.get(0).get("origin_matches"));
        Assert.assertEquals(true, members.get(0).get("base_path_matches"));
        Assert.assertEquals(true, members.get(1).get("origin_matches"));
        Assert.assertEquals(false, members.get(1).get("base_path_matches"));
        Assert.assertEquals(false, members.get(2).get("endpoint_valid"));
        Assert.assertNull(members.get(2).get("origin"));
        Assert.assertFalse(result.toString().contains("private"));
        Assert.assertFalse(result.toString().contains("token="));
    }

    @Test
    @SuppressWarnings("unchecked")
    public void testPdMappingDiagnosticsReportAmbiguityAndBoundMemberDetails() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);
        String[] addresses = new String[12];
        addresses[0] = "http://pd-node:8620";
        addresses[1] = "HTTP://PD-NODE:8620/";
        for (int i = 2; i < addresses.length; i++) {
            addresses[i] = "http://pd-" + i + ":8620";
        }
        Map<String, Object> result = parser.pdMetricMappingDiagnostics(pdCluster(addresses), addresses[0]);

        Assert.assertEquals("ambiguous", result.get("status"));
        Assert.assertEquals(2, result.get("matched_nodes"));
        Assert.assertEquals(12, result.get("discovered_nodes"));
        Assert.assertEquals(10, ((List<Map<String, Object>>) result.get("members")).size());
        Assert.assertEquals(2, result.get("omitted_members"));
    }

    @Test
    @SuppressWarnings("unchecked")
    public void testPdMappingDiagnosticsRetainTailMatchesBeforeOtherBoundedMembers() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);
        String[] addresses = new String[12];
        for (int i = 0; i < 10; i++) {
            addresses[i] = "http://pd-" + i + ":8620";
        }
        addresses[0] = "http://private-user:private-password@pd-0:8620/path?token=private-query";
        addresses[10] = "http://pd-node:8620/private-base-path";
        addresses[11] = "HTTP://PD-NODE:8620/private-base-path/";
        String cluster = pdCluster(addresses);
        List<Node> discovered = parser.parseTopology(cluster,
                "{\"status\":0,\"data\":{\"stores\":[]}}").getNodes();
        Map<String, Object> result = parser.pdMetricMappingDiagnostics(cluster, addresses[10]);

        Assert.assertEquals("ambiguous", result.get("status"));
        Assert.assertEquals(2, result.get("matched_nodes"));
        Assert.assertEquals(12, result.get("discovered_nodes"));
        Assert.assertEquals(2, result.get("omitted_members"));
        List<Map<String, Object>> members = (List<Map<String, Object>>) result.get("members");
        Assert.assertEquals(10, members.size());
        for (int i = 0; i < 2; i++) {
            Assert.assertEquals(discovered.get(10 + i).getId(), members.get(i).get("node_id"));
            Assert.assertEquals(true, members.get(i).get("origin_matches"));
            Assert.assertEquals(true, members.get(i).get("base_path_matches"));
        }
        Assert.assertEquals(discovered.get(0).getId(), members.get(2).get("node_id"));
        Assert.assertEquals(discovered.get(7).getId(), members.get(9).get("node_id"));
        Assert.assertFalse(result.toString().contains("private"));
        Assert.assertFalse(result.toString().contains("token="));
    }

    @Test
    public void testOmitsIncompleteOrOverflowingSizeFacts() {
        String cluster = "{\"status\":0,\"data\":{" +
                         "\"pdList\":[],\"dataSize\":9223372036854775807}}";
        String stores = "{\"status\":0,\"data\":{\"stores\":[{" +
                        "\"storeId\":\"1\",\"capacity\":1000},{" +
                        "\"storeId\":\"2\",\"capacity\":1000," +
                        "\"available\":2000}]}}";

        Topology topology = new OperationsPayloadParser(MAPPER)
                            .parseTopology(cluster, stores);

        Assert.assertFalse(topology.getFacts().containsKey("data_size_bytes"));
        Assert.assertFalse(topology.getFacts().containsKey(
                           "capacity_total_bytes"));
        Assert.assertFalse(topology.getFacts().containsKey(
                           "capacity_used_bytes"));
    }

    @Test
    public void testMapsExactClusterStates() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);
        String[] states = {"Cluster_OK", "Cluster_Warn", "DEGRADED",
                           "Cluster_Not_Ready", "Cluster_Offline",
                           "Cluster_Fault", null, "Cluster_OKish"};
        String[] expected = {"UP", "DEGRADED", "DEGRADED", "DEGRADED",
                             "DEGRADED", "DOWN", "UNKNOWN", "UNKNOWN"};
        String[] reasons = {null, "cluster_warn", "cluster_warn",
                            "cluster_not_ready",
                            "cluster_offline", "cluster_fault",
                            "cluster_state_missing", "cluster_state_unknown"};
        String stores = "{\"status\":0,\"data\":{\"stores\":[]}}";

        for (int i = 0; i < states.length; i++) {
            String state = states[i];
            String field = state == null ? "" : "\"state\":\"" +
                           state + "\",";
            String cluster = "{\"status\":0,\"data\":{" + field +
                             "\"pdList\":[]}}";
            Topology topology = parser.parseTopology(cluster, stores);
            Assert.assertEquals(expected[i], topology.getStatus());
            Assert.assertEquals(reasons[i], topology.getReason());
        }
    }

    @Test
    public void testParsesOnlyStoreMetricTargetsAndInternalHostMap() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);
        String stores = "{\"status\":0,\"data\":{\"stores\":[{" +
                        "\"storeId\":\"7\",\"address\":\"store-a:8500\"," +
                        "\"restAddress\":\"store-a:8520\"}]}}";
        String targets = "[{\"targets\":[\"store-a:8520\"]," +
                         "\"labels\":{\"__app_name\":\"store\"," +
                         "\"__scheme__\":\"http\"}},{\"targets\":[" +
                         "\"pd-a:8620\"],\"labels\":{" +
                         "\"__app_name\":\"pd\",\"__scheme__\":\"http\"}}]";

        Map<String, String> hosts = parser.parseStoreHosts(stores);
        Map<String, String> restAddresses =
                parser.parseStoreRestAddresses(stores);
        Map<String, URI> metricTargets = parser.parseStoreMetricTargets(targets);

        Assert.assertEquals("store-a", hosts.values().iterator().next());
        Assert.assertEquals("store-a:8520",
                            restAddresses.values().iterator().next());
        Assert.assertEquals(1, metricTargets.size());
        Assert.assertEquals(URI.create("http://store-a:8520"),
                            metricTargets.get("store-a:8520"));
    }

    @Test
    public void testKeepsSameHostStoreTargetsDistinctByAuthority() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);
        String targets = "[{\"targets\":[\"store-a:8520\"," +
                         "\"store-a:9520\"],\"labels\":{" +
                         "\"__app_name\":\"store\"," +
                         "\"__scheme__\":\"http\"}}]";

        Map<String, URI> metricTargets = parser.parseStoreMetricTargets(targets);

        Assert.assertEquals(2, metricTargets.size());
        Assert.assertEquals(URI.create("http://store-a:8520"),
                            metricTargets.get("store-a:8520"));
        Assert.assertEquals(URI.create("http://store-a:9520"),
                            metricTargets.get("store-a:9520"));
    }

    @Test
    public void testParsesIpv6StoreRestAddressAuthority() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);
        String stores = "{\"status\":0,\"data\":{\"stores\":[{" +
                        "\"storeId\":7,\"address\":\"[2001:db8::1]:8500\"," +
                        "\"restAddress\":\"[2001:db8::1]:8520\"}]}}";

        Map<String, String> restAddresses =
                parser.parseStoreRestAddresses(stores);

        Assert.assertEquals("[2001:db8::1]:8520",
                            restAddresses.values().iterator().next());
    }

    @Test
    public void testPdLeaderOverridesContradictoryPdListRoles() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);
        String cluster = "{\"status\":0,\"data\":{" +
                         "\"pdList\":[{" +
                         "\"restUrl\":\"http://pd-a:8620\"," +
                         "\"role\":\"Leader\"},{" +
                         "\"restUrl\":\"http://pd-b:8620\"," +
                         "\"role\":\"Follower\"}]," +
                         "\"pdLeader\":{" +
                         "\"restUrl\":\"http://pd-b:8620\"}}}";
        String stores = "{\"status\":0,\"data\":{\"stores\":[]}}";

        Topology topology = parser.parseTopology(cluster, stores);

        Assert.assertEquals(1L, topology.getNodes().stream()
                                      .filter(node -> "LEADER".equals(
                                              node.getRole()))
                                      .count());
        Node leader = topology.getNodes().stream()
                              .filter(node -> "LEADER".equals(node.getRole()))
                              .findFirst().orElseThrow(AssertionError::new);
        String expectedId = parser.parseTopology(
                "{\"status\":0,\"data\":{\"pdList\":[]," +
                "\"pdLeader\":{\"restUrl\":\"http://pd-b:8620\"}}}",
                stores).getNodes().get(0).getId();
        Assert.assertEquals(expectedId, leader.getId());
    }

    @Test
    public void testCombinesDataAndClusterHealthWithoutChangingNodeStatus() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);
        String stores = "{\"status\":0,\"data\":{\"stores\":[]}}";
        String[][] states = {
                {"Cluster_OK", "PState_Normal", "UP", null},
                {"Cluster_OK", "PState_Warn", "DEGRADED", "data_warn"},
                {"Cluster_OK", "PState_Offline", "DEGRADED", "data_offline"},
                {"Cluster_OK", "PState_Fault", "DOWN", "data_fault"},
                {"Cluster_OK", "PState_None", "DEGRADED", "data_state_unknown"},
                {"Cluster_OK", "PState_Future", "DEGRADED", "data_state_unknown"},
                {"Cluster_Fault", "PState_Warn", "DOWN", "cluster_fault"}
        };
        for (String[] state : states) {
            String cluster = "{\"status\":0,\"data\":{\"state\":\"" + state[0] +
                             "\",\"dataState\":\"" + state[1] + "\",\"pdList\":[{" +
                             "\"restUrl\":\"http://pd:8620\",\"state\":\"Up\"}]}}";
            OperationsModels.Topology topology = parser.parseTopology(cluster, stores);

            Assert.assertEquals(state[2], topology.getStatus());
            Assert.assertEquals(state[3], topology.getReason());
            Assert.assertEquals(state[0], topology.getClusterState());
            Assert.assertEquals(state[1], topology.getDataState());
            Assert.assertEquals("UP", topology.getNodes().get(0).getStatus());
        }
    }

    @Test
    public void testRedactsDrivePathsAndSummarizesRaftMetrics() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);

        Map<String, Object> drive = parser.parseStoreMetrics("drive",
                "{\"/secret/data\":{\"usable_space\":4," +
                "\"total_space\":10,\"free_space\":5," +
                "\"size_unit\":\"MB\"}}");
        Map<String, Object> raft = parser.parseStoreMetrics("raft",
                "{\"0\":{\"enabled\":true,\"metricRegistry\":{" +
                "\"secret.path\":1},\"metrics\":{}}," +
                "\"1\":{\"enabled\":false,\"metrics\":{}}}");

        Assert.assertEquals(10L, drive.get("total_space"));
        Assert.assertFalse(drive.toString().contains("secret"));
        Assert.assertEquals(2L, raft.get("groups"));
        Assert.assertEquals(1L, raft.get("enabled_groups"));
        Assert.assertFalse(raft.toString().contains("metricRegistry"));
    }

    @Test
    public void testMissingDriveValuesRemainUnknownInsteadOfZero() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);

        Map<String, Object> drive = parser.parseStoreMetrics("drive",
                                                             "{\"disk\":{}}");

        Assert.assertFalse(drive.containsKey("total_space"));
        Assert.assertFalse(drive.containsKey("usable_space"));
        Assert.assertFalse(drive.containsKey("free_space"));
    }

    @Test
    public void testParsesWhitelistedPdPrometheusMetrics() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);
        String payload = "process_uptime_seconds{hg=\"pd\"} 12\n" +
                         "system_cpu_count{hg=\"pd\"} 2\n" +
                         "jvm_threads_live_threads{hg=\"pd\"} 8\n" +
                         "jvm_memory_used_bytes{area=\"heap\"," +
                         "id=\"secret-pool\"} 100\n" +
                         "jvm_memory_used_bytes{area=\"nonheap\"} 20\n" +
                         "untrusted_secret_metric{path=\"/secret\"} 99\n";

        Map<String, Object> metrics = parser.parsePdPrometheusMetrics(payload);

        Assert.assertEquals(12D, metrics.get("uptime_seconds"));
        Assert.assertEquals(100D, metrics.get("heap_used_bytes"));
        Assert.assertEquals(20D, metrics.get("nonheap_used_bytes"));
        Assert.assertFalse(metrics.toString().contains("secret"));
    }

    @Test
    public void testParsesUnlabelledPdPrometheusMetrics() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);
        String payload = "process_uptime_seconds 12\n" +
                         "system_cpu_count 2\n" +
                         "jvm_threads_live_threads 8\n" +
                         "process_cpu_usage 0.1\n" +
                         "system_cpu_usage 0.2\n" +
                         "process_uptime_seconds_total 99\n";

        Map<String, Object> metrics = parser.parsePdPrometheusMetrics(payload);

        Assert.assertEquals(12D, metrics.get("uptime_seconds"));
        Assert.assertEquals(2D, metrics.get("cpu_count"));
        Assert.assertEquals(8D, metrics.get("threads_live"));
        Assert.assertEquals(0.1D, metrics.get("process_cpu_usage"));
        Assert.assertEquals(0.2D, metrics.get("system_cpu_usage"));
    }

    @Test(expected = MalformedUpstreamException.class)
    public void testRejectsPrometheusWithoutRecognizedMetrics() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);

        parser.parsePdPrometheusMetrics("garbage\nuntrusted_metric 1\n");
    }

    @Test
    public void testAcceptsNumericAndStringStoreIds() throws Exception {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);
        String cluster = "{\"status\":0,\"data\":{\"pdList\":[]," +
                         "\"stores\":[{\"storeId\":7,\"state\":\"Up\"}]}}";
        String stores = "{\"status\":0,\"data\":{\"stores\":[{" +
                        "\"storeId\":\"7\",\"state\":\"Up\"}]}}";

        Topology topology = parser.parseTopology(cluster, stores);

        Assert.assertEquals(1, topology.getNodes().size());
    }

    @Test(expected = MalformedUpstreamException.class)
    public void testRejectsSuccessfulWrapperWithoutObjectData() throws Exception {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);
        parser.parseTopology("{\"status\":0,\"data\":[]}",
                             "{\"status\":0,\"data\":{\"stores\":[]}}");
    }

    @Test(expected = MalformedUpstreamException.class)
    public void testRejectsNonArrayPdList() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);

        parser.parseTopology("{\"status\":0,\"data\":{\"pdList\":{}}}",
                             "{\"status\":0,\"data\":{\"stores\":[]}}");
    }

    @Test(expected = MalformedUpstreamException.class)
    public void testRejectsNonArrayStores() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);

        parser.parseTopology("{\"status\":0,\"data\":{\"pdList\":[]}}",
                             "{\"status\":0,\"data\":{\"stores\":{}}}");
    }

    @Test(expected = MalformedUpstreamException.class)
    public void testRejectsNonObjectTopologyElement() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);

        parser.parseTopology("{\"status\":0,\"data\":{\"pdList\":[1]}}",
                             "{\"status\":0,\"data\":{\"stores\":[]}}");
    }

    @Test(expected = MalformedUpstreamException.class)
    public void testRejectsBooleanTextField() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);

        parser.parseTopology("{\"status\":0,\"data\":{\"pdList\":[{" +
                             "\"restUrl\":true}]}}",
                             "{\"status\":0,\"data\":{\"stores\":[]}}");
    }

    @Test(expected = MalformedUpstreamException.class)
    public void testRejectsNumericPrometheusTarget() {
        OperationsPayloadParser parser = new OperationsPayloadParser(MAPPER);

        parser.parseStoreMetricTargets("[{\"targets\":[8520],\"labels\":{" +
                                       "\"__app_name\":\"store\"}}]");
    }
}
