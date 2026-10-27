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

import java.io.Serializable;
import java.util.regex.Pattern;

import org.apache.hugegraph.loader.constant.Constants;

import com.fasterxml.jackson.annotation.JsonProperty;

public class SkippedLine implements Serializable {

    @JsonProperty("regex")
    private String regex;

    private transient volatile Pattern pattern;

    public SkippedLine() {
        this.regex = Constants.SKIPPED_LINE_REGEX;
        this.pattern = null;
    }

    public String regex() {
        return this.regex;
    }

    public void regex(String regex) {
        this.regex = regex;
        this.pattern = null;
    }

    private Pattern pattern() {
        Pattern compiled = this.pattern;
        if (compiled == null) {
            compiled = Pattern.compile(this.regex);
            this.pattern = compiled;
        }
        return compiled;
    }

    public boolean matches(String line) {
        // Split file readers share the source, so each match needs its own state.
        return this.pattern().matcher(line).matches();
    }
}
