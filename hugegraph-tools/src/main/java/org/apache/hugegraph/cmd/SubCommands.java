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

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.api.API;
import org.apache.hugegraph.constant.AuthRestoreConflictStrategy;
import org.apache.hugegraph.manager.TasksManager;
import org.apache.hugegraph.structure.constant.GraphMode;
import org.apache.hugegraph.structure.constant.HugeType;
import org.apache.hugegraph.util.E;
import org.apache.hugegraph.util.InsertionOrderUtil;

import com.beust.jcommander.DynamicParameter;
import com.beust.jcommander.IParameterValidator;
import com.beust.jcommander.IStringConverter;
import com.beust.jcommander.Parameter;
import com.beust.jcommander.ParameterException;
import com.beust.jcommander.Parameters;
import com.beust.jcommander.ParametersDelegate;
import com.google.common.collect.ImmutableList;
import com.google.common.collect.ImmutableMap;
import com.google.common.collect.ImmutableSet;

public class SubCommands {

    private Map<String, Object> commands;

    public SubCommands() {
        this.commands = InsertionOrderUtil.newMap();
        this.initSubCommands();
    }

    private void initSubCommands() {
        this.commands.put("graph-create", new GraphCreate());
        this.commands.put("graph-clone", new GraphClone());
        this.commands.put("graph-list", new GraphList());
        this.commands.put("graph-get", new GraphGet());
        this.commands.put("graph-clear", new GraphClear());
        this.commands.put("graph-drop", new GraphDrop());
        this.commands.put("graph-mode-set", new GraphModeSet());
        this.commands.put("graph-mode-get", new GraphModeGet());

        this.commands.put("task-list", new TaskList());
        this.commands.put("task-get", new TaskGet());
        this.commands.put("task-delete", new TaskDelete());
        this.commands.put("task-cancel", new TaskCancel());
        this.commands.put("task-clear", new TaskClear());

        this.commands.put("gremlin-execute", new Gremlin());
        this.commands.put("gremlin-schedule", new GremlinJob());

        this.commands.put("backup", new Backup());
        this.commands.put("schedule-backup", new ScheduleBackup());
        this.commands.put("dump", new DumpGraph());
        this.commands.put("restore", new Restore());
        this.commands.put("migrate", new Migrate());

        this.commands.put("deploy", new Deploy());
        this.commands.put("start-all", new StartAll());
        this.commands.put("clear", new Clear());
        this.commands.put("stop-all", new StopAll());

        this.commands.put("auth-backup", new AuthBackup());
        this.commands.put("auth-restore", new AuthRestore());

        this.commands.put("help", new Help());
    }

    public Map<String, Object> commands() {
        return this.commands;
    }

    @Parameters(commandDescription = "Schedule backup task")
    public static class ScheduleBackup {

        @Parameter(names = {"--interval"}, arity = 1,
                   description =
                           "The interval of backup, format is: \"a b c d e\"." +
                           " 'a' means minute (0 - 59)," +
                           " 'b' means hour (0 - 23)," +
                           " 'c' means day of month (1 - 31)," +
                           " 'd' means month (1 - 12)," +
                           " 'e' means day of week (0 - 6) (Sunday=0)," +
                           " \"*\" means all")
        public String interval = "\"0 0 * * *\"";

        @Parameter(names = {"--backup-num"}, arity = 1,
                   description = "The number of latest backups to keep")
        public int num = 3;

        @Parameter(names = {"--directory", "-d"}, arity = 1, required = true,
                   description = "The directory of backups stored")
        public String directory;
    }

    @Parameters(commandDescription = "Backup graph schema/data. If directory " +
                                     "is on HDFS, use -D to set HDFS params. " +
                                     "For example: " +
                                     "-Dfs.default.name=hdfs://localhost:9000")
    public static class Backup extends BackupRestore {

        @Parameter(names = {"--split-size", "-s"}, arity = 1,
                   description = "Split size of shard")
        public long splitSize = 1024 * 1024L;

        @ParametersDelegate
        private HugeTypes types = new HugeTypes();

        @Parameter(names = {"--format"}, arity = 1,
                   validateWith = {FormatValidator.class},
                   description = "File format, valid is [json, text]")
        public String format = "json";

        @Parameter(names = {"--compress"}, arity = 1,
                   description = "compress flag")
        public boolean compress = true;

