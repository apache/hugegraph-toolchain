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

package org.apache.hugegraph.loader.test.functional;

import java.io.File;
import java.io.IOException;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.hadoop.hive.common.type.Date;
import org.apache.hadoop.hive.serde2.typeinfo.TypeInfo;
import org.apache.hadoop.hive.serde2.typeinfo.TypeInfoUtils;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.SchemaManager;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.loader.HugeGraphLoader;
import org.apache.hugegraph.loader.constant.Constants;
import org.apache.hugegraph.loader.exception.LoadException;
import org.apache.hugegraph.loader.exception.ParseException;
import org.apache.hugegraph.loader.executor.LoadContext;
import org.apache.hugegraph.loader.executor.LoadOptions;
import org.apache.hugegraph.loader.progress.FileItemProgress;
import org.apache.hugegraph.loader.progress.InputItemProgress;
import org.apache.hugegraph.loader.progress.InputProgress;
import org.apache.hugegraph.loader.source.file.Compression;
import org.apache.hugegraph.loader.util.DateUtil;
import org.apache.hugegraph.loader.util.HugeClientHolder;
import org.apache.hugegraph.structure.constant.DataType;
import org.apache.hugegraph.structure.graph.Edge;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.structure.schema.PropertyKey;
import org.apache.hugegraph.testutil.Assert;
import org.apache.hugegraph.testutil.Whitebox;
import org.apache.hugegraph.util.CommonUtil;
import org.apache.hugegraph.util.LongEncoding;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import com.google.common.collect.ImmutableList;
import com.google.common.collect.ImmutableMap;
import com.google.common.collect.ImmutableSet;

public class FileLoadTest extends LoadTest {

    private static final Charset GBK = Charset.forName("GBK");

    protected IOUtil ioUtil;

    public String structPath(String fileName) {
        return configPath(fileName);
    }

    @Before
    public void init() {
        this.ioUtil = new FileUtil("files");
    }

    @After
    public void clear() {
        clearFileData();
        clearServerData();
    }

    protected void clearFileData() {
        this.ioUtil.delete();
    }

    /**
     * NOTE: Unsupported auto create schema
     */
    //@Test
    public void testAutoCreateSchema() {
        String[] args = new String[]{
                "-f", "example/struct.json",
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2"
        };

        loadWithAuth(args);

        List<PropertyKey> propertyKeys = CLIENT.schema().getPropertyKeys();
        propertyKeys.forEach(pkey -> {
            Assert.assertEquals(DataType.TEXT, pkey.dataType());
        });

        List<Vertex> vertices = CLIENT.graph().listVertices();
        List<Edge> edges = CLIENT.graph().listEdges();

        Assert.assertEquals(7, vertices.size());
        Assert.assertEquals(6, edges.size());

        boolean interestedVertex = false;
        for (Vertex vertex : vertices) {
            Assert.assertEquals(String.class, vertex.id().getClass());
            if (((String) vertex.id()).contains("li,nary")) {
                interestedVertex = true;
                Assert.assertEquals("26", vertex.property("age"));
                Assert.assertEquals("Wu,han", vertex.property("city"));
            }
        }
        Assert.assertTrue(interestedVertex);

        boolean interestedEdge = false;
        for (Edge edge : edges) {
            Assert.assertEquals(String.class, edge.sourceId().getClass());
            Assert.assertEquals(String.class, edge.targetId().getClass());
            if (((String) edge.sourceId()).contains("marko") &&
                ((String) edge.targetId()).contains("vadas")) {
                interestedEdge = true;
                Assert.assertEquals("20160110", edge.property("date"));
                Assert.assertEquals("0.5", edge.property("weight"));
            }
        }
        Assert.assertTrue(interestedEdge);
    }

