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

import static org.apache.hugegraph.service.load.FileMappingService.CONN_PREIFX;
import static org.apache.hugegraph.service.load.FileMappingService.JOB_PREIFX;

import java.io.File;
import java.io.IOException;
import java.nio.file.Paths;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import org.apache.commons.lang.StringUtils;
import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.entity.enums.FileMappingStatus;
import org.apache.hugegraph.entity.enums.JobStatus;
import org.apache.hugegraph.entity.load.FileMapping;
import org.apache.hugegraph.entity.load.FileUploadResult;
import org.apache.hugegraph.entity.load.JobManager;
import org.apache.hugegraph.exception.InternalException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.load.FileMappingService;
import org.apache.hugegraph.service.load.JobManagerService;
import org.apache.hugegraph.util.CollectionUtil;
import org.apache.hugegraph.util.Ex;
import org.apache.hugegraph.util.FileUtil;
import org.apache.hugegraph.util.HubbleUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.log4j.Log4j2;

@Log4j2
@RestController
@RequestMapping(Constant.API_VERSION + "graph-connections/{connId}/job-manager/{jobId}/upload-file")
public class FileUploadController {

    @Autowired
    private HugeConfig config;
    @Autowired
    private FileMappingService service;
    @Autowired
    private JobManagerService jobService;

    @GetMapping("token")
    public Map<String, String> fileToken(@PathVariable("connId") int connId,
                                         @PathVariable("jobId") int jobId,
                                         @RequestParam("names")
                                         List<String> fileNames) {
        Ex.check(CollectionUtil.allUnique(fileNames),
                 "load.upload.file.duplicate-name");
        Map<String, String> tokens = new HashMap<>();
        for (String fileName : fileNames) {
            this.checkFileNameValid(fileName);
            String token = this.service.generateFileToken(fileName);
            Ex.check(!this.uploadingTokenLocks().containsKey(token),
                     "load.upload.file.token.existed");
            this.uploadingTokenLocks().put(token, new ReentrantReadWriteLock());
            tokens.put(fileName, token);
        }
        return tokens;
    }

    @PostMapping
    public FileUploadResult upload(@PathVariable("connId") int connId,
                                   @PathVariable("jobId") int jobId,
                                   @RequestParam("file") MultipartFile file,
                                   @RequestParam("name") String fileName,
                                   @RequestParam(value = "size",
                                                 required = false)
                                   Long fileSize,
                                   @RequestParam("token") String token,
                                   @RequestParam("total") int total,
                                   @RequestParam("index") int index) {
        this.checkTotalAndIndexValid(total, index);
        this.checkFileNameValid(fileName);
        this.checkFileNameMatchToken(fileName, token);
        JobManager jobEntity = this.jobService.get(jobId);
        Long sourceFileSize = this.resolveSourceFileSize(file, fileSize,
                                                         total, index);
        this.checkFileValid(jobId, jobEntity, file, fileName);
        if (jobEntity.getJobStatus() == JobStatus.DEFAULT) {
            jobEntity.setJobStatus(JobStatus.UPLOADING);
            this.jobService.update(jobEntity);
        }
        // Ensure location exist and generate file path
        String filePath = this.generateFilePath(connId, jobId, fileName);
        // Check this file deleted before
        ReadWriteLock lock = this.uploadingTokenLocks().get(token);
        FileUploadResult result;
        if (lock == null) {
            result = new FileUploadResult();
            result.setName(file.getOriginalFilename());
            result.setSize(file.getSize());
            result.setStatus(FileUploadResult.Status.FAILURE);
            result.setCause("File has been deleted");
            return result;
        }

        lock.readLock().lock();
        try {
            FileMapping reservedMapping;
            synchronized (this.service) {
                reservedMapping = this.reserveUploadQuota(connId, jobId,
                                                          fileName, filePath,
                                                          sourceFileSize);
            }
            result = this.service.uploadFile(file, index, filePath);
            if (result.getStatus() == FileUploadResult.Status.FAILURE) {
                return result;
            }
            synchronized (this.service) {
                FileMapping mapping = this.service.get(connId, jobId, fileName);
                if (mapping == null) {
                    mapping = reservedMapping;
                }
                Ex.check(mapping != null, "load.file-mapping.not-exist.name",
                         fileName);
                if (mapping.getFileStatus() == FileMappingStatus.COMPLETED) {
                    result.setId(mapping.getId());
                    this.uploadingTokenLocks().remove(token);
                    return result;
                }
                mapping.setUpdateTime(HubbleUtil.nowDate());
                // Determine whether all the parts have been uploaded, then merge them
                boolean merged = this.service.tryMergePartFiles(filePath, total);
                if (!merged) {
                    this.service.update(mapping);
                    return result;
                }
                JobManager currentJob = this.jobService.get(jobId);
                long actualFileSize;
                try {
                    actualFileSize = this.resolveUploadedFileSize(
                            mapping.getPath());
                    Ex.check(currentJob != null, "job-manager.not-exist.id",
                             jobId);
                    long reservedUploadingSize =
                            this.sumReservedUploadingSize(jobId,
                                                          mapping.getId());
                    this.checkFileSizeLimit(actualFileSize,
                                            currentJob.getJobSize(),
                                            reservedUploadingSize);
                } catch (RuntimeException e) {
                    this.cleanupFailedUpload(mapping, token);
                    throw e;
                }
                // Read column names and values then fill it
                this.service.extractColumns(mapping);
                mapping.setFileStatus(FileMappingStatus.COMPLETED);
                mapping.setTotalLines(FileUtil.countLines(mapping.getPath()));
                mapping.setTotalSize(actualFileSize);

                // Move to the directory corresponding to the file mapping Id
                String newPath = this.service.moveToNextLevelDir(mapping);
                // Update file mapping stored path
                mapping.setPath(newPath);
                this.service.update(mapping);
                // Update Job Manager size
                long jobSize = currentJob.getJobSize() + mapping.getTotalSize();
                currentJob.setJobSize(jobSize);
                this.jobService.update(currentJob);
                result.setId(mapping.getId());
                // Remove uploading file token
                this.uploadingTokenLocks().remove(token);
            }
            return result;
        } finally {
            lock.readLock().unlock();
        }
    }

