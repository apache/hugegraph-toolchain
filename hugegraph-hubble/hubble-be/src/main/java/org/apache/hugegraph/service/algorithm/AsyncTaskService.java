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

package org.apache.hugegraph.service.algorithm;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.extern.log4j.Log4j2;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.structure.Task;
import org.apache.hugegraph.util.PageUtil;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.apache.hugegraph.service.space.DirectVermeerService;
import org.apache.hugegraph.util.E;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.exception.ServerException;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Log4j2
@Service
public class AsyncTaskService {

    @Autowired
    private DirectVermeerService vermeer;

    private static final String VERMEER_TASK_TYPE = "vermeer-task";
    private static final String VERMEER_TASK_LOAD = "vermeer-task:load";
    private static final String VERMEER_TASK_COMPUTE = "vermeer-task:compute";
    private static final int MAX_TASK_ID_BATCH_SIZE = 32;
    private static final Pattern DISPLAY_ID =
            Pattern.compile("(?i)^(server|vermeer) #([0-9]+)$");

    public Task get(HugeClient client, int id) {
        if (id < 0) {
            return this.vermeer.task(client, id, true);
        }
        Task task = client.task().get(id);
        if (isVermeerType(task.type())) {
            task.type(switchVermeerType(task.name()));
        }
        return task;
    }

    private boolean isVermeerType(String type) {
        return VERMEER_TASK_TYPE.equals(type);
    }

    private String switchVermeerType(String name) {
        if (VERMEER_TASK_LOAD.equals(name)) {
            return name;
        }
        return VERMEER_TASK_COMPUTE;
    }

    public List<Task> list(HugeClient client, List<Long> taskIds) {
        E.checkArgument(taskIds.size() <= MAX_TASK_ID_BATCH_SIZE,
                        "At most %s task IDs can be queried at once", MAX_TASK_ID_BATCH_SIZE);
        List<Long> serverIds = taskIds.stream().filter(id -> id >= 0).toList();
        List<Task> tasks = new ArrayList<>();
        tasks.addAll(this.listServerTasks(client, serverIds));
        for (Long id : taskIds) {
            if (id < 0) {
                tasks.add(this.vermeer.task(client, Math.toIntExact(id), false));
            }
        }
        for (Task task: tasks) {
            if (isVermeerType(task.type())) {
                task.type(switchVermeerType(task.name()));
            }
        }
        return tasks;
    }

    public IPage<Task> list(HugeClient client, int pageNo, int pageSize,
                            String content,
                            String type, String status) {
        if (status.isEmpty()) {
            status = null;
        }
        List<Task> tasks = new ArrayList<>(client.task().list(status));
        content = content.trim();
        Matcher displayId = DISPLAY_ID.matcher(content);
        boolean qualifiedId = displayId.matches();
        if (!qualifiedId || "server".equalsIgnoreCase(displayId.group(1))) {
            this.addExactIdTask(client, tasks, qualifiedId ? displayId.group(2) : content);
        }
        boolean vermeerUnavailable = false;
        if (this.vermeer != null && this.vermeer.configured() && this.vermeer.supported() &&
            (type.isEmpty() || type.startsWith(VERMEER_TASK_TYPE))) {
            try {
                tasks.addAll(this.vermeer.tasks(client));
            } catch (ExternalException e) {
                vermeerUnavailable = true;
                log.warn("Vermeer tasks are unavailable; retaining Server tasks");
            }
        }
        for (Task task: tasks) {
            if (isVermeerType(task.type())) {
                task.type(switchVermeerType(task.name()));
            }
        }

        List<Task> result = new ArrayList<>();
        for (Task task : tasks) {
            if (status != null && !status.toLowerCase(Locale.ROOT).equals(task.status())) {
                continue;
            }
            if (!type.isEmpty() && !type.equals(task.type())) {
                continue;
            }
            if (!content.isEmpty()) {
                String taskId = String.valueOf(task.id());
                if (qualifiedId) {
                    // A displayed identity selects one source and ID, not task names.
                    boolean vermeerId = taskId.startsWith("-");
                    String source = vermeerId ? "vermeer" : "server";
                    String nativeId = vermeerId ? taskId.substring(1) : taskId;
                    if (!source.equalsIgnoreCase(displayId.group(1)) ||
                        !nativeId.equals(displayId.group(2))) {
                        continue;
                    }
                } else if (!content.equals(taskId) &&
                    !(taskId.startsWith("-") && content.equals(taskId.substring(1))) &&
                    (task.name() == null || !task.name().contains(content))) {
                    continue;
                }
            }
            result.add(task);
        }
        result.sort(Comparator.comparing(Task::createTime).reversed());
        return new TaskPage(PageUtil.page(result, pageNo, pageSize), vermeerUnavailable);
    }

    private void addExactIdTask(HugeClient client, List<Task> tasks, String content) {
        final long id;
        try {
            id = Long.parseLong(content);
        } catch (NumberFormatException ignored) {
            return;
        }
        if (id < 0 || tasks.stream().anyMatch(task -> task.id() == id)) {
            return;
        }
        // A submitted task may be in the scheduler before its persisted
        // list entry is visible. The IDs API returns metadata, not results.
        tasks.addAll(this.listServerTasks(client, List.of(id)));
    }

    private List<Task> listServerTasks(HugeClient client, List<Long> ids) {
        List<Long> remaining = ids;
        while (!remaining.isEmpty()) {
            try {
                return client.task().list(remaining);
            } catch (ServerException e) {
                Long missing = missingTaskId(e, remaining);
                if (missing == null) {
                    throw e;
                }
                // The batch limit bounds upstream requests to 32. Each fallback
                // removes a confirmed missing ID and preserves other metadata.
                remaining = remaining.stream().filter(id -> !id.equals(missing)).toList();
            }
        }
        return List.of();
    }

    private static Long missingTaskId(ServerException error, List<Long> ids) {
        String notFound = "org.apache.hugegraph.exception.NotFoundException";
        if (error.status() != 404 ||
            (!notFound.equals(error.exception()) &&
             !("class " + notFound).equals(error.exception()))) {
            return null;
        }
        // Graph and route failures also use 404. Only a scheduler's missing
        // requested task is an expected discovery delay.
        return ids.stream().filter(id ->
                ("Can't find task with id '" + id + "'").equals(error.message()))
                  .findFirst().orElse(null);
    }

    public static class TaskPage extends Page<Task> {

        private final boolean vermeerUnavailable;

        public TaskPage(IPage<Task> page, boolean vermeerUnavailable) {
            super(page.getCurrent(), page.getSize(), page.getTotal());
            this.setRecords(page.getRecords());
            this.vermeerUnavailable = vermeerUnavailable;
        }

        public boolean isVermeerUnavailable() {
            return this.vermeerUnavailable;
        }
    }

    public void remove(HugeClient client, int id) {
        E.checkArgument(id >= 0, "Vermeer does not support deleting task history");
        client.task().delete(id);
    }

    public Task cancel(HugeClient client, int id) {
        if (id < 0) {
            return this.vermeer.cancel(client, id);
        }
        return client.task().cancel(id);
    }
}
