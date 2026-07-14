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

package org.apache.hugegraph.controller.ingest;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.extern.log4j.Log4j2;
import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.common.Response;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.controller.BaseController;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.GraphConnection;
import org.apache.hugegraph.entity.enums.FileMappingStatus;
import org.apache.hugegraph.entity.enums.JobStatus;
import org.apache.hugegraph.entity.enums.LoadStatus;
import org.apache.hugegraph.entity.load.Datasource;
import org.apache.hugegraph.entity.load.EdgeMapping;
import org.apache.hugegraph.entity.load.FieldMappingItem;
import org.apache.hugegraph.entity.load.FileMapping;
import org.apache.hugegraph.entity.load.FileSetting;
import org.apache.hugegraph.entity.load.JobManager;
import org.apache.hugegraph.entity.load.LoadParameter;
import org.apache.hugegraph.entity.load.LoadTask;
import org.apache.hugegraph.entity.load.NullValues;
import org.apache.hugegraph.entity.load.ValueMappingItem;
import org.apache.hugegraph.entity.load.VertexMapping;
import org.apache.hugegraph.exception.InternalException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.load.DatasourceService;
import org.apache.hugegraph.service.load.FileMappingService;
import org.apache.hugegraph.service.load.JobManagerService;
import org.apache.hugegraph.service.load.LoadTaskService;
import org.apache.hugegraph.util.Ex;
import org.apache.hugegraph.util.FileUtil;
import org.apache.hugegraph.util.HubbleUtil;
import org.apache.hugegraph.util.UrlUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Log4j2
@RestController
@RequestMapping(Constant.API_VERSION + "ingest")
public class IngestController extends BaseController {

    @Autowired
    private JobManagerService jobManagerService;
    @Autowired
    private LoadTaskService loadTaskService;
    @Autowired
    private DatasourceService datasourceService;
    @Autowired
    private FileMappingService fileMappingService;
    @Autowired
    private HugeConfig config;

    // ===== Datasource endpoints =====

    @GetMapping("/datasources/list")
    public Response datasourceList(
            @RequestParam(name = "query", required = false, defaultValue = "") String query,
            @RequestParam(name = "page_no", required = false, defaultValue = "1") int pageNo,
            @RequestParam(name = "page_size", required = false, defaultValue = "10") int pageSize) {
        IPage<Datasource> page = datasourceService.list(pageNo, pageSize, query);
        return Response.builder().status(Constant.STATUS_OK).data(page).build();
    }

    @GetMapping("/datasources/{id}")
    public Response datasourceGet(@PathVariable("id") int id) {
        Datasource ds = datasourceService.get(id);
        if (ds == null) {
            return Response.builder().status(Constant.STATUS_NOT_FOUND)
                           .message("Datasource not found: " + id).build();
        }
        return Response.builder().status(Constant.STATUS_OK).data(ds).build();
    }

    @PostMapping("/datasources")
    public Response datasourceCreate(@RequestBody Datasource entity) {
        datasourceService.save(entity);
        return Response.builder().status(Constant.STATUS_OK)
                       .data(Map.of("datasource_id", entity.getId())).build();
    }

    @DeleteMapping("/datasources/{id}")
    public Response datasourceDelete(@PathVariable("id") int id) {
        datasourceService.remove(id);
        return Response.builder().status(Constant.STATUS_OK).build();
    }

    @PostMapping("/datasources/delete")
    public Response datasourceBatchDelete(@RequestBody List<Integer> ids) {
        datasourceService.removeBatch(ids);
        return Response.builder().status(Constant.STATUS_OK).build();
    }

