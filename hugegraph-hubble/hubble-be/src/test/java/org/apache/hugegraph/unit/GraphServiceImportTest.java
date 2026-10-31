/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hugegraph.unit;

import java.io.File;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Locale;

import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import org.apache.hugegraph.driver.GraphManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.schema.EdgeLabelEntity;
import org.apache.hugegraph.entity.schema.VertexLabelEntity;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.service.auth.UserService;
import org.apache.hugegraph.service.graph.GraphService;
import org.apache.hugegraph.service.schema.EdgeLabelService;
import org.apache.hugegraph.service.schema.PropertyKeyService;
import org.apache.hugegraph.service.schema.VertexLabelService;
import org.apache.hugegraph.structure.constant.IdStrategy;
import org.apache.hugegraph.structure.graph.Edge;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.testutil.Assert;
import org.apache.hugegraph.util.Bytes;

public class GraphServiceImportTest {

    @Test
    public void testImportRejectsPreviewMarkersBeforeAnyGraphInteraction()
           throws Exception {
        String vertex = "{\"id\":\"source\",\"label\":\"person\",\"properties\":{}}";
        String markedVertex = "{\"id\":\"source\",\"label\":\"person\",\"properties\":{}," +
                              "\"~hubble_properties_preview\":true}";
        String markedEdge = "{\"label\":\"knows\",\"source\":\"source\",\"target\":\"source\"," +
                            "\"properties\":{},\"~hubble_properties_preview\":true}";
        String[] inputs = {
                "{\"vertices\":[" + markedVertex + "],\"edges\":[]}",
                "{\"vertices\":[" + vertex + "],\"edges\":[" + markedEdge + "]}",
                "{\"properties_truncated\":true,\"vertices\":[" + vertex + "],\"edges\":[]}"
        };
        for (String json : inputs) {
            GraphService service = this.serviceWithSchemas();
            GraphManager graph = Mockito.mock(GraphManager.class);
            HugeClient client = this.clientWithGraph(graph);
            ExternalException error = (ExternalException) Assert.assertThrows(ExternalException.class, () -> {
                service.importJson(client, this.file(json));
            });
            Assert.assertEquals("graph.import.truncated-preview", error.getMessage());
            Mockito.verifyNoInteractions(graph);
        }
    }

    @Test
    public void testImportJsonRejectsOversizedFileBeforeMaterializing()
           throws Exception {
        GraphService service = this.serviceWithSchemas();
        HugeClient client = this.clientWithGraph(Mockito.mock(GraphManager.class));
        MultipartFile file = Mockito.mock(MultipartFile.class);
        Mockito.when(file.isEmpty()).thenReturn(false);
        Mockito.when(file.getSize()).thenReturn(Bytes.GB + 1L);

        Assert.assertThrows(ExternalException.class, () -> {
            service.importJson(client, file);
        });

        UserService userService = (UserService) this.getField(service,
                                                             "userService");
        Mockito.verify(userService, Mockito.never())
               .multipartFileToFile(Mockito.any());
    }

    @Test
    public void testImportJsonValidatesEdgesBeforeWritingVertices()
           throws Exception {
        GraphService service = this.serviceWithSchemas();
        GraphManager graph = Mockito.mock(GraphManager.class);
        HugeClient client = this.clientWithGraph(graph);
        Vertex source = new Vertex("person");
        source.id("source");
        Mockito.when(graph.getVertex("source")).thenReturn(source);
        Mockito.when(graph.getVertex("missing")).thenReturn(null);

        String json = "{" +
                      "\"vertices\":[" +
                      "{\"id\":\"source\",\"label\":\"person\"," +
                      "\"properties\":{}}]," +
                      "\"edges\":[" +
                      "{\"label\":\"knows\",\"source\":\"source\"," +
                      "\"target\":\"missing\",\"properties\":{}}]" +
                      "}";

        ExternalException e = (ExternalException)
                              Assert.assertThrows(ExternalException.class,
                                                  () -> {
            service.importJson(client, this.file(json));
        });

        Assert.assertEquals("gremlin.edges.linked-vertex.not-exist",
                            e.getMessage());
        Mockito.verify(graph, Mockito.never())
               .addVertex(Mockito.any(Vertex.class));
        Mockito.verify(graph, Mockito.never()).addEdge(Mockito.any());
    }