    @DeleteMapping
    public Boolean delete(@PathVariable("connId") int connId,
                          @PathVariable("jobId") int jobId,
                          @RequestParam("name") String fileName,
                          @RequestParam("token") String token) {
        this.checkFileNameValid(fileName);
        JobManager jobEntity = this.jobService.get(jobId);
        Ex.check(jobEntity != null, "job-manager.not-exist.id", jobId);
        Ex.check(jobEntity.getJobStatus() == JobStatus.UPLOADING ||
                 jobEntity.getJobStatus() == JobStatus.MAPPING ||
                 jobEntity.getJobStatus() == JobStatus.SETTING,
                 "deleted.file.no-permission");
        FileMapping mapping = this.service.get(connId, jobId, fileName);
        Ex.check(mapping != null, "load.file-mapping.not-exist.name", fileName);

        ReadWriteLock lock = this.uploadingTokenLocks().get(token);
        if (lock != null) {
            lock.writeLock().lock();
        }
        try {
            this.service.deleteDiskFile(mapping);
            log.info("Prepare to remove file mapping {}", mapping.getId());
            this.service.remove(mapping.getId());
            long jobSize = jobEntity.getJobSize() - mapping.getTotalSize();
            jobEntity.setJobSize(jobSize);
            this.jobService.update(jobEntity);
            if (lock != null) {
                this.uploadingTokenLocks().remove(token);
            }
            return true;
        } finally {
            if (lock != null) {
                lock.writeLock().unlock();
            }
        }
    }

    @PutMapping("next-step")
    public JobManager nextStep(@PathVariable("jobId") int jobId) {
        JobManager jobEntity = this.jobService.get(jobId);
        Ex.check(jobEntity != null, "job-manager.not-exist.id", jobId);
        Ex.check(jobEntity.getJobStatus() == JobStatus.UPLOADING,
                 "job.manager.status.unexpected",
                 JobStatus.UPLOADING, jobEntity.getJobStatus());
        jobEntity.setJobStatus(JobStatus.MAPPING);
        this.jobService.update(jobEntity);
        return jobEntity;
    }

