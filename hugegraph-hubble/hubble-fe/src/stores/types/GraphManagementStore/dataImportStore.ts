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

import { CancellablePromise } from 'mobx/lib/api/flow';

export interface JobGlance {
  name: string;
  description: string;
}

export interface Job {
  id: number;
  conn_id: number;
  job_name: string;
  job_remarks: string;
  job_size: string;
  job_status: string;
  job_duration: string;
  update_time: string;
  create_time: string;
}

export interface JobResponse {
  records: Job[];
  total: number;
}

export interface JobFailedReason {
  task_id: number;
  file_id: number;
  file_name: string;
  reason: string;
}

export interface FileUploadTask {
  name: string;
  size: number;
  status: 'uploading' | 'failed' | 'success';
  chunkList: {
    chunkIndex: number;
    chunk: Blob;
  }[];
  chunkTotal: number;
  uploadedChunkTotal: number;
  pendingChunkIndexes: number[];
  failedChunkIndexes: number[];
  uploadedChunksIndexes: number[];
}

export interface FileUploadResult {
  id: string;
  name: string;
  size: string;
  status: string;
  cause: string | null;
}

export interface FileUploadQueue {
  fileName: string;
  status: string;
  task: CancellablePromise<FileUploadResult | undefined>;
}

export interface FileConfig {
  has_header: boolean;
  column_names: string[];
  column_values: string[];
  format: string;
  delimiter: string;
  charset: string;
  date_format: string;
  time_zone: string;
  skipped_line: string;
}

export type FileValidator = Pick<
  FileConfig,
  'delimiter' | 'charset' | 'date_format' | 'skipped_line'
>;

export interface FieldMapping {
  column_name: string;
  mapped_name: string;
}

export interface ValueMapping {
  column_name: string;
  values: {
    column_value: string;
    mapped_value: string;
  }[];
}

export type ValueMapValidator = {
  null_values: string[];
  value_mapping: ValueMapping[];
};

export interface NullValues {
  checked: string[];
  customized: string[];
}

export interface VertexMap {
  id?: string;
  label: string;
  id_fields: string[];
  field_mapping: FieldMapping[];
  value_mapping: ValueMapping[];
  null_values: NullValues;
}

export interface EdgeMap {
  id?: string;
  label: string;
  source_fields: string[];
  target_fields: string[];
  field_mapping: FieldMapping[];
  value_mapping: ValueMapping[];
  null_values: NullValues;
}

export interface LoadParameter {
  check_vertex: boolean;
  insert_timeout: string;
  max_parse_errors: string;
  max_insert_errors: string;
  retry_times: string;
  retry_interval: string;
}

export interface FileMapInfo {
  id: number;
  name: string;
  total_lines: number;
  total_size: string;
  total_size_bytes: number;
  file_setting: FileConfig;
  file_status: string;
  vertex_mappings: VertexMap[];
  edge_mappings: EdgeMap[];
  load_parameter: LoadParameter;
  last_access_time: string;
}

export interface FileMapResult {
  records: FileMapInfo[];
}

export interface ImportTasks {
  id: number;
  conn_id: number;
  file_id: number;
  vertices: string[];
  edges: string[];
  load_rate: number;
  load_progress: number;
  file_total_lines: number;
  file_read_lines: number;
  status: string;
  duration: string;
}

export interface AllImportTasksRecords {
  records: ImportTasks[];
}
