/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import {StreamLanguage} from '@codemirror/language';
import {groovy as groovyParser} from '@codemirror/legacy-modes/mode/groovy';

const groovyLanguage = StreamLanguage.define(groovyParser);

export {groovyLanguage, groovyParser};