        @Parameter(names = {"--label"}, arity = 1,
                   description = "Vertex label or edge label, only valid when type " +
                                 "is vertex or edge")
        public String label;

        @Parameter(names = {"--all-properties"}, arity = 1,
                   description = "All properties to be backup flag")
        public boolean allProperties = false;

        @Parameter(names = {"--properties"}, arity = 1,
                   description = "Vertex or edge properties to backup, " +
                                 "only valid when type is vertex or edge")
        public List<String> properties = ImmutableList.of();

        public long splitSize() {
            return this.splitSize;
        }

        public void splitSize(long splitSize) {
            this.splitSize = splitSize;
        }

        public List<HugeType> types() {
            return this.types.types;
        }

        public void types(List<HugeType> types) {
            this.types.types = types;
        }

        public String format() {
            return this.format;
        }

        public void format(String format) {
            this.format = format;
        }

        public boolean compress() {
            return this.compress;
        }

        public void compress(boolean compress) {
            this.compress = compress;
        }

        public String label() {
            return this.label;
        }

        public void label(String label) {
            this.label = label;
        }

        public boolean allProperties() {
            return this.allProperties;
        }

        public void allProperties(boolean allProperties) {
            this.allProperties = allProperties;
        }

        public List<String> properties() {
            return this.properties;
        }

        public void properties(List<String> properties) {
            this.properties = properties;
        }
    }

    @Parameters(commandDescription = "Restore graph schema/data. If directory" +
                                     " is on HDFS, use -D to set HDFS params " +
                                     "if needed. For example:" +
                                     "-Dfs.default.name=hdfs://localhost:9000")
    public static class Restore extends BackupRestore {
        @Parameter(names = {"--clean"},
                   description = "Whether to remove the directory of " +
                                 "graph data after restored")
        public boolean clean = false;

        @ParametersDelegate
        private HugeTypes types = new HugeTypes();

        public boolean clean() {
            return this.clean;
        }

        public void clean(boolean clean) {
            this.clean = clean;
        }

        public List<HugeType> types() {
            return this.types.types;
        }

        public void types(List<HugeType> types) {
            this.types.types = types;
        }
    }

    @Parameters(commandDescription = "Dump graph to files")
    public static class DumpGraph extends BackupRestore {

        @Parameter(names = {"--formatter", "-f"}, arity = 1,
                   description = "Formatter to customize format of vertex/edge")
        public String formatter = "JsonFormatter";

        @Parameter(names = {"--split-size", "-s"}, arity = 1,
                   description = "Split size of shard")
        public long splitSize = 1024 * 1024L;

        public String formatter() {
            return this.formatter;
        }

        public long splitSize() {
            return this.splitSize;
        }

        public void splitSize(long splitSize) {
            this.splitSize = splitSize;
        }
    }

    @Parameters(commandDescription = "Migrate graph")
    public static class Migrate extends BackupRestore {

        @Parameter(names = {"--split-size", "-s"}, arity = 1,
                   description = "Split size of shard")
        public long splitSize = 1024 * 1024L;

        @ParametersDelegate
        private HugeTypes types = new HugeTypes();

        @Parameter(names = {"--target-url"}, arity = 1,
                   description = "The url of target graph to migrate")
        public String targetUrl = "http://127.0.0.1:8081";

        @Parameter(names = {"--target-graph"}, arity = 1,
                   description = "The name of target graph to migrate")
        public String targetGraph = "hugegraph";

        @Parameter(names = {"--target-user"}, arity = 1,
                   description = "The username of target graph to migrate")
        public String targetUsername;

        @Parameter(names = {"--target-password"}, arity = 1,
                   description = "The password of target graph to migrate")
        public String targetPassword;

        @Parameter(names = {"--target-timeout"}, arity = 1,
                   description = "The timeout to connect target graph to " +
                                 "migrate")
        public int targetTimeout;

        @Parameter(names = {"--target-trust-store-file"}, arity = 1,
                   description = "The trust store file of target graph to " +
                                 "migrate")
        public String targetTrustStoreFile;

        @Parameter(names = {"--target-trust-store-password"}, arity = 1,
                   description = "The trust store password of target graph " +
                                 "to migrate")
        public String targetTrustStorePassword;

        @Parameter(names = {"--graph-mode", "-m"}, arity = 1,
                   converter = GraphModeConverter.class,
                   description = "Mode used when migrating to target graph, " +
                                 "include: [RESTORING, MERGING]")
        public GraphMode mode = GraphMode.RESTORING;