    @Test
    public void testImportJsonRejectsLabelMismatchBeforeWriting()
           throws Exception {
        GraphService service = this.serviceWithSchemas();
        GraphManager graph = Mockito.mock(GraphManager.class);
        HugeClient client = this.clientWithGraph(graph);
        Vertex source = new Vertex("person");
        source.id("source");
        Vertex target = new Vertex("software");
        target.id("target");
        Mockito.when(graph.getVertex("target")).thenReturn(target);

        String json = "{" +
                      "\"vertices\":[" +
                      "{\"id\":\"source\",\"label\":\"person\"," +
                      "\"properties\":{}}]," +
                      "\"edges\":[" +
                      "{\"label\":\"knows\",\"source\":\"source\"," +
                      "\"target\":\"target\",\"properties\":{}}]" +
                      "}";

        ExternalException e = (ExternalException)
                              Assert.assertThrows(ExternalException.class,
                                                  () -> {
            service.importJson(client, this.file(json));
        });

        Assert.assertEquals("graph.edge.link-unmatched-vertex",
                            e.getMessage());
        Mockito.verify(graph, Mockito.never())
               .addVertex(Mockito.any(Vertex.class));
        Mockito.verify(graph, Mockito.never()).addEdge(Mockito.any());
    }

    @Test
    public void testImportJsonReportsMissingSourceAndTargetAsRequired()
           throws Exception {
        GraphService service = this.serviceWithSchemas();
        HugeClient client =
                this.clientWithGraph(Mockito.mock(GraphManager.class));
        String json = "{" +
                      "\"vertices\":[]," +
                      "\"edges\":[" +
                      "{\"label\":\"knows\",\"target\":\"target\"," +
                      "\"properties\":{}}]" +
                      "}";

        ExternalException e = (ExternalException)
                              Assert.assertThrows(ExternalException.class,
                                                  () -> {
            service.importJson(client, this.file(json));
        });

        Assert.assertEquals("common.param.cannot-be-null", e.getMessage());
        Assert.assertEquals("source_id", e.args()[0]);
    }

    @Test
    public void testImportJsonReportsMissingTargetAsRequired()
           throws Exception {
        GraphService service = this.serviceWithSchemas();
        HugeClient client =
                this.clientWithGraph(Mockito.mock(GraphManager.class));
        String json = "{" +
                      "\"vertices\":[]," +
                      "\"edges\":[" +
                      "{\"label\":\"knows\",\"source\":\"source\"," +
                      "\"properties\":{}}]" +
                      "}";

        ExternalException e = (ExternalException)
                              Assert.assertThrows(ExternalException.class,
                                                  () -> {
            service.importJson(client, this.file(json));
        });

        Assert.assertEquals("common.param.cannot-be-null", e.getMessage());
        Assert.assertEquals("target_id", e.args()[0]);
    }

    @Test
    public void testImportJsonRejectsInvalidJsonAsExternalError()
           throws Exception {
        GraphService service = this.serviceWithSchemas();
        HugeClient client =
                this.clientWithGraph(Mockito.mock(GraphManager.class));

        ExternalException e = (ExternalException)
                              Assert.assertThrows(ExternalException.class,
                                                  () -> {
            service.importJson(client, this.file("{invalid json"));
        });

        Assert.assertEquals("graph.import.invalid-json", e.getMessage());
    }

    @Test
    public void testImportJsonRejectsMissingEdgesField()
           throws Exception {
        GraphService service = this.serviceWithSchemas();
        HugeClient client =
                this.clientWithGraph(Mockito.mock(GraphManager.class));

        ExternalException e = (ExternalException)
                              Assert.assertThrows(ExternalException.class,
                                                  () -> {
            service.importJson(client, this.file("{\"vertices\":[]}"));
        });

        Assert.assertEquals("graph.import.missing-field", e.getMessage());
        Assert.assertEquals("edges", e.args()[0]);
    }