    @PostMapping("/files/upload")
    public Response uploadFile(@RequestParam("file") MultipartFile file) {
        Ex.check(file != null && !file.isEmpty(), "load.upload.file.cannot-be-empty");
        String fileName = FilenameUtils.getName(file.getOriginalFilename());
        Ex.check(StringUtils.isNotBlank(fileName) &&
                 fileName.equals(file.getOriginalFilename()),
                 "load.upload.file.name.invalid");
        Long limit = this.config.get(HubbleOptions.UPLOAD_SINGLE_FILE_SIZE_LIMIT);
        Ex.check(file.getSize() <= limit, "load.upload.file.exceed-single-size",
                 limit);

        Path uploadRoot = Paths.get(this.config.get(HubbleOptions.UPLOAD_FILE_LOCATION))
                               .toAbsolutePath()
                               .normalize();
        Path target = uploadRoot.resolve("ingest")
                                .resolve(UUID.randomUUID().toString())
                                .resolve(fileName)
                                .normalize();
        Ex.check(target.startsWith(uploadRoot),
                 "load.upload.file.path.outside-root", target, uploadRoot);
        try {
            FileUtils.forceMkdirParent(target.toFile());
            file.transferTo(target.toFile());
        } catch (IOException e) {
            throw new InternalException("Failed to save ingest upload file %s",
                                        e, fileName);
        }

        Map<String, Object> data = new HashMap<>();
        data.put("file", target.toString());
        return Response.builder().status(Constant.STATUS_OK).data(data).build();
    }

    @GetMapping("/schemas")
    public Response datasourceSchema(@RequestParam("datasource") int id) {
        Datasource datasource = datasourceService.get(id);
        if (datasource == null) {
            return Response.builder().status(Constant.STATUS_NOT_FOUND)
                           .message("Datasource not found: " + id).build();
        }

        Map<String, Object> config = datasource.getDatasourceConfig();
        if (!"FILE".equals(config.get("type"))) {
            return Response.builder().status(Constant.STATUS_BAD_REQUEST)
                           .message("Only FILE datasource schema is supported")
                           .build();
        }

        List<String> header = this.stringList(config.get("header"));
        if (!header.isEmpty()) {
            return Response.builder().status(Constant.STATUS_OK)
                           .data(header).build();
        }

        FileSetting setting = this.buildFileSetting(config, Collections.emptyList(),
                                                    false);
        ColumnInfo columns = this.readColumns(this.requireUploadFile(config),
                                             setting, false);
        return Response.builder().status(Constant.STATUS_OK)
                       .data(columns.names).build();
    }

    @PostMapping("/jdbc/check")
    public Response checkJdbc() {
        return Response.builder().status(Constant.STATUS_BAD_REQUEST)
                       .message("JDBC datasource check is not supported locally")
                       .build();
    }

    // ===== Task endpoints (job_manager table) =====

    @PostMapping("/tasks")
    public Response createTask(@RequestBody IngestTaskRequest request) {
        Ex.check(request != null, "common.param.cannot-be-null-or-empty",
                 "task");
        Ex.check("ONCE".equals(request.taskScheduleType),
                 "Only ONCE ingest tasks are currently supported");
        Datasource datasource = datasourceService.get(request.datasourceId);
        Ex.check(datasource != null, "Datasource not found: %s",
                 request.datasourceId);
        Map<String, Object> dsConfig = datasource.getDatasourceConfig();
        Ex.check("FILE".equals(dsConfig.get("type")),
                 "Only FILE datasource ingest tasks are currently supported");

        IngestStruct struct = request.firstStruct();
        Map<String, Object> input = new HashMap<>(dsConfig);
        if (struct.input != null) {
            input.putAll(struct.input);
        }

        String graphSpace = request.ingestionOption.graphspace;
        String graph = request.ingestionOption.graph;
        File sourceFile = this.requireUploadFile(input);
        long totalSize = sourceFile.length();
        List<String> header = this.stringList(input.get("header"));
        boolean hasPhysicalHeader = !this.stringList(dsConfig.get("header"))
                                     .isEmpty();
        FileSetting setting = this.buildFileSetting(input, header,
                                                    hasPhysicalHeader);
        if (setting.getColumnNames() == null ||
            setting.getColumnNames().isEmpty()) {
            ColumnInfo columns = this.readColumns(sourceFile, setting,
                                                 hasPhysicalHeader);
            setting.setColumnNames(columns.names);
            setting.setColumnValues(columns.values);
        }

        Set<VertexMapping> vertexMappings = this.vertexMappings(struct.vertices);
        Set<EdgeMapping> edgeMappings = this.edgeMappings(struct.edges);
        Ex.check(!vertexMappings.isEmpty() || !edgeMappings.isEmpty(),
                 "At least one vertex or edge mapping is required");

        JobManager job = JobManager.builder()
                                   .graphSpace(graphSpace)
                                   .graph(graph)
                                   .jobName(request.taskName)
                                   .jobSize(totalSize)
                                   .jobStatus(JobStatus.LOADING)
                                   .createTime(HubbleUtil.nowDate())
                                   .updateTime(HubbleUtil.nowDate())
                                   .build();
        FileMapping mapping = new FileMapping(graphSpace, graph,
                                              sourceFile.getName(),
                                              sourceFile.getPath());
        mapping.setFileStatus(FileMappingStatus.COMPLETED);
        mapping.setTotalSize(totalSize);
        mapping.setTotalLines(FileUtil.countLines(sourceFile.getPath()));
        mapping.setFileSetting(setting);
        mapping.setLoadParameter(new LoadParameter());
        mapping.setVertexMappings(vertexMappings);
        mapping.setEdgeMappings(edgeMappings);

        GraphConnection connection = this.graphConnection(graphSpace, graph);
        HugeClient client = this.authClient(graphSpace, graph);
        LoadTask task = this.jobManagerService.createIngestTask(
                job, mapping, connection, client);
        Map<String, Object> data = new HashMap<>();
        data.put("task_id", job.getId());
        data.put("job_id", task.getId());
        return Response.builder().status(Constant.STATUS_OK)
                       .data(data).build();
    }

