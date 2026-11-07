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

package org.apache.hugegraph.cmd;

import java.util.Arrays;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.apache.commons.collections.CollectionUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.base.Printer;
import org.apache.hugegraph.base.ToolClient;
import org.apache.hugegraph.base.ToolManager;
import org.apache.hugegraph.constant.Constants;
import org.apache.hugegraph.exception.ExitException;
import org.apache.hugegraph.manager.AuthBackupRestoreManager;
import org.apache.hugegraph.manager.BackupManager;
import org.apache.hugegraph.manager.DumpGraphManager;
import org.apache.hugegraph.manager.GraphsManager;
import org.apache.hugegraph.manager.GremlinManager;
import org.apache.hugegraph.manager.RestoreManager;
import org.apache.hugegraph.manager.TasksManager;
import org.apache.hugegraph.structure.Task;
import org.apache.hugegraph.structure.constant.GraphMode;
import org.apache.hugegraph.structure.gremlin.Result;
import org.apache.hugegraph.structure.gremlin.ResultSet;
import org.apache.hugegraph.util.E;
import org.apache.hugegraph.util.ToolUtil;
import org.apache.logging.log4j.util.Strings;

import com.beust.jcommander.JCommander;
import com.beust.jcommander.ParameterException;
import com.beust.jcommander.ParametersDelegate;
import com.google.common.collect.Lists;

public class HugeGraphCommand {

    private static final int DEFAULT_GRAPH_CLEAR_TIMEOUT = 300;
    private static final int DEFAULT_GRAPH_CREATE_TIMEOUT = 300;

    private SubCommands subCommands;

    private List<ToolManager> taskManagers;

    @ParametersDelegate
    private SubCommands.Url url = new SubCommands.Url();

    @ParametersDelegate
    private SubCommands.Graph graph = new SubCommands.Graph();

    @ParametersDelegate
    private SubCommands.Username username = new SubCommands.Username();

    @ParametersDelegate
    private SubCommands.Password password = new SubCommands.Password();

    @ParametersDelegate
    private SubCommands.Timeout timeout = new SubCommands.Timeout();

    @ParametersDelegate
    private SubCommands.TrustStoreFile trustStoreFile =
                                       new SubCommands.TrustStoreFile();

    @ParametersDelegate
    private SubCommands.TrustStorePassword trustStorePassword =
                                           new SubCommands.TrustStorePassword();

    @ParametersDelegate
    private SubCommands.ThrowMode throwMode = new SubCommands.ThrowMode();

    public HugeGraphCommand() {
        this.subCommands = new SubCommands();
        this.taskManagers = Lists.newArrayList();
    }

    public Map<String, Object> subCommands() {
        return this.subCommands.commands();
    }

    @SuppressWarnings("unchecked")
    public <T> T subCommand(String subCmd) {
        return (T) this.subCommands.commands().get(subCmd);
    }

    public String url() {
        return this.url.url;
    }

    private void url(String url) {
        this.url.url = url;
    }

    public String graph() {
        return this.graph.graph;
    }

    private void graph(String graph) {
        this.graph.graph = graph;
    }

    public String username() {
        return this.username.username;
    }

    public void username(String username) {
        this.username.username = username;
    }

    public String password() {
        return this.password.password;
    }

    public void password(String password) {
        this.password.password = password;
    }

    public int timeout() {
        return this.timeout.timeout;
    }

    public void timeout(int timeout) {
        this.timeout.timeout = timeout;
    }

    public String trustStoreFile() {
        return this.trustStoreFile.trustStoreFile;
    }

    public void trustStoreFile(String trustStoreFile) {
        this.trustStoreFile.trustStoreFile = trustStoreFile;
    }

    public String trustStorePassword() {
        return this.trustStorePassword.trustStorePassword;
    }

    public void trustStorePassword(String trustStorePassword) {
        this.trustStorePassword.trustStorePassword = trustStorePassword;
    }

