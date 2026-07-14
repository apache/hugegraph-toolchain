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

package org.apache.hugegraph.service.op;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

import org.apache.hugegraph.exception.ForbiddenException;

public final class OperationsCapabilityService {

    public static final String HEALTH_READ = "operations_health_read";
    public static final String TOPOLOGY_READ = "operations_topology_read";
    public static final String METRICS_READ = "operations_metrics_read";

    private OperationsCapabilityService() {
    }

    public static Set<String> forLevel(String level) {
        Set<String> capabilities = new LinkedHashSet<>();
        if ("ADMIN".equals(level)) {
            capabilities.add(HEALTH_READ);
            capabilities.add(TOPOLOGY_READ);
            capabilities.add(METRICS_READ);
        }
        return Collections.unmodifiableSet(capabilities);
    }

    public static void requireHealth(Set<String> capabilities) {
        if (!capabilities.contains(HEALTH_READ)) {
            throw new ForbiddenException(
                      "Permission denied: operations health read");
        }
    }
}