        @Parameter(names = {"--keep-local-data"},
                   description = "Whether to keep the local directory of " +
                                 "graph data after restored")
        public boolean keepData = false;

        public long splitSize() {
            return this.splitSize;
        }

        public void splitSize(long splitSize) {
            this.splitSize = splitSize;
        }

        public List<HugeType> types() {
            return this.types.types;
        }

        public void types(List<HugeType> types) {
            this.types.types = types;
        }

        public String targetUrl() {
            return this.targetUrl;
        }

        public String targetGraph() {
            return this.targetGraph;
        }

        public String targetUsername() {
            return this.targetUsername;
        }

        public String targetPassword() {
            return this.targetPassword;
        }

        public int targetTimeout() {
            return this.targetTimeout;
        }

        public String targetTrustStoreFile() {
            return this.targetTrustStoreFile;
        }

        public String targetTrustStorePassword() {
            return this.targetTrustStorePassword;
        }

        public GraphMode mode() {
            return this.mode;
        }

        public boolean keepData() {
            return this.keepData;
        }
    }

    @Parameters(commandDescription = "Create graph with config")
    public static class GraphCreate {

        @Parameter(names = {"--name", "-n"}, arity = 1,
                   description = "The name of new created graph, default is g")
        public String name = "g";

        @ParametersDelegate
        private ConfigFile configFile = new ConfigFile();

        public String name() {
            return this.name;
        }

        public String config() {
            return this.configFile.config;
        }
    }

    @Parameters(commandDescription = "Clone graph")
    public static class GraphClone {

        @Parameter(names = {"--name", "-n"}, arity = 1,
                   description = "The name of new created graph, default is g")
        public String name = "g";

        @Parameter(names = {"--clone-graph-name"}, arity = 1,
                   description = "The name of cloned graph, default is hugegraph")
        public String cloneGraphName = "hugegraph";

        public String name() {
            return this.name;
        }

        public String cloneGraphName() {
            return this.cloneGraphName;
        }
    }

    @Parameters(commandDescription = "List all graphs")
    public static class GraphList {
    }

    @Parameters(commandDescription = "Get graph info")
    public static class GraphGet {
    }

    @Parameters(commandDescription = "Clear graph schema and data")
    public static class GraphClear {

        @ParametersDelegate
        private ClearConfirmMessage message = new ClearConfirmMessage();

        public String confirmMessage() {
            return this.message.confirmMessage;
        }
    }

    @Parameters(commandDescription = "Drop graph")
    public static class GraphDrop {

        @ParametersDelegate
        private DropConfirmMessage message = new DropConfirmMessage();

        public String confirmMessage() {
            return this.message.confirmMessage;
        }
    }

    @Parameters(commandDescription = "Set graph mode")
    public static class GraphModeSet {

        @ParametersDelegate
        private Mode mode = new Mode();

        public GraphMode mode() {
            return this.mode.mode;
        }
    }

    @Parameters(commandDescription = "Get graph mode")
    public static class GraphModeGet {
    }

    @Parameters(commandDescription = "Execute Gremlin statements")
    public static class Gremlin extends GremlinJob {

        @ParametersDelegate
        private Aliases aliases = new Aliases();

        public Map<String, String> aliases() {
            return this.aliases.aliases;
        }
    }

    @Parameters(commandDescription = "Execute Gremlin statements as " +
                                     "asynchronous job")
    public static class GremlinJob {

        @ParametersDelegate
        private FileScript fileScript = new FileScript();

        @ParametersDelegate
        private GremlinScript cmdScript = new GremlinScript();

        @ParametersDelegate
        private Language language = new Language();

        @ParametersDelegate
        private Bindings bindings = new Bindings();

        public String fileScript() {
            return this.fileScript.script;
        }

        public String cmdScript() {
            return this.cmdScript.script;
        }

        public String language() {
            return this.language.language;
        }

        public Map<String, String> bindings() {
            return this.bindings.bindings;
        }

        public String script() {
            String script;
            if (this.cmdScript() == null) {
                E.checkArgument(this.fileScript() != null,
                                "Either --script or --file must " +
                                "be provided, but both are null");
                script = this.fileScript();
            } else {
                E.checkArgument(this.fileScript() == null,
                                "Either --script or --file must " +
                                "be provided, but both are provided: " +
                                "'%s' and '%s'",
                                this.cmdScript(), this.fileScript());
                script = this.cmdScript();
            }
            return script;
        }
    }

