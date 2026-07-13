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

CREATE TABLE IF NOT EXISTS `job_manager` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `conn_id` INT DEFAULT 0,
    `graphspace` VARCHAR(48) NOT NULL,
    `graph` VARCHAR(48) NOT NULL,
    `job_name` VARCHAR(100) NOT NULL DEFAULT '',
    `job_remarks` VARCHAR(200) NOT NULL DEFAULT '',
    `job_size` LONG NOT NULL DEFAULT 0,
    `job_status` TINYINT NOT NULL DEFAULT 0,
    `job_duration` LONG NOT NULL DEFAULT 0,
    `update_time` DATETIME(6) NOT NULL,
    `create_time` DATETIME(6) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE (`job_name`, `graphspace`, `graph`)
);

CREATE TABLE IF NOT EXISTS `file_mapping` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `conn_id` INT,
    `graphspace` VARCHAR(48) NOT NULL,
    `graph` VARCHAR(48) NOT NULL,
    `job_id` INT NOT NULL DEFAULT 0,
    `name` VARCHAR(128) NOT NULL,
    `path` VARCHAR(2048) NOT NULL,
    `total_lines` LONG NOT NULL,
    `total_size` LONG NOT NULL,
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
    `file_total_lines` LONG NOT NULL,
    `load_status` TINYINT NOT NULL,
    `file_read_lines` LONG NOT NULL,
    `last_duration` LONG NOT NULL,
    `curr_duration` LONG NOT NULL,
    `create_time` DATETIME(6) NOT NULL,
    PRIMARY KEY (`id`)
);
