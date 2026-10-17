/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hugegraph.service.auth;

import java.util.concurrent.TimeUnit;

import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.service.HugeClientPoolService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Single boundary for Hubble authentication mode. Business controllers should
 * not infer mode from sessions or PD settings.
 */
@Service
public class AuthModeService {

    private static final int PROBE_TIMEOUT_SECONDS = 3;
    private static final long CACHE_NANOS = TimeUnit.SECONDS.toNanos(30L);

    private final HugeClientPoolService hugeClientPoolService;
    private volatile Boolean serverAuthEnabled;
    private volatile long detectedAt;

    @Autowired
    public AuthModeService(HugeClientPoolService hugeClientPoolService) {
        this.hugeClientPoolService = hugeClientPoolService;
    }

    public boolean enabled() {
        Boolean cached = this.serverAuthEnabled;
        long now = System.nanoTime();
        if (cached != null && now - this.detectedAt < CACHE_NANOS) {
            return cached;
        }
        return this.refresh();
    }

    /** Recheck Server state before authorizing operations that only mutate Hubble metadata. */
    public boolean refresh() {
        try (HugeClient client = this.createUnauthClient()) {
            return this.update(client.isServerAuthEnabled());
        } catch (RuntimeException ignored) {
            // Fail closed while Server state is unavailable.
            return this.update(true);
        }
    }

    public boolean anonymous() {
        return !this.enabled();
    }

    public boolean update(boolean enabled) {
        return this.update(enabled, System.nanoTime());
    }

    private boolean update(boolean enabled, long detectedAt) {
        this.serverAuthEnabled = enabled;
        this.detectedAt = detectedAt;
        return enabled;
    }

    protected HugeClient createUnauthClient() {
        return this.hugeClientPoolService.createUnauthClient(
               PROBE_TIMEOUT_SECONDS);
    }
}
