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

import {ANALYSIS_TYPE} from './constants';

export const MODEL_PROVIDERS = {
    ollama: 'http://localhost:11434/v1',
    openai: 'https://api.openai.com/v1',
};

export const DEFAULT_QUERY_LANGUAGE = 'gremlin';
export const QUERY_LANGUAGES = {
    gremlin: {label: 'Gremlin', analysisType: ANALYSIS_TYPE.GREMLIN,
        endpoint: 'gremlin-query', editorTitleKey: 'analysis.query.generated_gremlin'},
    cypher: {label: 'Cypher', analysisType: ANALYSIS_TYPE.CYPHER, requiresCypher: true,
        endpoint: 'cypher', editorTitleKey: 'analysis.query.generated_cypher'},
};

export const supportsQueryLanguage = (language, cypherEnabled = false) => {
    return Object.prototype.hasOwnProperty.call(QUERY_LANGUAGES, language)
        && (!QUERY_LANGUAGES[language].requiresCypher || cypherEnabled === true);
};

// Only expose complete server templates; older servers may omit Prompt metadata.
export const readPromptTemplates = value => (Object.keys(QUERY_LANGUAGES)
    .every(language => typeof value?.[language] === 'string' && value[language].trim())
    ? {gremlin: value.gremlin, cypher: value.cypher} : undefined);

export const MAX_PROMPT_LENGTH = 16000;