    @GetMapping("/tasks/list")
    public Response taskList(
            @RequestParam(name = "query", required = false, defaultValue = "") String query,
            @RequestParam(name = "page_no", required = false, defaultValue = "1") int pageNo,
            @RequestParam(name = "page_size", required = false, defaultValue = "10") int pageSize) {

        // list all jobs across all graphspaces - use empty strings to get all
        // We need to query without graphspace/graph filter for the ingest view
        IPage<JobManager> page = jobManagerService.listAll(pageNo, pageSize, query);

        IPage<TaskVO> result = page.convert(job -> {
            TaskVO vo = new TaskVO();
            vo.taskId = job.getId();
            vo.taskName = job.getJobName();
            vo.taskScheduleType = "ONCE";
            vo.taskScheduleStatus = toScheduleStatus(job.getJobStatus());
            vo.createTime = job.getCreateTime();
            vo.creator = "";

            // Build ingestion_option from job fields
            Map<String, Object> option = new HashMap<>();
            option.put("graphspace", job.getGraphSpace());
            option.put("graph", job.getGraph());
            vo.ingestionOption = option;

            // Build ingestion_mapping with structs from file mappings
            List<LoadTask> tasks = loadTaskService.taskListByJob(job.getId());
            List<Map<String, Object>> structs = tasks.stream().map(t -> {
                Map<String, Object> struct = new HashMap<>();
                Map<String, Object> input = new HashMap<>();
                input.put("type", "FILE");
                input.put("path", t.getFileName());
                struct.put("input", input);
                return struct;
            }).collect(Collectors.toList());
            Map<String, Object> mapping = new HashMap<>();
            mapping.put("structs", structs);
            vo.ingestionMapping = mapping;

            // Build last_metrics from latest load task
            if (!tasks.isEmpty()) {
                LoadTask latest = tasks.get(tasks.size() - 1);
                Map<String, Object> metrics = new HashMap<>();
                metrics.put("status", latest.getStatus().name());
                metrics.put("load_progress", latest.getLoadProgress());
                vo.lastMetrics = metrics;
            }

            // Build job_summary
            JobSummaryVO summary = new JobSummaryVO();
            for (LoadTask t : tasks) {
                if (t.getStatus() == LoadStatus.SUCCEED) {
                    summary.successCount++;
                } else if (t.getStatus() == LoadStatus.FAILED) {
                    summary.failedCount++;
                } else if (t.getStatus().inRunning()) {
                    summary.runningCount++;
                }
            }
            vo.jobSummary = summary;

            return vo;
        });

        return Response.builder().status(Constant.STATUS_OK).data(result).build();
    }

    @GetMapping("/tasks/{id}")
    public Response taskDetail(@PathVariable("id") int id) {
        JobManager job = jobManagerService.get(id);
        if (job == null) {
            return Response.builder().status(Constant.STATUS_NOT_FOUND)
                           .message("Task not found: " + id).build();
        }
        return Response.builder().status(Constant.STATUS_OK).data(job).build();
    }

