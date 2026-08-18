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

package org.apache.hugegraph.loader.reader.file;

import static org.apache.hugegraph.util.Bytes.MB;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.util.Arrays;
import java.util.List;

import org.apache.commons.collections.CollectionUtils;
import org.apache.commons.compress.compressors.CompressorInputStream;
import org.apache.commons.compress.compressors.CompressorStreamFactory;
import org.apache.commons.lang3.StringUtils;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.io.compress.CompressionCodec;
import org.apache.hadoop.io.compress.CompressionInputStream;
import org.apache.hadoop.io.compress.SnappyCodec;
import org.apache.hadoop.util.ReflectionUtils;
import org.apache.hugegraph.loader.exception.LoadException;
import org.apache.hugegraph.loader.parser.CsvLineParser;
import org.apache.hugegraph.loader.parser.JsonLineParser;
import org.apache.hugegraph.loader.parser.LineParser;
import org.apache.hugegraph.loader.parser.TextLineParser;
import org.apache.hugegraph.loader.reader.Readable;
import org.apache.hugegraph.loader.reader.line.Line;
import org.apache.hugegraph.loader.reader.line.LineFetcher;
import org.apache.hugegraph.loader.source.file.Compression;
import org.apache.hugegraph.loader.source.file.FileFormat;
import org.apache.hugegraph.loader.source.file.FileSource;
import org.apache.hugegraph.util.E;
import org.apache.hugegraph.util.Log;
import org.slf4j.Logger;

/**
 * Used to iterate all readable data files, like local files, hdfs paths
 */
public class FileLineFetcher extends LineFetcher {

    private static final Logger LOG = Log.logger(FileLineFetcher.class);

    private static final long BUF_SIZE = 4 * MB;

    private static final int FIRST_LINE_OFFSET = 1;

    private BufferedReader reader;
    private final LineParser parser;

    public FileLineFetcher(FileSource source) {
        super(source);
        this.reader = null;
        this.parser = createLineParser(source);
    }

    @Override
    public FileSource source() {
        return (FileSource) super.source();
    }

    @Override
    public boolean ready() {
        return this.reader != null;
    }

    @Override
    public void resetReader() {
        LOG.debug("resetReader called, reader reset to null, offset={}", this.offset());
        this.reader = null;
    }

    @Override
    public boolean needReadHeader() {
        return this.source().format().needHeader() &&
               this.source().header() == null;
    }

    /**
     * Read the first line of the first non-empty file as a header
     */
    @Override
    public String[] readHeader(List<Readable> readables) {
        String[] header = null;
        for (Readable readable : readables) {
            LOG.debug("try to read header from {}", readable.name());
            this.openReader(readable);
            assert this.reader != null;
            try {
                String line = this.reader.readLine();
                if (!StringUtils.isEmpty(line)) {
                    header = this.parser.split(line);
                    break;
                }
            } catch (IOException e) {
                throw new LoadException("Failed to read header from '%s'",
                                        e, readable);
            } finally {
                try {
                    this.closeReader();
                } catch (IOException e) {
                    LOG.warn("Failed to close reader of '{}'", readable);
                }
            }
        }
        return header;
    }

    @Override
    public void openReader(Readable readable) {
        InputStream stream = null;
        try {
            stream = readable.open();
            this.reader = createBufferedReader(stream, this.source());
        } catch (IOException e) {
            throw new LoadException("Failed to open stream for '%s'",
                                    e, readable);
        } catch (Exception e) {
            if (stream != null) {
                try {
                    stream.close();
                } catch (IOException ignored) {
                    LOG.warn("Failed to close stream of '{}'", readable);
                }
            }
            throw new LoadException("Failed to create reader for '%s'",
                                    e, readable);
        }
        // Mark as fresh
        this.resetStatus();
    }

    @Override
    public void closeReader() throws IOException {
        if (this.reader != null) {
            this.reader.close();
        }
    }