    @Parameters(commandDescription = "List tasks")
    public static class TaskList {

        @ParametersDelegate
        private TaskStatus status = new TaskStatus();

        @ParametersDelegate
        private Limit limit = new Limit();

        public String status() {
            if (this.status.status == null) {
                return null;
            }
            return this.status.status.toUpperCase();
        }

        public long limit() {
            return this.limit.limit;
        }
    }

    @Parameters(commandDescription = "Get task info")
    public static class TaskGet {

        @ParametersDelegate
        private TaskId taskId = new TaskId();

        public long taskId() {
            return this.taskId.taskId;
        }
    }

    @Parameters(commandDescription = "Delete task")
    public static class TaskDelete {

        @ParametersDelegate
        private TaskId taskId = new TaskId();

        public long taskId() {
            return this.taskId.taskId;
        }
    }

    @Parameters(commandDescription = "Cancel task")
    public static class TaskCancel {

        @ParametersDelegate
        private TaskId taskId = new TaskId();

        public long taskId() {
            return this.taskId.taskId;
        }
    }

    @Parameters(commandDescription = "Clear completed tasks")
    public static class TaskClear {

        @Parameter(names = "--force",
                   description = "Force to clear all tasks, " +
                                 "cancel all uncompleted tasks firstly, " +
                                 "and delete all completed tasks")
        private boolean force = false;

        public boolean force() {
            return this.force;
        }
    }

    @Parameters(commandDescription = "Install HugeGraph-Server and " +
                                     "HugeGraph-Studio")
    public static class Deploy {

        @ParametersDelegate
        private Version version = new Version();

        @ParametersDelegate
        public InstallPath path = new InstallPath();

        @ParametersDelegate
        public DownloadURL url = new DownloadURL();
    }

    @Parameters(commandDescription = "Start HugeGraph-Server and " +
                                     "HugeGraph-Studio")
    public static class StartAll {

        @ParametersDelegate
        private Version version = new Version();

        @ParametersDelegate
        public InstallPath path = new InstallPath();
    }

    @Parameters(commandDescription = "Clear HugeGraph-Server and " +
                                     "HugeGraph-Studio")
    public static class Clear {

        @ParametersDelegate
        public InstallPath path = new InstallPath();
    }

    @Parameters(commandDescription = "Stop HugeGraph-Server and " +
                                     "HugeGraph-Studio")
    public static class StopAll {
    }

    @Parameters(commandDescription = "Print usage")
    public static class Help {
    }

    public static class BackupRestore {

        @Parameter(names = {"--directory", "-d"}, arity = 1,
                   description = "Directory of graph schema/data, default is " +
                                 "'./{graphname}' in local file system " +
                                 "or '{fs.default.name}/{graphname}' in HDFS")
        public String directory;

        @Parameter(names = {"--log", "-l"}, arity = 1,
                   description = "Directory of log")
        public String logDir = "./logs";

        @Parameter(names = {"--thread-num", "-T"}, arity = 1,
                   validateWith = {PositiveValidator.class},
                   description = "Threads number to use, default is " +
                                 "Math.min(10, Math.max(4, CPUs / 2))")
        public int threadsNum;

        @ParametersDelegate
        private Retry retry = new Retry();

        @DynamicParameter(names = "-D",
                          description = "HDFS config parameters")
        private Map<String, String> hdfsConf = new HashMap<>();

        public String directory() {
            return this.directory;
        }

        public String logDir() {
            return this.logDir;
        }

        public int threadsNum() {
            return this.threadsNum;
        }

        public int retry() {
            return this.retry.retry;
        }

        public Map<String, String> hdfsConf() {
            return this.hdfsConf;
        }

        public void directory(String directory) {
            this.directory = directory;
        }

        public void logDir(String logDir) {
            this.logDir = logDir;
        }

        public void retry(int retry) {
            this.retry.retry = retry;
        }

        public void hdfsConf(Map<String, String> hdfsConf) {
            this.hdfsConf = hdfsConf;
        }
    }

    public static class Url {

        @Parameter(names = {"--url"}, arity = 1,
                   validateWith = {UrlValidator.class},
                   description = "The URL of HugeGraph-Server")
        public String url = "http://127.0.0.1:8080";
    }

    public static class Graph {

