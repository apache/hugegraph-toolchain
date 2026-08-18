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

package org.apache.hugegraph.loader.test.functional;

import java.io.IOException;
import java.io.OutputStream;
import java.net.URI;
import java.nio.charset.Charset;

import org.apache.commons.compress.compressors.CompressorException;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.FileSystem;
import org.apache.hadoop.fs.Path;
import org.apache.hugegraph.loader.source.file.Compression;
import org.apache.hugegraph.util.Log;
import org.slf4j.Logger;

public class HDFSUtil implements IOUtil {

    private static final Logger LOG = Log.logger(HDFSUtil.class);

    private final String storePath;
    private final Configuration conf;
    private final FileSystem fs;

    public HDFSUtil(String storePath) {
        this.storePath = storePath;
        this.conf = new Configuration();
        try {
            this.fs = FileSystem.get(URI.create(storePath), this.conf);
        } catch (IOException e) {
            throw new RuntimeException("Failed to init HDFS file system", e);
        }
    }

    @Override
    public String storePath() {
        return this.storePath;
    }

    @Override
    public Configuration config() {
        return this.conf;
    }

    @Override
    public void mkdirs(String path) {
        try {
            this.fs.mkdirs(new Path(this.storePath, path));
        } catch (IOException e) {
            throw new RuntimeException("Failed to mkdirs: " + path, e);
        }
    }

    @Override
    public void write(String fileName, Charset charset, Compression compression, String... lines) {
        Path path = new Path(this.storePath, fileName);
        try (OutputStream os = this.fs.create(path, true)) {
            if (compression == Compression.NONE) {
                for (String line : lines) {
                    os.write(line.getBytes(charset));
                    os.write("\n".getBytes(charset));
                }
            } else {
                IOUtil.compress(os, charset, compression, lines);
            }
        } catch (IOException | CompressorException e) {
            throw new RuntimeException("Failed to write file: " + fileName, e);
        }
    }

    @Override
    public void copy(String srcPath, String destPath) {
        try {
            // 通常测试场景是将本地文件上传到 HDFS
            Path src = new Path(srcPath);
            Path dst = new Path(this.storePath, destPath);
            this.fs.copyFromLocalFile(src, dst);
        } catch (IOException e) {
            throw new RuntimeException("Failed to copy file from " + srcPath + " to " + destPath, e);
        }
    }

    @Override
    public void delete() {
        Path path = new Path(this.storePath);
        try {
            if (this.fs.exists(path)) {
                this.fs.delete(path, true);
            }
        } catch (IOException e) {
            throw new RuntimeException("Failed to delete path: " + this.storePath, e);
        }
    }

    @Override
    public void close() {
        try {
            this.fs.close();
        } catch (IOException e) {
            LOG.warn("Failed to close HDFS file system", e);
        }
    }
}
