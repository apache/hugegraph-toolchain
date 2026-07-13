/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import {execFileSync} from 'child_process';
import syntaxConfig from './index';
import {groovyLanguage, groovyParser} from './groovy';

jest.mock('@codemirror/language', () => ({
    StreamLanguage: {
        define: jest.fn(parser => ({parser, type: 'stream-language'})),
    },
}));
jest.mock('@codemirror/legacy-modes/mode/groovy', () => ({
    groovy: {name: 'groovy-test-parser'},
}));

test('registers the Groovy stream parser as the Gremlin and Groovy language extension', () => {
    expect(groovyLanguage).toEqual({parser: groovyParser, type: 'stream-language'});
    expect(syntaxConfig.gremlin.language).toBe(groovyLanguage);
    expect(syntaxConfig.groovy.language).toBe(groovyLanguage);
});

test('the registered Groovy parser emits keyword, property, string, and comment tokens', () => {
    const script = `
        const {groovy} = require('@codemirror/legacy-modes/mode/groovy');
        const {StringStream} = require('@codemirror/language');
        const line = 'def schema = graph.schema(); ' +
            'schema.propertyKey("name").asText().create() // note';
        const stream = new StringStream(line, 4, 2);
        const state = groovy.startState(2);
        const tokens = [];
        while (!stream.eol()) {
            const start = stream.pos;
            const style = groovy.token(stream, state);
            tokens.push([line.slice(start, stream.pos), style]);
        }
        process.stdout.write(JSON.stringify(tokens));
    `;
    const output = execFileSync(process.execPath, ['-e', script], {
        cwd: process.cwd(),
        encoding: 'utf8',
    });
    const tokens = JSON.parse(output);

    expect(tokens).toEqual(expect.arrayContaining([
        ['def', 'keyword'],
        ['propertyKey', 'property'],
        ['"name"', 'string'],
        ['// note', 'comment'],
    ]));
});