        @Parameter(names = {"--graph"}, arity = 1,
                   description = "Name of graph")
        public String graph = "hugegraph";
    }

    public static class Username {

        @Parameter(names = {"--user"}, arity = 1,
                   description = "Name of user")
        public String username;
    }

    public static class Password {

        @Parameter(names = {"--password"}, arity = 1,
                   description = "Password of user")
        public String password;
    }

    public static class Timeout {

        @Parameter(names = {"--timeout"}, arity = 1,
                   description = "Connection timeout")
        public int timeout = 30;
    }

    public static class Protocol {

        @Parameter(names = {"--protocol"}, arity = 1,
                   validateWith = {ProtocolValidator.class},
                   description = "The Protocol of HugeGraph-Server, allowed values " +
                                 "are: http or https")
        public String protocol = "http";
    }

    public static class TrustStoreFile {

        @Parameter(names = {"--trust-store-file"}, arity = 1,
                   description = "The path of client truststore file used when " +
                                 "https protocol is enabled")
        public String trustStoreFile;
    }

    public static class TrustStorePassword {

        @Parameter(names = {"--trust-store-password"}, arity = 1,
                   description = "The password of the client truststore file " +
                                 "used when the https protocol is enabled")
        public String trustStorePassword;
    }

    public static class ThrowMode {

        @Parameter(names = {"--throw-mode"}, arity = 1,
                   description = "Whether the hugegraph-tools work " +
                                 "to throw an exception")
        public boolean throwMode = false;
    }

    public static class HugeTypes {

        @Parameter(names = {"--huge-types", "-t"},
                   listConverter = HugeTypeListConverter.class,
                   description = "Type of schema/data. Concat with ',' if more " +
                                 "than one. Other types include 'all' and " +
                                 "'schema'. 'all' means all vertices, edges and " +
                                 "schema. In other words, 'all' equals with " +
                                 "'vertex, edge, vertex_label, edge_label, " +
                                 "property_key, index_label'. 'schema' equals " +
                                 "with 'vertex_label, edge_label, property_key, " +
                                 "index_label'.")
        public List<HugeType> types = HugeTypeListConverter.ALL_TYPES;
    }

    public static class InstallPath {

        @Parameter(names = {"-p"}, arity = 1, required = true,
                   description = "Install path of HugeGraph-Server and " +
                                 "HugeGraph-Studio")
        public String directory;
    }

    public static class DownloadURL {

        @Parameter(names = {"-u"}, arity = 1,
                   description = "Download url prefix path of " +
                                 "HugeGraph-Server and HugeGraph-Studio")
        public String url = null;
    }

    public static class ClearConfirmMessage {

        @Parameter(names = {"--confirm-message", "-c"}, arity = 1,
                   description = "Confirm message of graph clear is " +
                                 "\"I'm sure to delete all data\". " +
                                 "(Note: include \"\")",
                   required = true)
        public String confirmMessage;
    }

    public static class DropConfirmMessage {

        @Parameter(names = {"--confirm-message", "-c"}, arity = 1,
                   description = "Confirm message of graph clear is " +
                                 "\"I'm sure to drop the graph\". " +
                                 "(Note: include \"\")",
                   required = true)
        public String confirmMessage;
    }

    public static class Mode {

        @Parameter(names = {"--graph-mode", "-m"}, arity = 1,
                   converter = GraphModeConverter.class,
                   description = "Graph mode, " +
                                 "include: [NONE, RESTORING, MERGING]",
                   required = true)
        public GraphMode mode;
    }

    public static class FileScript {

        @Parameter(names = {"--file", "-f"}, arity = 1,
                   converter = FileNameToContentConverter.class,
                   description = "Gremlin Script file to be executed, UTF-8 " +
                                 "encoded, exclusive to --script")
        public String script;
    }

    public static class ConfigFile {

        @Parameter(names = {"--file", "-f"}, arity = 1,
                   converter = FileNameToContentConverter.class,
                   description = "Creating graph config file")
        public String config;
    }

    public static class GremlinScript {

        @Parameter(names = {"--script", "-s"}, arity = 1,
                   description = "Gremlin script to be executed, " +
                                 "exclusive to --file")
        public String script;
    }

    public static class Language {

        @Parameter(names = {"--language", "-l"}, arity = 1,
                   description = "Gremlin script language")
        public String language = "gremlin-groovy";
    }

    public static class Bindings {