    @DeleteMapping("/tasks/{id}")
    public Response deleteTask(@PathVariable("id") int id) {
        jobManagerService.remove(id);
        return Response.builder().status(Constant.STATUS_OK).build();
    }

    @PutMapping("/tasks/{id}/enable")
    public Response enableTask(@PathVariable("id") int id) {
        JobManager job = jobManagerService.get(id);
        if (job == null) {
            return Response.builder().status(Constant.STATUS_NOT_FOUND)
                           .message("Task not found: " + id).build();
        }
        job.setJobStatus(JobStatus.DEFAULT);
        jobManagerService.update(job);
        return Response.builder().status(Constant.STATUS_OK).build();
    }

    @PutMapping("/tasks/{id}/disable")
    public Response disableTask(@PathVariable("id") int id) {
        JobManager job = jobManagerService.get(id);
        if (job == null) {
            return Response.builder().status(Constant.STATUS_NOT_FOUND)
                           .message("Task not found: " + id).build();
        }
        job.setJobStatus(JobStatus.FAILED);
        jobManagerService.update(job);
        return Response.builder().status(Constant.STATUS_OK).build();
    }

    // ===== Job endpoints (load_task table) =====

    @GetMapping("/jobs/list")
    public Response jobList(
            @RequestParam(name = "taskid", required = false, defaultValue = "0") int taskId,
            @RequestParam(name = "page_no", required = false, defaultValue = "1") int pageNo,
            @RequestParam(name = "page_size", required = false, defaultValue = "10") int pageSize) {

        List<LoadTask> tasks = loadTaskService.taskListByJob(taskId);

        // Manual pagination
        int total = tasks.size();
        int fromIndex = Math.min((pageNo - 1) * pageSize, total);
        int toIndex = Math.min(fromIndex + pageSize, total);
        List<LoadTask> pageData = tasks.subList(fromIndex, toIndex);

        List<JobVO> records = pageData.stream().map(t -> {
            JobVO vo = new JobVO();
            vo.jobId = t.getId();
            vo.taskId = t.getJobId();
            vo.jobStatus = t.getStatus().name();
            vo.jobMessage = "";
            vo.createTime = t.getCreateTime();

            JobMetricsVO metrics = new JobMetricsVO();
            metrics.totalCount = t.getFileReadLines() != null ? t.getFileReadLines() : 0L;
            long durationMs = t.getDuration() != null ? t.getDuration() : 0L;
            long durationSec = durationMs > 0 ?
                               Math.max(1L, durationMs / 1000L) : 1L;
            metrics.avgRate = durationMs > 0 ? (float) metrics.totalCount / durationSec : 0f;
            metrics.curRate = t.getStatus().inRunning() ? metrics.avgRate : 0f;
            metrics.totalTime = durationMs;
            vo.jobMetrics = metrics;

            return vo;
        }).collect(Collectors.toList());

        Map<String, Object> result = new HashMap<>();
        result.put("records", records);
        result.put("total", total);
        result.put("size", pageSize);
        result.put("current", pageNo);

        return Response.builder().status(Constant.STATUS_OK).data(result).build();
    }

    @GetMapping("/jobs/{id}")
    public Response jobDetail(@PathVariable("id") int id) {
        LoadTask task = loadTaskService.get(id);
        if (task == null) {
            return Response.builder().status(Constant.STATUS_NOT_FOUND)
                           .message("Job not found: " + id).build();
        }
        return Response.builder().status(Constant.STATUS_OK).data(task).build();
    }

    @DeleteMapping("/jobs/{id}")
    public Response deleteJob(@PathVariable("id") int id) {
        loadTaskService.remove(id);
        return Response.builder().status(Constant.STATUS_OK).build();
    }

    // ===== Metrics =====

