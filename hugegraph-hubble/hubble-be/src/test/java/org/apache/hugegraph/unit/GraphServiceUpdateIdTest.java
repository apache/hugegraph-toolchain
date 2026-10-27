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

package org.apache.hugegraph.unit;

import java.lang.reflect.Field;
import java.util.Collections;
import java.util.UUID;

import org.junit.Assert;
import org.junit.Test;
import org.junit.jupiter.api.Assertions;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

import org.apache.hugegraph.client.RestClient;
import org.apache.hugegraph.config.JacksonConfig;
import org.apache.hugegraph.controller.graph.GraphController;
import org.apache.hugegraph.driver.GraphManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.graph.VertexEntity;
import org.apache.hugegraph.entity.schema.VertexLabelEntity;
import org.apache.hugegraph.rest.RestResult;
import org.apache.hugegraph.service.graph.GraphService;
import org.apache.hugegraph.service.schema.VertexLabelService;
import org.apache.hugegraph.structure.constant.IdStrategy;
import org.apache.hugegraph.structure.graph.Vertex;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

public class GraphServiceUpdateIdTest {

    @Test
    public void testCustomNumberUpdatePreservesNumericSdkPath() throws Exception {
        for (long id : new long[]{9000001L, Long.MAX_VALUE}) {
            this.assertUpdate(IdStrategy.CUSTOMIZE_NUMBER, Long.toString(id),
                              Long.toString(id), id);
        }
    }

    @Test
    public void testNumericLookingStringUpdatePreservesQuotedSdkPath() throws Exception {
        this.assertUpdate(IdStrategy.CUSTOMIZE_STRING, "9000001",
                          "\"9000001\"", "9000001");
        this.assertUpdate(IdStrategy.CUSTOMIZE_STRING, "001", "\"001\"", "001");
    }

    @Test
    public void testCustomUuidUpdatePreservesUuidSdkPath() throws Exception {
        String id = "835e1153-62c4-407c-832a-058419744e2d";
        this.assertUpdate(IdStrategy.CUSTOMIZE_UUID, id, "U\"" + id + "\"", UUID.fromString(id));
    }

    @Test
    public void testPrimaryKeyUpdateRetainsStringPathFallback() throws Exception {
        this.assertUpdate(IdStrategy.PRIMARY_KEY, "1:alice", "\"1:alice\"", null);
    }

    @Test
    public void testAutomaticUpdateUsesExplicitNumericTypeWithoutGuessingStrings() throws Exception {
        for (String id : new String[]{"9000001", "9007199254740993", "9223372036854775807"}) {
            this.assertUpdate(IdStrategy.AUTOMATIC, this.fromJson("\"" + id + "\"", true),
                              id, Long.parseLong(id));
            this.assertUpdate(IdStrategy.AUTOMATIC, this.fromJson("\"" + id + "\"", false),
                              "\"" + id + "\"", null);
        }
        this.assertUpdate(IdStrategy.AUTOMATIC, this.fromJson("\"001\"", false), "\"001\"", null);
    }

    @Test
    public void testAutomaticUpdateRejectsInvalidJsonIdBeforeWriting() throws Exception {
        for (String id : new String[]{"null", "\"1.5\"", "\"9223372036854775808\"", "true", "{}", "[]"}) {
            Assertions.assertThrows(Exception.class, () ->
                    this.assertUpdate(IdStrategy.AUTOMATIC, this.fromJson(id, true), "", null));
        }
    }

