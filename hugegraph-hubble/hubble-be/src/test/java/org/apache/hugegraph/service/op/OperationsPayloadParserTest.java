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
                         "\"shardCount\":3}}";
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