    @GetMapping("/metrics/task")
    public Response metricsTask() {
        List<JobManager> all = jobManagerService.listAll();
        all.forEach(jobManagerService::refreshStatus);

        long runningOnce = 0;
        long runningCron = 0;
        long runningRealtime = 0;
        long todoOnce = 0;
        long todoCron = 0;
        long todoRealtime = 0;

        for (JobManager job : all) {
            if (job.getJobStatus() == JobStatus.LOADING) {
                runningOnce++;
            } else if (job.getJobStatus() == JobStatus.DEFAULT ||
                       job.getJobStatus() == JobStatus.SETTING) {
                todoOnce++;
            }
        }

        Map<String, Object> todo = new HashMap<>();
        todo.put("ONCE", todoOnce);
        todo.put("CRON", todoCron);
        todo.put("REALTIME", todoRealtime);

        Map<String, Object> running = new HashMap<>();
        running.put("ONCE", runningOnce);
        running.put("CRON", runningCron);
        running.put("REALTIME", runningRealtime);

        Map<String, Object> data = new HashMap<>();
        data.put("total_realtime_size", 0);
        data.put("total_other_size", all.size());
        data.put("todo", todo);
        data.put("running", running);

        return Response.builder().status(Constant.STATUS_OK).data(data).build();
    }

    // ===== Helpers =====

    private GraphConnection graphConnection(String graphSpace, String graph) {
        GraphConnection connection = new GraphConnection();
        connection.setCluster(config.get(HubbleOptions.PD_CLUSTER));
        connection.setRouteType(config.get(HubbleOptions.ROUTE_TYPE));
        connection.setPdPeers(config.get(HubbleOptions.PD_PEERS));
        connection.setGraphSpace(graphSpace);
        connection.setGraph(graph);
        connection.setToken(this.getToken());
        connection.setUsername(this.getUser());
        if (!config.get(HubbleOptions.PD_ENABLED)) {
            UrlUtil.Host host = UrlUtil.parseHost(config.get(
                    HubbleOptions.SERVER_URL));
            connection.setProtocol(host.getScheme());
            connection.setHost(host.getHost());
            connection.setPort(host.getPort());
        }
        return connection;
    }

    private File requireUploadFile(Map<String, Object> config) {
        String path = this.string(config.get("path"));
        Ex.check(StringUtils.isNotBlank(path),
                 "Datasource file path is empty");
        return this.fileMappingService.requirePathUnderUploadRoot(path);
    }

    private FileSetting buildFileSetting(Map<String, Object> input,
                                         List<String> header,
                                         boolean hasPhysicalHeader) {
        FileSetting setting = new FileSetting();
        setting.setHasHeader(hasPhysicalHeader);
        if (!header.isEmpty()) {
            setting.setColumnNames(header);
        }
        setting.setFormat(this.stringOrDefault(input.get("format"), "CSV"));
        setting.setDelimiter(this.stringOrDefault(input.get("delimiter"), ","));
        setting.setCharset(this.stringOrDefault(input.get("charset"), "UTF-8"));
        setting.setDateFormat(this.stringOrDefault(input.get("date_format"),
                                                   "yyyy-MM-dd HH:mm:ss"));
        setting.setTimeZone(this.stringOrDefault(input.get("time_zone"),
                                                 "GMT+8"));
        Object skippedLine = input.get("skipped_line");
        if (skippedLine instanceof Map) {
            setting.setSkippedLine(this.stringOrDefault(
                    ((Map<?, ?>) skippedLine).get("regex"), "(^#|^//).*"));
        } else {
            setting.setSkippedLine(this.stringOrDefault(skippedLine,
                                                        "(^#|^//).*"));
        }
        setting.changeFormatIfNeeded();
        return setting;
    }