    @Test
    public void testImportJsonRejectsMissingVerticesField()
           throws Exception {
        GraphService service = this.serviceWithSchemas();
        HugeClient client =
                this.clientWithGraph(Mockito.mock(GraphManager.class));

        ExternalException e = (ExternalException)
                              Assert.assertThrows(ExternalException.class,
                                                  () -> {
            service.importJson(client, this.file("{\"edges\":[]}"));
        });

        Assert.assertEquals("graph.import.missing-field", e.getMessage());
        Assert.assertEquals("vertices", e.args()[0]);
    }

    @Test
    public void testImportJsonRejectsNonArrayFields()
           throws Exception {
        GraphService service = this.serviceWithSchemas();
        GraphManager graph = Mockito.mock(GraphManager.class);
        HugeClient client = this.clientWithGraph(graph);

        ExternalException verticesError = (ExternalException)
                                          Assert.assertThrows(ExternalException.class,
                                                              () -> {
            service.importJson(client, this.file("{\"vertices\":{},\"edges\":[]}"));
        });

        Assert.assertEquals("graph.import.field-should-array",
                            verticesError.getMessage());
        Assert.assertEquals("vertices", verticesError.args()[0]);

        ExternalException edgesError = (ExternalException)
                                       Assert.assertThrows(ExternalException.class,
                                                           () -> {
            service.importJson(client, this.file("{\"vertices\":[],\"edges\":{}}"));
        });

        Assert.assertEquals("graph.import.field-should-array",
                            edgesError.getMessage());
        Assert.assertEquals("edges", edgesError.args()[0]);
        Mockito.verify(graph, Mockito.never())
               .addVertex(Mockito.any(Vertex.class));
        Mockito.verify(graph, Mockito.never()).addEdge(Mockito.any());
    }

    @Test
    public void testImportJsonRejectsDuplicateVertexId()
           throws Exception {
        GraphService service = this.serviceWithSchemas();
        GraphManager graph = Mockito.mock(GraphManager.class);
        HugeClient client = this.clientWithGraph(graph);
        String json = "{" +
                      "\"vertices\":[" +
                      "{\"id\":\"source\",\"label\":\"person\"," +
                      "\"properties\":{}}," +
                      "{\"id\":\"source\",\"label\":\"person\"," +
                      "\"properties\":{}}]," +
                      "\"edges\":[]" +
                      "}";

        ExternalException e = (ExternalException)
                              Assert.assertThrows(ExternalException.class,
                                                  () -> {
            service.importJson(client, this.file(json));
        });

        Assert.assertEquals("graph.import.vertex.duplicate-id",
                            e.getMessage());
        Assert.assertEquals("source", e.args()[0]);
        Mockito.verify(graph, Mockito.never())
               .addVertex(Mockito.any(Vertex.class));
        Mockito.verify(graph, Mockito.never()).addEdge(Mockito.any());
    }

    @Test
    public void testImportJsonAddsValidatedVerticesAndEdges()
           throws Exception {
        GraphService service = this.serviceWithSchemas();
        GraphManager graph = Mockito.mock(GraphManager.class);
        HugeClient client = this.clientWithGraph(graph);
        Mockito.when(graph.addVertex(Mockito.any(Vertex.class)))
               .thenAnswer(invocation -> invocation.getArgument(0));
        Mockito.when(graph.addEdge(Mockito.any(Edge.class)))
               .thenAnswer(invocation -> {
                   Edge edge = invocation.getArgument(0);
                   edge.id("S1:source>target");
                   return edge;
               });
        String json = "{" +
                      "\"vertices\":[" +
                      "{\"id\":\"source\",\"label\":\"person\"," +
                      "\"properties\":{}}," +
                      "{\"id\":\"target\",\"label\":\"person\"," +
                      "\"properties\":{}}]," +
                      "\"edges\":[" +
                      "{\"id\":\"edge-1\",\"label\":\"knows\"," +
                      "\"source\":\"source\"," +
                      "\"target\":\"target\",\"properties\":{}}]" +
                      "}";

        org.apache.hugegraph.entity.query.GraphView graphView =
                service.importJson(client, this.file(json));

        Assert.assertEquals(2, graphView.getVertices().size());
        Assert.assertEquals(1, graphView.getEdges().size());
        Mockito.verify(graph, Mockito.never()).getVertex("source");
        Mockito.verify(graph, Mockito.never()).getVertex("target");
    }

