/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

package org.apache.hugegraph.controller.graph;

import java.util.LinkedHashMap;
import java.util.Map;

import lombok.extern.log4j.Log4j2;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.controller.BaseController;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.util.Ex;

@RestController
@Log4j2
@RequestMapping(Constant.API_VERSION + "graphspaces/{graphspace}/graphs/{graph}/sample")
public class SampleGraphController extends BaseController {

    public static final String LOADER_SOURCE = "hugegraph-loader/example/file";
    public static final String RANK_SOURCE =
            "hugegraph-doc/rank-api/neighbor-rank-example";

    public static final String LOADER_SCHEMA =
            "schema = graph.schema();\n" +
            "schema.propertyKey('name').asText().ifNotExist().create();\n" +
            "schema.propertyKey('age').asInt().ifNotExist().create();\n" +
            "schema.propertyKey('city').asText().ifNotExist().create();\n" +
            "schema.propertyKey('weight').asDouble().ifNotExist().create();\n" +
            "schema.propertyKey('lang').asText().ifNotExist().create();\n" +
            "schema.propertyKey('date').asText().ifNotExist().create();\n" +
            "schema.propertyKey('price').asDouble().ifNotExist().create();\n" +
            "schema.vertexLabel('person').properties('name', 'age', 'city')" +
            ".primaryKeys('name').nullableKeys('age', 'city')" +
            ".ifNotExist().create();\n" +
            "schema.vertexLabel('software').useCustomizeNumberId()" +
            ".properties('name', 'lang', 'price').ifNotExist().create();\n" +
            "schema.edgeLabel('knows').sourceLabel('person')" +
            ".targetLabel('person').properties('date', 'weight')" +
            ".ifNotExist().create();\n" +
            "schema.edgeLabel('created').sourceLabel('person')" +
            ".targetLabel('software').properties('date', 'weight')" +
            ".ifNotExist().create();";

    public static final String LOADER_DATA =
            vertex("marko", "marko", 29, "Beijing") +
            vertex("vadas", "vadas", 27, "Hongkong") +
            vertex("josh", "josh", 32, "Beijing") +
            vertex("peter", "peter", 35, "Shanghai") +
            vertex("linary", "li,nary", 26, "Wu,han") +
            nullableVertex("tom", "tom") +
            software(1, "lop", 328) + software(2, "ripple", 199) +
            edge("marko", "knows", "vadas", "20160110", 0.5) +
            edge("marko", "knows", "josh", "20130220", 1.0) +
            created("marko", 1, "2017-12-10", 0.4) +
            created("josh", 1, "2009-11-11", 0.4) +
            created("josh", 2, "2017-12-10", 1.0) +
            created("peter", 1, "2017-03-24", 0.2);

    public static final String RANK_SCHEMA =
            "schema = graph.schema();\n" +
            "schema.propertyKey('name').asText().ifNotExist().create();\n" +
            "schema.vertexLabel('person').properties('name')" +
            ".useCustomizeStringId().ifNotExist().create();\n" +
            "schema.vertexLabel('movie').properties('name')" +
            ".useCustomizeStringId().ifNotExist().create();\n" +
            "schema.edgeLabel('follow').sourceLabel('person')" +
            ".targetLabel('person').ifNotExist().create();\n" +
            "schema.edgeLabel('like').sourceLabel('person')" +
            ".targetLabel('movie').ifNotExist().create();\n" +
            "schema.edgeLabel('directedBy').sourceLabel('movie')" +
            ".targetLabel('person').ifNotExist().create();";

    public static final String RANK_DATA =
            rankVertex("O", "person") + rankVertex("A", "person") +
            rankVertex("B", "person") + rankVertex("C", "person") +
            rankVertex("D", "person") + rankVertex("E", "movie") +
            rankVertex("F", "movie") + rankVertex("G", "movie") +
            rankVertex("H", "movie") + rankVertex("I", "movie") +
            rankVertex("J", "movie") + rankVertex("K", "person") +
            rankVertex("L", "person") + rankVertex("M", "person") +
            rankEdge("O", "follow", "A") + rankEdge("O", "follow", "B") +
            rankEdge("O", "follow", "C") + rankEdge("D", "follow", "O") +
            rankEdge("A", "follow", "B") + rankEdge("A", "like", "E") +
            rankEdge("A", "like", "F") + rankEdge("B", "like", "G") +
            rankEdge("B", "like", "H") + rankEdge("C", "like", "I") +
            rankEdge("C", "like", "J") +
            rankEdge("E", "directedBy", "K") +
            rankEdge("F", "directedBy", "B") +
            rankEdge("F", "directedBy", "L") +
            rankEdge("G", "directedBy", "M");

