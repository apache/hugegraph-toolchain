/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

CREATE TABLE IF NOT EXISTS `user_info` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(48) NOT NULL,
    `locale` VARCHAR(20) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE (`username`)
);

-- DROP TABLE IF EXISTS `app_info`;
CREATE TABLE IF NOT EXISTS `app_info`(
    `graph_name`         varchar(255) DEFAULT NULL,
    `app_name`           varchar(255) NOT NULL,
    `app_type`           varchar(255) NOT NULL,
    `count_query`        text         DEFAULT NULL,
    `distribution_query` text         DEFAULT NULL,
    `description`        text         DEFAULT NULL,
    PRIMARY KEY (`graph_name`, `app_name`, `app_type`)
);

-- DROP TABLE IF EXISTS `execute_history`;
CREATE TABLE IF NOT EXISTS `execute_history` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `conn_id` INT,
    `graphspace` VARCHAR(48) NOT NULL,
    `graph` VARCHAR(48) NOT NULL,
    `async_id` BIGINT NOT NULL,
    `execute_type` TINYINT NOT NULL,
    `content` TEXT NOT NULL,
    `text` TEXT NOT NULL,
    `execute_status` TINYINT NOT NULL,
    `failure_reason` VARCHAR(64) DEFAULT NULL,
    `async_status` TINYINT NOT NULL DEFAULT 0,
    `duration` BIGINT NOT NULL,
    `create_time` DATETIME(6) NOT NULL,
    PRIMARY KEY (`id`)
    );

CREATE INDEX IF NOT EXISTS `execute_history_conn_id` ON `execute_history`(`conn_id`);
CREATE INDEX IF NOT EXISTS `execute_history_graph_create_time` ON `execute_history`(`graphspace`, `graph`, `create_time`);


-- DROP TABLE IF EXISTS `edit_history`;
CREATE TABLE IF NOT EXISTS `edit_history`
(
    `id`            int NOT NULL AUTO_INCREMENT,
    `graphspace`    varchar(255) DEFAULT NULL,
    `graph`         varchar(255) DEFAULT NULL,
    `element_id`    varchar(255) DEFAULT NULL,
    `label`         varchar(255) DEFAULT NULL,
    `property_num`  int          DEFAULT NULL,
    `option_type`   varchar(255) DEFAULT NULL,
    `option_time`   datetime     DEFAULT NULL,
    `option_person` varchar(255) DEFAULT NULL,
    `content`       text,
    PRIMARY KEY (`id`)
);

CREATE INDEX IF NOT EXISTS `idx_graphspace_graph` ON `edit_history` (`graphspace`, `graph`);


CREATE TABLE IF NOT EXISTS `gremlin_collection` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `conn_id` INT,
    `graphspace` VARCHAR(48) NOT NULL,
    `graph` VARCHAR(48) NOT NULL,
    `name` VARCHAR(48) NOT NULL,
    `type` VARCHAR(48) NOT NULL,
    `content` VARCHAR(65535) NOT NULL,
    `create_time` DATETIME(6) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE (`graphspace`, `graph`, `name`, `type`)
);
CREATE INDEX IF NOT EXISTS `gremlin_collection_conn_id` ON `gremlin_collection`(`conn_id`);

CREATE TABLE IF NOT EXISTS `file_mapping` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `conn_id` INT,
    `graphspace` VARCHAR(48) NOT NULL,
    `graph` VARCHAR(48) NOT NULL,
    `job_id` INT NOT NULL DEFAULT 0,
    `name` VARCHAR(128) NOT NULL,
    `path` VARCHAR(2048) NOT NULL,
    `total_lines` BIGINT NOT NULL,
    `total_size` BIGINT NOT NULL,
    `file_status` TINYINT NOT NULL DEFAULT 0,
    `file_setting` VARCHAR(65535) NOT NULL,
    `vertex_mappings` VARCHAR(65535) NOT NULL,
    `edge_mappings` VARCHAR(65535) NOT NULL,
    `load_parameter` VARCHAR(65535) NOT NULL,
    `create_time` DATETIME(6) NOT NULL,
    `update_time` DATETIME(6) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE (`conn_id`, `job_id`, `name`)
);
CREATE INDEX IF NOT EXISTS `file_mapping_conn_id` ON `file_mapping`(`conn_id`);
CREATE INDEX IF NOT EXISTS `file_mapping_job_id` ON `file_mapping`(`job_id`);

