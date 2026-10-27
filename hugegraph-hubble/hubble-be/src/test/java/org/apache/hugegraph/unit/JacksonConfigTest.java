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

import java.time.Instant;
import java.time.LocalDate;
import java.util.Date;
import java.util.LinkedHashMap;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.hugegraph.common.Response;
import org.apache.hugegraph.config.JacksonConfig;
import org.apache.hugegraph.entity.graph.VertexQueryEntity;
import org.apache.hugegraph.structure.graph.Edge;
import org.apache.hugegraph.structure.graph.Vertex;
import org.junit.Assert;
import org.junit.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

public class JacksonConfigTest {

    private static final long LARGE_LONG = 9007199254740993L;

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(JacksonAutoConfiguration.class))
            .withUserConfiguration(JacksonConfig.class);

    @Test
    public void testBootMapperPreservesResponseAndVertexContract() {
        this.runner.run(context -> {
            Assert.assertNull(context.getStartupFailure());
            Assert.assertEquals(1, context.getBeansOfType(ObjectMapper.class).size());
            ObjectMapper mapper = context.getBean(ObjectMapper.class);
            Assert.assertSame(mapper, context.getBean("jacksonObjectMapper"));
            Vertex vertex = new Vertex("person");
            vertex.id(LARGE_LONG);
            vertex.properties().put("balance", LARGE_LONG);
            vertex.properties().put("age", 42);
            Response response = Response.builder().status(200).data(vertex)
                                        .message("Success").build();

            Assert.assertEquals(mapper.readTree("""
                    {"status":200,"data":{"id":"9007199254740993","id_type":"NUMBER","label":"person",
                     "properties":{"balance":"9007199254740993","age":42}},
                     "message":"Success","cause":null}
                    """), mapper.readTree(mapper.writeValueAsString(response)));
        });
    }

    @Test
    public void testQueryVertexPreservesStatisticsAndNullProperties() {
        this.runner.run(context -> {
            ObjectMapper mapper = context.getBean(ObjectMapper.class);
            VertexQueryEntity vertex = new VertexQueryEntity("person");
            vertex.id("person/1");
            vertex.setProperties(new LinkedHashMap<>());
            vertex.properties().put("nickname", null);
            vertex.getStatistics().put("degree", LARGE_LONG);
            vertex.getStatistics().put("optional", null);

            Assert.assertEquals(mapper.readTree("""
                    {"id":"person/1","label":"person","properties":{"nickname":null},
                     "statistics":{"degree":"9007199254740993","optional":null}}
                    """), mapper.readTree(mapper.writeValueAsString(vertex)));
        });
    }

    @Test
    public void testEdgesPreserveStringIdsAndLongProperties() {
        this.runner.run(context -> {
            ObjectMapper mapper = context.getBean(ObjectMapper.class);
            Edge edge = new Edge("knows");
            edge.id("edge-1");
            edge.sourceId(LARGE_LONG);
            edge.targetId("person/2");
            edge.properties().put("weight", LARGE_LONG);

            Assert.assertEquals(mapper.readTree("""
                    {"id":"edge-1","label":"knows","source":"9007199254740993",
                     "target":"person/2","properties":{"weight":"9007199254740993"}}
                    """), mapper.readTree(mapper.writeValueAsString(edge)));
            edge.id(null);
            Assert.assertFalse(mapper.readTree(mapper.writeValueAsString(edge)).has("id"));
        });
    }

    @Test
    public void testBootPropertiesAndJavaTimeModuleRemainAvailable() {
        this.runner.withPropertyValues(
                "spring.jackson.property-naming-strategy=SNAKE_CASE",
                "spring.jackson.default-property-inclusion=non_null",
                "spring.jackson.date-format=yyyy-MM-dd HH:mm:ss",
                "spring.jackson.time-zone=GMT+8")
                .run(context -> {
                    ObjectMapper mapper = context.getBean(ObjectMapper.class);
                    TimeValue value = new TimeValue(LocalDate.of(2026, 10, 23),
                            Date.from(Instant.parse("2026-01-01T16:05:06Z")), null);

                    Assert.assertEquals("{\"creation_date\":\"2026-10-23\",\"update_time\":\"2026-01-02 00:05:06\"}",
                                        mapper.writeValueAsString(value));
                });
    }

    private record TimeValue(LocalDate creationDate, Date updateTime, String missingValue) {
    }
}
