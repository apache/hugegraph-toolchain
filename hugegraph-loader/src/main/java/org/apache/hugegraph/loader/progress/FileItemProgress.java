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

package org.apache.hugegraph.loader.progress;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

public class FileItemProgress extends InputItemProgress {

    @JsonProperty("name")
    private final String name;
    @JsonProperty("last_modified")
    private final long timestamp;
    @JsonProperty("checksum")
    private final String checkSum;

    @JsonCreator
    public FileItemProgress(@JsonProperty("name") String name,
                            @JsonProperty("last_modified") long timestamp,
                            @JsonProperty("checksum") String checkSum,
                            @JsonProperty("offset") long offset) {
        super(offset);
        this.name = name;
        this.timestamp = timestamp;
        this.checkSum = checkSum;
    }

    public String name() {
        return this.name;
    }

    @Override
    public String toString() {
        return this.name;
    }

    @Override
    public boolean equals(Object object) {
        if (!(object instanceof FileItemProgress other)) {
            return false;
        }
        return this.name.equals(other.name) &&
               this.timestamp == other.timestamp &&
               this.checkSum.equals(other.checkSum);
    }

    @Override
    public int hashCode() {
        return this.name.hashCode() ^
               Long.hashCode(this.timestamp) ^
               this.checkSum.hashCode();
    }
}
