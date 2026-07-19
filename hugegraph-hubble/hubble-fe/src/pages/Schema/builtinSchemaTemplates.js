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

const BUILTIN_SCHEMA_TEMPLATES = {
    people_network: [
        'schema.propertyKey("name").asText().ifNotExist().create()',
        'schema.propertyKey("since").asInt().ifNotExist().create()',
        'schema.vertexLabel("person").properties("name").primaryKeys("name")',
        '      .ifNotExist().create()',
        'schema.edgeLabel("knows").sourceLabel("person").targetLabel("person")',
        '      .properties("since").ifNotExist().create()',
    ].join('\n'),
    product_catalog: [
        'schema.propertyKey("sku").asText().ifNotExist().create()',
        'schema.propertyKey("region").asText().ifNotExist().create()',
        'schema.propertyKey("name").asText().ifNotExist().create()',
        'schema.propertyKey("price").asDouble().ifNotExist().create()',
        'schema.vertexLabel("product").properties("sku", "region", "name", "price")',
        '      .primaryKeys("sku", "region").ifNotExist().create()',
        'schema.edgeLabel("related").sourceLabel("product").targetLabel("product")',
        '      .ifNotExist().create()',
        'schema.indexLabel("productByPrice").onV("product").by("price")',
        '      .range().ifNotExist().create()',
    ].join('\n'),
};

export default BUILTIN_SCHEMA_TEMPLATES;
export {BUILTIN_SCHEMA_TEMPLATES};
