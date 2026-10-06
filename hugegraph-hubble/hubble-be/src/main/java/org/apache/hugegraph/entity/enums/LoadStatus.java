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

package org.apache.hugegraph.entity.enums;

import com.baomidou.mybatisplus.annotation.IEnum;

public enum LoadStatus implements IEnum<Byte> {

    RUNNING(0),

    SUCCEED(1),

    FAILED(2),

    PAUSED(3),

    STOPPED(4),

    // No Used
    INIT(5);

    private byte code;

    LoadStatus(int code) {
        assert code < 256;
        this.code = (byte) code;
    }

    @Override
    public Byte getValue() {
        return this.code;
    }

    public boolean inRunning() {
        return this == RUNNING;
    }
}