    private ColumnInfo readColumns(File file, FileSetting setting,
                                   boolean hasPhysicalHeader) {
        try (BufferedReader reader = Files.newBufferedReader(file.toPath())) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.matches(setting.getSkippedLine())) {
                    break;
                }
            }
            Ex.check(line != null, "The file has no data line can treat as header");

            List<String> firstLine = this.splitLine(line, setting.getDelimiter());
            if (hasPhysicalHeader) {
                String sample = reader.readLine();
                List<String> values = sample == null ? Collections.emptyList() :
                                      this.splitLine(sample,
                                                     setting.getDelimiter());
                return new ColumnInfo(firstLine, values);
            }

            List<String> names = new ArrayList<>();
            for (int i = 1; i <= firstLine.size(); i++) {
                names.add("col-" + i);
            }
            return new ColumnInfo(names, firstLine);
        } catch (IOException e) {
            throw new InternalException("Failed to read columns from file %s",
                                        e, file);
        }
    }

    private List<String> splitLine(String line, String delimiter) {
        if (line == null) {
            return Collections.emptyList();
        }
        String[] values = StringUtils.split(line, delimiter);
        List<String> list = new ArrayList<>();
        if (values != null) {
            Collections.addAll(list, values);
        }
        return list;
    }

    private Set<VertexMapping> vertexMappings(List<Map<String, Object>> raw) {
        Set<VertexMapping> mappings = new LinkedHashSet<>();
        if (raw == null) {
            return mappings;
        }
        for (int i = 0; i < raw.size(); i++) {
            Map<String, Object> item = raw.get(i);
            List<String> idFields = this.stringList(item.get("id_fields"));
            String id = this.string(item.get("id"));
            if (idFields.isEmpty() && StringUtils.isNotBlank(id)) {
                idFields = Collections.singletonList(id);
            }
            VertexMapping mapping = VertexMapping.builder()
                                                 .idFields(idFields)
                                                 .build();
            this.fillElementMapping(mapping, item, "vertex-" + i);
            mappings.add(mapping);
        }
        return mappings;
    }

    private Set<EdgeMapping> edgeMappings(List<Map<String, Object>> raw) {
        Set<EdgeMapping> mappings = new LinkedHashSet<>();
        if (raw == null) {
            return mappings;
        }
        for (int i = 0; i < raw.size(); i++) {
            Map<String, Object> item = raw.get(i);
            EdgeMapping mapping = EdgeMapping.builder()
                                             .sourceFields(this.stringList(
                                                     item.get("source")))
                                             .targetFields(this.stringList(
                                                     item.get("target")))
                                             .build();
            this.fillElementMapping(mapping, item, "edge-" + i);
            mappings.add(mapping);
        }
        return mappings;
    }

    private void fillElementMapping(
            org.apache.hugegraph.entity.load.ElementMapping mapping,
            Map<String, Object> item, String id) {
        mapping.setId(id);
        mapping.setLabel(this.string(item.get("label")));
        mapping.setFieldMappings(this.fieldMappings(
                item.get("field_mapping")));
        mapping.setValueMappings(this.valueMappings(
                item.get("value_mapping")));
        mapping.setNullValues(this.nullValues(item.get("null_values")));
    }

    private List<FieldMappingItem> fieldMappings(Object raw) {
        if (!(raw instanceof Map)) {
            return Collections.emptyList();
        }
        List<FieldMappingItem> mappings = new ArrayList<>();
        for (Map.Entry<?, ?> entry : ((Map<?, ?>) raw).entrySet()) {
            mappings.add(FieldMappingItem.builder()
                                         .columnName(this.string(entry.getKey()))
                                         .mappedName(this.string(entry.getValue()))
                                         .build());
        }
        return mappings;
    }

    private List<ValueMappingItem> valueMappings(Object raw) {
        if (!(raw instanceof Map)) {
            return Collections.emptyList();
        }
        List<ValueMappingItem> mappings = new ArrayList<>();
        for (Map.Entry<?, ?> entry : ((Map<?, ?>) raw).entrySet()) {
            List<ValueMappingItem.ValueItem> values = new ArrayList<>();
            if (entry.getValue() instanceof Map) {
                for (Map.Entry<?, ?> valueEntry :
                     ((Map<?, ?>) entry.getValue()).entrySet()) {
                    values.add(ValueMappingItem.ValueItem.builder()
                              .columnValue(this.string(valueEntry.getKey()))
                              .mappedValue(this.string(valueEntry.getValue()))
                              .build());
                }
            }
            mappings.add(ValueMappingItem.builder()
                                         .columnName(this.string(entry.getKey()))
                                         .values(values)
                                         .build());
        }
        return mappings;
    }

    private NullValues nullValues(Object raw) {
        Set<Object> checked = new LinkedHashSet<>();
        Set<Object> customized = new LinkedHashSet<>();
        if (raw instanceof Map) {
            checked.addAll(this.objectSet(((Map<?, ?>) raw).get("checked")));
            customized.addAll(this.objectSet(((Map<?, ?>) raw).get(
                    "customized")));
        } else {
            checked.addAll(this.objectSet(raw));
        }
        return NullValues.builder()
                         .checked(checked)
                         .customized(customized)
                         .build();
    }

    private Set<Object> objectSet(Object raw) {
        Set<Object> values = new LinkedHashSet<>();
        if (raw instanceof Iterable) {
            for (Object item : (Iterable<?>) raw) {
                values.add(item);
            }
        } else if (raw != null) {
            values.add(raw);
        }
        return values;
    }

    private List<String> stringList(Object raw) {
        if (raw instanceof Iterable) {
            List<String> values = new ArrayList<>();
            for (Object item : (Iterable<?>) raw) {
                values.add(this.string(item));
            }
            return values;
        }
        if (raw == null || StringUtils.isBlank(raw.toString())) {
            return Collections.emptyList();
        }
        return Collections.singletonList(raw.toString());
    }

    private String stringOrDefault(Object raw, String defaultValue) {
        String value = this.string(raw);
        return StringUtils.isBlank(value) ? defaultValue : value;
    }

    private String string(Object raw) {
        return raw == null ? null : raw.toString();
    }

    private String toScheduleStatus(JobStatus status) {
        if (status == JobStatus.FAILED) {
            return "DISABLE";
        }
        return "ENABLE";
    }

    // ===== VOs =====

    @Data
    static class TaskVO {
        @JsonProperty("task_id") Integer taskId;
        @JsonProperty("task_name") String taskName;
        @JsonProperty("task_schedule_type") String taskScheduleType;
        @JsonProperty("task_schedule_status") String taskScheduleStatus;
        @JsonProperty("ingestion_option") Object ingestionOption;
        @JsonProperty("ingestion_mapping") Object ingestionMapping;
        @JsonProperty("last_metrics") Object lastMetrics;
        @JsonProperty("job_summary") JobSummaryVO jobSummary;
        @JsonProperty("create_time") Date createTime;
        @JsonProperty("creator") String creator;
    }

    @Data
    static class JobSummaryVO {
        @JsonProperty("success_count") int successCount;
        @JsonProperty("failed_count") int failedCount;
        @JsonProperty("running_count") int runningCount;
    }

    @Data
    static class JobVO {
        @JsonProperty("job_id") Integer jobId;
        @JsonProperty("task_id") Integer taskId;
        @JsonProperty("job_status") String jobStatus;
        @JsonProperty("job_message") String jobMessage;
        @JsonProperty("job_metrics") JobMetricsVO jobMetrics;
        @JsonProperty("create_time") Date createTime;
    }

    @Data
    static class JobMetricsVO {
        @JsonProperty("total_count") long totalCount;
        @JsonProperty("avg_rate") float avgRate;
        @JsonProperty("cur_rate") float curRate;
        @JsonProperty("total_time") long totalTime;
    }

    @Data
    static class IngestTaskRequest {
        @JsonProperty("task_name") String taskName;
        @JsonProperty("datasource_id") Integer datasourceId;
        @JsonProperty("task_schedule_type") String taskScheduleType;
        @JsonProperty("ingestion_option") IngestionOption ingestionOption;
        @JsonProperty("ingestion_mapping") IngestionMapping ingestionMapping;

        IngestStruct firstStruct() {
            Ex.check(this.ingestionOption != null,
                     "common.param.cannot-be-null-or-empty",
                     "ingestion_option");
            Ex.check(this.ingestionMapping != null &&
                     this.ingestionMapping.structs != null &&
                     !this.ingestionMapping.structs.isEmpty(),
                     "common.param.cannot-be-null-or-empty",
                     "ingestion_mapping.structs");
            return this.ingestionMapping.structs.get(0);
        }
    }

    @Data
    static class IngestionOption {
        @JsonProperty("graphspace") String graphspace;
        @JsonProperty("graph") String graph;
    }

    @Data
    static class IngestionMapping {
        @JsonProperty("structs") List<IngestStruct> structs;
    }

    @Data
    static class IngestStruct {
        @JsonProperty("input") Map<String, Object> input;
        @JsonProperty("vertices") List<Map<String, Object>> vertices;
        @JsonProperty("edges") List<Map<String, Object>> edges;
    }

    static class ColumnInfo {
        private final List<String> names;
        private final List<String> values;

        ColumnInfo(List<String> names, List<String> values) {
            this.names = names;
            this.values = values;
        }
    }
}
