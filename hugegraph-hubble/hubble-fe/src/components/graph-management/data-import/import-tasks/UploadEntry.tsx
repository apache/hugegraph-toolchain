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

import React, { useContext, useCallback, useRef, useEffect } from 'react';
import { observer } from 'mobx-react';
import { useLocation } from 'wouter';
import classnames from 'classnames';
import {
  isEmpty,
  size,
  isUndefined,
  range,
  xor,
  intersection
} from 'lodash-es';
import { DndProvider, useDrop, DropTargetMonitor } from 'react-dnd';
import { useTranslation } from 'react-i18next';
import { HTML5Backend, NativeTypes } from 'react-dnd-html5-backend';
import { Button, Progress, Message } from 'hubble-ui';
import { CancellablePromise } from 'mobx/lib/api/flow';

import { DataImportRootStoreContext } from '../../../../stores';
import { useInitDataImport } from '../../../../hooks';
import { isCurrentJobUploadSizeExceeded } from '../../../../utils/dataImportUpload';

import type { FileUploadResult } from '../../../../stores/types/GraphManagementStore/dataImportStore';

import CloseIcon from '../../../../assets/imgs/ic_close_16.svg';
import RefreshIcon from '../../../../assets/imgs/ic_refresh.svg';

import './UploadEntry.less';

const KB = 1024;
const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;
const MAX_CONCURRENT_UPLOAD = 5;

const UploadEntry: React.FC = observer(() => {
  const dataImportRootStore = useContext(DataImportRootStoreContext);
  const { dataMapStore, serverDataImportStore } = dataImportRootStore;
  const isInitReady = useInitDataImport();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  useEffect(() => {
    const unload = (e: any) => {
      e = e || window.event;

      if (e) {
        e.returnValue = 'hint';
      }

      return 'hint';
    };

    window.addEventListener('beforeunload', unload);

    return () => {
      window.removeEventListener('beforeunload', unload);
    };
  }, [dataImportRootStore]);

  return isInitReady ? (
    <>
      <DndProvider backend={HTML5Backend}>
        <FileDropZone />
      </DndProvider>
      <div className="import-tasks-manipulation-wrapper">
        <Button
          size="medium"
          style={{ width: 88, marginRight: 16 }}
          disabled={
            !dataImportRootStore.fileUploadTasks.some(
              ({ status }) => status === 'uploading'
            )
          }
          onClick={() => {
            dataImportRootStore.fileUploadQueue.forEach(
              ({ fileName, status }) => {
                if (status === 'uploading') {
                  dataImportRootStore.mutateFileUploadTasks(
                    'status',
                    'failed',
                    fileName
                  );
                }
              }
            );
          }}
        >
          {t('upload-files.cancel')}
        </Button>
        <Button
          type="primary"
          size="medium"
          style={{ width: 74 }}
          disabled={
            (isEmpty(dataImportRootStore.fileUploadTasks) &&
              isEmpty(dataMapStore.fileMapInfos)) ||
            isEmpty(
              dataMapStore.fileMapInfos.filter(
                ({ file_status }) => file_status === 'COMPLETED'
              )
            ) ||
            dataImportRootStore.fileUploadTasks.some(
              ({ status }) => status === 'uploading'
            )
          }
          onClick={async () => {
            // require fetching fileMapInfo here, since files that saved on
            // server need to be revealed either, users may delete some files
            await dataMapStore.fetchDataMaps();

            dataMapStore.setSelectedFileId(
              Number(
                dataMapStore.fileMapInfos.filter(
                  ({ file_status }) => file_status === 'COMPLETED'
                )[0].id
              )
            );
            dataMapStore.setSelectedFileInfo();
            serverDataImportStore.syncImportConfigs(
              dataMapStore.selectedFileInfo!.load_parameter
            );

            setLocation(
              `/graph-management/${dataImportRootStore.currentId}/data-import/import-manager/${dataImportRootStore.currentJobId}/import-tasks/mapping`
            );

            dataImportRootStore.setCurrentStep(2);
            // avoid resets when user moves back to previous step
            if (
              dataImportRootStore.currentStatus === 'DEFAULT' ||
              dataImportRootStore.currentStatus === 'UPLOADING'
            ) {
              // users may browse from <JobDetails />
              // which make @readonly and @irregularProcess true
              dataMapStore.switchReadOnly(false);
              dataMapStore.switchIrregularProcess(false);

              dataImportRootStore.setCurrentStatus('MAPPING');
              dataImportRootStore.sendUploadCompleteSignal();
            }
          }}
        >
          {t('upload-files.next')}
        </Button>
      </div>
    </>
  ) : null;
});