    public boolean throwMode() {
        return this.throwMode.throwMode;
    }

    private void throwMode(boolean throwMode) {
        this.throwMode.throwMode = throwMode;
    }

    public JCommander jcommander() {
        JCommander.Builder builder = JCommander.newBuilder();

        // Add main command firstly
        builder.addObject(this);

        // Add sub-commands
        for (Map.Entry<String, Object> entry : this.subCommands().entrySet()) {
            builder.addCommand(entry.getKey(), entry.getValue());
        }

        JCommander jCommander = builder.build();
        jCommander.setProgramName("hugegraph");
        jCommander.setCaseSensitiveOptions(true);
        jCommander.setAllowAbbreviatedOptions(true);
        return jCommander;
    }

    private void execute(String subCmd, JCommander jCommander) {
        this.checkMainParams();
        switch (subCmd) {
            case "backup":
                if (this.timeout() < BackupManager.BACKUP_DEFAULT_TIMEOUT) {
                    this.timeout(BackupManager.BACKUP_DEFAULT_TIMEOUT);
                }
                Printer.print("Graph '%s' start backup!", this.graph());
                SubCommands.Backup backup = this.subCommand(subCmd);
                BackupManager backupManager = manager(BackupManager.class);

                backupManager.init(backup);
                backupManager.backup(backup.types());
                break;
            case "restore":
                GraphsManager graphsManager = manager(GraphsManager.class);
                GraphMode mode = graphsManager.mode(this.graph());
                E.checkState(mode.maintaining(),
                             "Invalid mode '%s' of graph '%s' for restore " +
                             "sub-command", mode, this.graph());
                Printer.print("Graph '%s' start restore in mode '%s'!",
                              this.graph(), mode);
                SubCommands.Restore restore = this.subCommand(subCmd);
                RestoreManager restoreManager = manager(RestoreManager.class);

                restoreManager.init(restore);
                restoreManager.mode(mode);
                restoreManager.restore(restore.types());
                break;
            case "migrate":
                SubCommands.Migrate migrate = this.subCommand(subCmd);
                Printer.print("Migrate graph '%s' from '%s' to '%s' as '%s'",
                              this.graph(), this.url(),
                              migrate.targetUrl(), migrate.targetGraph());

                // Backup source graph
                if (this.timeout() < BackupManager.BACKUP_DEFAULT_TIMEOUT) {
                    this.timeout(BackupManager.BACKUP_DEFAULT_TIMEOUT);
                }
                backup = convMigrate2Backup(migrate);
                backupManager = manager(BackupManager.class);
                backupManager.init(backup);
                backupManager.backup(backup.types());

                // Restore source graph to target graph
                this.url(migrate.targetUrl());
                this.graph(migrate.targetGraph());
                this.username(migrate.targetUsername());
                this.password(migrate.targetPassword());
                this.timeout(migrate.targetTimeout());
                this.trustStoreFile(migrate.targetTrustStoreFile());
                this.trustStorePassword(migrate.targetTrustStorePassword());
                graphsManager = manager(GraphsManager.class);
                GraphMode origin = graphsManager.mode(migrate.targetGraph());
                // Set target graph mode
                mode = migrate.mode();
                E.checkState(mode.maintaining(),
                             "Invalid mode '%s' of graph '%s' for restore",
                             mode, migrate.targetGraph());
                graphsManager.mode(migrate.targetGraph(), mode);
                // Restore
                Printer.print("Graph '%s' start restore in mode '%s'!",
                              migrate.targetGraph(), migrate.mode());
                String directory = backupManager.directory().directory();
                restore = convMigrate2Restore(migrate, directory);
                restoreManager = manager(RestoreManager.class);
                restoreManager.init(restore);
                restoreManager.mode(mode);

                restoreManager.restore(restore.types());
                // Restore target graph mode
                graphsManager.mode(migrate.targetGraph(), origin);
                break;
            case "dump":
                Printer.print("Graph '%s' start dump!", this.graph());
                SubCommands.DumpGraph dump = this.subCommand(subCmd);
                DumpGraphManager dumpManager = manager(DumpGraphManager.class);

                dumpManager.init(dump);
                dumpManager.dumpFormatter(dump.formatter());
                dumpManager.dump();
                break;
            case "graph-create":
                SubCommands.GraphCreate graphCreate = this.subCommand(subCmd);
                if (timeout() < DEFAULT_GRAPH_CREATE_TIMEOUT) {
                    this.timeout(DEFAULT_GRAPH_CREATE_TIMEOUT);
                }
                graphsManager = manager(GraphsManager.class);
                graphsManager.create(graphCreate.name(), graphCreate.config());
                Printer.print("Graph '%s' is created", graphCreate.name());
                break;
            case "graph-clone":
                SubCommands.GraphClone graphClone = this.subCommand(subCmd);
                if (timeout() < DEFAULT_GRAPH_CREATE_TIMEOUT) {
                    this.timeout(DEFAULT_GRAPH_CREATE_TIMEOUT);
                }
                graphsManager = manager(GraphsManager.class);
                graphsManager.clone(graphClone.name(),
                                    graphClone.cloneGraphName());
                Printer.print("Graph '%s' is created(cloned from '%s')",
                              graphClone.name(), graphClone.cloneGraphName());
                break;
            case "graph-list":
                graphsManager = manager(GraphsManager.class);
                Printer.printList("Graphs", graphsManager.list());
                break;
            case "graph-get":
                graphsManager = manager(GraphsManager.class);
                Printer.printMap("Graph info",
                                 graphsManager.get(this.graph()));
                break;
            case "graph-clear":
                SubCommands.GraphClear graphClear = this.subCommand(subCmd);
                if (timeout() < DEFAULT_GRAPH_CLEAR_TIMEOUT) {
                    this.timeout(DEFAULT_GRAPH_CLEAR_TIMEOUT);
                }
                graphsManager = manager(GraphsManager.class);
                graphsManager.clear(this.graph(), graphClear.confirmMessage());
                Printer.print("Graph '%s' is cleared", this.graph());
                break;
            case "graph-drop":
                SubCommands.GraphDrop graphDrop = this.subCommand(subCmd);
                if (timeout() < DEFAULT_GRAPH_CLEAR_TIMEOUT) {
                    this.timeout(DEFAULT_GRAPH_CLEAR_TIMEOUT);
                }
                graphsManager = manager(GraphsManager.class);
                graphsManager.drop(this.graph(), graphDrop.confirmMessage());
                Printer.print("Graph '%s' is dropped", this.graph());
                break;
            case "graph-mode-set":
                SubCommands.GraphModeSet graphModeSet = this.subCommand(subCmd);
                graphsManager = manager(GraphsManager.class);
                graphsManager.mode(this.graph(), graphModeSet.mode());
                Printer.print("Set graph '%s' mode to '%s'",
                              this.graph(), graphModeSet.mode());
                break;
            case "graph-mode-get":
                graphsManager = manager(GraphsManager.class);
                Printer.printKV("Graph mode", graphsManager.mode(this.graph()));
                break;
            case "gremlin-execute":
                SubCommands.Gremlin gremlin = this.subCommand(subCmd);
                GremlinManager gremlinManager = manager(GremlinManager.class);
                Printer.print("Run gremlin script");
                ResultSet result = gremlinManager.execute(gremlin.script(),
                                                          gremlin.bindings(),
                                                          gremlin.language(),
                                                          gremlin.aliases());
                Iterator<Result> iterator = result.iterator();
                while (iterator.hasNext()) {
                    Printer.print(iterator.next().getString());
                }
                break;
            case "gremlin-schedule":
                SubCommands.GremlinJob job = this.subCommand(subCmd);
                gremlinManager = manager(GremlinManager.class);
                Printer.print("Run gremlin script as async job");
                long taskId = gremlinManager.executeAsTask(job.script(),
                                                           job.bindings(),
                                                           job.language());
                Printer.printKV("Task id", taskId);
                break;
            case "task-list":
                SubCommands.TaskList taskList = this.subCommand(subCmd);
                TasksManager tasksManager = manager(TasksManager.class);
                List<Task> tasks = tasksManager.list(taskList.status(),
                                                     taskList.limit());
                List<Object> results = tasks.stream().map(Task::asMap)
                                            .collect(Collectors.toList());
                Printer.printList("Tasks", results);
                break;
            case "task-get":
                SubCommands.TaskGet taskGet = this.subCommand(subCmd);
                tasksManager = manager(TasksManager.class);
                Printer.printKV("Task info",
                                tasksManager.get(taskGet.taskId()).asMap());
                break;
            case "task-delete":
                SubCommands.TaskDelete taskDelete = this.subCommand(subCmd);
                tasksManager = manager(TasksManager.class);
                tasksManager.delete(taskDelete.taskId());
                Printer.print("Task '%s' is deleted", taskDelete.taskId());
                break;
            case "task-cancel":
                SubCommands.TaskCancel taskCancel = this.subCommand(subCmd);
                tasksManager = manager(TasksManager.class);
                tasksManager.cancel(taskCancel.taskId());
                Printer.print("Task '%s' is cancelled", taskCancel.taskId());
                break;
            case "task-clear":
                SubCommands.TaskClear taskClear = this.subCommand(subCmd);
                tasksManager = manager(TasksManager.class);
                tasksManager.clear(taskClear.force());
                Printer.print("Tasks are cleared[force=%s]",
                              taskClear.force());
                break;
            case "auth-backup":
                Printer.print("Auth backup start...");
                SubCommands.AuthBackup authBackup = this.subCommand(subCmd);
                AuthBackupRestoreManager authBackupManager =
                        manager(AuthBackupRestoreManager.class);

                authBackupManager.init(authBackup);
                authBackupManager.backup(authBackup.types());
                break;
            case "auth-restore":
                Printer.print("Auth restore start...");
                SubCommands.AuthRestore authRestore = this.subCommand(subCmd);
                AuthBackupRestoreManager authRestoreManager =
                        manager(AuthBackupRestoreManager.class);

                authRestoreManager.init(authRestore);
                authRestoreManager.restore(authRestore.types());
                break;
            default:
                throw new ParameterException(String.format(
                          "Invalid sub-command: %s", subCmd));
        }
    }