    private Map<String, ReadWriteLock> uploadingTokenLocks() {
        return this.service.getUploadingTokenLocks();
    }

    private void checkTotalAndIndexValid(int total, int index) {
        if (total <= 0) {
            throw new InternalException("The request params 'total' must > 0");
        }
        if (index < 0) {
            throw new InternalException("The request params 'index' must >= 0");
        }
    }

    private void checkFileNameMatchToken(String fileName, String token) {
        String md5Prefix = HubbleUtil.md5(fileName);
        Ex.check(StringUtils.isNotEmpty(token) && token.startsWith(md5Prefix),
                 "load.upload.file.name-token.unmatch");
    }

    private void checkFileNameValid(String fileName) {
        Ex.check(StringUtils.isNotBlank(fileName) &&
                 fileName.equals(FilenameUtils.getName(fileName)) &&
                 !fileName.contains("/") &&
                 !fileName.contains("\\") &&
                 !fileName.contains(".."),
                 "load.upload.file.name.invalid");
    }

    private void checkFileValid(int jobId, JobManager jobEntity,
                                MultipartFile file, String fileName) {
        Ex.check(jobEntity != null, "job-manager.not-exist.id", jobId);
        Ex.check(jobEntity.getJobStatus() == JobStatus.DEFAULT ||
                 jobEntity.getJobStatus() == JobStatus.UPLOADING ||
                 jobEntity.getJobStatus() == JobStatus.MAPPING ||
                 jobEntity.getJobStatus() == JobStatus.SETTING,
                 "load.upload.file.no-permission");
        // Now allowed to upload empty file
        Ex.check(!file.isEmpty(), "load.upload.file.cannot-be-empty");
        // Difficult: how to determine whether the file is csv or text
        log.debug("File content type: {}", file.getContentType());

        String format = FilenameUtils.getExtension(fileName);
        List<String> formatWhiteList = this.config.get(
                HubbleOptions.UPLOAD_FILE_FORMAT_LIST);
        Ex.check(formatWhiteList.contains(format),
                 "load.upload.file.format.unsupported");
    }

    private FileMapping reserveUploadQuota(int connId, int jobId,
                                           String fileName, String filePath,
                                           Long sourceFileSize) {
        JobManager currentJob = this.jobService.get(jobId);
        Ex.check(currentJob != null, "job-manager.not-exist.id", jobId);

        FileMapping mapping = this.service.get(connId, jobId, fileName);
        Ex.check(mapping == null ||
                 mapping.getFileStatus() == FileMappingStatus.UPLOADING,
                 "load.upload.file.existed", fileName);

        long reservedFileSize = this.resolveReservedFileSize(mapping,
                                                             sourceFileSize);
        Integer mappingId = mapping == null ? null : mapping.getId();
        long reservedUploadingSize = this.sumReservedUploadingSize(jobId,
                                                                   mappingId);
        this.checkFileSizeLimit(reservedFileSize, currentJob.getJobSize(),
                                reservedUploadingSize);

        if (mapping == null) {
            mapping = new FileMapping(connId, fileName, filePath);
            mapping.setJobId(jobId);
            this.fillUploadingReservation(mapping, reservedFileSize);
            this.service.save(mapping);
            return mapping;
        }

        mapping.setPath(filePath);
        this.fillUploadingReservation(mapping, reservedFileSize);
        this.service.update(mapping);
        return mapping;
    }

    private Long resolveSourceFileSize(MultipartFile file, Long fileSize,
                                       int total, int index) {
        if (total == 1) {
            return file.getSize();
        }
        if (fileSize != null) {
            return fileSize;
        }
        if (index == 0) {
            return this.estimateChunkedFileSizeUpperBound(file.getSize(),
                                                          total);
        }
        return null;
    }

    private void checkFileSizeLimit(long fileSize, long currentJobSize) {
        this.checkFileSizeLimit(fileSize, currentJobSize, 0L);
    }

