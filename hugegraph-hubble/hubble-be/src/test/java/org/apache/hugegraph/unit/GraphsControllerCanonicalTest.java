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

import java.lang.reflect.Field;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.junit.Before;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import jakarta.servlet.ServletException;

import org.apache.hugegraph.controller.graphs.GraphsController;
import org.apache.hugegraph.controller.query.GremlinQueryController;
import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.service.HugeClientPoolService;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.controller.BaseController;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.graphs.GraphCloneEntity;
import org.apache.hugegraph.entity.graphs.GraphStatisticsEntity;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.graphs.GraphsService;
import org.apache.hugegraph.service.space.VermeerService;
import org.apache.hugegraph.testutil.Assert;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

public class GraphsControllerCanonicalTest {

    private MockMvc mvc;
    private GraphsController controller;
    private HugeClient client;
    private GraphsService graphsService;
    private VermeerService vermeerService;
    private RequestPostProcessor withClient;

    @Before
    public void setup() throws Exception {
        GraphsController controller = new GraphsController();
        this.controller = controller;
        this.graphsService = Mockito.mock(GraphsService.class);
        this.setField(controller, "graphsService", this.graphsService);
        this.vermeerService = Mockito.mock(VermeerService.class);
        this.setField(controller, "vermeerService", this.vermeerService);
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        this.setField(controller, "config", config);
        this.setField(BaseController.class, controller, "config", config);

        this.client = Mockito.mock(HugeClient.class);
        this.withClient = request -> {
            request.setAttribute("hugeClient", this.client);
            return request;
        };
        this.mvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    public void testGraphListSurvivesDirectVermeerFailureAfterCapabilityCheck() throws Exception {
        Mockito.when(this.vermeerService.isVermeerEnabled(this.client, null)).thenReturn(true);
        Mockito.when(this.vermeerService.graphs(this.client))
               .thenThrow(new ExternalException("Vermeer became unavailable"));
        Mockito.when(this.graphsService.sortedGraphsProfile(this.client, "DEFAULT", "", "",
                                                             true, Collections.emptyMap()))
               .thenReturn(List.of(Map.of("name", "graph_a")));
        String body = this.mvc.perform(get("/api/v1.3/graphspaces/DEFAULT/graphs/list")
                                      .with(this.withClient))
                              .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        Assert.assertTrue(body.contains("graph_a"));
    }

    @Test
    public void testGraphDetailSurvivesDirectVermeerFailureAfterCapabilityCheck() throws Exception {
        Mockito.when(this.vermeerService.isVermeerEnabled(this.client, null)).thenReturn(true);
        Mockito.when(this.vermeerService.graph(this.client, "DEFAULT", "graph_a"))
               .thenThrow(new ExternalException("Vermeer became unavailable"));
        Mockito.when(this.graphsService.get(this.client, "DEFAULT", "graph_a", Collections.emptyMap()))
               .thenReturn(Map.of("name", "graph_a"));
        String body = this.mvc.perform(get("/api/v1.3/graphspaces/DEFAULT/graphs/graph_a/get")
                                      .with(this.withClient))
                              .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        Assert.assertTrue(body.contains("graph_a"));
    }

    @Test
    public void testStatisticsUsesGremlinAuthenticationCapability() throws Exception {
        HugeClientPoolService pool = Mockito.mock(HugeClientPoolService.class);
        HugeClient basicClient = Mockito.mock(HugeClient.class);
        this.setField(BaseController.class, this.controller, "hugeClientPoolService", pool);
        Mockito.when(pool.createBasicClient("DEFAULT", "graph", "admin", "fixture-password"))
               .thenReturn(basicClient);

        for (boolean basicRequired : new boolean[]{false, true}) {
            Mockito.when(this.client.requiresBasicGremlinAuth()).thenReturn(basicRequired);
            this.mvc.perform(get("/api/v1.3/graphspaces/DEFAULT/graphs/graph/statistics")
                             .with(this.withClient)
                             .sessionAttr(Constant.USERNAME_KEY, "admin")
                             .sessionAttr(Constant.TOKEN_KEY, "fixture-token")
                             .sessionAttr(Constant.PASSWORD_KEY, "fixture-password")
                             .sessionAttr(Constant.PASSWORD_EXPIRE_AT_KEY,
                                          System.currentTimeMillis() + 60000L))
                    .andExpect(status().isOk());
            Mockito.verify(this.graphsService).getStatistics(
                    basicRequired ? basicClient : this.client, "DEFAULT", "graph");
        }
        Mockito.verify(this.client).close();
        Mockito.verify(pool).createBasicClient("DEFAULT", "graph", "admin", "fixture-password");
    }

    @Test
    public void testLegacyOverviewSharesTheExplicitStatisticsCredentialContext() throws Exception {
        HugeClientPoolService pool = Mockito.mock(HugeClientPoolService.class);
        HugeClient basicClient = Mockito.mock(HugeClient.class);
        Mockito.when(this.client.requiresBasicGremlinAuth()).thenReturn(true);
        Mockito.when(pool.createBasicClient("DEFAULT", "graph", "admin", "fixture-password"))
               .thenReturn(basicClient);
        this.setField(BaseController.class, this.controller, "hugeClientPoolService", pool);
        GremlinQueryController overview = new GremlinQueryController();
        this.setField(overview, "graphsService", this.graphsService);
        this.setField(BaseController.class, overview, "hugeClientPoolService", pool);
        HugeConfig config = Mockito.mock(HugeConfig.class);
        Mockito.when(config.get(HubbleOptions.PD_ENABLED)).thenReturn(false);
        this.setField(BaseController.class, overview, "config", config);
        Mockito.when(this.graphsService.evCount(basicClient, "DEFAULT", "graph"))
               .thenReturn(Collections.emptyMap(), java.util.Map.of("vertex", 12L, "edge", 8L));
        Mockito.when(this.graphsService.getStatistics(basicClient, "DEFAULT", "graph"))
               .thenReturn(GraphStatisticsEntity.emptyEntity());
        MockMvc routes = MockMvcBuilders.standaloneSetup(this.controller, overview).build();
        RequestPostProcessor withCredentials = request -> {
            request.setAttribute("hugeClient", this.client);
            request.getSession().setAttribute(Constant.USERNAME_KEY, "admin");
            request.getSession().setAttribute(Constant.TOKEN_KEY, "fixture-token");
            request.getSession().setAttribute(Constant.PASSWORD_KEY, "fixture-password");
            request.getSession().setAttribute(Constant.PASSWORD_EXPIRE_AT_KEY,
                                              System.currentTimeMillis() + 60000L);
            return request;
        };
        String graphPath = "/api/v1.3/graphspaces/DEFAULT/graphs/graph/";

        routes.perform(get(graphPath + "gremlin-query").with(withCredentials))
              .andExpect(status().isOk()).andExpect(jsonPath("$.vertexcount").doesNotExist());
        routes.perform(get(graphPath + "statistics").with(withCredentials)).andExpect(status().isOk());
        routes.perform(get(graphPath + "gremlin-query").with(withCredentials))
              .andExpect(status().isOk()).andExpect(jsonPath("$.vertexcount").value("12"))
              .andExpect(jsonPath("$.edgecount").value("8"));

        org.mockito.InOrder calls = Mockito.inOrder(this.graphsService);
        calls.verify(this.graphsService).evCount(basicClient, "DEFAULT", "graph");
        calls.verify(this.graphsService).getStatistics(basicClient, "DEFAULT", "graph");
        calls.verify(this.graphsService).evCount(basicClient, "DEFAULT", "graph");
        Mockito.verifyNoMoreInteractions(this.graphsService);
    }

    @Test
    public void testBriefListUsesMetadataRoute() throws Exception {
        this.mvc.perform(get("/api/v1.3/graphspaces/DEFAULT/graphs")
                         .param("brief", "true")
                         .with(this.withClient))
                .andExpect(status().isOk());

        Mockito.verify(this.graphsService)
               .queryBriefPage(this.client, "DEFAULT", "", "", 1, 100, "");
        Mockito.verifyNoMoreInteractions(this.graphsService);
    }

    @Test
    public void testBriefListForwardsPageSearchAndOffPageSelection() throws Exception {
        this.mvc.perform(get("/api/v1.3/graphspaces/DEFAULT/graphs")
                         .param("brief", "true")
                         .param("query", "alias")
                         .param("page_no", "2")
                         .param("page_size", "10")
                         .param("selected", "late_graph")
                         .with(this.withClient))
                .andExpect(status().isOk());

        Mockito.verify(this.graphsService)
               .queryBriefPage(this.client, "DEFAULT", "alias", "", 2, 10, "late_graph");
        Mockito.verifyNoMoreInteractions(this.graphsService);
    }

    @Test
    public void testCanonicalCreateGraphUsesPathNameAndJsonBody()
           throws Exception {
        Mockito.when(this.graphsService.create(Mockito.eq(this.client),
                                               Mockito.eq("GraphNick"),
                                               Mockito.eq("graph_a"),
                                               Mockito.eq("template_a")))
               .thenReturn(Collections.singletonMap("name", "graph_a"));

        this.mvc.perform(post("/api/v1.3/graphspaces/DEFAULT/graphs/graph_a")
                         .with(this.withClient)
                         .contentType(MediaType.APPLICATION_JSON)
                         .content("{\"nickname\":\"GraphNick\"," +
                                  "\"schema\":\"template_a\"}"))
                .andExpect(status().isOk());

        Mockito.verify(this.graphsService)
               .create(this.client, "GraphNick", "graph_a", "template_a");
    }

    @Test
    public void testCanonicalUpdateGraphUsesJsonBody()
           throws Exception {
        this.mvc.perform(put("/api/v1.3/graphspaces/DEFAULT/graphs/graph_a")
                         .with(this.withClient)
                         .contentType(MediaType.APPLICATION_JSON)
                         .content("{\"nickname\":\"GraphNick\"}"))
                .andExpect(status().isOk());

        Mockito.verify(this.graphsService)
               .update(this.client, "GraphNick", "graph_a");
    }

    @Test
    public void testCanonicalClearGraphUsesPostAndClearsSchemaAndData()
           throws Exception {
        this.mvc.perform(post("/api/v1.3/graphspaces/DEFAULT/graphs/graph_a/clear")
                         .with(this.withClient))
                .andExpect(status().isOk());

        Mockito.verify(this.graphsService).clearGraph(this.client, "graph_a");
    }

    @Test
    public void testCanonicalClearGraphPropagatesDefaultGraphRejection()
           throws Exception {
        Mockito.doThrow(new ExternalException("Can't clear default graph"))
               .when(this.graphsService).clearGraph(this.client, "graph_a");

        try {
            this.mvc.perform(
                    post("/api/v1.3/graphspaces/DEFAULT/graphs/graph_a/clear")
                    .with(this.withClient));
            org.junit.Assert.fail("Expected default graph rejection");
        } catch (ServletException e) {
            Assert.assertInstanceOf(ExternalException.class, e.getCause());
        }

        Mockito.verify(this.graphsService).clearGraph(this.client, "graph_a");
    }

    @Test
    public void testLegacyGetClearGraphRouteIsNotSuccessful()
           throws Exception {
        this.mvc.perform(get("/api/v1.3/graphspaces/DEFAULT/graphs/graph_a/truncate")
                         .with(this.withClient)
                         .param("clear_schema", "true"))
                .andExpect(status().is4xxClientError());

        Mockito.verifyNoInteractions(this.graphsService);
    }

    @Test
    public void testLegacyGraphMutationRoutesAreNotSuccessful()
           throws Exception {
        this.mvc.perform(get("/api/v1.3/graphspaces/DEFAULT/graphs/graph_a/update")
                         .with(this.withClient)
                         .param("nickname", "GraphNick"))
                .andExpect(status().is4xxClientError());
        this.mvc.perform(get("/api/v1.3/graphspaces/DEFAULT/graphs/graph_a/setdefault")
                         .with(this.withClient))
                .andExpect(status().is4xxClientError());
        this.mvc.perform(get("/api/v1.3/graphspaces/DEFAULT/graphs/graph_a/unsetdefault")
                         .with(this.withClient))
                .andExpect(status().is4xxClientError());
        this.mvc.perform(get("/api/v1.3/graphspaces/DEFAULT/graphs/getdefault")
                         .with(this.withClient))
                .andExpect(status().is4xxClientError());
        this.mvc.perform(post("/api/v1.3/graphspaces/DEFAULT/graphs")
                         .with(this.withClient)
                         .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                         .param("graph", "graph_b")
                         .param("nickname", "LegacyNick")
                         .param("schema", "template_b"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    public void testCanonicalSetDefaultGraphUsesServiceDefault()
           throws Exception {
        this.mvc.perform(post("/api/v1.3/graphspaces/DEFAULT/graphs/graph_a/default")
                         .with(this.withClient))
                .andExpect(status().isOk());

        Mockito.verify(this.graphsService).setDefault(this.client, "graph_a");
    }

    @Test
    public void testSetDefaultUsesGraphspaceScopedClient() throws Exception {
        ScopeCapturingController controller = new ScopeCapturingController();
        controller.client = this.client;
        this.setField(controller, "graphsService", this.graphsService);

        controller.setDefaultByCanonicalApi("DEFAULT", "graph_a");

        Assert.assertEquals("DEFAULT", controller.graphspace);
        Assert.assertNull(controller.graph);
        Mockito.verify(this.graphsService).setDefault(this.client, "graph_a");
    }

    @Test
    public void testCanonicalUnsetDefaultGraphUsesServiceDefault()
           throws Exception {
        this.mvc.perform(delete("/api/v1.3/graphspaces/DEFAULT/graphs/graph_a/default")
                         .with(this.withClient))
                .andExpect(status().isOk());

        Mockito.verify(this.graphsService).unSetDefault(this.client, "graph_a");
    }

    @Test
    public void testCanonicalGetDefaultGraphUsesServiceDefault()
           throws Exception {
        Mockito.when(this.graphsService.getDefault(this.client))
               .thenReturn(Collections.singletonMap("name", "graph_a"));

        this.mvc.perform(get("/api/v1.3/graphspaces/DEFAULT/graphs/default")
                         .with(this.withClient))
                .andExpect(status().isOk());

        Mockito.verify(this.graphsService).getDefault(this.client);
    }

    @Test
    public void testCloneOnlyAllowsSchemaInCurrentGraphSpace() throws Exception {
        ScopeCapturingController controller = new ScopeCapturingController();
        controller.client = this.client;
        this.setField(controller, "graphsService", this.graphsService);
        GraphCloneEntity clone = GraphCloneEntity.builder()
                                                 .graphSpace("source")
                                                 .name("copy")
                                                 .nickname("Copy")
                                                 .build();
        controller.clone("source", "original", clone);
        Assert.assertEquals("source", controller.checkedGraphSpace);
        Mockito.verify(this.graphsService).cloneSchema(this.client, "copy", "original", "Copy");

        clone.setGraphSpace("other");
        Assert.assertThrows(org.apache.hugegraph.exception.ParameterizedException.class,
                            () -> controller.clone("source", "original", clone));
        clone.setGraphSpace("source");
        clone.setLoadData(1);
        Assert.assertThrows(org.apache.hugegraph.exception.ParameterizedException.class,
                            () -> controller.clone("source", "original", clone));
        clone.setLoadData(0);
        clone.setName("original");
        Assert.assertThrows(org.apache.hugegraph.exception.ParameterizedException.class,
                            () -> controller.clone("source", "original", clone));
        Mockito.verifyNoMoreInteractions(this.graphsService);
    }

    private void setField(Object object, String name, Object value)
                          throws Exception {
        Class<?> type = object.getClass();
        while (type != null) {
            try {
                Field field = type.getDeclaredField(name);
                field.setAccessible(true);
                field.set(object, value);
                return;
            } catch (NoSuchFieldException ignored) {
                type = type.getSuperclass();
            }
        }
        throw new NoSuchFieldException(name);
    }

    private void setField(Class<?> type, Object object, String name,
                          Object value) throws Exception {
        Field field = type.getDeclaredField(name);
        field.setAccessible(true);
        field.set(object, value);
    }

    private static class ScopeCapturingController extends GraphsController {

        private HugeClient client;
        private String graphspace;
        private String graph;
        private String checkedGraphSpace;

        @Override
        protected HugeClient authClient(String graphspace, String graph) {
            this.graphspace = graphspace;
            this.graph = graph;
            return this.client;
        }

        @Override
        protected void requireGraphSpaceWrite(HugeClient client,
                                              String graphSpace) {
            this.checkedGraphSpace = graphSpace;
        }
    }
}