    private void execute(String[] args) {
        JCommander jCommander = this.parseCommand(args);
        this.execute(jCommander.getParsedCommand(), jCommander);
    }

    private void checkMainParams() {
        E.checkArgument(this.url() != null, "Url can't be null");
        E.checkArgument(this.username() == null && this.password() == null ||
                        this.username() != null && this.password() != null,
                        "Both user name and password must be null or " +
                        "not null at same time");
    }

    private <T extends ToolManager> T manager(Class<T> clz) {
        try {
            ToolClient.ConnectionInfo info = new ToolClient.ConnectionInfo(this.url(), this.graph(),
                                                     this.username(),
                                                     this.password(),
                                                     this.timeout(),
                                                     this.trustStoreFile(),
                                                     this.trustStorePassword());
            T toolManager = clz.getConstructor(ToolClient.ConnectionInfo.class)
                               .newInstance(info);
            this.taskManagers.add(toolManager);
            return toolManager;
        } catch (Exception e) {
            throw new RuntimeException(String.format(
                      "Construct manager failed for class '%s', please make " +
                      "sure global arguments set correctly: " +
                      "--url=%s,--graph=%s,--user=%s,--password=%s," +
                      "--timeout=%s,--trust-store-file=%s," +
                      "--trust-store-password=%s", clz.getSimpleName(),
                      this.url(), this.graph(), this.username(),
                      this.password(), this.timeout(),
                      this.trustStoreFile(), this.trustStorePassword()), e);
        }
    }

