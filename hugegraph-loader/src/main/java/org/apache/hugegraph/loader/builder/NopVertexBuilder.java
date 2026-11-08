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

package org.apache.hugegraph.loader.builder;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import org.apache.hugegraph.loader.constant.ElemType;
import org.apache.hugegraph.loader.executor.LoadContext;
import org.apache.hugegraph.loader.mapping.ElementMapping;
import org.apache.hugegraph.loader.mapping.InputStruct;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.structure.schema.SchemaLabel;
import org.apache.hugegraph.structure.schema.VertexLabel;

public class NopVertexBuilder extends ElementBuilder<Vertex> {

    public NopVertexBuilder(LoadContext context, InputStruct struct) {
        super(context, struct);
    }

    @Override
    public ElementMapping mapping() {
        ElementMapping mapping = new ElementMapping() {
            @Override
            public ElemType type() {
                return ElemType.VERTEX;
            }
        };

        mapping.label("graph-vertex");

        return mapping;
    }

    @Override
    public List<Vertex> build(String[] names, Object[] values) {
        List<Vertex> result = new ArrayList();

        for (Object value : values) {
            if (value instanceof Vertex vertex) {
                VertexLabel label = getVertexLabel(vertex.label());
                if (label.idStrategy().isPrimaryKey()) {
                    vertex.id(null);
                }
                result.add(vertex);
            }
        }
        return result;
    }

    @Override
    protected SchemaLabel schemaLabel() {
        return null;
    }

    @Override
    protected Collection<String> nonNullableKeys() {
        return null;
    }

    @Override
    protected boolean isIdField(String fieldName) {
        return false;
    }
}
