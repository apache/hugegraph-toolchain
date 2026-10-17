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

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.entity.enums.AsyncTaskStatus;
import org.apache.hugegraph.entity.enums.ExecuteStatus;
import org.apache.hugegraph.entity.enums.ExecuteType;
import org.apache.hugegraph.entity.enums.QueryLanguage;
import org.apache.hugegraph.entity.query.ExecuteHistory;
import org.apache.hugegraph.entity.query.GremlinQuery;
import org.apache.hugegraph.entity.query.GremlinResult;
import org.apache.hugegraph.service.query.ExecuteHistoryService;
import org.apache.hugegraph.service.query.QueryService;
import org.apache.hugegraph.util.Ex;
import org.apache.hugegraph.util.HubbleUtil;
import lombok.extern.log4j.Log4j2;
import org.apache.commons.lang3.StringUtils;
import org.apache.commons.lang3.time.StopWatch;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Log4j2
@RestController
@RequestMapping(Constant.API_VERSION + "graphspaces/{graphspace}/graphs" +
        "/{graph}/cypher")
public class CypherController extends GremlinController {
    @Autowired
    private ExecuteHistoryService historyService;

    @Autowired
    private QueryService queryService;

    @GetMapping
    public GremlinResult execute(@PathVariable("graphspace") String graphSpace,
                                 @PathVariable("graph") String graph,
                                 @RequestParam(name = "cypher") String query) {
        return this.executeQuery(graphSpace, graph, new GremlinQuery(query));
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public GremlinResult execute(@PathVariable("graphspace") String graphSpace,
                                 @PathVariable("graph") String graph,
                                 @RequestBody GremlinQuery query) {
        return this.executeQuery(graphSpace, graph, query);
    }

    private GremlinResult executeQuery(String graphSpace, String graph, GremlinQuery query) {
        this.checkParamsValid(query);
        HugeClient client = this.authGremlinClient(graphSpace, graph);
        QueryLanguage.CYPHER.requireSupported(client);
        Date createTime = HubbleUtil.nowDate();
        ExecuteStatus status = ExecuteStatus.RUNNING;
        ExecuteHistory history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.CYPHER, query.getContent(), query.getText() == null ? "" : query.getText(),
                status, AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);

        StopWatch timer = StopWatch.createStarted();
        try {
            GremlinResult result = this.queryService.executeCypherQuery(client, query.getContent());
            status = ExecuteStatus.SUCCESS;
            return result;
        } catch (Throwable e) {
            status = ExecuteStatus.FAILED;
            history.setFailureReason(GremlinQueryController.GREMLIN_EXECUTION_FAILED);
            this.checkAnonymousAuthenticationFailure(e);
            throw e;
        } finally {
            timer.stop();
            history.setStatus(status);
            history.setDuration(timer.getTime(TimeUnit.MILLISECONDS));
            this.historyService.update(history);
        }
    }

    @PostMapping("async-task")
    public Map<String, Object> executeAsyncTask(
            @PathVariable("graphspace") String graphSpace,
            @PathVariable("graph") String graph,
            @RequestBody GremlinQuery query) {
        this.checkParamsValid(query);
        HugeClient client = this.authGremlinClient(graphSpace, graph);
        QueryLanguage.CYPHER.requireSupported(client);

        Date createTime = HubbleUtil.nowDate();
        // Insert execute history
        ExecuteStatus status = ExecuteStatus.ASYNC_TASK_RUNNING;
        ExecuteHistory history;
        history = new ExecuteHistory(null, graphSpace, graph, 0L,
                ExecuteType.CYPHER_ASYNC,
                query.getContent(), query.getText() == null ? "" : query.getText(), status,
                AsyncTaskStatus.UNKNOWN, -1L, createTime);
        this.historyService.save(history);

        StopWatch timer = StopWatch.createStarted();
        long asyncId = 0L;
        Map<String, Object> result = new HashMap<>(3);
        try {
            asyncId = this.queryService.executeCypherAsyncTask(client, query.getContent());
            status = ExecuteStatus.ASYNC_TASK_SUCCESS;
            result.put("task_id", asyncId);
            result.put("execute_status", status);
            return result;
        } catch (Throwable e) {
            status = ExecuteStatus.ASYNC_TASK_FAILED;
            this.checkAnonymousAuthenticationFailure(e);
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

    private void checkAnonymousAuthenticationFailure(Throwable failure) {
        if (this.authMode != null && this.authMode.anonymous() && failure instanceof ExternalException &&
            failure.getCause() instanceof ServerException server && server.status() == 401) {
            throw new ExternalException(502, "cypher.server.authentication-required");
        }
    }

    private void checkParamsValid(GremlinQuery query) {
        Ex.check(query != null && !StringUtils.isEmpty(query.getContent()),
                "common.param.cannot-be-null-or-empty",
                "gremlin-query.content");
        checkContentLength(query.getContent());
        if (query.isReadOnly()) {
            QueryLanguage.CYPHER.validate(query.getContent());
        }
    }
}