    @Test
    public void testImportJsonLinksPrimaryKeyVerticesFromSameFile()
           throws Exception {
        GraphService service = this.serviceWithSchemas();
        GraphManager graph = Mockito.mock(GraphManager.class);
        HugeClient client = this.clientWithGraph(graph);
        final int[] vertexIndex = {0};
        Mockito.when(graph.addVertex(Mockito.any(Vertex.class)))
               .thenAnswer(invocation -> {
                   Vertex input = invocation.getArgument(0);
                   Vertex created = new Vertex(input.label());
                   created.id(vertexIndex[0]++ == 0 ? "account-source" :
                                                   "account-target");
                   return created;
               });
        Mockito.when(graph.addEdge(Mockito.any(Edge.class)))
               .thenAnswer(invocation -> {
                   Edge edge = invocation.getArgument(0);
                   edge.id("Saccount-source>target");
                   return edge;
               });
        String json = "{" +
                      "\"vertices\":[" +
                      "{\"id\":\"account-source\",\"label\":\"account\"," +
                      "\"properties\":{}}," +
                      "{\"id\":\"account-target\",\"label\":\"account\"," +
                      "\"properties\":{}}]," +
                      "\"edges\":[" +
                      "{\"id\":\"edge-1\",\"label\":\"follows\"," +
                      "\"source\":\"account-source\"," +
                      "\"target\":\"account-target\",\"properties\":{}}]" +
                      "}";

        org.apache.hugegraph.entity.query.GraphView graphView =
                service.importJson(client, this.file(json));

        Assert.assertEquals(2, graphView.getVertices().size());
        Assert.assertEquals(1, graphView.getEdges().size());
        Mockito.verify(graph, Mockito.never()).getVertex("account-source");
        Mockito.verify(graph, Mockito.never()).getVertex("account-target");
    }

    @Test
    public void testImportJsonDoesNotDeleteVerticesWhenEdgeWriteFails()
           throws Exception {
        GraphService service = this.serviceWithSchemas();
        GraphManager graph = Mockito.mock(GraphManager.class);
        HugeClient client = this.clientWithGraph(graph);
        Mockito.when(graph.addVertex(Mockito.any(Vertex.class)))
               .thenAnswer(invocation -> invocation.getArgument(0));
        Mockito.when(graph.addEdge(Mockito.any(Edge.class)))
               .thenThrow(new RuntimeException("write edge failed"));
        String json = "{" +
                      "\"vertices\":[" +
                      "{\"id\":\"source\",\"label\":\"person\"," +
                      "\"properties\":{}}," +
                      "{\"id\":\"target\",\"label\":\"person\"," +
                      "\"properties\":{}}]," +
                      "\"edges\":[" +
                      "{\"label\":\"knows\",\"source\":\"source\"," +
                      "\"target\":\"target\",\"properties\":{}}]" +
                      "}";

        RuntimeException error = (RuntimeException) Assert.assertThrows(RuntimeException.class, () -> {
            service.importJson(client, this.file(json));
        });

        Mockito.verify(graph, Mockito.never()).deleteVertex(Mockito.any());
        Mockito.verify(graph, Mockito.never()).deleteEdge(Mockito.anyString());
        Assert.assertTrue(error instanceof ExternalException);
        Assert.assertEquals("graph.import.partial-failure", error.getMessage());
        Assert.assertEquals("write edge failed", error.getCause().getMessage());
        Assert.assertEquals(2, ((ExternalException) error).args()[0]);
        Assert.assertEquals(0, ((ExternalException) error).args()[1]);
    }

