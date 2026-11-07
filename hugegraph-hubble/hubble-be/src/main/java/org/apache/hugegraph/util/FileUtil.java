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

package org.apache.hugegraph.util;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;

import org.apache.hugegraph.exception.InternalException;

public final class FileUtil {

    public static int countLines(String path) {
        return countLines(new File(path));
    }

    /**
     * NOTE: If there is no blank line at the end of the file,
     * one line will be missing
     */
    public static int countLines(File file) {
        if (!file.exists()) {
            throw new IllegalArgumentException(String.format(
                      "The file %s doesn't exist", file));
        }
        long fileLength = file.length();
        try (FileInputStream fis = new FileInputStream(file);
             BufferedInputStream bis = new BufferedInputStream(fis)) {
            /*
             * The last character may be an EOL or a non-EOL character.
             * If it is the EOL, need to add 1 line; if it is the non-EOL,
             * also need to add 1 line, because the next character means the EOF
             * and should also be counted as a line.
             */
            int number = 0;
            for (int i = 0; i < fileLength - 1; i++) {
                if (bis.read() == '\n') {
                    number++;
                }
            }
            if (fileLength > 0) {
                number++;
            }
            return number;
        } catch (IOException e) {
            throw new InternalException("Failed to count lines of file %s",
                                        e, file);
        }
    }
}
