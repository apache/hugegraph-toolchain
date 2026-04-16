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

import { createContext } from 'react';
import { observable, action, flow, computed } from 'mobx';
import axios, { AxiosResponse } from 'axios';
import { remove, isUndefined } from 'lodash-es';

import { DataMapStore } from './dataMapStore';
import { ServerDataImportStore } from './serverDataImportStore';
import {
  initErrorInfo,
  initRequestStatus
} from '../../factory/dataImportStore/dataImportRootStore';
import { baseUrl, responseData } from '../../types/common';
import {
  FileUploadResult,
  FileUploadTask,
  FileUploadQueue
} from '../../types/GraphManagementStore/dataImportStore';
import {
  VertexType,
  VertexTypeListResponse,
  EdgeType,
  EdgeTypeListResponse
} from '../../types/GraphManagementStore/metadataConfigsStore';
import { checkIfLocalNetworkOffline, getErrorMessage } from '../../utils';

const MAX_CONCURRENT_UPLOAD = 5;

export class DataImportRootStore {
  dataMapStore: DataMapStore;
  serverDataImportStore: ServerDataImportStore;

  constructor() {
    this.dataMapStore = new DataMapStore(this);
    this.serverDataImportStore = new ServerDataImportStore(this);
  }

  @observable currentId: number | null = null;
  @observable currentJobId: number | null = null;
  @observable currentStatus = '';
  @observable currentStep = NaN;

  @observable requestStatus = initRequestStatus();
  @observable errorInfo = initErrorInfo();

  @observable fileList: File[] = [];
  @observable.ref fileHashes: Record<string, string> = {};
  @observable fileUploadTasks: FileUploadTask[] = [];
  @observable fileUploadQueue: FileUploadQueue[] = [];
  @observable fileRetryUploadList: string[] = [];

  @observable.ref fileInfos: FileUploadResult[] = [];
  @observable.ref vertexTypes: VertexType[] = [];
  @observable.ref edgeTypes: EdgeType[] = [];

  @computed get successFileUploadTaskNames() {
    return this.fileUploadTasks
      .filter(({ status }) => status === 'success')
      .map(({ name }) => name);
  }

  @computed get unsuccessFileUploadTasks() {
    return this.fileUploadTasks.filter(({ status }) => status !== 'success');
  }

  findFileUploadTask(fileName: string) {
    return this.fileUploadTasks.find(({ name }) => name === fileName);
  }

  getRequiredFileUploadTask(fileName: string) {
    const fileUploadTask = this.findFileUploadTask(fileName);

    if (isUndefined(fileUploadTask)) {
      throw new Error(`Upload task '${fileName}' not found`);
    }

    return fileUploadTask;
  }

  @action
  setCurrentId(id: number) {
    this.currentId = id;
  }

  @action
  setCurrentJobId(id: number) {
    this.currentJobId = id;
  }

  @action
  setCurrentStatus(status: string) {
    this.currentStatus = status;
  }

  @action
  setCurrentStep(step: number) {
    this.currentStep = step;
  }

  @action
  updateFileList(files: File[]) {
    this.fileList = [...files, ...this.fileList];
  }

  @action
  initFileUploadTask(tasks: FileUploadTask) {
    this.fileUploadTasks = [tasks, ...this.fileUploadTasks];
  }

  @action
  addFileUploadQueue(element: FileUploadQueue) {
    this.fileUploadQueue.push(element);
  }

  @action
  removeFileUploadQueue(fileName: string) {
    remove(this.fileUploadQueue, ({ fileName: name }) => name === fileName);
  }

  @action
  mutateFileUploadQueue<T extends keyof FileUploadQueue>(
    key: T,
    value: FileUploadQueue[T],
    index: number
  ) {
    this.fileUploadQueue[index][key] = value;
  }

  @action
  mutateFileUploadTasks<T extends keyof FileUploadTask>(
    key: T,
    value: FileUploadTask[T],
    fileName: string
  ) {
    const fileUploadTask = this.findFileUploadTask(fileName);

    // users may click back button in browser
    if (!isUndefined(fileUploadTask)) {
      fileUploadTask[key] = value;
    }
  }