    @PostMapping
    public Map<String, Object> load(@PathVariable("graphspace") String graphSpace,
                                    @PathVariable("graph") String graph,
                                    @RequestParam(name = "dataset",
                                                  defaultValue = "loader")
                                    String dataset) {
        boolean rank = "rank".equals(dataset);
        Ex.check(rank || "loader".equals(dataset),
                 "common.param.should-belong-to", "dataset", "[loader, rank]");
        HugeClient client = this.authGremlinClient(graphSpace, graph);
        try {
            client.gremlin().gremlin(rank ? RANK_SCHEMA : LOADER_SCHEMA).execute();
            client.gremlin().gremlin(rank ? RANK_DATA : LOADER_DATA).execute();
        } catch (RuntimeException e) {
            log.warn("Failed to load sample dataset '{}' into {}/{}",
                     dataset, graphSpace, graph, e);
            throw new ExternalException("graph.sample.load-failed",
                                        dataset, graphSpace, graph);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("dataset", dataset);
        result.put("source", rank ? RANK_SOURCE : LOADER_SOURCE);
        result.put("graphspace", graphSpace);
        result.put("graph", graph);
        result.put("vertices", rank ? 14 : 8);
        result.put("edges", rank ? 15 : 6);
        result.put("idempotent", true);
        result.put("clears_existing_data", false);
        return result;
    }

    private static String vertex(String variable, String name, int age,
                                 String city) {
        return String.format("%1$s = g.V().hasLabel('person').has('name','%2$s')" +
                             ".fold().coalesce(unfold(),addV('person')" +
                             ".property('name','%2$s').property('age',%3$d)" +
                             ".property('city','%4$s')).next();\n",
                             variable, name, age, city);
    }

    private static String nullableVertex(String variable, String name) {
        return String.format("%1$s = g.V().hasLabel('person').has('name','%2$s')" +
                             ".fold().coalesce(unfold(),addV('person')" +
                             ".property('name','%2$s')).next();\n", variable, name);
    }

    private static String software(int id, String name, int price) {
        return String.format("software%1$d = g.V(%1$d).hasLabel('software')" +
                             ".fold().coalesce(unfold(),addV('software')" +
                             ".property(T.id,%1$d).property('name','%2$s')" +
                             ".property('lang','java').property('price',%3$d))" +
                             ".next();\n", id, name, price);
    }

    private static String edge(String source, String label, String target,
                               String date, double weight) {
        return String.format("if (!g.V(%1$s.id()).outE('%2$s')" +
                             ".where(inV().hasId(%3$s.id())).hasNext()) { " +
                             "%1$s.addEdge('%2$s',%3$s,'date','%4$s'," +
                             "'weight',%5$s); };\n",
                             source, label, target, date, weight);
    }

    private static String created(String source, int target, String date,
                                  double weight) {
        return edge(source, "created", "software" + target, date, weight);
    }

    private static String rankVertex(String id, String label) {
        return String.format("v%1$s = g.V('%1$s').hasLabel('%2$s').fold()" +
                             ".coalesce(unfold(),addV('%2$s')" +
                             ".property(T.id,'%1$s').property('name','%1$s'))" +
                             ".next();\n", id, label);
    }

    private static String rankEdge(String source, String label, String target) {
        return String.format("if (!g.V(v%1$s.id()).outE('%2$s')" +
                             ".where(inV().hasId(v%3$s.id())).hasNext()) { " +
                             "v%1$s.addEdge('%2$s',v%3$s); };\n",
                             source, label, target);
    }
}
