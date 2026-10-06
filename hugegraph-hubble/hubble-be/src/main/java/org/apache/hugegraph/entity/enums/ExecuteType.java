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
import org.apache.hugegraph.exception.InternalException;

import java.util.HashSet;
import java.util.Set;

public enum ExecuteType implements IEnum<Byte> {

    GREMLIN(0),

    ALGORITHM(1),
    CYPHER(2),
    CYPHER_ASYNC(4),
    GREMLIN_ASYNC(5),
    GREMLIN_ALL(6),
    CYPHER_ALL(7);

    private byte code;

    ExecuteType(int code) {
        assert code < 256;
        this.code = (byte) code;
    }

    @Override
    public Byte getValue() {
        return this.code;
    }

    public static boolean isSingle(int type) {
        return type < GREMLIN_ALL.getValue();
    }

    public static Set<Integer> getMatchedTypes(int type) {
        Set<Integer> types = new HashSet<>();
        if (isSingle(type)) {
            types.add(type);
        } else if (type == GREMLIN_ALL.getValue()) {
            types.add(GREMLIN_ASYNC.getValue().intValue());
            types.add(GREMLIN.getValue().intValue());
        } else if (type == CYPHER_ALL.getValue()) {
            types.add(CYPHER.getValue().intValue());
            types.add(CYPHER_ASYNC.getValue().intValue());
        } else {
            throw new InternalException("executehistory type invalid");
        }
        return types;
    }
}
