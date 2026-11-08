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
import java.lang.reflect.UndeclaredThrowableException;

import org.apache.hugegraph.loader.constant.Constants;
import org.apache.hugegraph.loader.executor.LoadOptions;
import org.apache.hugegraph.util.E;

import com.beust.jcommander.JCommander;

public final class LoadUtil {

    public static String getStructDirPrefix(LoadOptions options) {
        String structFileName = options.file;
        E.checkArgument(options.file.endsWith(Constants.JSON_SUFFIX),
                        "The mapping description file name must be end with %s",
                        Constants.JSON_SUFFIX);
        int lastDotIdx = structFileName.lastIndexOf(Constants.DOT_STR);
        return structFileName.substring(0, lastDotIdx);
    }

    public static String getFileNamePrefix(File file) {
        String fileName = file.getName();
        int lastDotIdx = fileName.lastIndexOf(Constants.DOT_STR);
        return fileName.substring(0, lastDotIdx);
    }

    public static String getFileNameSuffix(File file) {
        String fileName = file.getName();
        int lastDotIdx = fileName.lastIndexOf(Constants.DOT_STR);
        // With '.'
        return fileName.substring(lastDotIdx);
    }

    public static void exitWithUsage(JCommander commander, int code) {
        commander.usage();
        System.exit(code);
    }

    public static RuntimeException targetRuntimeException(Throwable t) {
        Throwable e;
        if (t instanceof UndeclaredThrowableException) {
            e = ((UndeclaredThrowableException) t).getUndeclaredThrowable()
                                                  .getCause();
        } else {
            e = t;
        }
        if (e instanceof RuntimeException runtimeException) {
            return runtimeException;
        }
        return new RuntimeException(e);
    }
}
