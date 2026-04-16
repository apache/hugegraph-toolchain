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

package org.apache.hugegraph.util;

import java.io.File;
import java.io.IOException;
import java.net.URL;
import java.util.Map;

import org.apache.commons.io.FileUtils;

public final class CommonUtil {

    public static final String PREFIX = "https://github.com/apache/hugegraph-doc/" +
                                        "raw/binary/dist/toolchain/";

    public static void checkMapClass(Object object, Class<?> kClass,
                                     Class<?> vClass) {
        E.checkArgumentNotNull(object, "The object can't be null");
        E.checkArgument(object instanceof Map,
                        "The object must be instance of Map, but got '%s'(%s)",
                        object, object.getClass());
        E.checkArgumentNotNull(kClass, "The key class can't be null");
        E.checkArgumentNotNull(vClass, "The value class can't be null");
        Map<?, ?> map = (Map<?, ?>) object;
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            Object key = entry.getKey();
            Object value = entry.getValue();
            E.checkState(kClass.isAssignableFrom(key.getClass()),
                         "The map key must be instance of %s, " +
                         "but got '%s'(%s)", kClass, key, key.getClass());
            E.checkState(vClass.isAssignableFrom(value.getClass()),
                         "The map value must be instance of %s, " +
                         "but got '%s'(%s)", vClass, value, value.getClass());
        }
    }

    public static void downloadFileByUrl(String url, String destPath) {
        int connectTimeout = 5000;
        int readTimeout = 5000;
        try {
            FileUtils.copyURLToFile(new URL(url), new File(destPath), connectTimeout, readTimeout);
        } catch (IOException e) {
            throw new RuntimeException("Failed to download file, please check the network", e);
        }
    }
}