    @Test
    public void testCustomizedSchema() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,29,Beijing",
                     "vadas,27,Hongkong",
                     "josh,32,Beijing",
                     "peter,35,Shanghai",
                     "\"li,nary\",26,\"Wu,han\"");
        ioUtil.write("vertex_software.csv", GBK,
                     "name,lang,price",
                     "lop,java,328",
                     "ripple,java,199");
        ioUtil.write("edge_knows.csv",
                     "source_name,target_name,date,weight",
                     "marko,vadas,20160110,0.5",
                     "marko,josh,20130220,1.0");
        ioUtil.write("edge_created.csv",
                     "source_name,target_name,date,weight",
                     "marko,lop,20171210,0.4",
                     "josh,lop,20091111,0.4",
                     "josh,ripple,20171210,1.0",
                     "peter,lop,20170324,0.2");

        String[] args = new String[]{
                "-f", structPath("customized_schema/struct.json"),
                "-s", configPath("customized_schema/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        List<Edge> edges = CLIENT.graph().listEdges();

        Assert.assertEquals(7, vertices.size());
        Assert.assertEquals(6, edges.size());

        boolean interestedVertex = false;
        for (Vertex vertex : vertices) {
            Assert.assertEquals(String.class, vertex.id().getClass());
            if (((String) vertex.id()).contains("li,nary")) {
                interestedVertex = true;
                Assert.assertEquals(26, vertex.property("age"));
                Assert.assertEquals("Wu,han", vertex.property("city"));
            }
        }
        Assert.assertTrue(interestedVertex);

        boolean interestedEdge = false;
        for (Edge edge : edges) {
            Assert.assertEquals(String.class, edge.sourceId().getClass());
            Assert.assertEquals(String.class, edge.targetId().getClass());
            if (((String) edge.sourceId()).contains("marko") &&
                ((String) edge.targetId()).contains("vadas")) {
                interestedEdge = true;
                Assert.assertEquals("20160110", edge.property("date"));
                Assert.assertEquals(0.5, edge.property("weight"));
            }
        }
        Assert.assertTrue(interestedEdge);
    }

    @Test
    public void testNoSchemaFile() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,29,Beijing");

        String[] args = new String[]{
                "-f", structPath("no_schema_file/struct.json"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        Assert.assertThrows(LoadException.class, () -> {
            loadWithAuth(args);
        });
    }

    @Test
    public void testClearSchemaBeforeLoad() {
        LoadOptions options = new LoadOptions();
        options.host = Constants.HTTP_PREFIX + SERVER;
        options.port = PORT;
        options.graph = GRAPH;
        options.username = "admin";
        options.password = "pa";
        HugeClient client = HugeClientHolder.create(options);
        SchemaManager schema = client.schema();
        schema.propertyKey("name").asText().ifNotExist().create();
        schema.propertyKey("age").asInt().ifNotExist().create();
        // The old datatype of city is int
        schema.propertyKey("city").asInt().ifNotExist().create();
        schema.vertexLabel("person").properties("name", "age", "city")
              .primaryKeys("name").ifNotExist().create();

        // Actual city datatype is String
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,29,Beijing",
                     "vadas,27,Hongkong",
                     "josh,32,Beijing",
                     "peter,35,Shanghai",
                     "\"li,nary\",26,\"Wu,han\"");
        List<String> argsList1 = new ArrayList<>(Arrays.asList(
                "-f", structPath("clear_schema_before_load/struct.json"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        ));
        argsList1.addAll(Arrays.asList("--username", "admin", "--password", "pa"));
        Assert.assertThrows(ParseException.class, () -> {
            HugeGraphLoader loader = new HugeGraphLoader(argsList1.toArray(new String[0]));
            try {
                loader.load();
            } finally {
                loader.shutdown();
            }
        }, (e) -> {
            String msg = e.getMessage();
            Assert.assertTrue(msg.startsWith("Failed to convert value"));
            Assert.assertTrue(msg.endsWith("to Number"));
        });

        List<String> argsList2 = new ArrayList<>(Arrays.asList(
                "-f", structPath("clear_schema_before_load/struct.json"),
                "-s", configPath("clear_schema_before_load/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--clear-all-data", "true",
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        ));
        argsList2.addAll(Arrays.asList("--username", "admin", "--password", "pa"));
        HugeGraphLoader loader = new HugeGraphLoader(argsList2.toArray(new String[0]));
        loader.load();
        loader.shutdown();
        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(5, vertices.size());
        client.close();
    }

    @Test
    public void testSkipStruct() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,29,Beijing",
                     "vadas,27,Hongkong",
                     "josh,32,Beijing",
                     "peter,35,Shanghai",
                     "\"li,nary\",26,\"Wu,han\"");
        ioUtil.write("vertex_software.csv", GBK,
                     "name,lang,price",
                     "lop,java,328",
                     "ripple,java,199");
        ioUtil.write("edge_knows.csv",
                     "source_name,target_name,date,weight",
                     "marko,vadas,20160110,0.5",
                     "marko,josh,20130220,1.0");
        ioUtil.write("edge_created.csv",
                     "source_name,target_name,date,weight",
                     "marko,lop,20171210,0.4",
                     "josh,lop,20091111,0.4",
                     "josh,ripple,20171210,1.0",
                     "peter,lop,20170324,0.2");

        String[] args = new String[]{
                "-f", structPath("skip_struct/struct.json"),
                "-s", configPath("skip_struct/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        List<Edge> edges = CLIENT.graph().listEdges();

        Assert.assertEquals(7, vertices.size());
        Assert.assertEquals(4, edges.size());

        for (Edge edge : edges) {
            Assert.assertEquals("created", edge.label());
        }
    }

    @Test
    public void testVertexIdExceedLimit() {
        Integer[] array = new Integer[129];
        Arrays.fill(array, 1);
        String tooLongId = StringUtils.join(array);
        String line = StringUtils.join(tooLongId, 29, "Beijing");
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     line);

        String[] args = new String[]{
                "-f", structPath("vertex_id_exceed_limit/struct.json"),
                "-s", configPath("vertex_id_exceed_limit/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        Assert.assertThrows(ParseException.class, () -> {
            loadWithAuth(args);
        });

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(0, vertices.size());
    }

    @Test
    public void testVertexIdExceedLimitInBytes() {
        String pk = "ecommerce__color__极光银翻盖上盖+" +
                    "琥珀啡翻盖下盖 + 咖啡金翻盖上盖装饰片+" +
                    "香槟金主镜片 + 深咖啡色副镜片 + 琥珀>" +
                    "啡前壳 + 极光银后壳 + 浅灰电池扣 + 极光银电池组件 + 深灰天线";
        Assert.assertTrue(pk.length() < 128);
        String line = StringUtils.join(new String[]{pk, "中文", "328"}, ",");
        ioUtil.write("vertex_software.csv", GBK,
                     "name,lang,price",
                     line);

        String[] args = new String[]{
                "-f", structPath("vertex_id_exceed_limit_in_bytes/struct.json"),
                "-s", configPath("vertex_id_exceed_limit_in_bytes/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        // Bytes encoded in utf-8 exceed 128
        Assert.assertThrows(ParseException.class, () -> {
            loadWithAuth(args);
        });
    }

    @Test
    public void testIdFieldAsProperty() {
        ioUtil.write("vertex_person.csv",
                     "id,name,age,city",
                     "1,marko,29,Beijing",
                     "2,vadas,27,Hongkong",
                     "3,josh,32,Beijing",
                     "4,peter,35,Shanghai",
                     "5,\"li,nary\",26,\"Wu,han\"");

        String[] args = new String[]{
                "-f", structPath("id_field_as_property/struct.json"),
                "-s", configPath("id_field_as_property/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(5, vertices.size());
        for (Vertex vertex : vertices) {
            Assert.assertNotNull(vertex.property("id"));
        }
    }

    @Test
    public void testTooManyColumns() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,29,Beijing,Extra");

        String[] args = new String[]{
                "-f", structPath("too_many_columns/struct.json"),
                "-s", configPath("too_many_columns/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        Assert.assertThrows(ParseException.class, () -> {
            loadWithAuth(args);
        });
    }

    @Test
    public void testUnmatchedPropertyDataType() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,Should be number,Beijing");

        String[] args = new String[]{
                "-f", structPath("unmatched_property_datatype/struct.json"),
                "-s", configPath("unmatched_property_datatype/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        Assert.assertThrows(ParseException.class, () -> {
            loadWithAuth(args);
        });

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(0, vertices.size());
    }

    @Test
    public void testVertexPkContainsSpecicalSymbol() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "mar:ko!,29,Beijing");

        String[] args = new String[]{
                "-f", structPath("vertex_pk_contains_special_symbol/struct.json"),
                "-s", configPath("vertex_pk_contains_special_symbol/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(1, vertices.size());
        Vertex vertex = vertices.get(0);
        Assert.assertEquals(String.class, vertex.id().getClass());
        Assert.assertTrue(((String) vertex.id()).contains(":mar`:ko`!"));
        Assert.assertEquals(29, vertex.property("age"));
        Assert.assertEquals("Beijing", vertex.property("city"));
    }

    @Test
    public void testUnmatchedEncodingCharset() {
        ioUtil.write("vertex_software.csv", GBK,
                     "name,lang,price",
                     "lop,中文,328");

        String[] args = new String[]{
                "-f", structPath("unmatched_encoding_charset/struct.json"),
                "-s", configPath("unmatched_encoding_charset/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(1, vertices.size());
        Vertex vertex = vertices.get(0);
        Assert.assertEquals("lop", vertex.property("name"));
        Assert.assertNotEquals("中文", vertex.property("lang"));
        Assert.assertEquals(328.0, vertex.property("price"));
    }

    @Test
    public void testMatchedEncodingCharset() {
        ioUtil.write("vertex_software.csv", GBK,
                     "name,lang,price",
                     "lop,中文,328");

        String[] args = new String[]{
                "-f", structPath("matched_encoding_charset/struct.json"),
                "-s", configPath("matched_encoding_charset/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(1, vertices.size());
        Vertex vertex = vertices.get(0);
        Assert.assertEquals("lop", vertex.property("name"));
        Assert.assertEquals("中文", vertex.property("lang"));
        Assert.assertEquals(328.0, vertex.property("price"));
    }

    @Test
    public void testCustomizedDelimiterInCsvFile() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko\t29\tBeijing");

        String[] args = new String[]{
                "-f", structPath("customized_delimiter_in_csv_file/struct.json"),
                "-s", configPath("customized_delimiter_in_csv_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        // Invalid mapping file
        Assert.assertThrows(LoadException.class, () -> {
            new HugeGraphLoader(args);
        });
    }

    @Test
    public void testParseEmptyCsvLine() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "");

        String[] args = new String[]{
                "-f", structPath("parse_empty_csv_line/struct.json"),
                "-s", configPath("parse_empty_csv_line/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        Assert.assertThrows(ParseException.class, () -> {
            loadWithAuth(args);
        }, (e) -> {
            Assert.assertTrue(e.getMessage().contains("Parse line '' error"));
        });
    }

    /**
     * TODO: the order of collection's maybe change
     * (such as time:["2019-05-02 13:12:44","2008-05-02 13:12:44"])
     */
    @Test
    public void testValueListPropertyInJsonFile() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,29,Beijing");
        ioUtil.write("vertex_software.csv", GBK,
                     "name,lang,price",
                     "lop,中文,328");
        ioUtil.write("edge_use.json",
                     "{\"person_name\": \"marko\", \"software_name\": " +
                     "\"lop\", \"feel\": [\"so so\", \"good\", \"good\"]}");

        String[] args = new String[]{
                "-f", structPath("value_list_property_in_json_file/struct.json"),
                "-s", configPath("value_list_property_in_json_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Edge> edges = CLIENT.graph().listEdges();
        Assert.assertEquals(1, edges.size());
        Edge edge = edges.get(0);

        Assert.assertEquals("person", edge.sourceLabel());
        Assert.assertEquals("software", edge.targetLabel());
        Assert.assertEquals(ImmutableList.of("so so", "good", "good"),
                            edge.property("feel"));
    }

    @Test
    public void testValueListPropertyInTextFile()
           throws java.text.ParseException {
        ioUtil.write("vertex_person.txt", "jin\t29\tBeijing");
        ioUtil.write("vertex_software.txt", "tom\tChinese\t328");
        ioUtil.write("edge_use.txt",
                     "jin\ttom\t[4,1,5,6]\t[2019-05-02,2008-05-02]");

        String[] args = new String[]{
                "-f", structPath("value_list_property_in_text_file/struct.json"),
                "-s", configPath("value_list_property_in_text_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Edge> edges = CLIENT.graph().listEdges();
        Assert.assertEquals(1, edges.size());
        Edge edge = edges.get(0);

        Assert.assertEquals("person", edge.sourceLabel());
        Assert.assertEquals("software", edge.targetLabel());
        Assert.assertEquals(ImmutableList.of(4, 1, 5, 6),
                            edge.property("feel"));
        List<String> expectedTimes = ImmutableList.of(
                "2019-05-02 00:00:00.000",
                "2008-05-02 00:00:00.000"
        );
        assertDateEquals(expectedTimes, edge.property("time"));
    }

    @Test
    public void testValueSetPropertyInTextFile()
           throws java.text.ParseException {
        ioUtil.write("vertex_person.txt", "jin\t29\tBeijing");
        ioUtil.write("vertex_software.txt", "tom\tChinese\t328");
        ioUtil.write("edge_use.txt",
                     "jin\ttom\t[4,1,5,6]\t[2019-05-02,2008-05-02]");

        String[] args = new String[]{
                "-f", structPath("value_set_property_in_text_file/struct.json"),
                "-s", configPath("value_set_property_in_text_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Edge> edges = CLIENT.graph().listEdges();
        Assert.assertEquals(1, edges.size());
        Edge edge = edges.get(0);

        Assert.assertEquals("person", edge.sourceLabel());
        Assert.assertEquals("software", edge.targetLabel());
        Assert.assertEquals(ImmutableList.of(4, 1, 5, 6),
                            edge.property("feel"));
        Assert.assertEquals(ArrayList.class, edge.property("time").getClass());
        List<String> expectedTimes = ImmutableList.of(
                "2019-05-02 00:00:00.000",
                "2008-05-02 00:00:00.000"
        );
        assertDateEquals(expectedTimes, edge.property("time"));
    }

    @Test
    public void testValueListPropertyInTextFileWithElemDelimiter() {
        ioUtil.write("vertex_person.txt",
                     "marko\t29\t[Beijing;Hongkong;Wuhan]");

        String[] args = new String[]{
                "-f", structPath(
                "value_list_property_in_text_file_with_elem_delimiter/struct.json"),
                "-s", configPath(
                "value_list_property_in_text_file_with_elem_delimiter/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(1, vertices.size());
        Vertex vertex = vertices.get(0);

        Assert.assertEquals("marko", vertex.property("name"));
        Assert.assertEquals(29, vertex.property("age"));
        Assert.assertEquals(ImmutableList.of("Beijing", "Hongkong", "Wuhan"),
                            vertex.property("city"));
    }

    @Test
    public void testValueListPropertyInTextFileWithSymbols() {
        ioUtil.write("vertex_person.txt",
                     "marko\t29\t<Beijing,Hongkong,Wuhan}");
        ioUtil.write("vertex_software.txt",
                     "lop\tjava\t,[128,228,328],");

        String[] args = new String[]{
                "-f", structPath(
                "value_list_property_in_text_file_with_symbols/struct.json"),
                "-s", configPath(
                "value_list_property_in_text_file_with_symbols/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "-p", String.valueOf(PORT),
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(2, vertices.size());

        assertContains(vertices, "person", "name", "marko", "age", 29,
                       "city", ImmutableList.of("Beijing", "Hongkong", "Wuhan"));
        assertContains(vertices, "software", "name", "lop", "lang", "java",
                       "price", ImmutableList.of(128.0, 228.0, 328.0));
    }

    @Test
    public void testValueListPropertyInCSVFileWithSameDelimiter() {
        ioUtil.write("vertex_person.csv",
                     "marko,29,[Beijing,Hongkong,Wuhan]");

        String[] args = new String[]{
                "-f", structPath(
                "value_list_property_in_csv_file_with_same_delimiter/struct.json"),
                "-s", configPath(
                "value_list_property_in_csv_file_with_same_delimiter/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        // Invalid mapping file
        Assert.assertThrows(LoadException.class, () -> {
            new HugeGraphLoader(args);
        });
    }

    @Test
    public void testValueSetPorpertyInJsonFile() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,29,Beijing");
        ioUtil.write("vertex_software.csv", GBK,
                     "name,lang,price",
                     "lop,中文,328");
        ioUtil.write("edge_use.json",
                     "{\"person_name\": \"marko\", \"software_name\": " +
                     "\"lop\", \"time\": [\"20171210\", \"20180101\"]}");

        String[] args = new String[]{
                "-f", structPath("value_set_property_in_json_file/struct.json"),
                "-s", configPath("value_set_property_in_json_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Edge> edges = CLIENT.graph().listEdges();
        Assert.assertEquals(1, edges.size());
        Edge edge = edges.get(0);

        Assert.assertEquals("person", edge.sourceLabel());
        Assert.assertEquals("software", edge.targetLabel());
        /*
         * NOTE: Although the cardinality of the property is set in schema
         * declaration, client will deserialize it to list type in default.
         */
        List<String> props = (List<String>) edge.property("time");
        Assert.assertTrue(props.contains("20171210"));
        Assert.assertTrue(props.contains("20180101"));
    }

    @Test
    public void testLongProperty() {
        ioUtil.write("vertex_long_property.csv",
                     // trim space
                     "marko,29,Beijing, 11620311015184296736",
                     "vadas,27,Hongkong,11620311015184296737 ",
                     "josh,30,Wuhan,-1",
                     // unsigned long max value, will be parsed to -1
                     "lop,31,HongKong,18446744073709551615");

        String[] args = new String[]{
                "-f", structPath("long_property/struct.json"),
                "-s", configPath("long_property/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(4, vertices.size());
    }

    @Test
    public void testValidBooleanProperty() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city,isMale",
                     // trim space
                     "marko,29,Beijing, true",
                     "vadas,27,Hongkong,True ",
                     "jack,25,Beijing,1",
                     "tom,30,Beijing,yes",
                     "cindy,26,Beijing, False ",
                     "mary,31,Shanghai,FALSE  ",
                     "lucy,22,Beijing,0",
                     "lindy,23,Beijing,no");

        String[] args = new String[]{
                "-f", structPath("value_boolean_property_in_file/struct.json"),
                "-s", configPath("value_boolean_property_in_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(8, vertices.size());
    }

    @Test
    public void testInvalidBooleanProperty() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city,isMale",
                     "marko,29,Beijing,NotBoolean",
                     "vadas,27,Hongkong,666",
                     "tom,30,Beijing,T R U E");

        String[] args = new String[]{
                "-f", structPath("value_boolean_property_in_file/struct.json"),
                "-s", configPath("value_boolean_property_in_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        Assert.assertThrows(ParseException.class, () -> {
            loadWithAuth(args);
        });

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(0, vertices.size());
    }

    @Test
    public void testValidUUIDProperty() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city,no",
                     "marko,29,Beijing, 91b8dedb-bfb2-49be-a53a-1180338dfc7e ",
                     "vadas,27,Hongkong,5bfde4ca4e514e9291cd047becf0fd39");

        String[] args = new String[]{
                "-f", structPath("value_uuid_property_in_file/struct.json"),
                "-s", configPath("value_uuid_property_in_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(2, vertices.size());
    }

    @Test
    public void testInvalidUUIDProperty() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city,no",
                     "marko,29,Beijing,invalid uuid",
                     "vadas,27,Hongkong,5bfde4ca_4e51+4e92-91cd-047becf0fd39");

        String[] args = new String[]{
                "-f", structPath("value_uuid_property_in_file/struct.json"),
                "-s", configPath("value_uuid_property_in_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        Assert.assertThrows(ParseException.class, () -> {
            loadWithAuth(args);
        });

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(0, vertices.size());
    }

    @Test
    public void testCustomizedNumberId() {
        ioUtil.write("vertex_person_number_id.csv",
                     "1,marko,29,Beijing",
                     "2,vadas,27,Hongkong");
        ioUtil.write("edge_knows.csv", "1,2,20160110,0.5");

        String[] args = new String[]{
                "-f", structPath("customized_number_id/struct.json"),
                "-s", configPath("customized_number_id/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(2, vertices.size());

        List<Edge> edges = CLIENT.graph().listEdges();
        Assert.assertEquals(1, edges.size());
    }

    @Test
    public void testCustomizedLongId() {
        ioUtil.write("vertex_person_number_id.csv",
                     // trim space
                     " 11620311015184296736,marko,29,Beijing",
                     "11620311015184296737 ,vadas,27,Hongkong",
                     "-1, josh,30,Wuhan",
                     // unsigned long max value, will be parsed to -1
                     "18446744073709551615,lop,31,HongKong");

        String[] args = new String[]{
                "-f", structPath("customized_long_id/struct.json"),
                "-s", configPath("customized_long_id/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(3, vertices.size());
    }

    @Test
    public void testCustomizedUUID() {
        ioUtil.write("vertex_person_uuid.csv",
                     // trim space
                     " 70cc32db-d321-4914-8df3-1cc5828ce2e5,marko,29,Beijing",
                     "f2ab4ed4-97e8-4427-bd6b-a253369db125 ,vadas,27,Hongkong",
                     "34da417730614f30ab3775973a01cb9b, josh,30,Wuhan");

        String[] args = new String[]{
                "-f", structPath("customized_uuid/struct.json"),
                "-s", configPath("customized_uuid/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(3, vertices.size());
    }

    @Test
    public void testVertexJointPrimaryKeys() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,29,Beijing");

        String[] args = new String[]{
                "-f", structPath("vertex_joint_pks/struct.json"),
                "-s", configPath("vertex_joint_pks/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();

        Assert.assertEquals(1, vertices.size());
        Vertex vertex = vertices.get(0);

        Assert.assertTrue(vertex.id().toString().contains("marko!Beijing"));
        Assert.assertEquals("person", vertex.label());
        Assert.assertEquals("marko", vertex.property("name"));
        Assert.assertEquals(29, vertex.property("age"));
        Assert.assertEquals("Beijing", vertex.property("city"));
    }

    @Test
    public void testSelectedFields() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city,redundant",
                     "marko,29,Beijing,value1",
                     "vadas,27,Hongkong,value2");

        String[] args = new String[]{
                "-f", structPath("selected_fields/struct.json"),
                "-s", configPath("selected_fields/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(2, vertices.size());

        for (Vertex vertex : vertices) {
            Assert.assertEquals(3, vertex.properties().size());
            Assert.assertFalse(vertex.properties().containsKey("redundant"));
        }
    }

    @Test
    public void testIgnoredFields() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city,redundant",
                     "marko,29,Beijing,value1",
                     "vadas,27,Hongkong,value2");

        String[] args = new String[]{
                "-f", structPath("ignored_fields/struct.json"),
                "-s", configPath("ignored_fields/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(2, vertices.size());

        for (Vertex vertex : vertices) {
            Assert.assertEquals(3, vertex.properties().size());
            Assert.assertFalse(vertex.properties().containsKey("redundant"));
        }
    }

    @Test
    public void testSelectedAndIgnoredFields() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city,redundant",
                     "marko,29,Beijing,value1",
                     "vadas,27,Hongkong,value2");

        String[] args = new String[]{
                "-f", structPath("selected_and_ignored_fields/struct.json"),
                "-s", configPath("selected_and_ignored_fields/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        // Invalid mapping file
        Assert.assertThrows(LoadException.class, () -> {
            new HugeGraphLoader(args);
        });
    }

    @Test
    public void testIgnoreTailRedundantEmptyColumn() {
        // Has many redundant separator at the tail of line
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,29,Beijing,,,,");

        String[] args = new String[]{
                "-f", structPath("ignore_tail_redudant_empty_column/struct.json"),
                "-s", configPath("ignore_tail_redudant_empty_column/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(1, vertices.size());
        Vertex vertex = vertices.get(0);
        Assert.assertEquals(3, vertex.properties().size());
    }

    @Test
    public void testFillMissingColumnWithEmpty() {
        ioUtil.write("vertex_person.text",
                     "name|age|city",
                     "marko|29|",
                     "vadas|",
                     "josh");

        String[] args = new String[]{
                "-f", structPath("fill_missing_column_with_empty/struct.json"),
                "-s", configPath("fill_missing_column_with_empty/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(3, vertices.size());
    }

    @Test
    public void testIgnoreNullValueColumns() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,NULL,null",
                     "vadas,NULL,",
                     "josh,,null");

        String[] args = new String[]{
                "-f", structPath("ignore_null_value_columns/struct.json"),
                "-s", configPath("ignore_null_value_columns/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(3, vertices.size());

        for (Vertex vertex : vertices) {
            Assert.assertNull(vertex.property("age"));
            Assert.assertNull(vertex.property("city"));
        }
    }

    @Test
    public void testMappingIgnoreNullValueColumns() {
        ioUtil.write("vertex_person.csv",
                     "姓名,年龄,城市",
                     "marko,NULL,--",
                     "vadas,-,Hongkong",
                     "josh,30,null");

        String[] args = new String[]{
                "-f", structPath("mapping_ignore_null_value_columns/struct.json"),
                "-s", configPath("mapping_ignore_null_value_columns/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(3, vertices.size());

        for (Vertex vertex : vertices) {
            if (vertex.property("name").equals("marko")) {
                Assert.assertNull(vertex.property("age"));
                Assert.assertNull(vertex.property("city"));
            } else if (vertex.property("name").equals("vadas")) {
                Assert.assertNull(vertex.property("age"));
                Assert.assertEquals("Hongkong", vertex.property("city"));
            } else if (vertex.property("name").equals("josh")) {
                Assert.assertEquals(30, vertex.property("age"));
                Assert.assertNull(vertex.property("city"));
            }
        }
    }

    @Test
    public void testFileNoHeader() {
        ioUtil.write("vertex_person.csv",
                     "marko,29,Beijing");

        String[] args = new String[]{
                "-f", structPath("file_no_header/struct.json"),
                "-s", configPath("file_no_header/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        Assert.assertThrows(LoadException.class, () -> {
            loadWithAuth(args);
        });
    }

    @Test
    public void testMultiFilesHaveHeader() {
        ioUtil.write("vertex_dir/vertex_person_1.csv",
                     "name,age,city",
                     "marko,29,Beijing");
        ioUtil.write("vertex_dir/vertex_person_2.csv",
                     "name,age,city",
                     "vadas,27,Hongkong");

        String[] args = new String[]{
                "-f", structPath("multi_files_have_header/struct.json"),
                "-s", configPath("multi_files_have_header/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true",
                // FIXME: Set parser-threads to 1 because values > 1 currently trigger a NullPointerException (NPE).
                "--parser-threads", "1"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(2, vertices.size());
    }

    @Test
    public void testFileHasEmptyLine() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,29,#Beijing",
                     "",
                     "vadas,27,//Hongkong");

        String[] args = new String[]{
                "-f", structPath("file_has_empty_line/struct.json"),
                "-s", configPath("file_has_empty_line/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(2, vertices.size());
    }

    @Test
    public void testFileHasSkippedLineRegex() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "# This is a comment",
                     "marko,29,#Beijing",
                     "// This is also a comment",
                     "# This is still a comment",
                     "vadas,27,//Hongkong");

        String[] args = new String[]{
                "-f", structPath("file_has_skipped_line_regex/struct.json"),
                "-s", configPath("file_has_skipped_line_regex/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(2, vertices.size());
    }

    @Test
    public void testDirHasNoFile() {
        ioUtil.mkdirs("vertex_dir");
        String[] args = new String[]{
                "-f", structPath("dir_has_no_file/struct.json"),
                "-s", configPath("dir_has_no_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(0, vertices.size());
    }

    @Test
    public void testEmptyFileWithHeader() {
        ioUtil.write("vertex_person.csv");

        String[] args = new String[]{
                "-f", structPath("empty_file_with_header/struct.json"),
                "-s", configPath("empty_file_with_header/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(0, vertices.size());
    }

    @Test
    public void testEmptyFileWithoutHeader() {
        ioUtil.write("vertex_person.csv");

        String[] args = new String[]{
                "-f", structPath("empty_file_without_header/struct.json"),
                "-s", configPath("empty_file_without_header/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };

        Assert.assertThrows(LoadException.class, () -> {
            loadWithAuth(args);
        });
    }

    @Test
    public void testSpecifiedHeaderButIsEmpty() {
        ioUtil.write("vertex_person.csv",
                     "marko,29,Beijing");

        String[] args = new String[]{
                "-f", structPath("header_is_empty/struct.json"),
                "-s", configPath("header_is_empty/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        Assert.assertThrows(LoadException.class, () -> {
            new HugeGraphLoader(args);
        });
    }

    @Test
    public void testDirHasMultiFiles() {
        ioUtil.write("vertex_dir/vertex_person1.csv",
                     "marko,29,Beijing",
                     "vadas,27,Hongkong",
                     "josh,32,Beijing");
        ioUtil.write("vertex_dir/vertex_person2.csv",
                     "peter,35,Shanghai",
                     "\"li,nary\",26,\"Wu,han\"");
        ioUtil.write("vertex_dir/vertex_person3.csv");

        String[] args = new String[]{
                "-f", structPath("dir_has_multi_files/struct.json"),
                "-s", configPath("dir_has_multi_files/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true",
                // FIXME: Set parser-threads to 1 because values > 1 currently trigger a NullPointerException (NPE).
                "--parser-threads", "1"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(5, vertices.size());
    }

    @Test
    public void testMatchedDatePropertyAndFormat() {
        ioUtil.write("vertex_person_birth_date.csv",
                     "marko,1992-10-01,Beijing",
                     "vadas,2000-01-01,Hongkong");

        // DateFormat is yyyy-MM-dd
        String[] args = new String[]{
                "-f", structPath("matched_date_property_format/struct.json"),
                "-s", configPath("matched_date_property_format/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(2, vertices.size());
    }

    @Test
    public void testUnMatchedDatePropertyAndFormat() {
        ioUtil.write("vertex_person_birth_date.csv",
                     "marko,1992/10/01,Beijing",
                     "vadas,2000/01/01,Hongkong");

        // DateFormat is yyyy-MM-dd
        String[] args = new String[]{
                "-f", structPath("unmatched_date_property_format/struct.json"),
                "-s", configPath("unmatched_date_property_format/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        Assert.assertThrows(ParseException.class, () -> {
            loadWithAuth(args);
        });

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(0, vertices.size());
    }

    @Test
    public void testTimestampAsDateFormat() throws java.text.ParseException {
        long t1 = DateUtil.parse("1992-10-01", "yyyy-MM-dd").getTime();
        long t2 = DateUtil.parse("2000-01-01", "yyyy-MM-dd").getTime();
        ioUtil.write("vertex_person_birth_date.csv",
                     "marko," + t1 + ",Beijing",
                     "vadas," + t2 + ",Hongkong");

        // DateFormat is yyyy-MM-dd
        String[] args = new String[]{
                "-f", structPath("timestamp_as_dateformat/struct.json"),
                "-s", configPath("timestamp_as_dateformat/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(2, vertices.size());

        Vertex marko = vertices.get(0);
        assertDateEquals("1992-10-01 00:00:00.000", marko.property("birth"));

        Vertex vadas = vertices.get(1);
        assertDateEquals("2000-01-01 00:00:00.000", vadas.property("birth"));
    }

    @Test
    public void testDefaultTimeZoneGMT8() throws java.text.ParseException {
        ioUtil.write("vertex_person_birth_date.csv",
                     "marko,1992-10-01 12:00:00,Beijing",
                     "vadas,2000-01-01 13:00:00,Hongkong");

        String[] args = new String[]{
                "-f", structPath("default_timezone_gmt8/struct.json"),
                "-s", configPath("default_timezone_gmt8/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(2, vertices.size());

        Vertex marko = CLIENT.graph().getVertex("1:marko");
        assertDateEquals("1992-10-01 12:00:00.000", marko.property("birth"));

        Vertex vadas = CLIENT.graph().getVertex("1:vadas");
        assertDateEquals("2000-01-01 13:00:00.000", vadas.property("birth"));
    }

    @Test
    public void testCustomizedTimeZoneGMT0() throws java.text.ParseException {
        ioUtil.write("vertex_person_birth_date.csv",
                     "marko,1992-10-01 12:00:00,Beijing",
                     "vadas,2000-01-01 13:00:00,Hongkong");

        String[] args = new String[]{
                "-f", structPath("customized_timezone_gmt0/struct.json"),
                "-s", configPath("customized_timezone_gmt0/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(2, vertices.size());

        Vertex marko = CLIENT.graph().getVertex("1:marko");
        assertDateEquals("1992-10-01 20:00:00.000",
                         marko.property("birth"));

        Vertex vadas = CLIENT.graph().getVertex("1:vadas");
        assertDateEquals("2000-01-01 21:00:00.000",
                         vadas.property("birth"));
    }

    @Test
    public void testValueMapping() throws java.text.ParseException {
        /*
         * "age": {"1": 25, "2": 30}
         * "birth": {"1": "1994-01-01", "2": "1989-01-01"}
         * "city": "1": "Beijing", "2": "Shanghai"
         */
        ioUtil.write("vertex_person.csv",
                     "marko,1,1,1",
                     "vadas,2,2,2");

        String[] args = new String[]{
                "-f", structPath("value_mapping/struct.json"),
                "-s", configPath("value_mapping/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(2, vertices.size());

        Vertex marko, vadas;
        if (vertices.get(0).property("name").equals("marko")) {
            marko = vertices.get(0);
            vadas = vertices.get(1);
        } else {
            vadas = vertices.get(0);
            marko = vertices.get(1);
        }
        Assert.assertEquals(25, marko.property("age"));
        Assert.assertEquals("Beijing", marko.property("city"));
        assertDateEquals("1994-01-01 00:00:00.000", marko.property("birth"));

        Assert.assertEquals(30, vadas.property("age"));
        Assert.assertEquals("Shanghai", vadas.property("city"));
        assertDateEquals("1989-01-01 00:00:00.000", vadas.property("birth"));
    }

    @Test
    public void testPkValueMapping() {
        /*
         * "1": "marko"
         * "2": "vadas"
         */
        ioUtil.write("vertex_person.csv",
                     "1,29,Beijing",
                     "2,27,Shanghai");

        String[] args = new String[]{
                "-f", structPath("pk_value_mapping/struct.json"),
                "-s", configPath("pk_value_mapping/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(2, vertices.size());

        assertContains(vertices, "person", "name", "marko", "age", 29,
                       "city", "Beijing");
        assertContains(vertices, "person", "name", "vadas", "age", 27,
                       "city", "Shanghai");
    }

    @Test
    public void testSourceTargetValueMapping() {
        ioUtil.write("vertex_person.csv",
                     "id,name,age,city",
                     "p1,marko,29,Beijing",
                     "p2,vadas,27,Hongkong");
        ioUtil.write("vertex_software.csv",
                     "id,name,lang,price",
                     "s1,lop,java,328",
                     "s2,ripple,java,199");
        ioUtil.write("edge_created.csv",
                     "source_id,target_id,weight",
                     "p1,s1,0.8",
                     "p2,s2,0.6");

        String[] args = new String[]{
                "-f", structPath("source_target_value_mapping/struct.json"),
                "-s", configPath("source_target_value_mapping/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        List<Edge> edges = CLIENT.graph().listEdges();

        Assert.assertEquals(4, vertices.size());
        Assert.assertEquals(2, edges.size());

        assertContains(edges, "created", "person_marko", "software_lop",
                       "person", "software", "weight", 0.8);
        assertContains(edges, "created", "person_vadas", "software_ripple",
                       "person", "software", "weight", 0.6);
    }

    @Test
    public void testValueMappingInJsonFile() {
        // 1(Integer) and "1"(String) are both mapping
        ioUtil.write("vertex_person.json",
                     "{\"name\": \"marko\", \"age\": 29, \"city\": 1}",
                     "{\"name\": \"vadas\", \"age\": 27, \"city\": \"1\"}");

        String[] args = new String[]{
                "-f", structPath("value_mapping_in_json_file/struct.json"),
                "-s", configPath("value_mapping_in_json_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(2, vertices.size());
        assertContains(vertices, "person", "name", "marko",
                       "age", 29, "city", "Beijing");
        assertContains(vertices, "person", "name", "vadas",
                       "age", 27, "city", "Beijing");
    }

    @Test
    public void testFilterFileBySuffix() {
        // Allowed file suffix is [".csv"]
        ioUtil.write("vertex_person.dat",
                     "name,age,city",
                     "marko,29,Beijing",
                     "vadas,27,Hongkong");

        String[] args = new String[]{
                "-f", structPath("filter_file_by_suffix/struct.json"),
                "-s", configPath("filter_file_by_suffix/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true"
        };
        Assert.assertThrows(LoadException.class, () -> {
            loadWithAuth(args);
        });
    }

    @Test
    public void testFilterPathBySuffix() {
        ioUtil.write("vertex_dir/vertex_person.csv",
                     "name,age,city",
                     "marko,29,Beijing",
                     "vadas,27,Hongkong");
        ioUtil.write("vertex_dir/vertex_person.dat",
                     "name,age,city",
                     "marko1,29,Beijing",
                     "vadas1,27,Hongkong");

        String[] args = new String[]{
                "-f", structPath("filter_path_by_suffix/struct.json"),
                "-s", configPath("filter_path_by_suffix/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--test-mode", "true",
                // FIXME: Set parser-threads to 1 because values > 1 currently trigger a NullPointerException (NPE).
                "--parser-threads", "1"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(2, vertices.size());
    }

    @Test
    public void testGZipCompressFile() {
        ioUtil.write("vertex_person.gz", Compression.GZIP,
                     "name,age,city",
                     "marko,29,Beijing");

        String[] args = new String[]{
                "-f", structPath("gzip_compress_file/struct.json"),
                "-s", configPath("gzip_compress_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(1, vertices.size());
    }

    @Test
    public void testBZ2CompressFile() {
        ioUtil.write("vertex_person.bz2", Compression.BZ2,
                     "name,age,city",
                     "marko,29,Beijing");

        String[] args = new String[]{
                "-f", structPath("bz2_compress_file/struct.json"),
                "-s", configPath("bz2_compress_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(1, vertices.size());
    }

    @Test
    public void testXZCompressFile() {
        ioUtil.write("vertex_person.xz", Compression.XZ,
                     "name,age,city",
                     "marko,29,Beijing");

        String[] args = new String[]{
                "-f", structPath("xz_compress_file/struct.json"),
                "-s", configPath("xz_compress_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(1, vertices.size());
    }

    @Test
    public void testLZMACompressFile() {
        ioUtil.write("vertex_person.lzma", Compression.LZMA,
                     "name,age,city",
                     "marko,29,Beijing");

        String[] args = new String[]{
                "-f", structPath("lzma_compress_file/struct.json"),
                "-s", configPath("lzma_compress_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(1, vertices.size());
    }

//    @Test
    public void testSnappyRawCompressFile() {
        ioUtil.write("vertex_person.snappy", Compression.SNAPPY_RAW,
                     "name,age,city",
                     "marko,29,Beijing");

        String[] args = new String[]{
                "-f", structPath("snappy_raw_compress_file/struct.json"),
                "-s", configPath("snappy_raw_compress_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(1, vertices.size());
    }

    @Test
    public void testSnappyFramedCompressFile() {
        ioUtil.write("vertex_person.snappy", Compression.SNAPPY_FRAMED,
                     "name,age,city",
                     "marko,29,Beijing");

        String[] args = new String[]{
                "-f", structPath("snappy_framed_compress_file/struct.json"),
                "-s", configPath("snappy_framed_compress_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(1, vertices.size());
    }

    /**
     * Didn't find a way to generate the compression file using code
     */
    //@Test
    public void testZCompressFile() {
        ioUtil.write("vertex_person.z", Compression.Z,
                     "name,age,city",
                     "marko,29,Beijing");

        String[] args = new String[]{
                "-f", structPath("z_compress_file/struct.json"),
                "-s", configPath("z_compress_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(1, vertices.size());
    }

    @Test
    public void testDeflateCompressFile() {
        ioUtil.write("vertex_person.deflate", Compression.DEFLATE,
                     "name,age,city",
                     "marko,29,Beijing");

        String[] args = new String[]{
                "-f", structPath("deflate_compress_file/struct.json"),
                "-s", configPath("deflate_compress_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(1, vertices.size());
    }

    @Test
    public void testLZ4BlockCompressFile() {
        ioUtil.write("vertex_person.lz4", Compression.LZ4_BLOCK,
                     "name,age,city",
                     "marko,29,Beijing");

        String[] args = new String[]{
                "-f", structPath("lz4_block_compress_file/struct.json"),
                "-s", configPath("lz4_block_compress_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(1, vertices.size());
    }

    @Test
    public void testLZ4FramedCompressFile() {
        ioUtil.write("vertex_person.lz4", Compression.LZ4_FRAMED,
                     "name,age,city",
                     "marko,29,Beijing");

        String[] args = new String[]{
                "-f", structPath("lz4_framed_compress_file/struct.json"),
                "-s", configPath("lz4_framed_compress_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(1, vertices.size());
    }

    @Test
    public void testParserNotThrowException() {
        // Here are 2 parse errors, and expect no exception thrown
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "p1,marko,22,Beijing",
                     "tom,24,Hongkong",
                     "jerry,18");

        String[] args = new String[]{
                "-f", structPath("too_few_columns/struct.json"),
                "-s", configPath("too_few_columns/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--max-parse-errors", "3"
        };
        loadWithAuth(args);
    }

    @Test
    public void testParserV2() {
        ioUtil.write("vertex_person.csv",
                "name,age,city",
                "tom,24,Hongkong",
                "jerry,18");

        String[] args = new String[]{
                "-f", structPath("mapping_v2/struct.json"),
                "-s", configPath("mapping_v2/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "-p", String.valueOf(PORT),
                "--batch-insert-threads", "2",
                "--max-parse-errors", "1"
        };
        loadWithAuth(args);
    }

    @Test
    public void testBatchUpdateElement() {
        ioUtil.write("vertex_person.txt",
                     "tom\t18\t[str1,str2]",
                     "tom\t25\t[str1,str3]");
        ioUtil.write("edge_likes.txt",
                     "tom\ttom\t1\t[3,4]",
                     "tom\ttom\t2\t[1,2,3]");

        String[] args = new String[]{
                "-f", structPath("update_by_strategy/struct.json"),
                "-s", configPath("update_by_strategy/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--check-vertex", "false"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        List<Edge> edges = CLIENT.graph().listEdges();

        Assert.assertEquals(1, vertices.size());
        Assert.assertEquals(18, vertices.get(0).property("age"));
        Assert.assertEquals(3, ((List<?>) vertices.get(0).property("set")).size());

        Assert.assertEquals(1, edges.size());
        Assert.assertEquals(3, edges.get(0).property("age"));
        Assert.assertEquals(ImmutableList.of(3, 4, 1, 2, 3), edges.get(0).property("list"));
    }

    @Test
    public void testBatchUpdateElementWithoutSymbol() {
        ioUtil.write("vertex_person.txt",
                     "tom\t18\tstr1",
                     "tom\t19\tstr2",
                     "tom\t20\tstr1",
                     "tom\t21\tstr3");
        ioUtil.write("edge_likes.txt",
                     "tom\ttom\t1\t3",
                     "tom\ttom\t1\t4",
                     "tom\ttom\t2\t1",
                     "tom\ttom\t2\t2",
                     "tom\ttom\t2\t3");

        String[] args = new String[]{
                "-f", structPath(
                "update_by_strategy_without_symbol/struct.json"),
                "-s", configPath(
                "update_by_strategy_without_symbol/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--check-vertex", "false"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        List<Edge> edges = CLIENT.graph().listEdges();

        Assert.assertEquals(1, vertices.size());
        Assert.assertEquals(18, vertices.get(0).property("age"));
        Assert.assertEquals(3, ((List<?>) vertices.get(0).property("set")).size());

        Assert.assertEquals(1, edges.size());
        Assert.assertEquals(8, edges.get(0).property("age"));
        Assert.assertEquals(ImmutableList.of(3, 4, 1, 2, 3),
                            edges.get(0).property("list"));
    }

    @Test
    public void testBatchUpdateElementWithoutSymbolNoListFormat() {
        ioUtil.write("vertex_person.txt",
                     "tom\t18\tstr1",
                     "tom\t19\tstr2",
                     "tom\t20\tstr1",
                     "tom\t21\tstr3");
        ioUtil.write("edge_likes.txt",
                     "tom\ttom\t1\t3",
                     "tom\ttom\t1\t4",
                     "tom\ttom\t2\t1",
                     "tom\ttom\t2\t2",
                     "tom\ttom\t2\t3");

        String[] args = new String[]{
                "-f", structPath(
                "update_by_strategy_without_symbol/no_list_format_struct.json"),
                "-s", configPath(
                "update_by_strategy_without_symbol/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--check-vertex", "false",
                "--test-mode", "true"
        };
        Assert.assertThrows(ParseException.class, () -> {
            loadWithAuth(args);
        });

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(0, vertices.size());
        List<Edge> edges = CLIENT.graph().listEdges();
        Assert.assertEquals(0, edges.size());
    }

    @Test
    public void testBatchUpdateEdgeWithVertexCheck() {
        ioUtil.write("vertex_person.txt",
                     "tom\t18\t[str1,str2]",
                     "tom\t25\t[str1,str3]");
        ioUtil.write("edge_likes.txt",
                     "tom\ttom\t3\t[-1,0]",
                     "jin\ttom\t1\t[3,4]",
                     "tom\ttom\t2\t[1,2,3]");

        String[] args = new String[]{
                "-f", structPath("update_by_strategy/struct.json"),
                "-s", configPath("update_by_strategy/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--check-vertex", "true"
        };
        loadWithAuth(args);

        List<Edge> edges = CLIENT.graph().listEdges();

        Assert.assertEquals(1, edges.size());
        Assert.assertEquals(5, edges.get(0).property("age"));
        Assert.assertEquals(ImmutableList.of(-1, 0, 1, 2, 3),
                            edges.get(0).property("list"));
    }

    @Test
    public void testBatchUpdateElementWithInvalidStrategy() {
        ioUtil.write("vertex_person.txt",
                     "tom\t18\t[str1,str2]",
                     "tom\t25\t[str1,str3]");

        String[] args = new String[]{
                "-f", structPath("update_by_strategy/" +
                                 "invalid_strategy_struct.json"),
                "-s", configPath("update_by_strategy/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        // Invalid Enum value when parse json
        Assert.assertThrows(Exception.class, () -> {
            new HugeGraphLoader(args);
        });
    }

    @Test
    public void testLoadIncrementalModeAndLoadFailure()
           throws IOException, InterruptedException {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,应该是数字,Beijing",
                     "vadas,27,Hongkong",
                     "josh,32,Beijing",
                     "peter,35,Shanghai",
                     "\"li,nary\",26,\"Wu,han\"");
        ioUtil.write("vertex_software.csv", GBK,
                     "name,lang,price",
                     "office,C#,999",
                     "lop,java,应该是数字",
                     "ripple,java,199");

        // 1st time
        List<String> argsList = new ArrayList<>(Arrays.asList(
                "-f",
                structPath("incremental_mode_and_load_failure/struct.json"),
                "-s",
                configPath("incremental_mode_and_load_failure/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--max-parse-errors", "1",
                "--test-mode", "false",
                "--parser-threads", "1"
        ));
        argsList.addAll(Arrays.asList("--username", "admin", "--password", "pa"));

        HugeGraphLoader loader = new HugeGraphLoader(argsList.toArray(new String[0]));
        loader.load();
        loader.shutdown();
        LoadContext context = Whitebox.getInternalState(loader, "context");

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(4, vertices.size());

        Map<String, InputProgress> inputProgressMap = context.newProgress()
                                                             .inputProgress();
        Assert.assertEquals(1, inputProgressMap.size());
        inputProgressMap.forEach((id, inputProgress) -> {
            if (id.equals("1")) {
                Collection<InputItemProgress> loadedItems =
                        inputProgress.loadedItems().values();
                Assert.assertEquals(1, loadedItems.size());

                InputItemProgress loadedItem = loadedItems.iterator().next();
                Assert.assertTrue(loadedItem instanceof FileItemProgress);
                FileItemProgress fileItem = (FileItemProgress) loadedItem;
                Assert.assertEquals("vertex_person.csv", fileItem.name());
                // Reached last line: "li,nary",26,"Wu,han"
                Assert.assertEquals(6, fileItem.offset());
            }
        });

        File structDir = FileUtils.getFile(structPath(
                "incremental_mode_and_load_failure/struct"));
        File failureDataDir = FileUtils.getFile(structPath(
                "incremental_mode_and_load_failure/struct/failure-data/"));
        File[] files = failureDataDir.listFiles();
        assert files != null;
        Arrays.sort(files, Comparator.comparing(File::getName));
        Assert.assertNotNull(files);
        //Assert.assertEquals(2, files.length);

        File personFailureFile = files[0];
        List<String> personFailureLines = FileUtils.readLines(personFailureFile,
                                                              Constants.CHARSET);
        Assert.assertEquals(2, personFailureLines.size());
        Assert.assertEquals("marko,应该是数字,Beijing",
                            personFailureLines.get(1));

        // 2nd time, incremental-mode
        argsList = new ArrayList<>(Arrays.asList(
                "-f",
                structPath("incremental_mode_and_load_failure/struct.json"),
                "-g", GRAPH,
                "-h", SERVER,
                "--incremental-mode", "true",
                "--failure-mode", "false",
                "--batch-insert-threads", "2",
                "--max-parse-errors", "2",
                "--test-mode", "false"
        ));
        argsList.addAll(Arrays.asList("--username", "admin", "--password", "pa"));

        loader = new HugeGraphLoader(argsList.toArray(new String[0]));
        loader.load();
        loader.shutdown();
        context = Whitebox.getInternalState(loader, "context");

        vertices = CLIENT.graph().listVertices();
        // ripple,java,199 has been loaded
        Assert.assertEquals(6, vertices.size());

        inputProgressMap = context.newProgress().inputProgress();
        Assert.assertEquals(2, inputProgressMap.size());
        inputProgressMap.forEach((id, inputProgress) -> {
            if (id.equals("1")) {
                Collection<InputItemProgress> loadedItems =
                        inputProgress.loadedItems().values();
                Assert.assertEquals(1, loadedItems.size());

                InputItemProgress loadedItem = loadedItems.iterator().next();
                Assert.assertTrue(loadedItem instanceof FileItemProgress);
                FileItemProgress fileItem = (FileItemProgress) loadedItem;
                Assert.assertEquals("vertex_person.csv", fileItem.name());
                // Reached last line: "li,nary",26,"Wu,han"
                Assert.assertEquals(6, fileItem.offset());
            } else if (id.equals("2")) {
                Collection<InputItemProgress> loadedItems =
                        inputProgress.loadedItems().values();
                Assert.assertEquals(1, loadedItems.size());

                InputItemProgress loadedItem = loadedItems.iterator().next();
                Assert.assertTrue(loadedItem instanceof FileItemProgress);
                FileItemProgress fileItem = (FileItemProgress) loadedItem;
                Assert.assertEquals("vertex_software.csv", fileItem.name());
                // Reached last line: "ripple,java,199"
                Assert.assertEquals(4, fileItem.offset());
            }
        });

        Thread.sleep(1000);
        files = failureDataDir.listFiles();
        assert files != null;
        Arrays.sort(files, Comparator.comparing(File::getName));
        Assert.assertNotNull(files);
        Assert.assertEquals(4, files.length);

        personFailureFile = files[0];
        personFailureLines = FileUtils.readLines(personFailureFile,
                                                 Constants.CHARSET);
        Assert.assertEquals(2, personFailureLines.size());
        Assert.assertEquals("marko,应该是数字,Beijing",
                            personFailureLines.get(1));

        File softwareFailureFile = files[2];
        List<String> softwareFailureLines = FileUtils.readLines(
                                            softwareFailureFile, GBK);
        Assert.assertEquals(2, softwareFailureLines.size());
        Assert.assertEquals("lop,java,应该是数字", softwareFailureLines.get(1));

        // TODO: Change only one line first, and make the second line go wrong
        // modify person and software failure file
        personFailureLines.remove(1);
        personFailureLines.add("marko,29,Beijing");
        FileUtils.writeLines(personFailureFile, personFailureLines, false);
        // modify software failure file
        softwareFailureLines.remove(1);
        softwareFailureLines.add("lop,java,328");
        FileUtils.writeLines(softwareFailureFile, softwareFailureLines, false);

        // 3rd time, --failure-mode
        argsList = new ArrayList<>(Arrays.asList(
                "-f",
                structPath("incremental_mode_and_load_failure/struct.json"),
                "-g", GRAPH,
                "-h", SERVER,
                "--incremental-mode", "false",
                "--failure-mode", "true",
                "--batch-insert-threads", "2",
                "--max-parse-errors", "2",
                "--test-mode", "false"
        ));
        argsList.addAll(Arrays.asList("--username", "admin", "--password", "pa"));
        loader = new HugeGraphLoader(argsList.toArray(new String[0]));
        loader.load();
        loader.shutdown();
        context = Whitebox.getInternalState(loader, "context");

        vertices = CLIENT.graph().listVertices();
        // marko,29,Beijing has been loaded
        Assert.assertEquals(8, vertices.size());

        inputProgressMap = context.newProgress().inputProgress();
        Assert.assertEquals(2, inputProgressMap.size());
        inputProgressMap.forEach((id, inputProgress) -> {
            if (id.equals("1")) {
                Collection<InputItemProgress> loadedItems =
                        inputProgress.loadedItems().values();
                Assert.assertEquals(1, loadedItems.size());

                InputItemProgress loadedItem = loadedItems.iterator().next();
                Assert.assertTrue(loadedItem instanceof FileItemProgress);
                FileItemProgress fileItem = (FileItemProgress) loadedItem;
                Assert.assertEquals(2, fileItem.offset());
            } else if (id.equals("2")) {
                Collection<InputItemProgress> loadedItems =
                        inputProgress.loadedItems().values();
                Assert.assertEquals(1, loadedItems.size());

                InputItemProgress loadedItem = loadedItems.iterator().next();
                Assert.assertTrue(loadedItem instanceof FileItemProgress);
                FileItemProgress fileItem = (FileItemProgress) loadedItem;
                Assert.assertEquals(2, fileItem.offset());
            }
        });

        FileUtils.forceDeleteOnExit(structDir);
    }

    @Test
    public void testReloadJsonFailureFiles() throws IOException,
                                                    InterruptedException {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,29,Beijing",
                     "vadas,27,Hongkong",
                     "tom,28,Wuhan");
        ioUtil.write("edge_knows.json",
                     "{\"source_name\": \"marko\", \"target_name\": " +
                     "\"vadas\", \"date\": \"2016-01-10 12:00:00\"," +
                     "\"weight\": 0.5}",
                     // unexisted source and target vertex
                     "{\"source_name\": \"marko1\", \"target_name\": " +
                     "\"vadas1\", \"date\": \"2013-02-20 13:00:00\"," +
                     "\"weight\": 1.0}");

        List<String> argsList = new ArrayList<>(Arrays.asList(
                "-f", structPath("reload_json_failure_files/struct.json"),
                "-s", configPath("reload_json_failure_files/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--check-vertex", "true",
                "--batch-insert-threads", "2",
                "--test-mode", "false",
                "--parser-threads", "1"
        ));
        argsList.addAll(Arrays.asList("--username", "admin", "--password", "pa"));
        HugeGraphLoader loader = new HugeGraphLoader(argsList.toArray(new String[0]));
        loader.load();
        loader.shutdown();
        LoadContext context = Whitebox.getInternalState(loader, "context");

        List<Edge> edges = CLIENT.graph().listEdges();
        Assert.assertEquals(1, edges.size());

        Map<String, InputProgress> inputProgressMap = context.newProgress()
                                                             .inputProgress();
        Assert.assertEquals(2, inputProgressMap.size());
        Assert.assertEquals(ImmutableSet.of("1", "2"),
                            inputProgressMap.keySet());
        inputProgressMap.forEach((id, value) -> {
            if (id.equals("2")) {
                // The error line is exactly last line
                Collection<InputItemProgress> loadedItems =
                        value.loadedItems().values();
                Assert.assertEquals(1, loadedItems.size());

                InputItemProgress loadedItem = loadedItems.iterator().next();
                FileItemProgress fileItem = (FileItemProgress) loadedItem;
                Assert.assertEquals("edge_knows.json", fileItem.name());
                Assert.assertEquals(2, fileItem.offset());
            }
        });

        // Load failure data without modification
        argsList = new ArrayList<>(Arrays.asList(
                "-f", structPath("reload_json_failure_files/struct.json"),
                "-g", GRAPH,
                "-h", SERVER,
                "--failure-mode", "true",
                "--check-vertex", "true",
                "--batch-insert-threads", "2",
                "--test-mode", "false"
        ));
        argsList.addAll(Arrays.asList("--username", "admin", "--password", "pa"));
        loader = new HugeGraphLoader(argsList.toArray(new String[0]));
        loader.load();
        loader.shutdown();

        // Reload with modification
        File structDir = FileUtils.getFile(structPath(
                         "reload_json_failure_files/struct"));
        File failureDir = FileUtils.getFile(structPath(
                          "reload_json_failure_files/struct/failure-data/"));
        File[] files = failureDir.listFiles();
        assert files != null;
        Arrays.sort(files, Comparator.comparing(File::getName));
        Assert.assertNotNull(files);
        Assert.assertEquals(1, files.length);

        File knowsFailureFile = files[0];
        List<String> failureLines = FileUtils.readLines(knowsFailureFile,
                                                        Constants.CHARSET);
        Assert.assertEquals(2, failureLines.size());
        Assert.assertEquals("{\"source_name\": \"marko1\", \"target_name\": " +
                            "\"vadas1\", \"date\": \"2013-02-20 13:00:00\"," +
                            "\"weight\": 1.0}",
                            failureLines.get(1));

        failureLines.remove(1);
        failureLines.add("{\"source_name\": \"marko\", \"target_name\": " +
                         "\"tom\", \"date\": \"2013-02-20 13:00:00\"," +
                         "\"weight\": 1.0}");
        FileUtils.writeLines(knowsFailureFile, failureLines, false);

        // No exception throw, and error line doesn't exist
        loader = new HugeGraphLoader(argsList.toArray(new String[0]));
        loader.load();
        loader.shutdown();

        edges = CLIENT.graph().listEdges();
        Assert.assertEquals(2, edges.size());

        FileUtils.forceDeleteOnExit(structDir);
    }

    @Test
    public void testSingleInsertEdgeWithCheckVertexFalse() {
        // The source and target vertex doesn't exist
        ioUtil.write("edge_knows.csv",
                     "source_name,target_name,date,weight",
                     "marko,vadas,20160110,0.5",
                     "marko,josh,20130220,1.0");
        ioUtil.write("edge_created.csv",
                     "source_name,target_name,date,weight",
                     "marko,lop,20171210,0.4",
                     "josh,lop,20091111,0.4",
                     "josh,ripple,20171210,1.0",
                     "peter,lop,20170324,0.2");

        String[] args = new String[]{
                "-f",
                structPath("single_insert_edge_with_check_vertex_false/struct.json"),
                "-s",
                configPath("single_insert_edge_with_check_vertex_false/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--check-vertex", "false",
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        List<Edge> edges = CLIENT.graph().listEdges();

        Assert.assertEquals(0, vertices.size());
        Assert.assertEquals(6, edges.size());

        edges.forEach(edge -> {
            Assert.assertThrows(ServerException.class, () -> {
                CLIENT.graph().getVertex(edge.sourceId());
            }, e -> {
                ServerException se = (ServerException) e;
                Assert.assertTrue(se.exception().contains("NotFoundException"));
            });
            Assert.assertThrows(ServerException.class, () -> {
                CLIENT.graph().getVertex(edge.targetId());
            }, e -> {
                ServerException se = (ServerException) e;
                Assert.assertTrue(se.exception().contains("NotFoundException"));
            });
        });
    }

    @Test
    public void testOrcCompressFile() throws java.text.ParseException {
        // TODO: add test for blob and uuid
        TypeInfo typeInfo = TypeInfoUtils.getTypeInfoFromTypeString(
                "struct<" +
                "name:string," +
                "p_boolean:boolean," +
                "p_byte:tinyint," +
                "p_int:int," +
                "p_long:bigint," +
                "p_float:float," +
                "p_double:double," +
                "p_string:string," +
                "p_date:date" +
                ">");

        Date nowDate = Date.valueOf("2019-12-09");
        ioUtil.writeOrc("vertex_person.orc", typeInfo,
                        "marko", true, (byte) 1, 2, 3L,
                        4.0F, 5.0D, "marko", nowDate);
        String[] args = new String[]{
                "-f", structPath("orc_compress_file/struct.json"),
                "-s", configPath("orc_compress_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(1, vertices.size());

        Vertex vertex = vertices.get(0);
        Assert.assertEquals(true, vertex.property("p_boolean"));
        Assert.assertEquals(1, vertex.property("p_byte"));
        Assert.assertEquals(2, vertex.property("p_int"));
        Assert.assertEquals(3, vertex.property("p_long"));
        Assert.assertEquals(4.0D, vertex.property("p_float"));
        Assert.assertEquals(5.0D, vertex.property("p_double"));
        Assert.assertEquals("marko", vertex.property("p_string"));
        assertDateEquals("2019-12-09 00:00:00.000", vertex.property("p_date"));
    }

    @Test
    public void testParquetCompressFile() {
        /*
         * The content of origin vertex_person file is
         * marko,28,[Beijing;Shanghai]
         * vadas,27,Hongkong
         * josh,18,Beijing
         * peter,35,Shanghai
         * "linary",26,"Wuhan"
         */
        String[] args = new String[]{
                "-f", structPath("parquet_compress_file/struct.json"),
                "-s", configPath("parquet_compress_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        String path = configPath("parquet_compress_file/vertex_person.parquet");
        CommonUtil.downloadFileByUrl(CommonUtil.PREFIX + "vertex_person.parquet", path);
        if (this.ioUtil instanceof HDFSUtil) {
            HDFSUtil hdfsUtil = (HDFSUtil) this.ioUtil;
            CommonUtil.downloadFileByUrl(CommonUtil.PREFIX + "vertex_person.parquet",
                                         "src/test/resources/parquet_compress_file/vertex_person.parquet");
            hdfsUtil.copy(path, "hdfs://localhost:8020/files/vertex_person.parquet");
        }
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(5, vertices.size());
    }

    @Test
    public void testNumberAndDatePrimaryKeysEncoded() {
        ioUtil.write("vertex_person.csv",
                     "id,name,age,city",
                     "100,marko,29,Beijing");
        ioUtil.write("vertex_software.csv",
                     "date,name,lang,price",
                     "2000-02-01,lop,java,328");
        ioUtil.write("edge_created.csv",
                     "source_id,target_date,date,weight",
                     "100,2000-02-01,2017-12-10,0.4");

        String[] args = new String[]{
                "-f", structPath("number_and_date_pks_encoded/struct.json"),
                "-s", configPath("number_and_date_pks_encoded/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        List<Edge> edges = CLIENT.graph().listEdges();

        Assert.assertEquals(2, vertices.size());
        Assert.assertEquals(1, edges.size());

        Vertex v1 = CLIENT.graph().listVertices("person").get(0);
        Vertex v2 = CLIENT.graph().listVertices("software").get(0);
        Edge e = edges.get(0);

        String v1Id = String.format("%s:%s", 1, LongEncoding.encodeNumber(100));
        java.util.Date date = DateUtil.parse("2000-02-01", "yyyy-MM-dd");
        String v2Id = String.format("%s:%s", 2, LongEncoding.encodeNumber(date));
        String eId = String.format("S1:%s>1>1>>S2:%s",
                                   LongEncoding.encodeNumber(100),
                                   LongEncoding.encodeNumber(date));
        Assert.assertEquals(v1Id, v1.id());
        Assert.assertEquals(v2Id, v2.id());
        Assert.assertEquals(eId, e.id());
    }

    @Test
    public void testVertexPrimaryValueNull() {
        ioUtil.write("vertex_person.csv",
                     "p_name,age,city",
                     "marko,29,Beijing",
                     "vadas,27,Hongkong",
                     "josh,32,Beijing",
                     "peter,35,Shanghai",
                     "\"li,nary\",26,\"Wu,han\"");
        String[] args = new String[]{
                "-f", structPath("vertex_pk_value_null/struct.json"),
                "-s", configPath("vertex_pk_value_null/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        Assert.assertThrows(ParseException.class, () -> {
            loadWithAuth(args);
        }, e -> {
            String msgSuffix = "check whether the headers or field_mapping " +
                               "are configured correctly";
            Assert.assertTrue(e.getMessage().endsWith(msgSuffix));
        });

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(0, vertices.size());
    }

    @Test
    public void testSourceOrTargetPrimaryValueNull() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,29,Beijing",
                     "vadas,27,Hongkong",
                     "josh,32,Beijing",
                     "peter,35,Shanghai",
                     "\"li,nary\",26,\"Wu,han\"");
        ioUtil.write("vertex_software.csv", GBK,
                     "name,lang,price",
                     "lop,java,328",
                     "ripple,java,199");
        ioUtil.write("edge_created.csv",
                     "source_name,target_name,date,weight",
                     "marko,lop,20171210,0.4",
                     "josh,lop,20091111,0.4",
                     "josh,ripple,20171210,1.0",
                     "peter,lop,20170324,0.2");

        List<String> argsList = new ArrayList<>(Arrays.asList(
                "-f", structPath("source_or_target_pk_value_null/struct.json"),
                "-s", configPath("source_or_target_pk_value_null/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true",
                "--parser-threads", "1"
        ));

        argsList.addAll(Arrays.asList("--username", "admin", "--password", "pa"));
        AsyncThrowsAssert.assertThrows(RuntimeException.class, () -> {
            HugeGraphLoader loader = new HugeGraphLoader(argsList.toArray(new String[0]));
            try {
                loader.load();
            } finally {
                loader.shutdown();
            }
        }, e -> {
            String msgSuffix = "check whether the headers or field_mapping " +
                               "are configured correctly";
            Assert.assertTrue(e.getMessage().endsWith(msgSuffix));
        });
        List<Vertex> vertices = CLIENT.graph().listVertices();
        List<Edge> edges = CLIENT.graph().listEdges();
        Assert.assertEquals(7, vertices.size());
        Assert.assertEquals(0, edges.size());
    }

    @Test
    public void testVertexPrimaryValueEmpty() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     ",29,Beijing",     // name is empty
                     "vadas,27,Hongkong",
                     "josh,,Beijing",   // age is empty
                     "peter,35,Shanghai",
                     "\"li,nary\",26,\"Wu,han\"");
        String[] args = new String[]{
                "-f", structPath("vertex_pk_value_empty/struct.json"),
                "-s", configPath("vertex_pk_value_empty/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(3, vertices.size());
    }

    @Test
    public void testSourceOrTargetPrimaryValueEmpty() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     ",29,Beijing",                 // name is empty
                     "vadas,27,Hongkong",
                     "josh,,Beijing",               // age is empty
                     "peter,35,Shanghai",
                     "\"li,nary\",26,\"Wu,han\"");
        ioUtil.write("vertex_software.csv", GBK,
                     "name,lang,price",
                     "lop,java,328",
                     "ripple,java,199");
        ioUtil.write("edge_created.csv",
                     "source_name,source_age,target_name,date,weight",
                     ",29,lop,20171210,0.4",        // name is empty
                     "josh,,lop,20091111,0.4",      // age is empty
                     "josh,,ripple,20171210,1.0",   // age is empty
                     "peter,35,lop,20170324,0.2");

        String[] args = new String[]{
                "-f", structPath("source_or_target_pk_value_empty/struct.json"),
                "-s", configPath("source_or_target_pk_value_empty/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        List<Edge> edges = CLIENT.graph().listEdges();

        Assert.assertEquals(5, vertices.size());
        Assert.assertEquals(1, edges.size());
    }

    @Test
    public void testVertexIdColumnEmpty() {
        ioUtil.write("vertex_person.csv",
                     "id,name,age,city",
                     "1,marko,29,Beijing",
                     ",vadas,27,Hongkong",
                     "2,josh,32,Beijing",
                     ",peter,35,Shanghai",
                     "3,\"li,nary\",26,\"Wu,han\"");

        String[] args = new String[] {
                "-f", structPath("vertex_id_column_empty/struct.json"),
                "-s", configPath("vertex_id_column_empty/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(3, vertices.size());
    }

    @Test
    public void testEdgeSourceOrTargetColumnEmpty() {
        ioUtil.write("edge_created.csv",
                     "source_id,target_id,date,weight",
                     "1,2,20171210,0.4",
                     ",2,20091111,0.4",
                     "1,,20171210,1.0");

        String[] args = new String[]{
                "-f", structPath("edge_source_or_target_column_empty/struct.json"),
                "-s", configPath("edge_source_or_target_column_empty/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--check-vertex", "false",
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Edge> edges = CLIENT.graph().listEdges();
        Assert.assertEquals(1, edges.size());
    }

    @Test
    public void testMultiColumnMappingToSameLabel() {
        ioUtil.write("data.csv",
                     "name,alias",
                     "marko,m",
                     "vadas,v",
                     "josh,j");

        String[] args = new String[]{
                "-f", structPath("multi_column_mapping_to_same_label/struct.json"),
                "-s", configPath("multi_column_mapping_to_same_label/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--check-vertex", "false",
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(6, vertices.size());
    }

    @Test
    public void testVertexCusomizedIdUnfold() {
        ioUtil.write("vertex_person.csv",
                     "id,name,age,city",
                     "1|2|3,marko,29,Beijing",
                     "4|5,vadas,27,Hongkong",
                     "6,josh,32,Beijing",
                     "7|8|9,peter,35,Shanghai",
                     "10,\"li,nary\",26,\"Wu,han\"");

        String[] args = new String[] {
                "-f", structPath("vertex_customized_id_unfold/struct.json"),
                "-s", configPath("vertex_customized_id_unfold/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(10, vertices.size());

        Vertex v1 = CLIENT.graph().getVertex("1");
        Vertex v2 = CLIENT.graph().getVertex("2");
        Vertex v3 = CLIENT.graph().getVertex("3");
        Assert.assertEquals("marko", v1.property("name"));
        Assert.assertEquals("marko", v2.property("name"));
        Assert.assertEquals("marko", v3.property("name"));
    }

    @Test
    public void testVertexCusomizedIdUnfoldWithMapping() {
        // field_mapping: p_id -> id
        // value_mapping: p1 -> 1, p2 -> 2, p3 -> 3
        ioUtil.write("vertex_person.csv",
                     "p_id,name,age,city",
                     "p1|p2|p3,marko,29,Beijing",
                     "4|5,vadas,27,Hongkong",
                     "6,josh,32,Beijing",
                     "7|8|9,peter,35,Shanghai",
                     "10,\"li,nary\",26,\"Wu,han\"");

        String[] args = new String[] {
                "-f", structPath("vertex_customized_id_unfold_with_mapping/struct.json"),
                "-s", configPath("vertex_customized_id_unfold_with_mapping/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(10, vertices.size());

        Vertex v1 = CLIENT.graph().getVertex("1");
        Vertex v2 = CLIENT.graph().getVertex("2");
        Vertex v3 = CLIENT.graph().getVertex("3");
        Assert.assertEquals("marko", v1.property("name"));
        Assert.assertEquals("marko", v2.property("name"));
        Assert.assertEquals("marko", v3.property("name"));
    }

    @Test
    public void testVertexPrimaryKeyUnfold() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko|marko1|marko2,29,Beijing",
                     "vadas|vadas1,27,Hongkong",
                     "josh,32,Beijing",
                     "peter|peter1|peter2,35,Shanghai",
                     "\"li,nary\",26,\"Wu,han\"");

        String[] args = new String[] {
                "-f", structPath("vertex_primarykey_unfold/struct.json"),
                "-s", configPath("vertex_primarykey_unfold/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(10, vertices.size());

        vertices = CLIENT.graph().listVertices("person",
                                               ImmutableMap.of("age", 29));
        Assert.assertEquals(3, vertices.size());
        Set<Object> names = vertices.stream().map(v -> v.property("name"))
                                    .collect(Collectors.toSet());
        Assert.assertEquals(ImmutableSet.of("marko", "marko1", "marko2"), names);
    }

    @Test
    public void testVertexPrimaryKeyUnfoldWithMapping() {
        // field_mapping: p_name -> name
        // value_mapping: m -> marko, m1 -> marko1, m2 -> marko2
        ioUtil.write("vertex_person.csv",
                     "p_name,age,city",
                     "m|m1|m2,29,Beijing",
                     "vadas|vadas1,27,Hongkong",
                     "josh,32,Beijing",
                     "peter|peter1|peter2,35,Shanghai",
                     "\"li,nary\",26,\"Wu,han\"");

        String[] args = new String[] {
                "-f", structPath("vertex_primarykey_unfold_with_mapping/struct.json"),
                "-s", configPath("vertex_primarykey_unfold_with_mapping/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(10, vertices.size());

        vertices = CLIENT.graph().listVertices("person",
                                               ImmutableMap.of("age", 29));
        Assert.assertEquals(3, vertices.size());
        Set<Object> names = vertices.stream().map(v -> v.property("name"))
                                    .collect(Collectors.toSet());
        Assert.assertEquals(ImmutableSet.of("marko", "marko1", "marko2"), names);
    }

    @Test
    public void testVertexPrimaryKeyUnfoldExceedLimit() {
        // The primary keys are "name" nad "age"
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko|marko1|marko2,29,Beijing",
                     "vadas|vadas1,27,Hongkong",
                     "josh,32,Beijing",
                     "peter|peter1|peter2,35,Shanghai",
                     "\"li,nary\",26,\"Wu,han\"");

        String[] args = new String[] {
                "-f", structPath("vertex_primarykey_unfold_exceed_limit/struct.json"),
                "-s", configPath("vertex_primarykey_unfold_exceed_limit/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        Assert.assertThrows(ParseException.class, () -> {
            loadWithAuth(args);
        }, e -> {
            String msg = "In case unfold is true, just supported " +
                         "a single primary key";
            Assert.assertEquals(msg, e.getMessage());
        });

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(0, vertices.size());
    }

    @Test
    public void testVertexUnfoldInJsonFile() {
        ioUtil.write("vertex_person.json",
                     "{\"id\": [1,2,3], \"name\": \"marko\", \"age\": 29, " +
                     "\"city\": \"Beijing\"}",
                     "{\"id\": [4,5,6], \"name\": \"vadas\", \"age\": 27, " +
                     "\"city\": \"Beijing\"}");
        ioUtil.write("vertex_software.json",
                     "{\"name\": [\"hugegraph\", \"hg\"], " +
                     "\"lang\": \"java\", \"price\": 1000}",
                     "{\"name\": [\"word\", \"excel\"], " +
                     "\"lang\": \"C#\", \"price\": 999}");

        String[] args = new String[]{
                "-f", structPath("vertex_unfold_in_json_file/struct.json"),
                "-s", configPath("vertex_unfold_in_json_file/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);
    }

    @Test
    public void testEdgeUnfoldOneToMany() {
        ioUtil.write("edge_knows.csv",
                     "source_name,target_name,date,weight",
                     "marko,vadas|tom|peter,20160110,0.5",
                     "jerry,josh|jack|marry,20130220,1.0");
        ioUtil.write("edge_created.csv",
                     "source_name,target_id,date,weight",
                     "marko,1|2|3,20171210,0.4",
                     "josh,4|5|6,20091111,0.4",
                     "peter,7,20170324,0.2");

        String[] args = new String[]{
                "-f", structPath("edge_unfold_one_to_many/struct.json"),
                "-s", configPath("edge_unfold_one_to_many/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--check-vertex", "false",
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        List<Edge> edges = CLIENT.graph().listEdges();

        Assert.assertEquals(0, vertices.size());
        Assert.assertEquals(13, edges.size());
        Assert.assertEquals(6, CLIENT.graph().listEdges("knows").size());
        Assert.assertEquals(7, CLIENT.graph().listEdges("created").size());
    }

    @Test
    public void testEdgeUnfoldManyToOne() {
        ioUtil.write("edge_knows.csv",
                     "source_name,target_name,date,weight",
                     "marko|tom|peter,vadas,20160110,0.5",
                     "jerry|josh|jack,marry,20130220,1.0");
        ioUtil.write("edge_created.csv",
                     "source_name,target_id,date,weight",
                     "marko|tom|peter,1,20171210,0.4",
                     "jerry|josh|jack,2,20091111,0.4",
                     "marry,3,20170324,0.2");

        String[] args = new String[]{
                "-f", structPath("edge_unfold_many_to_one/struct.json"),
                "-s", configPath("edge_unfold_many_to_one/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--check-vertex", "false",
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        List<Edge> edges = CLIENT.graph().listEdges();

        Assert.assertEquals(0, vertices.size());
        Assert.assertEquals(13, edges.size());
        Assert.assertEquals(6, CLIENT.graph().listEdges("knows").size());
        Assert.assertEquals(7, CLIENT.graph().listEdges("created").size());
    }

    @Test
    public void testEdgeUnfoldManyToMany() {
        ioUtil.write("edge_knows.csv",
                     "source_name,target_name,date,weight",
                     "marko|tom|peter,jerry|josh|jack,20160110,0.5",
                     "jerry|josh|jack,marry|jack|marko,20130220,1.0");
        ioUtil.write("edge_created.csv",
                     "source_name,target_id,date,weight",
                     "marko|tom|peter,1|2|3,20171210,0.4",
                     "jerry|josh|jack,4|5|6,20091111,0.4");

        String[] args = new String[]{
                "-f", structPath("edge_unfold_many_to_many/struct.json"),
                "-s", configPath("edge_unfold_many_to_many/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--check-vertex", "false",
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        List<Edge> edges = CLIENT.graph().listEdges();

        Assert.assertEquals(0, vertices.size());
        Assert.assertEquals(12, edges.size());
        Assert.assertEquals(6, CLIENT.graph().listEdges("knows").size());
        Assert.assertEquals(6, CLIENT.graph().listEdges("created").size());
    }

    @Test
    public void testEdgeUnfoldManyToManyWithUnmatchNumber() {
        ioUtil.write("edge_knows.csv",
                     "source_name,target_name,date,weight",
                     "marko|tom|peter,jerry|josh,20160110,0.5");
        ioUtil.write("edge_created.csv",
                     "source_name,target_id,date,weight",
                     "marko|tom|peter,1|2,20171210,0.4");

        String[] args = new String[]{
                "-f",
                structPath("edge_unfold_many_to_many_with_unmatch_number/struct.json"),
                "-s",
                configPath("edge_unfold_many_to_many_with_unmatch_number/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--check-vertex", "false",
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        Assert.assertThrows(ParseException.class, () -> {
            loadWithAuth(args);
        }, e -> {
            String msg = "The elements number of source and target must be: " +
                         "1 to n, n to 1, n to n";
            Assert.assertEquals(msg, e.getMessage());
        });

        List<Vertex> vertices = CLIENT.graph().listVertices();
        List<Edge> edges = CLIENT.graph().listEdges();

        Assert.assertEquals(0, vertices.size());
        Assert.assertEquals(0, edges.size());
    }

    @Test
    public void testReadReachedMaxLines() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,29,Beijing",
                     "vadas,27,Hongkong",
                     "josh,32,Beijing",
                     "peter,35,Shanghai",
                     "\"li,nary\",26,\"Wu,han\"");
        ioUtil.write("vertex_software.csv", GBK,
                     "name,lang,price",
                     "lop,java,328",
                     "ripple,java,199");

        String[] args = new String[]{
                "-f", structPath("read_reached_max_lines/struct.json"),
                "-s", configPath("read_reached_max_lines/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--max-read-lines", "4",
                "--batch-insert-threads", "2",
                "--test-mode", "true",
                "--parser-threads", "1"
        };
        loadWithAuth(args);

        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(4, vertices.size());

        args = new String[]{
                "-f", structPath("read_reached_max_lines/struct.json"),
                "-s", configPath("read_reached_max_lines/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--max-read-lines", "6",
                "--batch-insert-threads", "2",
                "--test-mode", "true",
                "--parser-threads", "1"
        };
        loadWithAuth(args);

        vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(6, vertices.size());
    }

    @Test
    public void testHttpsClientValueMapping() {
        ioUtil.write("vertex_person.csv",
                     "tiny,1,1,1",
                     "mary,2,2,2");

        CommonUtil.downloadFileByUrl(FILE_URL, TRUST_STORE_PATH);
        String[] args = new String[]{
                "-f", structPath("value_mapping/struct.json"),
                "-s", configPath("value_mapping/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "-p", String.valueOf(HTTPS_PORT),
                "--protocol", HTTPS_PROTOCOL,
                "--trust-store-file", TRUST_STORE_PATH,
                "--trust-store-password", "hugegraph",
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        HugeClient httpsClient = null;
        try {
            httpsClient = HugeClient.builder(HTTPS_URL, GRAPH)
                                    .configUser("admin", "pa")
                                    .configSSL(TRUST_STORE_PATH, "hugegraph")
                                    .build();
            List<Vertex> vertices = httpsClient.graph().listVertices();
            Assert.assertEquals(2, vertices.size());
        } finally {
            clearAndClose(httpsClient, GRAPH);
        }
    }

    @Test
    public void testHttpsHolderClientValueMapping() {
        ioUtil.write("vertex_person.csv",
                     "marko,1,1,1",
                     "vadas,2,2,2");

        CommonUtil.downloadFileByUrl(FILE_URL, TRUST_STORE_PATH);
        String[] args = new String[]{
                "-f", structPath("value_mapping/struct.json"),
                "-s", configPath("value_mapping/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "-p", String.valueOf(HTTPS_PORT),
                "--protocol", HTTPS_PROTOCOL,
                "--trust-store-file", TRUST_STORE_PATH,
                "--trust-store-password", "hugegraph",
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        };
        loadWithAuth(args);

        LoadOptions options = new LoadOptions();
        options.host = SERVER;
        options.port = HTTPS_PORT;
        options.graph = GRAPH;
        options.protocol = HTTPS_PROTOCOL;
        options.trustStoreFile = TRUST_STORE_PATH;
        options.trustStoreToken = "hugegraph";
        options.username = "admin";
        options.password = "pa";
        HugeClient httpsClient = null;
        try {
            httpsClient = HugeClientHolder.create(options);
            List<Vertex> vertices = httpsClient.graph().listVertices();
            Assert.assertEquals(2, vertices.size());
        } finally {
            clearAndClose(httpsClient, GRAPH);
        }
    }
}
