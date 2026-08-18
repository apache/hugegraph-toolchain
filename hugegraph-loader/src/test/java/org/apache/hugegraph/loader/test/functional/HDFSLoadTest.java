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

import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.loader.HugeGraphLoader;
import org.junit.Before;
import org.junit.Test;

import org.apache.hugegraph.loader.exception.LoadException;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.testutil.Assert;

public class HDFSLoadTest extends FileLoadTest {

    @Override
    public String structPath(String fileName) {
        if (fileName.contains("struct")) {
            int idx = fileName.indexOf("/");
            String preifx = fileName.substring(0, idx);
            String suffix = fileName.substring(idx + 1);
            suffix = StringUtils.replace(suffix, "struct", "struct_hdfs");
            fileName = preifx + "/" + suffix;
        }
        return Paths.get(CONFIG_PATH_PREFIX, fileName).toString();
    }

    @Before
    public void init() {
        this.ioUtil = new HDFSUtil("hdfs://localhost:8020/files");
    }

    @Test
    public void testHDFSWithCoreSitePath() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,29,Beijing",
                     "vadas,27,Hongkong",
                     "josh,32,Beijing",
                     "peter,35,Shanghai",
                     "\"li,nary\",26,\"Wu,han\"");

        List<String> argsList = new ArrayList<>(Arrays.asList(
                "-f", structPath("hdfs_with_core_site_path/struct.json"),
                "-s", configPath("hdfs_with_core_site_path/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--parser-threads", "4", // <--- 【修改点 1】增加并发解析线程数
                "--test-mode", "true"
        ));
        argsList.addAll(Arrays.asList("--username", "admin", "--password", "pa"));

        HugeGraphLoader loader = new HugeGraphLoader(argsList.toArray(new String[0]));
        loader.load();
        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(5, vertices.size());
    }

    @Test
    public void testHDFSWithFilePrefix() {
        ioUtil.write("vertex_person_0.csv",
                     "name,age,city",
                     "marko,29,Beijing");

        ioUtil.write("vertex_person_1.csv",
                     "name,age,city",
                     "vadas,27,Hongkong",
                     "josh,32,Beijing",
                     "peter,35,Shanghai",
                     "\"li,nary\",26,\"Wu,han\"");

        List<String> argsList = new ArrayList<>(Arrays.asList(
                "-f", structPath("hdfs_file_with_prefix/struct.json"),
                "-s", configPath("hdfs_file_with_prefix/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--parser-threads", "4", // <--- 【修改点 2】增加并发解析线程数
                "--test-mode", "true"
        ));
        argsList.addAll(Arrays.asList("--username", "admin", "--password", "pa"));

        HugeGraphLoader loader = new HugeGraphLoader(argsList.toArray(new String[0]));
        loader.load();
        List<Vertex> vertices = CLIENT.graph().listVertices();
        Assert.assertEquals(5, vertices.size());
    }

    @Test
    public void testHDFSWithCoreSitePathEmpty() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,29,Beijing",
                     "vadas,27,Hongkong",
                     "josh,32,Beijing",
                     "peter,35,Shanghai",
                     "\"li,nary\",26,\"Wu,han\"");

        List<String> argsList = new ArrayList<>(Arrays.asList(
                "-f", structPath("hdfs_with_empty_core_site_path/struct.json"),
                "-s", configPath("hdfs_with_empty_core_site_path/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        ));
        argsList.addAll(Arrays.asList("--username", "admin", "--password", "pa"));

        Assert.assertThrows(LoadException.class, () -> {
            HugeGraphLoader loader = new HugeGraphLoader(argsList.toArray(new String[0]));
            loader.load();
        });
    }

    @Test
    public void testHDFSWithInvalidCoreSitePath() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,29,Beijing",
                     "vadas,27,Hongkong",
                     "josh,32,Beijing",
                     "peter,35,Shanghai",
                     "\"li,nary\",26,\"Wu,han\"");

        List<String> argsList = new ArrayList<>(Arrays.asList(
                "-f", structPath("hdfs_with_invalid_core_site_path/struct.json"),
                "-s", configPath("hdfs_with_invalid_core_site_path/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        ));
        argsList.addAll(Arrays.asList("--username", "admin", "--password", "pa"));

        Assert.assertThrows(LoadException.class, () -> {
            HugeGraphLoader loader = new HugeGraphLoader(argsList.toArray(new String[0]));
            loader.load();
        }, e -> {
            String message = "Failed to init";
            Assert.assertTrue(e.getMessage().contains(message));
        });
    }

    @Test
    public void testHDFSWithUnexistCoreSitePath() {
        ioUtil.write("vertex_person.csv",
                     "name,age,city",
                     "marko,29,Beijing",
                     "vadas,27,Hongkong",
                     "josh,32,Beijing",
                     "peter,35,Shanghai",
                     "\"li,nary\",26,\"Wu,han\"");

        List<String> argsList = new ArrayList<>(Arrays.asList(
                "-f", structPath("hdfs_with_unexist_core_site_path/struct.json"),
                "-s", configPath("hdfs_with_unexist_core_site_path/schema.groovy"),
                "-g", GRAPH,
                "-h", SERVER,
                "--batch-insert-threads", "2",
                "--test-mode", "true"
        ));
        argsList.addAll(Arrays.asList("--username", "admin", "--password", "pa"));

        Assert.assertThrows(LoadException.class, () -> {
            HugeGraphLoader loader = new HugeGraphLoader(argsList.toArray(new String[0]));
            loader.load();
        }, e -> {
            Throwable t = e.getCause();
            Assert.assertEquals(IllegalArgumentException.class, t.getClass());
            String msg = t.getMessage();
            Assert.assertTrue(msg.startsWith("The core site file"));
            Assert.assertTrue(msg.endsWith("is not an existing file"));
        });
    }

    @Override
    public void testParserV2() {
        // TODO: ensure file exist in V2 schema
    }
}
