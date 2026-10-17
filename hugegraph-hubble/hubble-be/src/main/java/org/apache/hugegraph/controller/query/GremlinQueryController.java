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

package org.apache.hugegraph.controller.query;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import org.apache.hugegraph.driver.HugeClient;
import org.apache.commons.lang3.StringUtils;
import org.apache.commons.lang3.time.StopWatch;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.entity.enums.AsyncTaskStatus;
import org.apache.hugegraph.entity.enums.ExecuteStatus;
import org.apache.hugegraph.entity.enums.ExecuteType;
import org.apache.hugegraph.entity.query.AdjacentQuery;
import org.apache.hugegraph.entity.query.ExecuteHistory;
import org.apache.hugegraph.entity.query.GremlinQuery;
import org.apache.hugegraph.entity.query.GremlinResult;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.service.query.ExecuteHistoryService;
import org.apache.hugegraph.service.query.QueryService;
import org.apache.hugegraph.structure.gremlin.ResultSet;
import org.apache.hugegraph.util.Ex;
import org.apache.hugegraph.util.HubbleUtil;
import org.apache.hugegraph.entity.enums.QueryLanguage;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.google.common.collect.ImmutableMap;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@RestController
@RequestMapping(Constant.API_VERSION + "graphspaces/{graphspace}/graphs" +
        "/{graph}/gremlin-query")
public class GremlinQueryController extends GremlinController {

    static final String GREMLIN_EXECUTION_FAILED =
            "GREMLIN_EXECUTION_FAILED";

    private static final Logger LOG =
            LoggerFactory.getLogger(GremlinQueryController.class);

    @Autowired
    private QueryService queryService;
    @Autowired
    private ExecuteHistoryService historyService;

    @GetMapping
    public Map<String, String> execute(@PathVariable("graphspace") String graphSpace,
                                       @PathVariable("graph") String graph) {

        HugeClient client = this.authGremlinClient(graphSpace, graph);
        Map<String, String> graphCount = new HashMap<>();
        graphCount.put("vertexcount", queryCount(client, "g.V().count()"));
        graphCount.put("edgecount", queryCount(client, "g.E().count()"));
        return graphCount;
    }

    private String queryCount(HugeClient client, String gremlin) {
        try {
            ResultSet result = this.queryService.executeQueryCount(client, gremlin);
            if (result.data() == null || result.data().isEmpty()) {
                return "max";
            }
            return String.valueOf(result.data().get(0));
        } catch (Throwable e) {
            LOG.warn("Failed to execute gremlin overview count: {}", gremlin, e);
            return "max";
        }
    }

    /**
     * 正常gremlin请求 && 图分析页面gremlin请求
     */
    @PostMapping
    public GremlinResult gremlin(@PathVariable("graphspace") String graphSpace,
                                 @PathVariable("graph") String graph,
                                 @RequestBody GremlinQuery query) {
        return this.executeGremlin(graphSpace, graph, query);
    }

    /*
    * 用户对大模型生成的gremlin评价
    */
    @PostMapping("text2gremlin-report")
    public Map<String, String> reportText2Gremlin(@PathVariable("graphspace") String graphSpace,
                                 @PathVariable("graph") String graph,
                                 @RequestBody Text2Gremlin text2Gremlin) {
        // username graphspace graph text llm-gremlin exec-gremlin success nice
        text2Gremlin.setText(text2Gremlin.getText().replaceAll(",", "，"));
        LOG.info("{},{},{},{},{},{},{},{}", text2Gremlin.getUsername(),
                 graphSpace, graph, text2Gremlin.getText(),
                 text2Gremlin.getLlmGremlin(), text2Gremlin.getExecGremlin(),
                 text2Gremlin.getSuccess(),
                 text2Gremlin.getScore());
        return ImmutableMap.of("text2gremlin-report", "success");
    }

    private GremlinResult executeGremlin(String graphSpace, String graph,
                                         GremlinQuery query) {
        this.checkParamsValid(query);

        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                                     ExecuteType.GREMLIN, query.getContent(),
                                     query.getText(), status,
                                     AsyncTaskStatus.UNKNOWN,
                                     -1L, createTime);
        this.historyService.save(history);