    @Test
    public void testImportJsonDoesNotDeleteEdgesOrVerticesWhenLaterWriteFails()
           throws Exception {
        GraphService service = this.serviceWithSchemas();
        GraphManager graph = Mockito.mock(GraphManager.class);
        HugeClient client = this.clientWithGraph(graph);
        Mockito.when(graph.addVertex(Mockito.any(Vertex.class)))
               .thenAnswer(invocation -> invocation.getArgument(0));
        Mockito.when(graph.addEdge(Mockito.any(Edge.class)))
               .thenAnswer(invocation -> {
                   Edge edge = invocation.getArgument(0);
                   edge.id("S1:source>target");
                   return edge;
               })
               .thenThrow(new RuntimeException("write edge failed"));
        String json = "{" +
                      "\"vertices\":[" +
                      "{\"id\":\"source\",\"label\":\"person\"," +
                      "\"properties\":{}}," +
                      "{\"id\":\"target\",\"label\":\"person\"," +
                      "\"properties\":{}}]," +
                      "\"edges\":[" +
                      "{\"label\":\"knows\",\"source\":\"source\"," +
                      "\"target\":\"target\",\"properties\":{}}," +
                      "{\"label\":\"knows\",\"source\":\"target\"," +
                      "\"target\":\"source\",\"properties\":{}}]" +
                      "}";

        RuntimeException error = (RuntimeException) Assert.assertThrows(RuntimeException.class, () -> {
            service.importJson(client, this.file(json));
        });

        Mockito.verify(graph, Mockito.never()).deleteEdge(Mockito.anyString());
        Mockito.verify(graph, Mockito.never()).deleteVertex(Mockito.any());
        Assert.assertTrue(error instanceof ExternalException);
        Assert.assertEquals("graph.import.partial-failure", error.getMessage());
        Assert.assertEquals(2, ((ExternalException) error).args()[0]);
        Assert.assertEquals(1, ((ExternalException) error).args()[1]);
    }

    @Test
    public void testImportJsonWarnsWhenFirstWriteResponseIsLost() throws Exception {
        GraphService service = this.serviceWithSchemas();
        GraphManager graph = Mockito.mock(GraphManager.class);
        HugeClient client = this.clientWithGraph(graph);
        Mockito.when(graph.addVertex(Mockito.any(Vertex.class)))
               .thenThrow(new RuntimeException("response lost"));
        String json = "{\"vertices\":[{\"id\":\"source\",\"label\":\"person\"," +
                      "\"properties\":{}}],\"edges\":[]}";

        ExternalException error = (ExternalException) Assert.assertThrows(ExternalException.class, () -> {
            service.importJson(client, this.file(json));
        });

        Assert.assertEquals("graph.import.partial-failure", error.getMessage());
        Assert.assertEquals(0, error.args()[0]);
        Assert.assertEquals(0, error.args()[1]);
        Mockito.verify(graph, Mockito.never()).deleteVertex(Mockito.any());
        Mockito.verify(graph, Mockito.never()).deleteEdge(Mockito.anyString());
    }

    @Test
    public void testImportJsonReportsOnlyAcknowledgedVertices() throws Exception {
        GraphService service = this.serviceWithSchemas();
        GraphManager graph = Mockito.mock(GraphManager.class);
        HugeClient client = this.clientWithGraph(graph);
        Mockito.when(graph.addVertex(Mockito.any(Vertex.class)))
               .thenAnswer(invocation -> invocation.getArgument(0))
               .thenThrow(new RuntimeException("response lost"));
        String json = "{\"vertices\":[" +
                      "{\"id\":\"source\",\"label\":\"person\",\"properties\":{}}," +
                      "{\"id\":\"target\",\"label\":\"person\",\"properties\":{}}],\"edges\":[]}";

        ExternalException error = (ExternalException) Assert.assertThrows(ExternalException.class, () -> {
            service.importJson(client, this.file(json));
        });

        Assert.assertEquals("graph.import.partial-failure", error.getMessage());
        Assert.assertEquals(1, error.args()[0]);
        Assert.assertEquals(0, error.args()[1]);
        Mockito.verify(graph, Mockito.never()).deleteVertex(Mockito.any());
        Mockito.verify(graph, Mockito.never()).deleteEdge(Mockito.anyString());
    }

