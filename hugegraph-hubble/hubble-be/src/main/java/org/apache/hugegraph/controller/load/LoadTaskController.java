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

package org.apache.hugegraph.controller.load;

import com.baomidou.mybatisplus.core.metadata.IPage;
import lombok.extern.log4j.Log4j2;
import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.common.Response;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.controller.BaseController;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.GraphConnection;
import org.apache.hugegraph.entity.enums.JobStatus;
import org.apache.hugegraph.entity.load.FileMapping;
import org.apache.hugegraph.entity.load.JobManager;
import org.apache.hugegraph.entity.load.LoadTask;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.load.FileMappingService;
import org.apache.hugegraph.service.load.JobManagerService;
import org.apache.hugegraph.service.load.LoadTaskService;
import org.apache.hugegraph.util.Ex;
import org.apache.hugegraph.util.HubbleUtil;
import org.apache.hugegraph.util.UrlUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

@Log4j2
@RestController
@RequestMapping(Constant.API_VERSION + "graphspaces/{graphspace}/graphs" +
        "/{graph}/job-manager/{jobId}/load-tasks")
public class LoadTaskController extends BaseController {

    private static final int LIMIT = 500;

    @Autowired
    private FileMappingService fmService;
    @Autowired
    private JobManagerService jobService;
    @Autowired
    private HugeConfig config;

    private final LoadTaskService service;

    @Autowired
    public LoadTaskController(LoadTaskService service) {
        this.service = service;
    }

    @GetMapping
    public IPage<LoadTask> list(@PathVariable("graphspace") String graphSpace,
                                @PathVariable("graph") String graph,
                                @PathVariable("jobId") int jobId,
                                @RequestParam(name = "page_no",
                                              required = false,
                                              defaultValue = "1")
                                int pageNo,
                                @RequestParam(name = "page_size",
                                              required = false,
                                              defaultValue = "10")
                                int pageSize) {
        return this.service.list(graphSpace, graph, jobId, pageNo, pageSize);
    }

    @GetMapping("ids")
    public List<LoadTask> list(@PathVariable("graphspace") String graphSpace,
                               @PathVariable("graph") String graph,
                               @PathVariable("jobId") int jobId,
                               @RequestParam("task_ids") List<Integer> taskIds) {
        return this.service.list(graphSpace, graph, jobId, taskIds);
    }

    @GetMapping("{id}")
    public LoadTask get(@PathVariable("graphspace") String graphSpace,
                        @PathVariable("graph") String graph,
                        @PathVariable("jobId") int jobId,
                        @PathVariable("id") int id) {
        LoadTask task = this.service.get(graphSpace, graph, jobId, id);
        if (task == null) {
            throw new ExternalException("load.task.not-exist.id", id);
        }
        return task;
    }

    @PostMapping
    public LoadTask create(@PathVariable("graphspace") String graphSpace,
                           @PathVariable("graph") String graph,
                           @PathVariable("jobId") int jobId,
                           @RequestBody LoadTask entity) {
        JobManager jobEntity = this.jobService.get(graphSpace, graph, jobId);
        Ex.check(jobEntity != null, "job-manager.not-exist.id", jobId);
        Ex.check(jobEntity.getJobStatus() == JobStatus.SETTING,
                 "load.task.create.no-permission");
        synchronized (this.service) {
            Ex.check(this.service.count() < LIMIT,
                     "load.task.reached-limit", LIMIT);
            entity.setGraphSpace(graphSpace);
            entity.setGraph(graph);
            entity.setJobId(jobId);
            this.service.save(entity);
        }
        return entity;
    }

    @DeleteMapping("{id}")
    public void delete(@PathVariable("graphspace") String graphSpace,
                       @PathVariable("graph") String graph,
                       @PathVariable("jobId") int jobId,
                       @PathVariable("id") int id) {
        LoadTask task = this.service.get(graphSpace, graph, jobId, id);
        if (task == null) {
            throw new ExternalException("load.task.not-exist.id", id);
        }
        this.service.remove(id);
    }

    @PostMapping("start")
    public List<LoadTask> start(@PathVariable("graphspace") String graphSpace,
                                @PathVariable("graph") String graph,
                                @PathVariable("jobId") int jobId,
                                @RequestParam("file_mapping_ids")
                                List<Integer> fileIds) {
        GraphConnection connection = new GraphConnection();

        connection.setCluster(config.get(HubbleOptions.PD_CLUSTER));
        connection.setRouteType(config.get(HubbleOptions.ROUTE_TYPE));
        connection.setPdPeers(config.get(HubbleOptions.PD_PEERS));
        connection.setGraphSpace(graphSpace);
        connection.setGraph(graph);
        connection.setToken(this.getToken());
        connection.setUsername(this.getUser());
        if (!config.get(HubbleOptions.PD_ENABLED)) {
            UrlUtil.Host host = UrlUtil.parseHost(config.get(HubbleOptions.SERVER_URL));
            connection.setProtocol(host.getScheme());
            connection.setHost(host.getHost());
            connection.setPort(host.getPort());
        }

        JobManager jobEntity = this.jobService.get(graphSpace, graph, jobId);
        Ex.check(jobEntity != null, "job-manager.not-exist.id", jobId);
        Ex.check(jobEntity.getJobStatus() == JobStatus.SETTING,
                 "load.task.start.no-permission");
        boolean existError = false;
        try {
            List<LoadTask> tasks = new ArrayList<>();
            HugeClient client = this.authClient(graphSpace, graph);
            for (Integer fileId : fileIds) {
                FileMapping fileMapping = this.fmService.get(graphSpace, graph,
                                                              jobId, fileId);
                if (fileMapping == null) {
                    throw new ExternalException("file-mapping.not-exist.id",
                                                fileId);
                }
                tasks.add(this.service.start(connection, fileMapping, client));
            }
            return tasks;
        } catch (Exception e) {
            existError = true;
            throw e;
        } finally {
            if (existError) {
                jobEntity.setJobStatus(JobStatus.FAILED);
            } else {
                jobEntity.setJobStatus(JobStatus.LOADING);
            }
            jobEntity.setUpdateTime(HubbleUtil.nowDate());
            this.jobService.update(jobEntity);
        }
    }

