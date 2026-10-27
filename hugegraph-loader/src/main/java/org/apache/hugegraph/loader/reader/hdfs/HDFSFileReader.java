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

package org.apache.hugegraph.loader.reader.hdfs;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.apache.commons.lang3.StringUtils;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.FileChecksum;
import org.apache.hadoop.fs.FileStatus;
import org.apache.hadoop.fs.FileUtil;
import org.apache.hadoop.fs.FileSystem;
import org.apache.hadoop.fs.Path;
import org.apache.hadoop.security.UserGroupInformation;

import org.apache.hugegraph.loader.constant.Constants;
import org.apache.hugegraph.loader.exception.LoadException;
import org.apache.hugegraph.loader.progress.FileItemProgress;
import org.apache.hugegraph.loader.progress.InputItemProgress;
import org.apache.hugegraph.loader.source.file.Compression;
import org.apache.hugegraph.loader.source.InputSource;
import org.apache.hugegraph.loader.source.file.DirFilter;
import org.apache.hugegraph.loader.source.file.FileFilter;
import org.apache.hugegraph.loader.source.hdfs.HDFSSource;
import org.apache.hugegraph.loader.source.hdfs.KerberosConfig;
import org.slf4j.Logger;

import org.apache.hugegraph.loader.reader.Readable;
import org.apache.hugegraph.loader.reader.file.FileLineFetcher;
import org.apache.hugegraph.loader.reader.file.FileReader;
import org.apache.hugegraph.loader.reader.file.OrcFileLineFetcher;
import org.apache.hugegraph.loader.reader.file.ParquetFileLineFetcher;
import org.apache.hugegraph.util.Log;
import com.google.common.collect.ImmutableSet;

public class HDFSFileReader extends FileReader {

    private static final Logger LOG = Log.logger(HDFSFileReader.class);

    private final FileSystem hdfs;
    private final Configuration conf;

    /**
     * Only supports single cluster
     */
    private static boolean hasLogin = false;

    public static final ScheduledExecutorService RELOGIN_EXECUTOR =
            Executors.newSingleThreadScheduledExecutor();
    private static boolean isCheckKerberos = false;

    public HDFSFileReader(HDFSSource source) {
        super(source);
        this.conf = this.loadConfiguration();
        try {
            this.enableKerberos(source);
            this.hdfs = getFileSystem(this.conf);
        } catch (IOException e) {
            throw new LoadException("Failed to create HDFS file system", e);
        }
        //Path path = new Path(source.path());
        //this.checkExist(path);
    }

    public FileSystem getFileSystem(Configuration conf) throws IOException {
        return FileSystem.get(conf);
    }

    private void enableKerberos(HDFSSource source) throws IOException {
        KerberosConfig kerberosConfig = source.kerberosConfig();
        if (kerberosConfig != null && kerberosConfig.enable()) {
            System.setProperty("java.security.krb5.conf",
                               kerberosConfig.krb5Conf());
            UserGroupInformation.setConfiguration(this.conf);
            synchronized (HDFSFileReader.class) {
                if (!hasLogin) {
                    UserGroupInformation.loginUserFromKeytab(
                            kerberosConfig.principal(),
                            kerberosConfig.keyTab());
                    hasLogin = true;
                }
            }

            cronCheckKerberos();
        }
    }

    private static void cronCheckKerberos() {
        if (!isCheckKerberos) {
            RELOGIN_EXECUTOR.scheduleAtFixedRate(
                    new Runnable() {
                        @Override
                        public void run() {
                            try {
                                UserGroupInformation
                                        .getCurrentUser()
                                        .checkTGTAndReloginFromKeytab();
                                LOG.info("Check Kerberos Tgt And " +
                                         "Relogin From Keytab Finish.");
                            } catch (IOException e) {
                                LOG.error("Check Kerberos Tgt And Relogin " +
                                          "From Keytab Error", e);
                            }
                        }
                    }, 0, 10, TimeUnit.MINUTES);
            LOG.info("Start Check Keytab TGT And Relogin Job Success.");

            isCheckKerberos = true;
        }
    }

    public FileSystem fileSystem() {
        return this.hdfs;
    }

    @Override
    public HDFSSource source() {
        return (HDFSSource) super.source();
    }

    @Override
    public FileReader newFileReader(InputSource source, Readable readable) {
        HDFSFileReader reader = new HDFSFileReader((HDFSSource) source);
        reader.readables(ImmutableSet.of(readable).iterator());
        return reader;
    }

    public void close() {
        super.close();
        //closeFileSystem(this.hdfs);
    }

    public void closeFileSystem(FileSystem fileSystem) {
        try {
            fileSystem.close();
        } catch (IOException e) {
            LOG.warn("Failed to close reader for {} with exception {}",
                     this.source(), e.getMessage(), e);
        }
    }

    @Override
    public boolean multiReaders() {
        return true;
    }

