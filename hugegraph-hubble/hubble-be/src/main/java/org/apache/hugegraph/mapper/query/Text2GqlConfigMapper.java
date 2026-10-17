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

package org.apache.hugegraph.mapper.query;

import org.apache.hugegraph.entity.query.Text2GqlConfiguration;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Select;

public interface Text2GqlConfigMapper {

    @Select("SELECT enabled, connection_type AS connectionType, base_url AS baseUrl, model, " +
            "encrypted_api_key AS encryptedApiKey, gremlin_prompt AS gremlinPrompt, " +
            "cypher_prompt AS cypherPrompt FROM text2gql_config WHERE id = 1")
    Text2GqlConfiguration current();

    @Insert("MERGE INTO text2gql_config " +
            "(id, enabled, connection_type, base_url, model, encrypted_api_key, " +
            "gremlin_prompt, cypher_prompt) KEY(id) " +
            "VALUES (1, #{enabled}, #{connectionType}, #{baseUrl}, #{model}, #{encryptedApiKey}, " +
            "#{gremlinPrompt}, #{cypherPrompt})")
    int save(Text2GqlConfiguration configuration);
}