        StopWatch timer = StopWatch.createStarted();
        try {
            HugeClient client = this.authGremlinClient(graphSpace, graph);
            GremlinResult result =
                    this.queryService.executeGremlinQuery(client, query);
            status = ExecuteStatus.SUCCESS;
            return result;
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            history.setFailureReason(GREMLIN_EXECUTION_FAILED);
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            this.historyService.update(history);
        }
    }

    @PostMapping("async-task")
    public Map<String, Object> executeAsyncTask(
            @PathVariable("graphspace") String graphSpace,
            @PathVariable("graph") String graph,
            @RequestBody GremlinQuery query) {
        this.checkParamsValid(query);

        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.ASYNC_TASK_RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                                     ExecuteType.GREMLIN_ASYNC,
                                     query.getContent(), query.getText(),
                                     status, AsyncTaskStatus.UNKNOWN, -1L,
                                     createTime);
        this.historyService.save(history);

        StopWatch timer = StopWatch.createStarted();
        long asyncId = 0L;
        Map<String, Object> result = new HashMap<>(3);
        try {
            HugeClient client = this.authGremlinClient(graphSpace, graph);
            asyncId = this.queryService.executeGremlinAsyncTask(client, query);
            status = ExecuteStatus.ASYNC_TASK_SUCCESS;
            result.put("task_id", asyncId);
            result.put("execute_status", status);
            return result;
        } catch (Throwable e) {
            status = ExecuteStatus.ASYNC_TASK_FAILED;
            // TODO: Persist an async failure reason only after the Server Task
            // DTO exposes a stable, sanitized reason code. Depending on task
            // status alone cannot distinguish submission from execution
            // failures; remove this TODO when that Server capability exists.
            throw e;
        } finally {
            timer.stop();
            long duration = timer.getTime(TimeUnit.MILLISECONDS);
            history.setStatus(status);
            history.setDuration(duration);
            history.setAsyncId(asyncId);
            this.historyService.update(history);
        }
    }

    @PutMapping
    public GremlinResult expand(@PathVariable("graphspace") String graphSpace,
                                @PathVariable("graph") String graph,
                                @RequestBody AdjacentQuery query) {
        this.checkParamsValid(query);
        try {
            HugeClient client = this.authGremlinClient(graphSpace, graph);
            return this.queryService.expandVertex(client, query);
        } catch (Exception e) {
            Throwable rootCause = Ex.rootCause(e);
            throw new ExternalException("gremlin.expand.failed", rootCause,
                                        rootCause.getMessage());
        }
    }

    private void checkParamsValid(GremlinQuery query) {
        Ex.check(!StringUtils.isEmpty(query.getContent()),
                 "common.param.cannot-be-null-or-empty",
                 "gremlin-query.content");
        checkContentLength(query.getContent());
        if (query.isReadOnly()) {
            QueryLanguage.GREMLIN.validate(query.getContent());
        }
    }

    private void checkParamsValid(AdjacentQuery query) {
        Ex.check(!StringUtils.isEmpty(query.getVertexId()),
                 "common.param.cannot-be-null-or-empty", "vertex_id");
        Ex.check(!StringUtils.isEmpty(query.getVertexLabel()),
                 "common.param.cannot-be-null-or-empty", "vertex_label");
        if (query.getConditions() != null && !query.getConditions().isEmpty()) {
            for (AdjacentQuery.Condition condition : query.getConditions()) {
                Ex.check(!StringUtils.isEmpty(condition.getKey()),
                         "common.param.cannot-be-null-or-empty",
                         "condition.key");
                Ex.check(!StringUtils.isEmpty(condition.getOperator()),
                         "common.param.cannot-be-null-or-empty",
                         "condition.operator");
                Ex.check(QueryService.CONDITION_OPERATORS.contains(
                         condition.getOperator()),
                         "common.param.should-belong-to", "condition.operator",
                         QueryService.CONDITION_OPERATORS);
                Ex.check(condition.getValue() != null,
                         "common.param.cannot-be-null", "condition.value");
            }
        }
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    private static class Text2Gremlin {
        @JsonProperty("username")
        private String username;

        // 执行的gremlin语句
        @JsonProperty("exec-gremlin")
        private String execGremlin;

        @JsonProperty("text")
        private String text;

        // 大模型生成的gremlin语句
        @JsonProperty("llm-gremlin")
        private String llmGremlin;

        // 语句成功与否
        @JsonProperty("success")
        private Boolean success;

        // 用户点赞与否
        @JsonProperty("score")
        private Boolean score;
    }
}
