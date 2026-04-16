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

package org.apache.hugegraph.service.load;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.apache.commons.io.FileUtils;
import org.apache.commons.io.IOUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.entity.enums.FileMappingStatus;
import org.apache.hugegraph.entity.load.FileMapping;
import org.apache.hugegraph.entity.load.FileSetting;
import org.apache.hugegraph.entity.load.FileUploadResult;
import org.apache.hugegraph.entity.load.JobManager;
import org.apache.hugegraph.exception.InternalException;
import org.apache.hugegraph.mapper.load.FileMappingMapper;
import org.apache.hugegraph.mapper.load.JobManagerMapper;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.util.Ex;
import org.apache.hugegraph.util.HubbleUtil;
import org.apache.hugegraph.util.StringUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

import lombok.extern.log4j.Log4j2;

@Log4j2
@Service
public class FileMappingService {

    public static final String CONN_PREIFX = "graph-connection-";
    public static final String JOB_PREIFX = "job-";
    public static final String FILE_PREIFX = "file-mapping-";

    @Autowired
    private HugeConfig config;
    @Autowired
    private FileMappingMapper mapper;
    @Autowired
    private JobManagerMapper jobManagerMapper;

    private final Map<String, ReadWriteLock> uploadingTokenLocks;

    public FileMappingService() {
        this.uploadingTokenLocks = new ConcurrentHashMap<>();
    }

    public Map<String, ReadWriteLock> getUploadingTokenLocks() {
        return this.uploadingTokenLocks;
    }

    public FileMapping get(int id) {
        return this.mapper.selectById(id);
    }

    public FileMapping get(int connId, int jobId, String fileName) {
        QueryWrapper<FileMapping> query = Wrappers.query();
        query.eq("conn_id", connId)
             .eq("job_id", jobId)
             .eq("name", fileName);
        return this.mapper.selectOne(query);
    }

    public List<FileMapping> listAll() {
        return this.mapper.selectList(null);
    }

    public List<FileMapping> listByJob(int jobId) {
        QueryWrapper<FileMapping> query = Wrappers.query();
        query.eq("job_id", jobId);
        return this.mapper.selectList(query);
    }