        @Parameter(names = {"--bindings", "-b"}, arity = 1,
                   converter = MapConverter.class,
                   description = "Gremlin bindings, valid format is: " +
                                 "'key1=value1,key2=value2...'")
        public Map<String, String> bindings = ImmutableMap.of();
    }

    public static class Aliases {

        @Parameter(names = {"--aliases", "-a"}, arity = 1,
                   converter = MapConverter.class,
                   description = "Gremlin aliases, valid format is: " +
                                 "'key1=value1,key2=value2...'")
        public Map<String, String> aliases = ImmutableMap.of();
    }

    public static class Version {

        @Parameter(names = {"-v"}, arity = 1, required = true,
                   description = "Version of HugeGraph-Server and " +
                                 "HugeGraph-Studio")
        public String version;
    }

    public static class Retry {

        @Parameter(names = {"--retry"}, arity = 1,
                   validateWith = {PositiveValidator.class},
                   description = "Retry times, default is 3")
        public int retry = 3;
    }

    public static class Limit {

        @Parameter(names = {"--limit"}, arity = 1,
                   validateWith = {PositiveValidator.class},
                   description = "Limit number, no limit if not provided")
        public long limit = -1;
    }

    public static class TaskStatus {

        @Parameter(names = {"--status"}, arity = 1,
                   validateWith = TaskStatusValidator.class,
                   description = "Status of task")
        public String status = null;
    }

    public static class TaskId {

        @Parameter(names = {"--task-id"}, arity = 1, required = true,
                   validateWith = {PositiveValidator.class},
                   description = "Task id")
        private long taskId;
    }

    public static class AuthBackupRestore {

        @ParametersDelegate
        private AuthTypes types = new AuthTypes();

        @Parameter(names = {"--directory"}, arity = 1,
                   description = "Directory of auth information, default " +
                                 "is './{auth-backup-restore}' in local " +
                                 "file system or '{fs.default.name}/" +
                                 "{auth-backup-restore}' in HDFS")
        public String directory;

        @DynamicParameter(names = "-D",
                          description = "HDFS config parameters")
        private Map<String, String> hdfsConf = new HashMap<>();

        @ParametersDelegate
        private Retry retry = new Retry();

        public List<HugeType> types() {
            return this.types.types;
        }

        public void types(List<HugeType> types) {
            this.types.types = types;
        }

        public int retry() {
            return this.retry.retry;
        }

        public void retry(int retry) {
            this.retry.retry = retry;
        }

        public String directory() {
            return this.directory;
        }

        public void directory(String directory) {
            this.directory = directory;
        }

        public Map<String, String> hdfsConf() {
            return this.hdfsConf;
        }

        public void hdfsConf(Map<String, String> hdfsConf) {
            this.hdfsConf = hdfsConf;
        }
    }

    public static class AuthBackup extends AuthBackupRestore {
    }

    public static class AuthRestore extends AuthBackupRestore {

        @Parameter(names = {"--strategy"},
                   converter = AuthStrategyConverter.class,
                   description = "The strategy needs to be chosen in the event " +
                                 "of a conflict when restoring. Valid " +
                                 "strategies include 'stop' and 'ignore', " +
                                 "default is 'stop'. 'stop' means if there " +
                                 "a conflict, stop restore. 'ignore' means if " +
                                 "there a conflict, ignore and continue to " +
                                 "restore.")
        public AuthRestoreConflictStrategy strategy = AuthStrategyConverter.STRATEGY;

        @Parameter(names = {"--init-password"}, arity = 1,
                   description = "Init user password, if restore type include " +
                                 "'user', please specify the init-password of " +
                                 "users.")
        public String initPassword = StringUtils.EMPTY;

        public AuthRestoreConflictStrategy strategy() {
            return this.strategy;
        }

        public void strategy(AuthRestoreConflictStrategy strategy) {
            this.strategy = strategy;
        }

        public String initPassword() {
            return this.initPassword;
        }

        public void initPassword(String initPassword) {
            this.initPassword = initPassword;
        }
    }

    public static class AuthTypes {

        @Parameter(names = {"--types", "-t"},
                   listConverter = AuthHugeTypeConverter.class,
                   description = "Type of auth data to restore and backup, " +
                                 "concat with ',' if more than one. 'all' " +
                                 "means all auth information. In other words, " +
                                 "'all' equals with 'user, group, target, " +
                                 "belong, access'. In addition, 'belong' or " +
                                 "'access' can not backup or restore alone, if " +
                                 "type contains 'belong' then should contains " +
                                 "'user' and 'group'. If type contains 'access' " +
                                 "then should contains 'group' and 'target'.")
        public List<HugeType> types = AuthHugeTypeConverter.AUTH_ALL_TYPES;
    }