    @PostMapping("pause")
    public LoadTask pause(@PathVariable("graphspace") String graphSpace,
                          @PathVariable("graph") String graph,
                          @PathVariable("jobId") int jobId,
                          @RequestParam("task_id") int taskId) {
        JobManager jobEntity = this.jobService.get(graphSpace, graph, jobId);
        Ex.check(jobEntity != null, "job-manager.not-exist.id", jobId);
        Ex.check(this.service.get(graphSpace, graph, jobId, taskId) != null,
                 "load.task.not-exist.id", taskId);
        Ex.check(jobEntity.getJobStatus() == JobStatus.LOADING,
                 "load.task.pause.no-permission");
        try {
            return this.service.pause(taskId);
        } finally {
            jobEntity.setJobStatus(JobStatus.LOADING);
            jobEntity.setUpdateTime(HubbleUtil.nowDate());
            this.jobService.update(jobEntity);
        }
    }

    @PostMapping("resume")
    public LoadTask resume(@PathVariable("graphspace") String graphSpace,
                           @PathVariable("graph") String graph,
                           @PathVariable("jobId") int jobId,
                           @RequestParam("task_id") int taskId) {
        JobManager jobEntity = this.jobService.get(graphSpace, graph, jobId);
        Ex.check(jobEntity != null, "job-manager.not-exist.id", jobId);
        Ex.check(this.service.get(graphSpace, graph, jobId, taskId) != null,
                 "load.task.not-exist.id", taskId);
        Ex.check(jobEntity.getJobStatus() == JobStatus.LOADING,
                 "load.task.pause.no-permission");
        try {
            return this.service.resume(taskId, this.getToken());
        } finally {
            jobEntity.setJobStatus(JobStatus.LOADING);
            jobEntity.setUpdateTime(HubbleUtil.nowDate());
            this.jobService.update(jobEntity);
        }
    }

    @PostMapping("stop")
    public LoadTask stop(@PathVariable("graphspace") String graphSpace,
                         @PathVariable("graph") String graph,
                         @PathVariable("jobId") int jobId,
                         @RequestParam("task_id") int taskId) {
        JobManager jobEntity = this.jobService.get(graphSpace, graph, jobId);
        Ex.check(jobEntity != null, "job-manager.not-exist.id", jobId);
        Ex.check(this.service.get(graphSpace, graph, jobId, taskId) != null,
                 "load.task.not-exist.id", taskId);
        Ex.check(jobEntity.getJobStatus() == JobStatus.LOADING,
                 "load.task.pause.no-permission");
        try {
            return this.service.stop(taskId);
        } finally {
            jobEntity.setJobStatus(JobStatus.LOADING);
            jobEntity.setUpdateTime(HubbleUtil.nowDate());
            this.jobService.update(jobEntity);
        }
    }

    @PostMapping("retry")
    public LoadTask retry(@PathVariable("graphspace") String graphSpace,
                          @PathVariable("graph") String graph,
                          @PathVariable("jobId") int jobId,
                          @RequestParam("task_id") int taskId) {
        JobManager jobEntity = this.jobService.get(graphSpace, graph, jobId);
        Ex.check(jobEntity != null, "job-manager.not-exist.id", jobId);
        Ex.check(this.service.get(graphSpace, graph, jobId, taskId) != null,
                 "load.task.not-exist.id", taskId);
        Ex.check(jobEntity.getJobStatus() == JobStatus.LOADING,
                 "load.task.pause.no-permission");
        try {
            return this.service.retry(taskId, this.getToken());
        } finally {
            jobEntity.setJobStatus(JobStatus.LOADING);
            jobEntity.setUpdateTime(HubbleUtil.nowDate());
            this.jobService.update(jobEntity);
        }
    }

    @GetMapping("{id}/reason")
    public Response reason(@PathVariable("graphspace") String graphSpace,
                           @PathVariable("graph") String graph,
                           @PathVariable("jobId") int jobId,
                           @PathVariable("id") int id) {
        LoadTask task = this.service.get(graphSpace, graph, jobId, id);
        if (task == null) {
            throw new ExternalException("load.task.not-exist.id", id);
        }
        JobManager jobEntity = this.jobService.get(graphSpace, graph, jobId);
        Ex.check(jobEntity != null, "job-manager.not-exist.id", jobId);
        Integer fileId = task.getFileId();
        FileMapping mapping = this.fmService.get(graphSpace, graph, jobId,
                                                  fileId);
        String reason = this.service.readLoadFailedReason(mapping);
        return Response.builder()
                       .status(Constant.STATUS_OK)
                       .data(reason)
                       .build();
    }
}