  @action
  removeFileUploadTasks(fileName: string) {
    remove(this.fileUploadTasks, ({ name }) => fileName === name);
  }

  @action
  addRetryFileUploadQueue(fileName: string) {
    this.fileRetryUploadList.push(fileName);
  }

  @action
  pullRetryFileUploadQueue() {
    return this.fileRetryUploadList.shift();
  }

  @action
  resetAllFileInfos() {
    this.fileList = [];
    this.fileUploadTasks = [];
    this.fileUploadQueue = [];
    this.fileInfos = [];
  }

  @action
  dispose() {
    this.currentId = null;
    this.currentJobId = null;
    this.currentStatus = '';
    this.currentStep = NaN;
    this.vertexTypes = [];
    this.edgeTypes = [];

    this.resetAllFileInfos();
    this.requestStatus = initRequestStatus();
    this.errorInfo = initErrorInfo();
  }

  fetchFilehashes = flow(function* fetchFilehashes(
    this: DataImportRootStore,
    fileNames: string[]
  ) {
    this.requestStatus.fetchFilehashes = 'pending';

    try {
      const result = yield axios
        .get<responseData<Record<string, string>>>(
          `${baseUrl}/${this.currentId}/job-manager/${
            this.currentJobId
          }/upload-file/token?${fileNames
            .map((name) => `names=${name}`)
            .join('&')}`
        )
        .catch(checkIfLocalNetworkOffline);

      if (result.data.status !== 200) {
        this.errorInfo.fetchFilehashes.code = result.data.status;
        throw new Error(result.data.message);
      }

      this.fileHashes = { ...this.fileHashes, ...result.data.data };
      this.requestStatus.fetchFilehashes = 'success';
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.requestStatus.fetchFilehashes = 'failed';
      this.errorInfo.fetchFilehashes.message = errorMessage;
      console.error(errorMessage);
    }
  });