    @Test
    public void testAutomaticUpdateRetainsTypeFromActualQuerySerialization() {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(JacksonAutoConfiguration.class))
                .withUserConfiguration(JacksonConfig.class)
                .run(context -> {
                    ObjectMapper mapper = context.getBean(ObjectMapper.class);
                    for (Object id : new Object[]{Long.MAX_VALUE, Long.toString(Long.MAX_VALUE)}) {
                        Vertex vertex = new Vertex("Person");
                        vertex.id(id);
                        String json = mapper.writeValueAsString(vertex);
                        VertexEntity entity = mapper.readValue(json, VertexEntity.class);
                        Assert.assertEquals(Long.toString(Long.MAX_VALUE), entity.getId());
                        Assert.assertEquals(id instanceof Number ? "NUMBER" : null, entity.getIdType());
                        this.assertUpdate(IdStrategy.AUTOMATIC, entity,
                                          id instanceof Number ? id.toString() : "\"" + id + "\"",
                                          id instanceof Number ? id : null);
                    }
                });
    }

    @Test
    public void testTypeMarkerDoesNotOverrideCustomStringSchemaOrPathGuard() throws Exception {
        VertexEntity entity = this.fromJson("\"9000001\"", true);
        this.assertUpdate(IdStrategy.CUSTOMIZE_STRING, entity, "\"9000001\"", "9000001");
        Assertions.assertThrows(RuntimeException.class, () ->
                new GraphController().checkIdSameAsBody("different", entity));
        entity.setIdType("UNKNOWN");
        Assertions.assertThrows(RuntimeException.class, () ->
                this.assertUpdate(IdStrategy.AUTOMATIC, entity, "", null));
    }

    @Test
    public void testAutomaticCreationLeavesIdToServer() throws Exception {
        GraphService service = this.service(IdStrategy.AUTOMATIC);
        HugeClient client = Mockito.mock(HugeClient.class);
        GraphManager graph = Mockito.mock(GraphManager.class);
        Mockito.when(client.graph()).thenReturn(graph);
        Mockito.when(graph.addVertex(Mockito.any(Vertex.class))).thenAnswer(invocation -> {
            Vertex vertex = invocation.getArgument(0);
            Assert.assertNull(vertex.id());
            vertex.id(123L);
            return vertex;
        });
        service.addVertex(client, this.fromJson("\"9007199254740993\"", true));
        Mockito.verify(graph).addVertex(Mockito.any(Vertex.class));
    }

    private VertexEntity fromJson(String id, boolean numeric) throws Exception {
        return new ObjectMapper().readValue("{\"id\":" + id +
                (numeric ? ",\"id_type\":\"NUMBER\"" : "") +
                ",\"label\":\"Person\",\"properties\":{}}", VertexEntity.class);
    }

    private void assertUpdate(IdStrategy strategy, String rawId,
                              String encodedId, Object typedId) throws Exception {
        VertexEntity entity = VertexEntity.builder()
                                          .id(rawId)
                                          .label("Person")
                                          .properties(Collections.emptyMap())
                                          .build();
        this.assertUpdate(strategy, entity, encodedId, typedId);
    }

    private GraphService service(IdStrategy strategy) throws Exception {
        GraphService service = new GraphService();
        VertexLabelService labels = Mockito.mock(VertexLabelService.class);
        Mockito.when(labels.get(Mockito.eq("Person"), Mockito.any()))
               .thenReturn(VertexLabelEntity.builder()
                                            .name("Person")
                                            .idStrategy(strategy)
                                            .properties(Collections.emptySet())
                                            .build());
        Field field = GraphService.class.getDeclaredField("vlService");
        field.setAccessible(true);
        field.set(service, labels);
        return service;
    }

    private void assertUpdate(IdStrategy strategy, VertexEntity entity,
                              String encodedId, Object typedId) throws Exception {
        GraphService service = this.service(strategy);

        RestClient rest = Mockito.mock(RestClient.class);
        RestResult result = Mockito.mock(RestResult.class);
        Vertex response = new Vertex("Person");
        Mockito.when(result.readObject(Vertex.class)).thenReturn(response);
        Mockito.when(rest.put(Mockito.anyString(), Mockito.anyString(),
                              Mockito.any(Vertex.class), Mockito.anyMap()))
               .thenReturn(result);
        GraphManager graph = new GraphManager(rest, "DEFAULT", "hubble_ux_3000");
        HugeClient client = Mockito.mock(HugeClient.class);
        Mockito.when(client.graph()).thenReturn(graph);
        new GraphController().checkIdSameAsBody(entity.getId(), entity);
        Assert.assertSame(response, service.updateVertex(client, entity.getId(), entity));

        ArgumentCaptor<String> path = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> id = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Vertex> body = ArgumentCaptor.forClass(Vertex.class);
        Mockito.verify(rest).put(path.capture(), id.capture(), body.capture(),
                                 Mockito.eq(Collections.singletonMap("action", "append")));
        Assert.assertEquals("graphspaces/DEFAULT/graphs/hubble_ux_3000/graph/vertices", path.getValue());
        Assert.assertEquals(encodedId, id.getValue());
        Assert.assertEquals(typedId, body.getValue().id());
        Assert.assertEquals("Person", body.getValue().label());
    }
}
