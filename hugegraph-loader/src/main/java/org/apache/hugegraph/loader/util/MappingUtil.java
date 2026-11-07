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

package org.apache.hugegraph.loader.util;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.commons.io.FileUtils;
import org.apache.hugegraph.util.E;
import org.apache.hugegraph.util.InsertionOrderUtil;

import org.apache.hugegraph.loader.constant.Constants;
import org.apache.hugegraph.loader.exception.LoadException;
import org.apache.hugegraph.loader.mapping.EdgeMapping;
import org.apache.hugegraph.loader.mapping.ElementMapping;
import org.apache.hugegraph.loader.mapping.InputStruct;
import org.apache.hugegraph.loader.mapping.LoadMapping;
import org.apache.hugegraph.loader.mapping.VertexMapping;
import org.apache.hugegraph.loader.source.InputSource;
import org.apache.hugegraph.loader.source.SourceType;
import org.apache.hugegraph.loader.source.file.FileSource;
import org.apache.hugegraph.loader.struct.EdgeStructV1;
import org.apache.hugegraph.loader.struct.ElementStructV1;
import org.apache.hugegraph.loader.struct.GraphStructV1;
import org.apache.hugegraph.loader.struct.VertexStructV1;
import com.google.common.collect.ImmutableSet;

@SuppressWarnings("deprecation")
public final class MappingUtil {

    private static final Set<String> ACCEPTABLE_VERSIONS = ImmutableSet.of(
            Constants.V1_STRUCT_VERSION, Constants.V2_STRUCT_VERSION
    );

    public static void write(LoadMapping mapping, String path) {
        File file = FileUtils.getFile(path);
        String json = JsonUtil.toJson(mapping);
        try {
            FileUtils.write(file, json, Constants.CHARSET);
        } catch (IOException e) {
            throw new LoadException("Failed to write mapping %s to file '%s'",
                                    e, mapping, file);
        }
    }

    public static LoadMapping parse(String json) {
        Map<String, Object> map = JsonUtil.convertMap(json, String.class,
                                                      Object.class);
        Object value = map.get(Constants.FIELD_VERSION);
        if (value == null) {
            value = Constants.V1_STRUCT_VERSION;
        } else {
            E.checkArgument(value instanceof String,
                            "The version value must be String class, " +
                            "but got '%s(%s)'", value, value.getClass());
        }
        String version = (String) value;

        E.checkArgument(ACCEPTABLE_VERSIONS.contains(version),
                        "Invalid version '%s', the acceptable versions are %s",
                        version, ACCEPTABLE_VERSIONS);
        if (version.equals(Constants.V2_STRUCT_VERSION)) {
            return JsonUtil.fromJson(json, LoadMapping.class);
        } else {
            assert version.equals(Constants.V1_STRUCT_VERSION);
            return parseV1(json);
        }
    }

    private static LoadMapping parseV1(String json) {
        GraphStructV1 graphStruct = JsonUtil.fromJson(json,
                                                      GraphStructV1.class);
        Map<FileSourceKey, InputStruct> fileSourceInputStructs =
                InsertionOrderUtil.newMap();
        List<InputStruct> jdbcSourceInputStructs = new ArrayList<>();
        for (ElementStructV1 originStruct : graphStruct.structs()) {
            InputSource inputSource = originStruct.input();
            ElementMapping targetStruct = convertV1ToV2(originStruct);

            SourceType type = inputSource.type();
            if (type == SourceType.FILE || type == SourceType.HDFS) {
                FileSource source = (FileSource) inputSource;
                FileSourceKey key = new FileSourceKey(type, source.path());
                fileSourceInputStructs.compute(key, (k, inputStruct) -> {
                    if (inputStruct == null) {
                        inputStruct = new InputStruct(null, null);
                        inputStruct.input(source);
                    }
                    inputStruct.add(targetStruct);
                    return inputStruct;
                });
            } else {
                assert type == SourceType.JDBC;
                InputStruct inputStruct = new InputStruct(null, null);
                inputStruct.input(inputSource);
                inputStruct.add(targetStruct);
                jdbcSourceInputStructs.add(inputStruct);
            }
        }
        // Generate id for every input mapping
        List<InputStruct> inputStructs = new ArrayList<>();
        int id = 0;
        for (InputStruct inputStruct : fileSourceInputStructs.values()) {
            inputStruct.id(String.valueOf(++id));
            inputStructs.add(inputStruct);
        }
        for (InputStruct inputStruct : jdbcSourceInputStructs) {
            inputStruct.id(String.valueOf(++id));
            inputStructs.add(inputStruct);
        }
        return new LoadMapping(inputStructs);
    }

    private static ElementMapping convertV1ToV2(ElementStructV1 origin) {
        ElementMapping target;
        if (origin.type().isVertex()) {
            VertexStructV1 originVertex = (VertexStructV1) origin;
            target = new VertexMapping(originVertex.idField(),
                                       originVertex.unfold());
        } else {
            EdgeStructV1 originEdge = (EdgeStructV1) origin;
            target = new EdgeMapping(originEdge.sourceFields(),
                                     originEdge.unfoldSource(),
                                     originEdge.targetFields(),
                                     originEdge.unfoldTarget());
        }
        fill(origin, target);
        return target;
    }

    private static void fill(ElementStructV1 originStruct,
                             ElementMapping targetStruct) {
        targetStruct.label(originStruct.label());
        targetStruct.skip(originStruct.skip());
        targetStruct.mappingFields(originStruct.mappingFields());
        targetStruct.mappingValues(originStruct.mappingValues());
        targetStruct.selectedFields(originStruct.selectedFields());
        targetStruct.ignoredFields(originStruct.ignoredFields());
        targetStruct.nullValues(originStruct.nullValues());
        targetStruct.updateStrategies(originStruct.updateStrategies());
    }

    private static class FileSourceKey {

        private final SourceType type;
        private final String path;

        public FileSourceKey(SourceType type, String path) {
            this.type = type;
            this.path = path;
        }

        @Override
        public boolean equals(Object object) {
            if (!(object instanceof FileSourceKey other)) {
                return false;
            }
            return this.type == other.type && this.path.equals(other.path);
        }

        @Override
        public int hashCode() {
            return this.type.hashCode() ^ this.path.hashCode();
        }
    }
}