    @Override
    public Line fetch() throws IOException {
        while (true) {
            // Fix NPE: check if reader is null before reading
            if (this.reader == null) {
                return null;
            }
            // Read next line from current file
            String rawLine = this.reader.readLine();
            if (rawLine == null) {
                return null;
            }

            this.increaseOffset();
            if (this.needSkipLine(rawLine) || this.checkMatchHeader(rawLine)) {
                continue;
            }
            return this.parser.parse(this.source().header(), rawLine);
        }
    }

    public void readHeaderIfNeeded(List<Readable> readables) {
        if (!this.needReadHeader()) {
            return;
        }

        E.checkArgument(!CollectionUtils.isEmpty(readables),
                        "Must contain at least one readable file");

        String[] header = this.readHeader(readables);
        // Reset internal status
        this.resetReader();
        this.resetStatus();
        if (header == null) {
            throw new LoadException("Failed to read header from " +
                                    "file source '%s'", this.source());
        }
        this.source().header(header);
    }

    public void skipOffset(Readable readable, long offset) {
        if (offset <= 0) {
            return;
        }
        E.checkState(this.reader != null, "The reader shouldn't be null");

        try {
            for (long i = 0L; i < offset; i++) {
                // Fix NPE: check reader again inside loop
                if (this.reader == null) {
                    throw new LoadException("Reader is null when skipping offset of file %s",
                                            readable);
                }
                this.reader.readLine();
            }
        } catch (IOException e) {
            throw new LoadException("Failed to skip the first %s lines " +
                                    "of file %s, please ensure the file " +
                                    "must have at least %s lines",
                                    e, offset, readable, offset);
        }
        this.addOffset(offset);
    }

    private void resetStatus() {
        super.resetOffset();
    }

    private boolean needSkipLine(String line) {
        if (this.source().skippedLine() != null) {
            return this.source().skippedLine().matches(line);
        }
        return false;
    }

    /**
     * Just match header for second or subsequent file first line
     */
    private boolean checkMatchHeader(String line) {
        if (!this.source().format().needHeader() ||
            Boolean.FALSE.equals(this.source().hasHeader()) ||
            this.offset() != FIRST_LINE_OFFSET) {
            return false;
        }

        String[] header = this.source().header();
        // Fix NPE: header might be null
        if (header == null) {
            return false;
        }
        String[] columns = this.parser.split(line);
        return Arrays.equals(header, columns);
    }

    private static BufferedReader createBufferedReader(InputStream stream,
                                                       FileSource source)
            throws Exception {
        E.checkNotNull(stream, "stream");
        try {
            Reader csr = createCompressReader(stream, source);
            return new BufferedReader(csr, (int) BUF_SIZE);
        } catch (IOException e) {
            try {
                stream.close();
            } catch (IOException ignored) {
                LOG.warn("Failed to close file {}", source.path());
            }
            throw e;
        }
    }

    private static Reader createCompressReader(InputStream stream,
                                               FileSource source)
            throws Exception {
        Compression compression = source.compression();
        String charset = source.charset();
        switch (compression) {
            case NONE:
                return new InputStreamReader(stream, charset);
            case SNAPPY_RAW:
                Configuration config = new Configuration();
                CompressionCodec codec = ReflectionUtils.newInstance(SnappyCodec.class, config);
                CompressionInputStream sis = codec.createInputStream(stream,
                                                                     codec.createDecompressor());
                return new InputStreamReader(sis, charset);
            case GZIP:
            case BZ2:
            case XZ:
            case LZMA:
            case SNAPPY_FRAMED:
            case Z:
            case DEFLATE:
            case LZ4_BLOCK:
            case LZ4_FRAMED:
                CompressorStreamFactory factory = new CompressorStreamFactory();
                CompressorInputStream cis =
                        factory.createCompressorInputStream(compression.string(), stream);
                return new InputStreamReader(cis, charset);
            default:
                throw new LoadException("Unsupported compression format '%s'",
                                        compression);
        }
    }

    private static LineParser createLineParser(FileSource source) {
        FileFormat format = source.format();
        switch (format) {
            case CSV:
                return new CsvLineParser();
            case TEXT:
                return new TextLineParser(source.delimiter());
            case JSON:
                return new JsonLineParser();
            default:
                throw new AssertionError(String.format("Unsupported file format '%s' of " +
                                                       "source '%s'", format, source));
        }
    }
}