    private void checkFileSizeLimit(long fileSize, long currentJobSize,
                                    long reservedUploadingSize) {
        Ex.check(fileSize > 0L, "load.upload.file.cannot-be-empty");

        long singleFileSizeLimit = this.config.get(
                HubbleOptions.UPLOAD_SINGLE_FILE_SIZE_LIMIT);
        Ex.check(fileSize <= singleFileSizeLimit,
                 "load.upload.file.exceed-single-size",
                 FileUtils.byteCountToDisplaySize(singleFileSizeLimit));

        long totalFileSizeLimit = this.config.get(
                HubbleOptions.UPLOAD_TOTAL_FILE_SIZE_LIMIT);
        long totalReservedSize = this.safeAdd(this.safeAdd(fileSize,
                                                           currentJobSize),
                                              reservedUploadingSize);
        Ex.check(totalReservedSize <= totalFileSizeLimit,
                 "load.upload.file.exceed-total-size",
                 FileUtils.byteCountToDisplaySize(totalFileSizeLimit));
    }

    private long resolveUploadedFileSize(String filePath) {
        File uploadedFile = this.service.requirePathUnderUploadRoot(filePath);
        if (!uploadedFile.exists() || !uploadedFile.isFile()) {
            throw new InternalException("The uploaded file '%s' is not ready " +
                                        "for quota validation",
                                        filePath);
        }
        return FileUtils.sizeOf(uploadedFile);
    }

    private void cleanupFailedUpload(FileMapping mapping, String token) {
        this.uploadingTokenLocks().remove(token);
        this.service.cleanupMappings(Collections.singletonList(mapping));
    }

    private long resolveReservedFileSize(FileMapping mapping,
                                         Long sourceFileSize) {
        long reservedFileSize = mapping == null ? 0L : mapping.getTotalSize();
        if (sourceFileSize != null) {
            return Math.max(reservedFileSize, sourceFileSize);
        }
        Ex.check(reservedFileSize > 0L,
                 "load.upload.file.size.missing-before-reserve");
        return reservedFileSize;
    }

    private void fillUploadingReservation(FileMapping mapping,
                                          long reservedFileSize) {
        mapping.setFileStatus(FileMappingStatus.UPLOADING);
        mapping.setTotalSize(reservedFileSize);
        mapping.setUpdateTime(HubbleUtil.nowDate());
    }

    private long sumReservedUploadingSize(int jobId, Integer excludedMappingId) {
        List<FileMapping> mappings = this.service.listByJob(jobId);
        if (mappings == null || mappings.isEmpty()) {
            return 0L;
        }

        long reservedUploadingSize = 0L;
        for (FileMapping mapping : mappings) {
            if (mapping == null ||
                mapping.getFileStatus() != FileMappingStatus.UPLOADING) {
                continue;
            }
            if (excludedMappingId != null &&
                excludedMappingId.equals(mapping.getId())) {
                continue;
            }
            if (mapping.getTotalSize() <= 0L) {
                continue;
            }
            reservedUploadingSize = this.safeAdd(reservedUploadingSize,
                                                 mapping.getTotalSize());
        }
        return reservedUploadingSize;
    }

    private long estimateChunkedFileSizeUpperBound(long chunkSize, int total) {
        try {
            return Math.multiplyExact(chunkSize, (long) total);
        } catch (ArithmeticException ignored) {
            return Long.MAX_VALUE;
        }
    }

    private long safeAdd(long left, long right) {
        try {
            return Math.addExact(left, right);
        } catch (ArithmeticException ignored) {
            return Long.MAX_VALUE;
        }
    }

    private String generateFilePath(int connId, int jobId, String fileName) {
        String location = this.config.get(HubbleOptions.UPLOAD_FILE_LOCATION);
        String path = Paths.get(CONN_PREIFX + connId, JOB_PREIFX + jobId)
                           .toString();
        this.ensureLocationExist(location, path);
        // Before merge: upload-files/conn-1/verson_person.csv/part-1
        // After merge: upload-files/conn-1/file-mapping-1/verson_person.csv
        return Paths.get(location, path, fileName).toString();
    }

    private void ensureLocationExist(String location, String connPath) {
        String path = Paths.get(location, connPath).toString();
        File locationDir = new File(path);
        if (!locationDir.exists()) {
            try {
                FileUtils.forceMkdir(locationDir);
            } catch (IOException e) {
                throw new InternalException("failed to create location dir", e);
            }
        }
    }
}