    private static SubCommands.Backup convMigrate2Backup(
                                      SubCommands.Migrate migrate) {
        SubCommands.Backup backup = new SubCommands.Backup();
        backup.splitSize(migrate.splitSize());
        backup.directory(migrate.directory());
        backup.logDir(migrate.logDir());
        backup.types(migrate.types());
        backup.retry(migrate.retry());
        backup.hdfsConf(migrate.hdfsConf());
        return backup;
    }

    private static SubCommands.Restore convMigrate2Restore(
                                       SubCommands.Migrate migrate,
                                       String directory) {
        SubCommands.Restore restore = new SubCommands.Restore();
        restore.clean(!migrate.keepData());
        restore.directory(directory);
        restore.logDir(migrate.logDir());
        restore.types(migrate.types());
        restore.retry(migrate.retry());
        restore.hdfsConf(migrate.hdfsConf());
        return restore;
    }

    public JCommander parseCommand(String[] args) {
        JCommander jCommander = this.jcommander();
        if (args.length == 0) {
            throw ExitException.exception(ToolUtil.commandUsage(jCommander),
                                          "No command found, please input" +
                                          " command");
        }
        if (this.parseHelp(args, jCommander)) {
            assert false;
        } else {
            jCommander.parse(args);
        }
        String subCommand = jCommander.getParsedCommand();
        if (subCommand == null) {
            throw ExitException.normal(ToolUtil.commandsCategory(
                                       jCommander),
                                       "No sub-command found");
        }
        return jCommander;
    }

