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
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hugegraph.unit;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.web.bind.annotation.PostMapping;

import org.apache.hugegraph.controller.algorithm.OltpAlgoController;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.algorithm.ShortestPathEntity;
import org.apache.hugegraph.entity.query.GremlinResult;
import org.apache.hugegraph.service.algorithm.OltpAlgoService;
import org.apache.hugegraph.testutil.Assert;

public class OltpAlgoControllerTest {

    @Test
    public void testShortestPathUsesGremlinCapableClient() throws Exception {
        HugeClient tokenClient = Mockito.mock(HugeClient.class);
        HugeClient gremlinClient = Mockito.mock(HugeClient.class);
        ShortestPathEntity body = new ShortestPathEntity();
        GremlinResult result = GremlinResult.builder().build();
        OltpAlgoService service = Mockito.mock(OltpAlgoService.class);
        Mockito.when(service.shortestPath(gremlinClient, body))
               .thenReturn(result);

        TestOltpAlgoController controller = new TestOltpAlgoController();
        controller.authClient = tokenClient;
        controller.gremlinClient = gremlinClient;
        this.setService(controller, service);

        GremlinResult actual = controller.shortPath("DEFAULT", "hugegraph", body);

        Assert.assertSame(result, actual);
        Assert.assertTrue(controller.gremlinClientCreated);
        Assert.assertFalse(controller.authClientCreated);
        Assert.assertEquals("DEFAULT", controller.graphSpace);
        Assert.assertEquals("hugegraph", controller.graph);
        Mockito.verify(service).shortestPath(gremlinClient, body);
        Mockito.verifyNoInteractions(tokenClient);
    }

    @Test
    public void testShortPathAliasMappingExists() throws Exception {
        Method method = OltpAlgoController.class.getDeclaredMethod("shortPathAlias",
                                                                  String.class,
                                                                  String.class,
                                                                  org.apache.hugegraph.entity.algorithm.ShortestPathEntity.class);

        PostMapping mapping = method.getAnnotation(PostMapping.class);
        Assert.assertEquals("shortpath", mapping.value()[0]);
    }

    @Test
    public void testAllShortPathAliasMappingExists() throws Exception {
        Method method = OltpAlgoController.class.getDeclaredMethod("allShortPathAlias",
                                                                  String.class,
                                                                  String.class,
                                                                  org.apache.hugegraph.entity.algorithm.AllShortestPathsEntity.class);

        PostMapping mapping = method.getAnnotation(PostMapping.class);
        Assert.assertEquals("allshortpath", mapping.value()[0]);
    }

    private void setService(OltpAlgoController controller,
                            OltpAlgoService service) throws Exception {
        Field field = OltpAlgoController.class.getDeclaredField("service");
        field.setAccessible(true);
        field.set(controller, service);
    }

    private static class TestOltpAlgoController extends OltpAlgoController {

        private HugeClient authClient;
        private HugeClient gremlinClient;
        private boolean authClientCreated;
        private boolean gremlinClientCreated;
        private String graphSpace;
        private String graph;

        @Override
        protected HugeClient authClient(String graphSpace, String graph) {
            this.authClientCreated = true;
            this.graphSpace = graphSpace;
            this.graph = graph;
            return this.authClient;
        }

        @Override
        protected HugeClient authGremlinClient(String graphSpace, String graph) {
            this.gremlinClientCreated = true;
            this.graphSpace = graphSpace;
            this.graph = graph;
            return this.gremlinClient;
        }
    }
}