    @Override
    protected List<Readable> scanReadables() throws IOException {
        Path path = new Path(this.source().path());
        FileFilter filter = this.source().filter();
        List<Readable> paths = new ArrayList<>();
        FileStatus status = this.hdfs.getFileStatus(path);
        if (status.isFile()) {
            if (!filter.reserved(path.getName())) {
                throw new LoadException(
                          "Please check path name and extensions, ensure " +
                          "that at least one path is available for reading");
            }
            paths.add(new HDFSFile(this.hdfs, path));
        } else {
            assert status.isDirectory();
            FileStatus[] statuses = this.hdfs.listStatus(path);
            Path[] subPaths = FileUtil.stat2Paths(statuses);
            for (Path subPath : subPaths) {
                FileStatus subStatus = this.hdfs.getFileStatus(subPath);
                if (subStatus.isFile() && this.isReservedFile(subPath)) {
                    paths.add(new HDFSFile(this.hdfs, subPath,
                                           this.source().path()));
                }
                if (subStatus.isDirectory()) {
                    for (Path dirSubPath : this.listDirWithFilter(subPath)) {
                        if (this.isReservedFile(dirSubPath)) {
                            paths.add(new HDFSFile(this.hdfs, dirSubPath,
                                                   this.source().path()));
                        }
                    }
                }
            }
        }
        return paths;
    }

    private boolean isReservedFile(Path path) throws IOException {
        FileStatus status = this.hdfs.getFileStatus(path);
        FileFilter filter = this.source().filter();

        if (status.getLen() > 0 && filter.reserved(path.getName())) {
            return true;
        }
        return false;
    }

    private List<Path> listDirWithFilter(Path dir) throws IOException {
        DirFilter dirFilter = this.source().dirFilter();
        List<Path> files  = new ArrayList<>();
        FileStatus status = this.hdfs.getFileStatus(dir);

        if (status.isFile()) {
            files.add(dir);
        }

        if (status.isDirectory() && dirFilter.reserved(dir.getName())) {
            FileStatus[] statuses = this.hdfs.listStatus(dir);
            Path[] subPaths = FileUtil.stat2Paths(statuses);
            if (subPaths == null) {
                throw new LoadException("Error while listing the files of " +
                                        "dir path '%s'", dir);
            }
            for (Path subFile : subPaths) {
                if (this.hdfs.getFileStatus(subFile).isFile()) {
                    files.add(subFile);
                }
                if (this.hdfs.getFileStatus(subFile).isDirectory()) {
                    files.addAll(this.listDirWithFilter(subFile));
                }
            }
        }

        return files;
    }

    @Override
    protected FileLineFetcher createLineFetcher() {
        if (Compression.ORC == this.source().compression()) {
            return new OrcFileLineFetcher(this.source(), this.conf);
        } else if (Compression.PARQUET == this.source().compression()) {
            return new ParquetFileLineFetcher(this.source(), this.conf);
        } else {
            return new FileLineFetcher(this.source());
        }
    }

    private Configuration loadConfiguration() {
        Configuration conf = new Configuration();
        conf.addResource(new Path(this.source().coreSitePath()));
        if (this.source().hdfsSitePath() != null) {
            conf.addResource(new Path(this.source().hdfsSitePath()));
        }
        return conf;
    }

    private void checkExist(Path path) {
        try {
            LOG.debug("to check exist {}", path.getName());
            if (!this.hdfs.exists(path)) {
                throw new LoadException("Please ensure the file or directory " +
                                        "exists: '%s'", path);
            }
            LOG.debug("finished check exist {}", path.getName());
        } catch (IOException e) {
            throw new LoadException("An exception occurred while checking " +
                                    "HDFS path: '%s'", e, path);
        }
    }

    private static class HDFSFile implements Readable {

        private final FileSystem hdfs;
        private final Path path;
        private final String inputPath;

        private HDFSFile(FileSystem hdfs, Path path) {
            this(hdfs, path, null);
        }

        private HDFSFile(FileSystem hdfs, Path path, String inputpath) {
            this.hdfs = hdfs;
            this.path = path;
            this.inputPath = inputpath;
        }

        public FileSystem hdfs() {
            return this.hdfs;
        }

        @Override
        public String name() {
            return this.relativeName();
        }

        private String relativeName() {
            if (!StringUtils.isEmpty(inputPath) &&
                Paths.get(inputPath).isAbsolute()) {
                String strPath = this.path.toUri().getPath();
                return Paths.get(inputPath)
                            .relativize(Paths.get(strPath)).toString();
            }

            return this.path.getName();
        }

        @Override
        public Path path() {
            return this.path;
        }

        @Override
        public InputStream open() throws IOException {
            return this.hdfs.open(this.path);
        }

        @Override
        public InputItemProgress inputItemProgress() {
            String name = this.path.getName();
            long timestamp;
            try {
                timestamp = this.hdfs.getFileStatus(this.path)
                                     .getModificationTime();
            } catch (IOException e) {
                throw new LoadException("Failed to get last modified time " +
                                        "for HDFS path '%s'", e, this.path);
            }
            byte[] bytes;
            try {
                FileChecksum checksum = this.hdfs.getFileChecksum(this.path);
                if (checksum == null) {
                    throw new LoadException("The checksum of HDFS path '%s' " +
                                            "is null", this.path);
                }
                bytes = checksum.getBytes();
            } catch (IOException e) {
                throw new LoadException("Failed to calculate checksum " +
                                        "for HDFS path '%s'", e, this.path);
            }
            String checkSum = new String(bytes, Constants.CHARSET);
            return new FileItemProgress(name, timestamp, checkSum, 0L);
        }

        @Override
        public String toString() {
            return "HDFS: " + this.path;
        }
    }
}