    public IPage<FileMapping> list(int connId, int jobId, int pageNo, int pageSize) {
        QueryWrapper<FileMapping> query = Wrappers.query();
        query.eq("conn_id", connId);
        query.eq("job_id", jobId);
        query.eq("file_status", FileMappingStatus.COMPLETED.getValue());
        query.orderByDesc("create_time");
        Page<FileMapping> page = new Page<>(pageNo, pageSize);
        return this.mapper.selectPage(page, query);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void save(FileMapping mapping) {
        if (this.mapper.insert(mapping) != 1) {
            throw new InternalException("entity.insert.failed", mapping);
        }
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void update(FileMapping mapping) {
        if (this.mapper.updateById(mapping) != 1) {
            throw new InternalException("entity.update.failed", mapping);
        }
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void remove(int id) {
        if (this.mapper.deleteById(id) != 1) {
            throw new InternalException("entity.delete.failed", id);
        }
    }

    public String generateFileToken(String fileName) {
        return this.fileTokenPrefix(fileName) +
               HubbleUtil.nowTime().getEpochSecond();
    }

    public FileUploadResult uploadFile(MultipartFile srcFile, int index,
                                       String dirPath) {
        FileUploadResult result = new FileUploadResult();
        // Current part saved path
        String partName = srcFile.getOriginalFilename();
        result.setName(partName);
        result.setSize(srcFile.getSize());

        File destFile = new File(dirPath, partName + "-" + index);
        // File all parts saved path
        File dir = new File(dirPath);
        if (!dir.exists()) {
            dir.mkdirs();
        }
        if (destFile.exists()) {
            destFile.delete();
        }

        log.debug("Uploading file {} length {}", partName, srcFile.getSize());
        try {
            // transferTo should accept absolute path
            srcFile.transferTo(destFile.getAbsoluteFile());
            result.setStatus(FileUploadResult.Status.SUCCESS);
            log.debug("Uploaded file part {}-{}", partName, index);
        } catch (Exception e) {
            log.error("Failed to save upload file and insert " +
                      "file mapping record", e);
            result.setStatus(FileUploadResult.Status.FAILURE);
            result.setCause(e.getMessage());
        }
        return result;
    }

    public boolean tryMergePartFiles(String dirPath, int total) {
        File dir = new File(dirPath);
        File[] partFiles = dir.listFiles();
        if (partFiles == null) {
            throw new InternalException("The part files can't be null");
        }
        if (partFiles.length != total) {
            return false;
        }

        File newFile = new File(dir.getPath() + ".all");
        File destFile = new File(dir.getPath());
        if (partFiles.length == 1) {
            try {
                // Rename file to dest file
                FileUtils.moveFile(partFiles[0], newFile);
            } catch (IOException e) {
                log.error("Failed to rename file from {} to {}",
                          partFiles[0], newFile, e);
                throw new InternalException("load.upload.move-file.failed", e);
            }
        } else {
            Arrays.sort(partFiles, (o1, o2) -> {
                String file1Idx = StringUtils.substringAfterLast(o1.getName(),
                                                                 "-");
                String file2Idx = StringUtils.substringAfterLast(o2.getName(),
                                                                 "-");
                Integer idx1 = Integer.valueOf(file1Idx);
                Integer idx2 = Integer.valueOf(file2Idx);
                return idx1.compareTo(idx2);
            });
            try (OutputStream os = new FileOutputStream(newFile, true)) {
                for (int i = 0; i < partFiles.length; i++) {
                    File partFile = partFiles[i];
                    try (InputStream is = new FileInputStream(partFile)) {
                        IOUtils.copy(is, os);
                    } catch (IOException e) {
                        log.error("Failed to copy file stream from {} to {}",
                                  partFile, newFile, e);
                        throw new InternalException(
                                "load.upload.merge-file.failed", e);
                    }
                }
            } catch (IOException e) {
                log.error("Failed to copy all file-parts stream to {}",
                          newFile, e);
                throw new InternalException("load.upload.merge-file.failed", e);
            }
        }
        // Delete origin directory
        try {
            FileUtils.forceDelete(dir);
        } catch (IOException e) {
            log.error("Failed to force delete file {}", dir, e);
            throw new InternalException("load.upload.delete-temp-dir.failed", e);
        }
        // Rename file to dest file
        if (!newFile.renameTo(destFile)) {
            throw new InternalException("load.upload.rename-file.failed");
        }
        return true;
    }

    public void extractColumns(FileMapping mapping) {
        File file = this.requirePathUnderUploadRoot(mapping.getPath());
        BufferedReader reader;
        try {
            reader = new BufferedReader(new FileReader(file));
        } catch (FileNotFoundException e) {
            throw new InternalException("The file '%s' is not found", file);
        }
        FileSetting setting = mapping.getFileSetting();
        String delimiter = setting.getDelimiter();
        Pattern pattern = Pattern.compile(setting.getSkippedLine());

        String[] columnNames;
        String[] columnValues;
        try {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!pattern.matcher(line).matches()) {
                    break;
                }
            }
            Ex.check(line != null,
                     "The file has no data line can treat as header");

            String[] firstLine = StringUtils.split(line, delimiter);
            if (setting.isHasHeader()) {
                // The first line as column names
                columnNames = firstLine;
                // The second line as column values
                line = reader.readLine();
                columnValues = StringUtil.split(line, delimiter);
            } else {
                // Let columns names as: column-1, column-2 ...
                columnNames = new String[firstLine.length];
                for (int i = 1; i <= firstLine.length; i++) {
                    columnNames[i - 1] = "col-" + i;
                }
                // The first line as column values
                columnValues = firstLine;
            }
        } catch (IOException e) {
            throw new InternalException("Failed to read header and sample " +
                                        "data from file '%s'", file);
        } finally {
            IOUtils.closeQuietly(reader);
        }

        setting.setColumnNames(Arrays.asList(columnNames));
        setting.setColumnValues(Arrays.asList(columnValues));
    }

    public String moveToNextLevelDir(FileMapping mapping) {
        File currFile = this.requirePathUnderUploadRoot(mapping.getPath());
        String destPath = Paths.get(currFile.getParentFile().getPath(),
                                    FILE_PREIFX + mapping.getId())
                               .toString();
        File destDir = new File(destPath);
        try {
            FileUtils.moveFileToDirectory(currFile, destDir, true);
        } catch (IOException e) {
            this.remove(mapping.getId());
            throw new InternalException(
                    "Failed to move file to next level directory");
        }
        return Paths.get(destPath, currFile.getName()).toString();
    }

    public void deleteDiskFile(FileMapping mapping) {
        File file = this.requirePathUnderUploadRoot(mapping.getPath());
        if (file.isDirectory()) {
            this.deletePathIfExists(file, mapping.getId());
        } else {
            File parentDir = file.getParentFile();
            if (parentDir == null) {
                log.info("Skip deleting file mapping {} because {} has no " +
                         "parent directory", mapping.getId(), mapping.getPath());
                return;
            }
            this.deletePathIfExists(parentDir, mapping.getId());
        }
    }

    public void cleanupMappings(List<FileMapping> mappings) {
        for (FileMapping mapping : mappings) {
            this.tryCleanupMapping(mapping);
        }
    }

    @Async
    @Scheduled(fixedRate = 10 * 60 * 1000)
    public void deleteOrphanedJobFiles() {
        this.cleanupMappings(this.listOrphanedJobFiles());
    }

    @Async
    @Scheduled(fixedRate = 10 * 60 * 1000)
    public void deleteUnfinishedFile() {
        QueryWrapper<FileMapping> query = Wrappers.query();
        query.in("file_status", FileMappingStatus.UPLOADING.getValue());
        List<FileMapping> mappings = this.mapper.selectList(query);
        long threshold = this.config.get(
                HubbleOptions.UPLOAD_FILE_MAX_TIME_CONSUMING) * 1000;
        Date now = HubbleUtil.nowDate();
        for (FileMapping mapping : mappings) {
            Date updateTime = mapping.getUpdateTime();
            long duration = now.getTime() - updateTime.getTime();
            if (duration > threshold) {
                this.tryDeleteUnfinishedMapping(mapping);
            }
        }
    }

    public File requirePathUnderUploadRoot(String filePath) {
        return this.requirePathUnderUploadRoot(new File(filePath));
    }

    private void deletePathIfExists(File path, int mappingId) {
        File safePath = this.requirePathUnderUploadRoot(path);
        if (!safePath.exists()) {
            log.info("Skip deleting path {} for mapping {} because it no " +
                     "longer exists", safePath, mappingId);
            return;
        }

        log.info("Prepare to delete directory {}", safePath);
        try {
            FileUtils.forceDelete(safePath);
        } catch (IOException e) {
            throw new InternalException("Failed to delete directory " +
                                        "corresponded to the file id %s, " +
                                        "please delete it manually",
                                        e, mappingId);
        }
    }

    private List<FileMapping> listOrphanedJobFiles() {
        List<FileMapping> mappings = this.mapper.selectList(null);
        if (mappings.isEmpty()) {
            return Collections.emptyList();
        }

        Set<Integer> jobIds = mappings.stream()
                                      .map(FileMapping::getJobId)
                                      .filter(jobId -> jobId != null)
                                      .collect(Collectors.toSet());
        if (jobIds.isEmpty()) {
            return new ArrayList<>(mappings);
        }

        List<JobManager> jobs = this.jobManagerMapper.selectBatchIds(jobIds);
        Set<Integer> existingJobIds = jobs.stream()
                                          .map(JobManager::getId)
                                          .collect(Collectors.toCollection(
                                                  HashSet::new));
        return mappings.stream()
                       .filter(mapping -> mapping.getJobId() == null ||
                                          !existingJobIds.contains(
                                                  mapping.getJobId()))
                       .collect(Collectors.toList());
    }

    private void tryCleanupMapping(FileMapping mapping) {
        try {
            this.deleteDiskFile(mapping);
            this.removeCleanupRecord(mapping.getId());
        } catch (RuntimeException e) {
            log.warn("Failed to cleanup disk file for mapping {} at {}",
                     mapping.getId(), mapping.getPath(), e);
        }
    }

    private void removeCleanupRecord(int mappingId) {
        int deleted = this.mapper.deleteById(mappingId);
        if (deleted == 1) {
            return;
        }
        if (deleted == 0) {
            log.info("Skip removing file mapping {} because it no longer " +
                     "exists", mappingId);
            return;
        }
        throw new InternalException("entity.delete.failed", mappingId);
    }

    private File requirePathUnderUploadRoot(File file) {
        Path uploadRootPath = this.normalizePath(new File(
                this.config.get(HubbleOptions.UPLOAD_FILE_LOCATION)));
        Path targetPath = this.normalizePath(file);
        if (!targetPath.startsWith(uploadRootPath)) {
            throw new InternalException("load.upload.file.path.outside-root",
                                        targetPath, uploadRootPath);
        }
        return targetPath.toFile();
    }

    private Path normalizePath(File file) {
        Path path = file.toPath();
        try {
            if (file.exists()) {
                return path.toRealPath();
            }
        } catch (IOException e) {
            throw new InternalException("Failed to resolve upload path '%s'",
                                        e, file);
        }
        return path.toAbsolutePath().normalize();
    }

    private void tryDeleteUnfinishedMapping(FileMapping mapping) {
        String filePath = mapping.getPath();
        try {
            FileUtils.forceDelete(this.requirePathUnderUploadRoot(filePath));
        } catch (IOException e) {
            log.warn("Failed to delete expired uploading file {}",
                     filePath, e);
        } catch (RuntimeException e) {
            log.warn("Skip deleting expired uploading file {} because the " +
                     "path is invalid", filePath, e);
            return;
        }
        this.remove(mapping.getId());
        this.removeUploadingTokens(mapping.getName());
    }

    private void removeUploadingTokens(String fileName) {
        String tokenPrefix = this.fileTokenPrefix(fileName);
        Iterator<Map.Entry<String, ReadWriteLock>> iter;
        iter = this.uploadingTokenLocks.entrySet().iterator();
        while (iter.hasNext()) {
            Map.Entry<String, ReadWriteLock> entry = iter.next();
            if (entry.getKey().startsWith(tokenPrefix)) {
                iter.remove();
            }
        }
    }

    private String fileTokenPrefix(String fileName) {
        return HubbleUtil.md5(fileName) + "-";
    }
}
