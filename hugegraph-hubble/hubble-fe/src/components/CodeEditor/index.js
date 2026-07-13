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

import {autocompletion, closeBrackets} from '@codemirror/autocomplete';
import {syntaxHighlighting, HighlightStyle} from '@codemirror/language';
import {basicSetup, EditorView} from 'codemirror';
import React, {useRef, useEffect} from 'react';
import {placeholder as cmplaceholder} from '@codemirror/view';
import syntaxConfig from './syntax';
import {tags} from '@lezer/highlight';
import {useTranslation} from 'react-i18next';

const CodeEditor = ({value, placeholder, onChange, lang = 'gremlin'}) => {
    const {t} = useTranslation();
    const editor = useRef();
    const cm = useRef();
    const initialValue = useRef(value || '');

    useEffect(() => {
        const syntax = syntaxConfig[lang] ?? syntaxConfig.default;

        const myCompletions = context => {
            let before = context.matchBefore(/\w+/);
            if (!context.explicit && !before) {
                return null;
            }

            return {
                from: before ? before.from : context.pos,
                options: syntax.hint,
                validFor: /^\w*$/,
            };
        };

        const myHighlightStyle = HighlightStyle.define([
            {tag: tags.keyword, color: '#fc6eee'},
            {tag: tags.function, color: '#ff0'},
        ]);

        cm.current = new EditorView({
            doc: initialValue.current,
            extensions: [
                basicSetup,
                closeBrackets(),
                autocompletion({override: [myCompletions]}),
                syntaxHighlighting(myHighlightStyle),
                EditorView.updateListener.of(e => {
                    onChange && onChange(e.state.doc.toString());
                }),
                EditorView.theme(
                    {
                        '&': {
                            color: '#000',
                        },
                        '&.cm-focused': {
                            outline: '0',
                        },
                        '.cm-activeLine': {
                            'background-color': 'transparent',
                        },
                    }
                ),
                cmplaceholder(placeholder ?? t('analysis.query.placeholder')),
            ],
            parent: editor.current,
        });

        // onChange && EditorView.updateListener.of(e => onChange(e.state.doc.toString()));

        return () => {
            cm.current.destroy();
        };
    }, [t, lang, onChange, placeholder]);

    useEffect(() => {
        if (value !== null && cm.current.state.doc && value !== cm.current.state.doc.toString()) {
            cm.current.dispatch({
                changes: {from: 0, to: cm.current.state.doc.length, insert: value},
            });
        }
    }, [value]);

    return (
        <div ref={editor} />
    );
};

export default CodeEditor;