    public boolean parseHelp(String[] args, JCommander jCommander) {
        String subCommand = Strings.EMPTY;
        List<String> list = Arrays.asList(args);
        if (!list.contains(Constants.COMMAND_HELP)) {
            return false;
        }
        // Parse the '--throw-mode' command
        if (list.contains(Constants.COMMAND_THROW_MODE)) {
            int index = list.indexOf(Constants.COMMAND_THROW_MODE) + 1;
            jCommander.parse(Constants.COMMAND_THROW_MODE,
                             list.get(index));
        }
        int index = list.indexOf(Constants.COMMAND_HELP);
        if (list.size() > index + 1) {
            subCommand = list.get(index + 1);
        }
        if (StringUtils.isEmpty(subCommand)) {
            throw ExitException.normal(ToolUtil.commandUsage(jCommander),
                                       "Command : hugegragh help");
        }

        Map<String, JCommander> commands = jCommander.getCommands();
        if (commands.containsKey(subCommand)) {
            throw ExitException.normal(ToolUtil.commandUsage(
                                       commands.get(subCommand)),
                                       "Command : hugegragh help %s",
                                       subCommand);
        } else {
            throw ExitException.exception(ToolUtil.commandsCategory(jCommander),
                                          "Unexpected help sub-command " +
                                          "%s", subCommand);
        }
    }

    public void shutdown() {
        if (CollectionUtils.isEmpty(this.taskManagers)) {
            return;
        }
        for (ToolManager toolManager : this.taskManagers) {
            toolManager.close();
        }
    }

    public static void main(String[] args) {
        HugeGraphCommand cmd = new HugeGraphCommand();
        int exitCode = Constants.EXIT_CODE_NORMAL;
        try {
            cmd.execute(args);
        } catch (ExitException e) {
            exitCode = e.exitCode();
            ToolUtil.exitOrThrow(e, cmd.throwMode());
        } catch (Throwable e) {
            exitCode = Constants.EXIT_CODE_ERROR;
            ToolUtil.printOrThrow(e, cmd.throwMode());
        } finally {
            cmd.shutdown();
        }

        if (exitCode != Constants.EXIT_CODE_NORMAL) {
            System.exit(exitCode);
        }
    }
}