    @Test
    public void testPartialImportMessageExplainsAcknowledgedCountsAndUncertainty() {
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        Object[] counts = {2, 1};
        String english = messages.getMessage("graph.import.partial-failure", counts, Locale.ENGLISH);
        String chinese = messages.getMessage("graph.import.partial-failure", counts, Locale.SIMPLIFIED_CHINESE);

        Assert.assertTrue(english.contains("2 vertex and 1 edge"));
        Assert.assertTrue(english.contains("failed request may also have succeeded"));
        Assert.assertTrue(chinese.contains("2 次顶点写入和 1 次边写入"));
        Assert.assertTrue(chinese.contains("失败的请求也可能已成功"));
    }

    @Test
    public void testImportJsonPreservesServerAuthorizationStatus() throws Exception {
        for (int status : new int[]{401, 403}) {
            GraphService service = this.serviceWithSchemas();
            GraphManager graph = Mockito.mock(GraphManager.class);
            HugeClient client = this.clientWithGraph(graph);
            ServerException serverError = new ServerException("denied");
            serverError.status(status);
            Mockito.when(graph.addVertex(Mockito.any(Vertex.class))).thenThrow(serverError);
            String json = "{\"vertices\":[{\"id\":\"source\",\"label\":\"person\"," +
                          "\"properties\":{}}],\"edges\":[]}";

            ExternalException error = (ExternalException) Assert.assertThrows(ExternalException.class, () -> {
                service.importJson(client, this.file(json));
            });

            Assert.assertEquals(status, error.status());
            Assert.assertEquals("graph.import.partial-failure", error.getMessage());
            Mockito.verify(graph, Mockito.never()).deleteVertex(Mockito.any());
        }
    }

    private GraphService serviceWithSchemas() throws Exception {
        GraphService service = new GraphService();

        UserService userService = Mockito.mock(UserService.class);
        Mockito.when(userService.multipartFileToFile(Mockito.any()))
               .thenAnswer(invocation -> {
                   MultipartFile file = invocation.getArgument(0);
                   File temp = File.createTempFile("hubble-import", ".json");
                   file.transferTo(temp);
                   return temp;
               });
        this.setField(service, "userService", userService);

        VertexLabelService vlService = Mockito.mock(VertexLabelService.class);
        Mockito.when(vlService.get(Mockito.eq("person"), Mockito.any()))
               .thenReturn(VertexLabelEntity.builder()
                                            .name("person")
                                            .idStrategy(IdStrategy.CUSTOMIZE_STRING)
                                            .properties(Collections.emptySet())
                                            .build());
        Mockito.when(vlService.get(Mockito.eq("account"), Mockito.any()))
               .thenReturn(VertexLabelEntity.builder()
                                            .name("account")
                                            .idStrategy(IdStrategy.PRIMARY_KEY)
                                            .properties(Collections.emptySet())
                                            .build());
        this.setField(service, "vlService", vlService);

        EdgeLabelService elService = Mockito.mock(EdgeLabelService.class);
        Mockito.when(elService.get(Mockito.eq("knows"), Mockito.any()))
               .thenReturn(EdgeLabelEntity.builder()
                                          .name("knows")
                                          .sourceLabel("person")
                                          .targetLabel("person")
                                          .properties(Collections.emptySet())
                                          .build());
        Mockito.when(elService.get(Mockito.eq("follows"), Mockito.any()))
               .thenReturn(EdgeLabelEntity.builder()
                                          .name("follows")
                                          .sourceLabel("account")
                                          .targetLabel("account")
                                          .properties(Collections.emptySet())
                                          .build());
        this.setField(service, "elService", elService);

        this.setField(service, "pkService",
                      Mockito.mock(PropertyKeyService.class));
        return service;
    }

    private HugeClient clientWithGraph(GraphManager graph) {
        HugeClient client = Mockito.mock(HugeClient.class);
        Mockito.when(client.graph()).thenReturn(graph);
        return client;
    }

    private MultipartFile file(String content) {
        return new MockMultipartFile("file", "graph.json",
                                     "application/json",
                                     content.getBytes(StandardCharsets.UTF_8));
    }

    private void setField(Object object, String name, Object value)
                          throws Exception {
        Field field = object.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(object, value);
    }

    private Object getField(Object object, String name) throws Exception {
        Field field = object.getClass().getDeclaredField(name);
        field.setAccessible(true);
        return field.get(object);
    }
}