    public static class GraphModeConverter
                  implements IStringConverter<GraphMode> {

        @Override
        public GraphMode convert(String value) {
            E.checkArgument(value != null && !value.isEmpty(),
                            "GraphMode can't be null or empty");
            return GraphMode.valueOf(value);
        }
    }

    public static class HugeTypeListConverter
                  implements IStringConverter<List<HugeType>> {

        public static final List<HugeType> ALL_TYPES = ImmutableList.of(
                HugeType.PROPERTY_KEY, HugeType.VERTEX_LABEL,
                HugeType.EDGE_LABEL, HugeType.INDEX_LABEL,
                HugeType.VERTEX, HugeType.EDGE
        );

        public static final List<HugeType> SCHEMA_TYPES = ImmutableList.of(
                HugeType.PROPERTY_KEY, HugeType.VERTEX_LABEL,
                HugeType.EDGE_LABEL, HugeType.INDEX_LABEL
        );

        @Override
        public List<HugeType> convert(String value) {
            E.checkArgument(value != null && !value.isEmpty(),
                            "HugeType can't be null or empty");
            String[] types = value.split(",");
            if (types.length == 1 && types[0].equalsIgnoreCase("all")) {
                return ALL_TYPES;
            }
            if (types.length == 1 && types[0].equalsIgnoreCase("schema")) {
                return SCHEMA_TYPES;
            }
            List<HugeType> hugeTypes = new ArrayList<>();
            for (String type : types) {
                try {
                    hugeTypes.add(HugeType.valueOf(type.toUpperCase()));
                } catch (IllegalArgumentException e) {
                    throw new ParameterException(String.format(
                              "Invalid --type '%s', valid value is 'all' or " +
                              "combination of 'vertex,edge,vertex_label," +
                              "edge_label,property_key,index_label'", type));
                }
            }
            return hugeTypes;
        }
    }

    public static class AuthHugeTypeConverter
                  implements IStringConverter<List<HugeType>> {

        public static final List<HugeType> AUTH_ALL_TYPES = ImmutableList.of(
                HugeType.TARGET, HugeType.GROUP,
                HugeType.USER, HugeType.ACCESS,
                HugeType.BELONG
        );

        @Override
        public List<HugeType> convert(String value) {
            E.checkArgument(value != null && !value.isEmpty(),
                            "HugeType can't be null or empty");
            String[] types = value.split(",");
            if (types.length == 1 && types[0].equalsIgnoreCase("all")) {
                return AUTH_ALL_TYPES;
            }
            List<String> typeList = new ArrayList<>();
            for (String type : types) {
                typeList.add(type.toLowerCase());
            }
            E.checkArgument(!typeList.contains(HugeType.BELONG.toString().toLowerCase()) ||
                            (typeList.contains(HugeType.USER.toString().toLowerCase()) &&
                             typeList.contains(HugeType.GROUP.toString().toLowerCase())),
                            "Invalid --type '%s', if type contains 'belong'" +
                            " then 'user' and 'group' are required.", value);
            E.checkArgument(!typeList.contains(HugeType.ACCESS.toString().toLowerCase()) ||
                            (typeList.contains(HugeType.GROUP.toString().toLowerCase()) &&
                             typeList.contains(HugeType.TARGET.toString().toLowerCase())),
                            "Invalid --type '%s', if type contains 'access'" +
                            " then 'group' and 'target' are required.", value);
            List<HugeType> hugeTypes = new ArrayList<>();
            for (String type : types) {
                try {
                    hugeTypes.add(HugeType.valueOf(type.toUpperCase()));
                } catch (IllegalArgumentException e) {
                    throw new IllegalArgumentException(String.format(
                              "Invalid --type '%s', valid value is 'all' or " +
                              "combination of [user,group,target," +
                              "belong,access]", type));
                }
            }
            return hugeTypes;
        }
    }