  uploadFiles = flow(function* uploadFiles(
    this: DataImportRootStore,
    {
      fileName,
      fileChunkList,
      fileChunkTotal
    }: {
      fileName: string;
      fileChunkList: {
        chunkIndex: number;
        chunk: Blob;
      };
      fileChunkTotal: number;
    }
  ) {
    this.requestStatus.uploadFiles = 'pending';
    const formData = new FormData();
    formData.append('file', fileChunkList.chunk);

    if (this.currentId === null || this.currentJobId === null) {
      return;
    }

    try {
      const fileSize = this.getRequiredFileUploadTask(fileName).size;
      const result: AxiosResponse<responseData<FileUploadResult>> = yield axios
        .post<responseData<FileUploadResult>>(
          `${baseUrl}/${this.currentId}/job-manager/${this.currentJobId}/upload-file?total=${fileChunkTotal}&index=${fileChunkList.chunkIndex}&name=${fileName}&size=${fileSize}&token=${this.fileHashes[fileName]}`,
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          }
        )
        .catch(checkIfLocalNetworkOffline);

      if (result.data.status !== 200) {
        this.errorInfo.uploadFiles.code = result.data.status;
        throw new Error(result.data.message);
      }

      this.fileInfos.push(result.data.data);
      this.requestStatus.uploadFiles = 'success';
      return result.data.data;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.requestStatus.uploadFiles = 'failed';
      this.errorInfo.uploadFiles.message = errorMessage;
      console.error(errorMessage);
    }
  });

  deleteFiles = flow(function* deleteFiles(
    this: DataImportRootStore,
    fileName: string
  ) {
    this.requestStatus.deleteFiles = 'pending';

    try {
      const result = yield axios
        .delete(
          `${baseUrl}/${this.currentId}/job-manager/${this.currentJobId}/upload-file?name=${fileName}&token=${this.fileHashes[fileName]}`
        )
        .catch(checkIfLocalNetworkOffline);

      if (result.data.status !== 200) {
        this.errorInfo.deleteFiles.code = result.data.status;
        throw new Error(result.data.message);
      }

      this.requestStatus.deleteFiles = 'success';
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.requestStatus.deleteFiles = 'failed';
      this.errorInfo.deleteFiles.message = errorMessage;
      console.error(errorMessage);
    }
  });

  sendUploadCompleteSignal = flow(function* sendUploadCompleteSignal(
    this: DataImportRootStore
  ) {
    this.requestStatus.sendUploadCompleteSignal = 'pending';

    try {
      const result = yield axios
        .put(
          `${baseUrl}/${this.currentId}/job-manager/${this.currentJobId}/upload-file/next-step`
        )
        .catch(checkIfLocalNetworkOffline);

      if (result.data.status !== 200) {
        this.errorInfo.sendUploadCompleteSignal.code = result.data.status;
        throw new Error(result.data.message);
      }

      this.requestStatus.sendUploadCompleteSignal = 'success';
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.requestStatus.sendUploadCompleteSignal = 'failed';
      this.errorInfo.sendUploadCompleteSignal.message = errorMessage;
      console.error(errorMessage);
    }
  });

  sendMappingCompleteSignal = flow(function* sendMappingCompleteSignal(
    this: DataImportRootStore
  ) {
    this.requestStatus.sendMappingCompleteSignal = 'pending';

    try {
      const result = yield axios
        .put(
          `${baseUrl}/${this.currentId}/job-manager/${this.currentJobId}/file-mappings/next-step`
        )
        .catch(checkIfLocalNetworkOffline);

      if (result.data.status !== 200) {
        this.errorInfo.sendMappingCompleteSignal.code = result.data.status;
        throw new Error(result.data.message);
      }

      this.requestStatus.sendMappingCompleteSignal = 'success';
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.requestStatus.sendMappingCompleteSignal = 'failed';
      this.errorInfo.sendMappingCompleteSignal.message = errorMessage;
      console.error(errorMessage);
    }
  });

  fetchVertexTypeList = flow(function* fetchVertexTypeList(
    this: DataImportRootStore
  ) {
    this.requestStatus.fetchVertexTypeList = 'pending';

    try {
      const result: AxiosResponse<responseData<
        VertexTypeListResponse
      >> = yield axios
        .get<responseData<VertexTypeListResponse>>(
          `${baseUrl}/${this.currentId}/schema/vertexlabels`,
          {
            params: {
              page_size: -1
            }
          }
        )
        .catch(checkIfLocalNetworkOffline);

      if (result.data.status !== 200) {
        this.errorInfo.fetchVertexTypeList.code = result.data.status;
        throw new Error(result.data.message);
      }

      this.vertexTypes = result.data.data.records;
      this.requestStatus.fetchVertexTypeList = 'success';
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.requestStatus.fetchVertexTypeList = 'failed';
      this.errorInfo.fetchVertexTypeList.message = errorMessage;
    }
  });

  fetchEdgeTypeList = flow(function* fetchEdgeTypeList(
    this: DataImportRootStore
  ) {
    this.requestStatus.fetchEdgeTypeList = 'pending';

    try {
      const result: AxiosResponse<responseData<
        EdgeTypeListResponse
      >> = yield axios
        .get<responseData<EdgeTypeListResponse>>(
          `${baseUrl}/${this.currentId}/schema/edgelabels`,
          {
            params: {
              page_size: -1
            }
          }
        )
        .catch(checkIfLocalNetworkOffline);

      if (result.data.status !== 200) {
        this.errorInfo.fetchEdgeTypeList.code = result.data.status;
        throw new Error(result.data.message);
      }

      this.edgeTypes = result.data.data.records;
      this.requestStatus.fetchEdgeTypeList = 'success';
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.requestStatus.fetchEdgeTypeList = 'failed';
      this.errorInfo.fetchEdgeTypeList.message = errorMessage;
    }
  });
}

export default createContext(new DataImportRootStore());