CREATE TABLE IF NOT EXISTS `load_task` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `conn_id` INT,
    `graphspace` VARCHAR(48) NOT NULL,
    `graph` VARCHAR(48) NOT NULL,
    `job_id` INT NOT NULL DEFAULT 0,
    `file_id` INT NOT NULL,
    `file_name` VARCHAR(128) NOT NULL,
    `options` VARCHAR(65535) NOT NULL,
    `vertices` VARCHAR(512) NOT NULL,
    `edges` VARCHAR(512) NOT NULL,
    `file_total_lines` BIGINT NOT NULL,
    `load_status` TINYINT NOT NULL,
    `file_read_lines` BIGINT NOT NULL,
    `last_duration` BIGINT NOT NULL,
    `curr_duration` BIGINT NOT NULL,
    `create_time` DATETIME(6) NOT NULL,
    PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `job_manager` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `conn_id` INT DEFAULT 0,
    `graphspace` VARCHAR(48) NOT NULL,
    `graph` VARCHAR(48) NOT NULL,
    `job_name` VARCHAR(100) NOT NULL DEFAULT '',
    `job_remarks` VARCHAR(200) NOT NULL DEFAULT '',
    `job_size` BIGINT NOT NULL DEFAULT 0,
    `job_status` TINYINT NOT NULL DEFAULT 0,
    `job_duration` BIGINT NOT NULL DEFAULT 0,
    `update_time` DATETIME(6) NOT NULL,
    `create_time` DATETIME(6) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE (`job_name`, `graphspace`, `graph`)
);

CREATE TABLE IF NOT EXISTS `async_task` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `conn_id` INT DEFAULT 0,
    `graphspace` VARCHAR(48) NOT NULL,
    `graph` VARCHAR(48) NOT NULL,
    `task_id` INT NOT NULL DEFAULT 0,
    `task_name` VARCHAR(100) NOT NULL DEFAULT '',
    `task_reason` VARCHAR(200) NOT NULL DEFAULT '',
    `task_type` TINYINT NOT NULL DEFAULT 0,
    `algorithm_name` VARCHAR(48) NOT NULL DEFAULT '',
    `task_content` VARCHAR(65535) NOT NULL DEFAULT '',
    `task_status` TINYINT NOT NULL DEFAULT 0,
    `task_duration` BIGINT NOT NULL DEFAULT 0,
    `create_time`  DATETIME(6)  NOT NULL,
    PRIMARY KEY (`id`)
);

CREATE INDEX IF NOT EXISTS `load_task_conn_id` ON `load_task`(`conn_id`);
CREATE INDEX IF NOT EXISTS `load_task_file_id` ON `load_task`(`file_id`);
CREATE INDEX IF NOT EXISTS `load_task_job_id` ON `load_task`(`job_id`);
CREATE INDEX IF NOT EXISTS `job_manager_graph_create_time` ON `job_manager`(`graphspace`, `graph`, `create_time`);
CREATE INDEX IF NOT EXISTS `async_task_graph` ON `async_task`(`graphspace`, `graph`);

CREATE TABLE IF NOT EXISTS `datasource` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `datasource_name` VARCHAR(128) NOT NULL,
    `datasource_config` TEXT NOT NULL,
    `creator` VARCHAR(64) NOT NULL DEFAULT '',
    `create_time` DATETIME(6) NOT NULL,
    PRIMARY KEY (`id`)
);

-- Written only after the complete new schema has initialized successfully.
CREATE TABLE IF NOT EXISTS "PUBLIC"."HUBBLE_SCHEMA_VERSION" (
    "ID" INT PRIMARY KEY CHECK ("ID" = 1),
    "VERSION" INT NOT NULL
);
MERGE INTO "PUBLIC"."HUBBLE_SCHEMA_VERSION" ("ID", "VERSION") KEY ("ID") VALUES (1, 1);
