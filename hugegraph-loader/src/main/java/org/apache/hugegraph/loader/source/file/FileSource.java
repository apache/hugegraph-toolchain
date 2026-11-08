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

package org.apache.hugegraph.loader.source.file;

import java.util.List;

import org.apache.hugegraph.util.E;

import org.apache.hugegraph.loader.constant.Constants;
import org.apache.hugegraph.loader.source.AbstractSource;
import org.apache.hugegraph.loader.source.SourceType;
import org.apache.hugegraph.loader.util.DateUtil;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import com.google.common.collect.ImmutableList;

@JsonPropertyOrder({"type", "path", "file_filter"})
public class FileSource extends AbstractSource {

    @JsonProperty("path")
    private String path;
    @JsonProperty("dir_filter")
    private DirFilter dirFilter;
    @JsonProperty("file_filter")
    private FileFilter filter;
    @JsonProperty("format")
    private FileFormat format;
    @JsonProperty("delimiter")
    private String delimiter;
    @JsonProperty("date_format")
    private String dateFormat;
    @JsonProperty("extra_date_formats")
    private List<String> extraDateFormats;
    @JsonProperty("time_zone")
    private String timeZone;
    @JsonProperty("skipped_line")
    private SkippedLine skippedLine;
    @JsonProperty("compression")
    private Compression compression;
    @JsonProperty("batch_size")
    private int batchSize;
    // Only works for single files
    @JsonProperty("split_count")
    private int splitCount;
    @JsonInclude(JsonInclude.Include.NON_NULL)
    @JsonProperty("has_header")
    private Boolean hasHeader;

    // Whether header needs to be case-sensitive
    private final boolean headerCaseSensitive;

    public FileSource() {
        this(null, new DirFilter(), new FileFilter(), FileFormat.CSV,
             Constants.COMMA_STR, Constants.DATE_FORMAT,
             ImmutableList.of(), Constants.TIME_ZONE,
             new SkippedLine(), Compression.NONE, 500, null);
    }

    public FileSource(@JsonProperty("path") String path,
                      @JsonProperty("dir_filter") DirFilter dirFilter,
                      @JsonProperty("filter") FileFilter filter,
                      @JsonProperty("format") FileFormat format,
                      @JsonProperty("delimiter") String delimiter,
                      @JsonProperty("date_format") String dateFormat,
                      @JsonProperty("extra_date_formats")
                      List<String> extraDateFormats,
                      @JsonProperty("time_zone") String timeZone,
                      @JsonProperty("skipped_line") SkippedLine skippedLine,
                      @JsonProperty("compression") Compression compression,
                      @JsonProperty("batch_size") Integer batchSize) {
        this(path, dirFilter, filter, format, delimiter, dateFormat,
             extraDateFormats, timeZone, skippedLine, compression, batchSize,
             null);
    }

    @JsonCreator
    public FileSource(@JsonProperty("path") String path,
                      @JsonProperty("dir_filter") DirFilter dirFilter,
                      @JsonProperty("filter") FileFilter filter,
                      @JsonProperty("format") FileFormat format,
                      @JsonProperty("delimiter") String delimiter,
                      @JsonProperty("date_format") String dateFormat,
                      @JsonProperty("extra_date_formats")
                      List<String> extraDateFormats,
                      @JsonProperty("time_zone") String timeZone,
                      @JsonProperty("skipped_line") SkippedLine skippedLine,
                      @JsonProperty("compression") Compression compression,
                      @JsonProperty("batch_size") Integer batchSize,
                      @JsonProperty("has_header") Boolean hasHeader) {
        this.path = path;
        this.dirFilter = dirFilter != null ? dirFilter : new DirFilter();
        this.filter = filter != null ? filter : new FileFilter();
        this.format = format != null ? format : FileFormat.CSV;
        this.delimiter = delimiter != null ?
                         delimiter : this.format.delimiter();
        this.dateFormat = dateFormat != null ?
                          dateFormat : Constants.DATE_FORMAT;
        this.extraDateFormats = extraDateFormats == null ||
                                extraDateFormats.isEmpty() ?
                                ImmutableList.of() : extraDateFormats;
        this.timeZone = timeZone != null ? timeZone : Constants.TIME_ZONE;
        this.skippedLine = skippedLine != null ? skippedLine : new SkippedLine();
        this.compression = compression != null ? compression : Compression.NONE;
        this.batchSize = batchSize != null ? batchSize : 500;
        this.hasHeader = hasHeader;

        // When input is orc/parquet, header is case-insensitive
        if (Compression.ORC.equals(this.compression()) ||
            Compression.PARQUET.equals(this.compression())) {
            headerCaseSensitive = false;
        } else {
            headerCaseSensitive = true;
        }
    }