export const FileDropZone: React.FC = observer(() => {
  const dataImportRootStore = useContext(DataImportRootStoreContext);
  const { dataMapStore, serverDataImportStore } = dataImportRootStore;
  const [{ canDrop, isOver }, drop] = useDrop({
    accept: [NativeTypes.FILE],
    drop(item, monitor) {
      handleFileDrop(monitor);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop()
    })
  });
  const { t } = useTranslation();

  const uploadRef = useRef<HTMLInputElement>(null);

  const validateFileCondition = (files: File[]) => {
    const validatedFiles = [];
    const currentUploadFileNames = dataImportRootStore.fileUploadTasks
      .map(({ name }) => name)
      .concat(dataMapStore.fileMapInfos.map(({ name }) => name));

    const filteredFiles = files.filter(
      ({ name }) => !currentUploadFileNames.includes(name)
    );

    if (size(filteredFiles) !== size(files)) {
      const duplicatedFiles = xor(files, filteredFiles);

      Message.error({
        content: (
          <div style={{ maxHeight: 500, overflow: 'auto' }}>
            <p>{t('upload-files.no-duplicate')}</p>
            {duplicatedFiles.map((file) => (
              <p key={file.name}>{file.name}</p>
            ))}
          </div>
        ),
        size: 'medium',
        showCloseIcon: false
      });
    }

    if (
      isCurrentJobUploadSizeExceeded(
        dataMapStore.fileMapInfos,
        dataImportRootStore.fileUploadTasks,
        filteredFiles
      )
    ) {
      Message.error({
        content: `${t('upload-files.over-all-size-limit')}`,
        size: 'medium',
        showCloseIcon: false
      });

      return [];
    }

    for (const file of filteredFiles) {
      const { name, size } = file;
      const sizeGB = size / GB;

      if (size === 0) {
        Message.error({
          content: `${name} ${t('upload-files.empty-file')}`,
          size: 'medium',
          showCloseIcon: false
        });

        break;
      }

      if (name.slice(-4) !== '.csv') {
        Message.error({
          content: `${name}: ${t('upload-files.wrong-format')}`,
          size: 'medium',
          showCloseIcon: false
        });

        break;
      }

      if (sizeGB > 1) {
        Message.error({
          content: `${name}: ${t('upload-files.over-single-size-limit')}`,
          size: 'medium',
          showCloseIcon: false
        });

        break;
      }

      validatedFiles.push(file);
    }

    dataImportRootStore.updateFileList(validatedFiles);
    return validatedFiles;
  };

  const handleFileChange = (files: File[]) => {
    for (const file of files) {
      const { name, size } = file;
      const sizeMB = size / MB;

      const chunkList = [];
      // start byte to slice
      let currentChunkStartIndex = 0;
      // size of each chunk
      let chunkSizeMB: number;
      let chunkIndex = 0;

      if (sizeMB > 2 && sizeMB <= 128) {
        chunkSizeMB = 2;
      } else if (sizeMB > 128 && size <= 512) {
        chunkSizeMB = 4;
      } else {
        chunkSizeMB = 5;
      }

      while (currentChunkStartIndex < size) {
        chunkList.push({
          chunkIndex,
          chunk: file.slice(
            currentChunkStartIndex,
            currentChunkStartIndex + chunkSizeMB * MB
          )
        });
        currentChunkStartIndex += chunkSizeMB * MB;
        ++chunkIndex;
      }

      dataImportRootStore.initFileUploadTask({
        name,
        size,
        status: 'uploading',
        chunkList,
        chunkTotal: Math.ceil(size / (chunkSizeMB * MB)),
        uploadedChunkTotal: 0,
        pendingChunkIndexes: [],
        failedChunkIndexes: [],
        uploadedChunksIndexes: []
      });
    }
  };

  const initFileTaskQueue = () => {
    const firstRequestTasks = dataImportRootStore.fileUploadTasks.slice(
      0,
      MAX_CONCURRENT_UPLOAD
    );

    firstRequestTasks.forEach(({ name, chunkList, chunkTotal }) => {
      const task = dataImportRootStore.uploadFiles({
        fileName: name,
        fileChunkList: chunkList[0],
        fileChunkTotal: chunkTotal
      });

      dataImportRootStore.addFileUploadQueue({
        fileName: name,
        status: 'uploading',
        task
      });

      scheduler(name, 0, task);
    });

    if (size(firstRequestTasks) < MAX_CONCURRENT_UPLOAD) {
      let loopCount = 1;

      // Traverse firstRequestTasks to add extra items to queue
      while (loopCount) {
        const currentQueueItemSize = size(dataImportRootStore.fileUploadQueue);

        firstRequestTasks.forEach(({ chunkTotal, chunkList, name }) => {
          if (
            chunkTotal > loopCount &&
            size(dataImportRootStore.fileUploadQueue) < MAX_CONCURRENT_UPLOAD
          ) {
            const task = dataImportRootStore.uploadFiles({
              fileName: name,
              fileChunkList: chunkList[loopCount],
              fileChunkTotal: chunkTotal
            });

            dataImportRootStore.addFileUploadQueue({
              fileName: name,
              status: 'uploading',
              task
            });

            scheduler(name, loopCount, task);
          }
        });

        if (
          size(dataImportRootStore.fileUploadQueue) === MAX_CONCURRENT_UPLOAD ||
          // which means no other items pushed into queue
          currentQueueItemSize === size(dataImportRootStore.fileUploadQueue)
        ) {
          break;
        } else {
          loopCount += 1;
        }
      }
    }
  };

  const scheduler = useCallback(
    async (
      fileName: string,
      fileChunkIndex: number,
      task: CancellablePromise<FileUploadResult | undefined>,
      retryMode: boolean = false
    ) => {
      const fileUploadTask = dataImportRootStore.fileUploadTasks.find(
        ({ name }) => name === fileName
      )!;

      // users may click back button in browser
      if (isUndefined(fileUploadTask)) {
        return;
      }

      // the index of fileChunk is pending
      dataImportRootStore.mutateFileUploadTasks(
        'pendingChunkIndexes',
        [...fileUploadTask.pendingChunkIndexes, fileChunkIndex],
        fileName
      );

      let result;

      // cancel all uploads by user
      if (fileUploadTask.status === 'failed') {
        task.cancel();
        result = undefined;
      } else {
        result = await task;
      }

      if (isUndefined(result) || result.status === 'FAILURE') {
        if (fileUploadTask.status !== 'failed') {
          if (dataImportRootStore.errorInfo.uploadFiles.message !== '') {
            Message.error({
              content: dataImportRootStore.errorInfo.uploadFiles.message,
              size: 'medium',
              showCloseIcon: false
            });
          }

          dataImportRootStore.mutateFileUploadTasks(
            'status',
            'failed',
            fileName
          );
        }

        dataImportRootStore.mutateFileUploadTasks(
          'failedChunkIndexes',
          [...fileUploadTask.failedChunkIndexes, fileChunkIndex],
          fileName
        );

        dataImportRootStore.mutateFileUploadTasks(
          'pendingChunkIndexes',
          [],
          fileName
        );

        dataImportRootStore.removeFileUploadQueue(fileName);
        return;
      }

      if (result.status === 'SUCCESS') {
        dataImportRootStore.mutateFileUploadTasks(
          'uploadedChunkTotal',
          fileUploadTask.uploadedChunkTotal + 1,
          fileName
        );

        dataImportRootStore.mutateFileUploadTasks(
          'uploadedChunksIndexes',
          [...fileUploadTask.uploadedChunksIndexes, fileChunkIndex],
          fileName
        );

        if (retryMode) {
          // remove failed chunk index after succeed
          dataImportRootStore.mutateFileUploadTasks(
            'failedChunkIndexes',
            fileUploadTask.failedChunkIndexes.filter(
              (failedChunkIndex) => failedChunkIndex !== fileChunkIndex
            ),
            fileName
          );

          // if there are no longer existed failed chunk index,
          // set retry mode to false
          if (size(fileUploadTask.failedChunkIndexes) === 0) {
            retryMode = false;
          }
        }

        // all file chunks are uploaded
        if (fileUploadTask.chunkTotal === fileUploadTask.uploadedChunkTotal) {
          // remove fully uploaded file from queue
          dataImportRootStore.removeFileUploadQueue(fileName);
          // change the status of fully uploaded file to success
          dataImportRootStore.mutateFileUploadTasks(
            'status',
            'success',
            fileName
          );
          // clear chunkList of fully uploaded file to release memory
          dataImportRootStore.mutateFileUploadTasks('chunkList', [], fileName);

          // no uploading files
          if (
            dataImportRootStore.fileUploadTasks.every(
              ({ status }) => status !== 'uploading'
            )
          ) {
            dataMapStore.fetchDataMaps();
            return;
          }

          if (size(dataImportRootStore.fileRetryUploadList) !== 0) {
            // check if there are some failed uploads waiting in retry queue
            const fileName = dataImportRootStore.pullRetryFileUploadQueue()!;
            const retryFileUploadTask = dataImportRootStore.fileUploadTasks.find(
              ({ name }) => name === fileName
            )!;

            const task = dataImportRootStore.uploadFiles({
              fileName,
              fileChunkList:
                retryFileUploadTask.chunkList[
                  retryFileUploadTask.failedChunkIndexes[0]
                ],
              fileChunkTotal: retryFileUploadTask.chunkTotal
            });

            scheduler(
              retryFileUploadTask.name,
              retryFileUploadTask.failedChunkIndexes[0],
              task,
              true
            );

            return;
          }

          for (const [
            fileIndex,
            fileUploadTask
          ] of dataImportRootStore.fileUploadTasks.entries()) {
            // if there still has files which are fully not being uploaded
            if (
              fileUploadTask.uploadedChunkTotal === 0 &&
              size(fileUploadTask.pendingChunkIndexes) === 0
            ) {
              const task = dataImportRootStore.uploadFiles({
                fileName: fileUploadTask.name,
                fileChunkList:
                  dataImportRootStore.fileUploadTasks[fileIndex].chunkList[0],
                fileChunkTotal:
                  dataImportRootStore.fileUploadTasks[fileIndex].chunkTotal
              });

              dataImportRootStore.addFileUploadQueue({
                fileName: fileUploadTask.name,
                status: 'uploading',
                task
              });

              scheduler(fileUploadTask.name, 0, task);

              // if queue is full, do not loop to add task
              if (
                size(dataImportRootStore.fileUploadQueue) ===
                MAX_CONCURRENT_UPLOAD
              ) {
                break;
              }
            }
          }

          return;
        }

        let nextUploadChunkIndex;

        if (retryMode) {
          const duplicateIndexes = intersection(
            fileUploadTask.uploadedChunksIndexes,
            fileUploadTask.failedChunkIndexes
          );

          if (!isEmpty(duplicateIndexes)) {
            dataImportRootStore.mutateFileUploadTasks(
              'failedChunkIndexes',
              fileUploadTask.failedChunkIndexes.filter(
                (failedIndex) => !duplicateIndexes.includes(failedIndex)
              ),
              fileName
            );
          }

          if (isEmpty(fileUploadTask.failedChunkIndexes)) {
            retryMode = false;
          }

          nextUploadChunkIndex =
            fileUploadTask.failedChunkIndexes[0] ||
            Math.max(
              ...fileUploadTask.pendingChunkIndexes,
              // maybe it just turns retry mode to false
              // and the failed chunk index could be less than
              // the one which uploads success
              // we have to compare uploaded chunk index either
              ...fileUploadTask.uploadedChunksIndexes
            ) + 1;
        } else {
          nextUploadChunkIndex =
            Math.max(
              ...fileUploadTask.pendingChunkIndexes,
              // maybe it just turns retry mode to false
              // and the failed chunk index could be less than
              // the one which uploads success
              // we have to compare uploaded chunk index either
              ...fileUploadTask.uploadedChunksIndexes
            ) + 1;
        }

        // remove pending here to get right result of nextUploadChunkIndex
        dataImportRootStore.mutateFileUploadTasks(
          'pendingChunkIndexes',
          fileUploadTask.pendingChunkIndexes.filter(
            (pendingChunkIndex) => pendingChunkIndex !== fileChunkIndex
          ),
          fileName
        );

        // no recursion
        if (
          nextUploadChunkIndex > fileUploadTask.chunkTotal - 1 ||
          fileUploadTask.uploadedChunksIndexes.includes(nextUploadChunkIndex)
        ) {
          return;
        }

        scheduler(
          fileName,
          nextUploadChunkIndex,
          dataImportRootStore.uploadFiles({
            fileName,
            fileChunkList: fileUploadTask.chunkList[nextUploadChunkIndex],
            fileChunkTotal: fileUploadTask.chunkTotal
          }),
          retryMode
        );

        return;
      }
    },
    []
  );

  const handleFileDrop = async (monitor: DropTargetMonitor) => {
    if (monitor) {
      const fileList = monitor.getItem().files;
      const currentValidateFileList = validateFileCondition(fileList);
      const isFirstBatchUpload =
        size(dataImportRootStore.fileUploadTasks) === 0;

      if (isEmpty(currentValidateFileList)) {
        return;
      }

      await dataImportRootStore.fetchFilehashes(
        currentValidateFileList.map(({ name }) => name)
      );

      handleFileChange(currentValidateFileList);

      if (isFirstBatchUpload) {
        initFileTaskQueue();
      } else {
        const spareQueueItems =
          MAX_CONCURRENT_UPLOAD - size(dataImportRootStore.fileUploadQueue);

        if (spareQueueItems === 0) {
          return;
        }

        // if new selected files are less than spare spaces from queue
        if (spareQueueItems >= size(currentValidateFileList)) {
          currentValidateFileList.forEach(({ name }) => {
            const fileUploadTask = dataImportRootStore.fileUploadTasks.find(
              ({ name: fileName }) => fileName === name
            )!;

            const task = dataImportRootStore.uploadFiles({
              fileName: name,
              fileChunkList: fileUploadTask.chunkList[0],
              fileChunkTotal: fileUploadTask.chunkTotal
            });

            dataImportRootStore.addFileUploadQueue({
              fileName: fileUploadTask.name,
              status: 'uploading',
              task
            });
            scheduler(name, 0, task);
          });
        } else {
          range(spareQueueItems).forEach((fileUploadTaskIndex) => {
            const fileUploadTask = dataImportRootStore.fileUploadTasks.find(
              ({ name: fileName }) =>
                fileName === currentValidateFileList[fileUploadTaskIndex].name
            )!;

            const task = dataImportRootStore.uploadFiles({
              fileName: fileUploadTask.name,
              fileChunkList: fileUploadTask.chunkList[0],
              fileChunkTotal: fileUploadTask.chunkTotal
            });

            dataImportRootStore.addFileUploadQueue({
              fileName: fileUploadTask.name,
              status: 'uploading',
              task
            });
            scheduler(fileUploadTask.name, 0, task);
          });
        }
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // event in async callback should call this
    e.persist();

    if (e.target.files) {
      const fileList = Array.from(e.target.files);
      const currentValidateFileList = validateFileCondition(fileList);
      const isFirstBatchUpload =
        size(dataImportRootStore.fileUploadTasks) === 0;

      if (isEmpty(currentValidateFileList)) {
        return;
      }

      await dataImportRootStore.fetchFilehashes(
        currentValidateFileList.map(({ name }) => name)
      );

      handleFileChange(currentValidateFileList);

      if (isFirstBatchUpload) {
        initFileTaskQueue();
      } else {
        const spareQueueItems =
          MAX_CONCURRENT_UPLOAD - size(dataImportRootStore.fileUploadQueue);

        if (spareQueueItems === 0) {
          return;
        }

        // if new selected files are less than spare spaces from queue
        if (spareQueueItems >= size(currentValidateFileList)) {
          currentValidateFileList.forEach(({ name }) => {
            const fileUploadTask = dataImportRootStore.fileUploadTasks.find(
              ({ name: fileName }) => fileName === name
            )!;

            const task = dataImportRootStore.uploadFiles({
              fileName: name,
              fileChunkList: fileUploadTask.chunkList[0],
              fileChunkTotal: fileUploadTask.chunkTotal
            });

            dataImportRootStore.addFileUploadQueue({
              fileName: fileUploadTask.name,
              status: 'uploading',
              task
            });
            scheduler(name, 0, task);
          });
        } else {
          range(spareQueueItems).forEach((fileUploadTaskIndex) => {
            const fileUploadTask = dataImportRootStore.fileUploadTasks.find(
              ({ name: fileName }) =>
                fileName === currentValidateFileList[fileUploadTaskIndex].name
            )!;

            const task = dataImportRootStore.uploadFiles({
              fileName: fileUploadTask.name,
              fileChunkList: fileUploadTask.chunkList[0],
              fileChunkTotal: fileUploadTask.chunkTotal
            });

            dataImportRootStore.addFileUploadQueue({
              fileName: fileUploadTask.name,
              status: 'uploading',
              task
            });
            scheduler(fileUploadTask.name, 0, task);
          });
        }
      }
    }

    // select same file will not trigger onChange on input[type="file"]
    // need to reset its value here
    e.target.value = '';
  };

  const dragAreaClassName = classnames({
    'import-tasks-upload-drag-area': true,
    'file-above': canDrop && isOver
  });

  // if upload file api throw errors
  useEffect(() => {
    if (dataImportRootStore.errorInfo.uploadFiles.message !== '') {
      Message.error({
        content: dataImportRootStore.errorInfo.uploadFiles.message,
        size: 'medium',
        showCloseIcon: false
      });
    }
  }, [dataImportRootStore.errorInfo.uploadFiles.message]);

  return (
    <div className="import-tasks-upload-wrapper">
      <label htmlFor="import-tasks-file-upload">
        <div className={dragAreaClassName} ref={drop}>
          {/* <span>{t('upload-files.description')}</span>   */}
          <span style={{ fontWeight: 900, color: '#000' }}>
            {t('upload-files.click')}
          </span>
          <span>{t('upload-files.description-1')}</span>
          <span style={{ fontWeight: 900, color: '#000' }}>
            {t('upload-files.drag')}
          </span>
          <span>{t('upload-files.description-2')}</span>
          <input
            ref={uploadRef}
            type="file"
            id="import-tasks-file-upload"
            multiple={true}
            onChange={handleFileSelect}
            style={{
              display: 'none'
            }}
          />
        </div>
      </label>
      <FileList scheduler={scheduler} />
    </div>
  );
});

export interface FileListProps {
  scheduler: (
    fileName: string,
    fileChunkIndex: number,
    task: CancellablePromise<FileUploadResult | undefined>,
    retryMode?: boolean
  ) => Promise<void>;
}

export const FileList: React.FC<FileListProps> = observer(({ scheduler }) => {
  const dataImportRootStore = useContext(DataImportRootStoreContext);
  const { dataMapStore } = dataImportRootStore;

  const handleRetry = (fileName: string) => () => {
    // if (size(dataImportRootStore.fileUploadQueue) === 0) {
    if (size(dataImportRootStore.fileUploadQueue) < MAX_CONCURRENT_UPLOAD) {
      const fileUploadTask = dataImportRootStore.fileUploadTasks.find(
        ({ name }) => name === fileName
      )!;

      const task = dataImportRootStore.uploadFiles({
        fileName,
        fileChunkList:
          fileUploadTask.chunkList[fileUploadTask.failedChunkIndexes[0]] ||
          fileUploadTask.chunkList[
            Math.max(
              ...fileUploadTask.pendingChunkIndexes,
              // maybe it just turns retry mode to false
              // and the failed chunk index could be less than
              // the one which uploads success
              // we have to compare uploaded chunk index either
              ...fileUploadTask.uploadedChunksIndexes
            ) + 1
          ],
        fileChunkTotal: fileUploadTask.chunkTotal
      });

      dataImportRootStore.addFileUploadQueue({
        fileName,
        status: 'uploading',
        task
      });

      dataImportRootStore.mutateFileUploadTasks(
        'status',
        'uploading',
        fileName
      );

      if (!isEmpty(fileUploadTask.failedChunkIndexes)) {
        dataImportRootStore.mutateFileUploadTasks(
          'failedChunkIndexes',
          [...fileUploadTask.failedChunkIndexes.slice(1)],
          fileName
        );
      }

      scheduler(
        fileName,
        fileUploadTask.failedChunkIndexes[0] ||
          Math.max(
            ...fileUploadTask.pendingChunkIndexes,
            // maybe it just turns retry mode to false
            // and the failed chunk index could be less than
            // the one which uploads success
            // we have to compare uploaded chunk index either
            ...fileUploadTask.uploadedChunksIndexes
          ) + 1,
        task,
        true
      );
    } else {
      // or just add filename to retry queue,
      // let other scheduler decide when to call it
      dataImportRootStore.addRetryFileUploadQueue(fileName);
    }
  };

  const handleDelete = (name: string, existed = false) => async () => {
    await dataImportRootStore.deleteFiles(name);

    if (dataImportRootStore.requestStatus.deleteFiles === 'failed') {
      Message.error({
        content: dataImportRootStore.errorInfo.deleteFiles.message,
        size: 'medium',
        showCloseIcon: false
      });

      return;
    }

    if (existed === true) {
      dataMapStore.fetchDataMaps();
      return;
    }

    dataImportRootStore.removeFileUploadTasks(name);

    // if no uploading files, fetch data maps again
    if (
      !dataImportRootStore.fileUploadTasks.some(
        ({ status }) => status === 'uploading'
      )
    ) {
      dataMapStore.fetchDataMaps();
    }
  };

  return (
    <div className="import-tasks-upload-file-list">
      {dataImportRootStore.fileUploadTasks.map(
        ({ name, size, chunkTotal, uploadedChunkTotal, status }) => {
          const [sizeKB, sizeMB, sizeGB] = [size / KB, size / MB, size / GB];
          const convertedSize =
            sizeGB > 1
              ? String(sizeGB.toFixed(2)) + ' GB'
              : sizeMB > 1
              ? String(sizeMB.toFixed(2)) + ' MB'
              : sizeKB > 1
              ? String(sizeKB.toFixed(2)) + ' KB'
              : String(size) + ' Byte';
          const progress = Number(
            ((uploadedChunkTotal / chunkTotal) * 100).toFixed(2)
          );

          return (
            <div className="import-tasks-upload-file-info" key={name}>
              <div className="import-tasks-upload-file-info-titles">
                <span>{name}</span>
                <span>{convertedSize}</span>
              </div>
              <div className="import-tasks-upload-file-info-progress-status">
                <Progress
                  width={390}
                  percent={progress}
                  status={
                    progress === 100
                      ? 'success'
                      : status === 'failed'
                      ? 'exception'
                      : 'normal'
                  }
                  onCancel={handleDelete(name)}
                />
                {status === 'failed' && progress !== 100 && (
                  <img
                    src={RefreshIcon}
                    alt="retry-upload-file"
                    className="import-tasks-upload-file-info-progress-status-refresh-icon"
                    onClick={handleRetry(name)}
                  />
                )}
                <img
                  src={CloseIcon}
                  alt="delete-file"
                  onClick={handleDelete(name)}
                  className={
                    progress !== 100 && status !== 'failed'
                      ? 'import-tasks-upload-file-info-progress-status-close-icon in-progress'
                      : status === 'failed'
                      ? 'import-tasks-upload-file-info-progress-status-close-icon in-error'
                      : 'import-tasks-upload-file-info-progress-status-close-icon'
                  }
                />
              </div>
            </div>
          );
        }
      )}
      {dataMapStore.fileMapInfos
        .filter(
          ({ name }) =>
            !dataImportRootStore.successFileUploadTaskNames.includes(name)
        )
        .map(({ name, total_size }) => {
          return (
            <div className="import-tasks-upload-file-info" key={name}>
              <div className="import-tasks-upload-file-info-titles">
                <span>{name}</span>
                <span>{total_size}</span>
              </div>
              <div className="import-tasks-upload-file-info-progress-status">
                <Progress
                  width={390}
                  percent={100}
                  status="success"
                  onCancel={handleDelete}
                />
                <img
                  src={CloseIcon}
                  alt="delete-file"
                  className="import-tasks-upload-file-info-progress-status-close-icon"
                  onClick={handleDelete(name, true)}
                />
              </div>
            </div>
          );
        })}
    </div>
  );
});

export default UploadEntry;
