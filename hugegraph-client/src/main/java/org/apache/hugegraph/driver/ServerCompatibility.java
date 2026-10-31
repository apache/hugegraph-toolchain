/*
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

package org.apache.hugegraph.driver;

import org.apache.hugegraph.util.VersionUtil;

/**
 * Small compatibility boundary shared by Hubble and clients.
 *
 * <p>Version checks belong here so callers can express capabilities instead
 * of branching on server versions in controllers or pages. Unknown versions
 * deliberately use the conservative legacy profile.</p>
 */
public final class ServerCompatibility {

    private static final String GRAPHSPACE_MIN_VERSION = "1.7.0";
    private static final String GRAPH_CREATE_MIN_API_VERSION = "0.67";
    private static final String DEFAULT_ROLE_MIN_API_VERSION = "0.72";
    private static final String SCHEMA_CLONE_MIN_API_VERSION = "0.73";

    private ServerCompatibility() {
    }

    public static Profile profile(String coreVersion) {
        return profile(coreVersion, null);
    }

    public static Profile profile(String coreVersion, String apiVersion) {
        if (supportsDefaultRoleApi(apiVersion)) {
            return Profile.MODERN;
        }
        if (coreVersion == null || coreVersion.trim().isEmpty()) {
            return Profile.LEGACY;
        }
        try {
            String normalized = coreVersion.trim();
            return VersionUtil.gte(normalized, GRAPHSPACE_MIN_VERSION) ? Profile.GRAPHSPACE : Profile.LEGACY;
        } catch (RuntimeException ignored) {
            return Profile.LEGACY;
        }
    }

    private static boolean supportsDefaultRoleApi(String apiVersion) {
        return supportsApi(apiVersion, DEFAULT_ROLE_MIN_API_VERSION);
    }

    private static boolean supportsApi(String apiVersion,
                                       String minimumVersion) {
        if (apiVersion == null || apiVersion.trim().isEmpty()) {
            return false;
        }
        try {
            return VersionUtil.gte(apiVersion.trim(), minimumVersion);
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    public static boolean supportsGraphSpace(String coreVersion) {
        return profile(coreVersion).supportsGraphSpace();
    }

    public static boolean supportsCypher(String coreVersion) {
        return profile(coreVersion).supportsCypher();
    }

    public static boolean supportsGraphCreate(String apiVersion) {
        return supportsApi(apiVersion, GRAPH_CREATE_MIN_API_VERSION);
    }

    public static boolean supportsSchemaClone(String apiVersion) {
        return supportsApi(apiVersion, SCHEMA_CLONE_MIN_API_VERSION);
    }

    public static boolean supportsDefaultRole(String coreVersion,
                                              String apiVersion) {
        return profile(coreVersion, apiVersion).supportsDefaultRole();
    }

    public static boolean supportsPersonalProfileUpdate(
            String coreVersion, String apiVersion) {
        return profile(coreVersion, apiVersion)
               .supportsPersonalProfileUpdate();
    }

    public enum Profile {
        LEGACY(false, false, false, false, false),
        GRAPHSPACE(true, true, false, false, true),
        MODERN(true, true, true, true, false);

        private final boolean graphSpace;
        private final boolean cypher;
        private final boolean defaultRole;
        private final boolean personalProfileUpdate;
        private final boolean basicGremlinAuth;

        Profile(boolean graphSpace, boolean cypher, boolean defaultRole,
                boolean personalProfileUpdate, boolean basicGremlinAuth) {
            this.graphSpace = graphSpace;
            this.cypher = cypher;
            this.defaultRole = defaultRole;
            this.personalProfileUpdate = personalProfileUpdate;
            this.basicGremlinAuth = basicGremlinAuth;
        }

        public boolean supportsGraphSpace() {
            return this.graphSpace;
        }

        public boolean supportsCypher() {
            return this.cypher;
        }

        public boolean supportsDefaultRole() {
            return this.defaultRole;
        }

        public boolean supportsPersonalProfileUpdate() {
            return this.personalProfileUpdate;
        }

        public boolean requiresBasicGremlinAuth() {
            return this.basicGremlinAuth;
        }
    }
}