    @Override
    public SourceType type() {
        return SourceType.FILE;
    }

    @Override
    public void check() throws IllegalArgumentException {
        super.check();
        if (this.format == FileFormat.CSV) {
            E.checkArgument(this.delimiter == null ||
                            this.delimiter.equals(Constants.COMMA_STR),
                            "The delimiter must be '%s' when file format " +
                            "is %s, but got '%s'", Constants.COMMA_STR,
                            this.format, this.delimiter);
        }
        E.checkArgument(DateUtil.checkTimeZone(this.timeZone),
                        "The time_zone '%s' is invalid", this.timeZone);
        if (this.listFormat() != null) {
            String elemDelimiter = this.listFormat().elemDelimiter();
            E.checkArgument(!elemDelimiter.equals(this.delimiter),
                            "The delimiters of fields(%s) and " +
                            "list elements(%s) can't be the same",
                            this.delimiter, elemDelimiter);
        }
    }

    public String path() {
        return this.path;
    }

    public void path(String path) {
        this.path = path;
    }

    public DirFilter dirFilter() {
        return this.dirFilter;
    }

    public void setDirFilter(DirFilter dirFilter) {
        this.dirFilter = dirFilter;
    }

    public FileFilter filter() {
        return this.filter;
    }

    public void filter(FileFilter filter) {
        this.filter = filter;
    }

    public FileFormat format() {
        return this.format;
    }

    public void format(FileFormat format) {
        this.format = format;
    }

    public String delimiter() {
        return this.delimiter;
    }

    public void delimiter(String delimiter) {
        this.delimiter = delimiter;
    }

    public String dateFormat() {
        return this.dateFormat;
    }

    public void dateFormat(String dateFormat) {
        this.dateFormat = dateFormat;
    }

    public List<String> extraDateFormats() {
        return this.extraDateFormats;
    }

    public void extraDateFormats(List<String> extraDateFormats) {
        this.extraDateFormats = extraDateFormats;
    }

    public String timeZone() {
        return this.timeZone;
    }

    public void timeZone(String timeZone) {
        this.timeZone = timeZone;
    }

    public SkippedLine skippedLine() {
        return this.skippedLine;
    }

    public void skippedLine(SkippedLine skippedLine) {
        this.skippedLine = skippedLine;
    }

    public Compression compression() {
        return this.compression;
    }

    public void compression(Compression compression) {
        this.compression = compression;
    }

    public int batchSize() {
        return this.batchSize;
    }

    public void batchSize(int batchSize) {
        this.batchSize = batchSize;
    }

    public int splitCount() {
        return this.splitCount;
    }

    public Boolean hasHeader() {
        return this.hasHeader;
    }

    public void hasHeader(boolean hasHeader) {
        this.hasHeader = hasHeader;
    }

    @Override
    public FileSource asFileSource() {
        FileSource source = new FileSource();
        source.header(this.header());
        source.charset(this.charset());
        source.listFormat(this.listFormat());
        source.path = this.path;
        source.dirFilter = this.dirFilter;
        source.filter = this.filter;
        source.format = this.format;
        source.delimiter = this.delimiter;
        source.dateFormat = this.dateFormat;
        source.extraDateFormats = this.extraDateFormats;
        source.timeZone = this.timeZone;
        source.skippedLine = this.skippedLine;
        source.compression = this.compression;
        source.hasHeader = this.hasHeader;
        return source;
    }

    @Override
    public String toString() {
        return String.format("%s(%s)", this.type(), this.path());
    }

    @Override
    public boolean headerCaseSensitive() {
        return headerCaseSensitive;
    }
}