    public static class AuthStrategyConverter
                  implements IStringConverter<AuthRestoreConflictStrategy> {

        public static final AuthRestoreConflictStrategy STRATEGY =
                            AuthRestoreConflictStrategy.STOP;

        @Override
        public AuthRestoreConflictStrategy convert(String value) {
            E.checkArgument(value != null && !value.isEmpty(),
                            "Strategy can't be null or empty");
            E.checkArgument(AuthRestoreConflictStrategy.matchStrategy(value),
                            "Invalid --strategy '%s', valid value is " +
                            "'stop' or 'ignore", value);
            return AuthRestoreConflictStrategy.fromName(value);
        }
    }

    public static class MapConverter
                  implements IStringConverter<Map<String, String>> {

        @Override
        public Map<String, String> convert(String value) {
            E.checkArgument(value != null && !value.isEmpty(),
                            "HugeType can't be null or empty");
            String[] equals = value.split(",");
            Map<String, String> result = new HashMap<>();
            for (String equal : equals) {
                String[] kv = equal.split("=");
                E.checkArgument(kv.length == 2,
                                "Map arguments format should be key=value, " +
                                "but got '%s'", equal);
                result.put(kv[0], kv[1]);
            }
            return result;
        }
    }

    public static class FileNameToContentConverter
                  implements IStringConverter<String> {

        @Override
        public String convert(String value) {
            File file = FileUtils.getFile(value);
            if (!file.exists() || !file.isFile() || !file.canRead()) {
                throw new ParameterException(String.format(
                          "'%s' must be existed readable file", value));
            }
            String content;
            try {
                content = FileUtils.readFileToString(file, API.CHARSET);
            } catch (IOException e) {
                throw new ParameterException(String.format(
                          "Read file '%s' error", value), e);
            }
            return content;
        }
    }

    public static class FormatValidator implements IParameterValidator {

        private static final Set<String> FORMATS = ImmutableSet.of(
                "JSON", "TEXT"
        );

        @Override
        public void validate(String name, String value) {
            if (!FORMATS.contains(value.toUpperCase())) {
                throw new ParameterException(String.format(
                          "Invalid --format '%s', valid value is %s",
                          value, FORMATS));
            }
        }
    }

    public static class ProtocolValidator implements IParameterValidator {

        private static final Set<String> PROTOCOLS = ImmutableSet.of(
                "HTTP", "HTTPS"
        );

        @Override
        public void validate(String name, String value) {
            if (!PROTOCOLS.contains(value.toUpperCase())) {
                throw new ParameterException(String.format(
                          "Invalid --protocol '%s', valid value is %s",
                          value, PROTOCOLS));
            }
        }
    }

    public static class TaskStatusValidator implements IParameterValidator {

        @Override
        public void validate(String name, String value) {
            if (!TasksManager.TASK_STATUSES.contains(value.toUpperCase())) {
                throw new ParameterException(String.format(
                          "Invalid --status '%s', valid value is %s",
                          value, TasksManager.TASK_STATUSES));
            }
        }
    }

    public static class UrlValidator implements IParameterValidator {

        @Override
        public void validate(String name, String value) {
            String regex = "^((http)(s?)://)?" +
                           // IP URL, like: 10.0.0.1
                           "(((25[0-5])|(2[0-4]\\d)|(1\\d\\d)|([1-9]\\d)|\\d)" +
                           "(\\.((25[0-5])|(2[0-4]\\d)|(1\\d\\d)|([1-9]\\d)|\\d)){3}" +
                           "|" +
                           // Or domain name
                           "([0-9a-z_!~*'()-]+\\.)*[0-9a-z_!~*'()-]+)" +
                           // Port
                           ":([0-9]|[1-9]\\d{1,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|" +
                           "655[0-2]\\d|6553[0-5])$";
            if (!value.matches(regex)) {
                throw new ParameterException(String.format(
                          "Invalid url value of args '%s': '%s'", name, value));
            }
        }
    }

    public static class DirectoryValidator implements IParameterValidator {

        @Override
        public void validate(String name, String value) {
            File file = new File(value);
            if (!file.exists() || !file.isDirectory()) {
                throw new ParameterException(String.format(
                          "Invalid value of argument '%s': '%s'", name, value));
            }
        }
    }

    public static class PositiveValidator implements IParameterValidator {

        @Override
        public void validate(String name, String value) {
            // Also validates long options such as --limit and --task-id
            long number = Long.parseLong(value);
            if (number <= 0) {
                throw new ParameterException(
                          "Parameter " + name + " should be positive, " +
                          "but got " + value);
            }
        }
    }
}
