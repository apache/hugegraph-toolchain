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

package org.apache.hugegraph.structure.auth;

public enum HugePermission {

    NONE(0x00),

    READ(0x01),
    WRITE(0x02),
    DELETE(0x04),
    EXECUTE(0x08),

    SPACE(0x1f),
    SPACE_MEMBER(0x2f),
    ADMIN(0x7f);

    private final byte code;

    HugePermission(int code) {
        assert code < 256;
        this.code = (byte) code;
    }

    public byte code() {
        return this.code;
    }

    public String string() {
        return this.name().toLowerCase();
    }

    public boolean match(HugePermission other) {
        if (other == ADMIN) {
            return this == ADMIN;
        }
        return (this.code & other.code) != 0;
    }
}
