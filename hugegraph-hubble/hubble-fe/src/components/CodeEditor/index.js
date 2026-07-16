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

const CodeEditor = ({
    value,
    placeholder,
    onChange,
    lang = 'gremlin',
    readOnly = false,
    ariaLabel,
    minHeight,
    metaEnterNewline = false,
    onExecutionShortcut,
}) => {
    const {t} = useTranslation();
    const editor = useRef();
    const cm = useRef();
    const initialValue = useRef(value || '');
    const onChangeRef = useRef(onChange);
    const executionShortcutRef = useRef(onExecutionShortcut);
    onChangeRef.current = onChange;
    executionShortcutRef.current = onExecutionShortcut;
    const resolvedPlaceholder = placeholder ?? t('analysis.query.placeholder');

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
            {tag: tags.string, color: '#067d17'},
            {tag: tags.comment, color: '#6a737d', fontStyle: 'italic'},
            {tag: tags.propertyName, color: '#005cc5'},
        ]);

        cm.current = new EditorView({
            doc: initialValue.current,
            extensions: [
                !readOnly
                    ? EditorView.domEventHandlers({
                        keydown: event => {
                            if (event.key !== 'Enter'
                                || (!event.metaKey && !event.ctrlKey)
                                || event.altKey || event.shiftKey
                                || event.isComposing
                                || !executionShortcutRef.current) {
                                return false;
                            }
                            event.preventDefault();
                            executionShortcutRef.current();
                            return true;
                        },
                    })
                    : [],
                basicSetup,
                readOnly ? [] : closeBrackets(),
                readOnly ? [] : autocompletion({override: [myCompletions]}),
                syntax.language ?? [],
                syntaxHighlighting(myHighlightStyle),
                EditorView.editable.of(!readOnly),
                metaEnterNewline && !readOnly
                    ? EditorView.domEventHandlers({
                        keydown: (event, view) => {
                            if (event.key !== 'Enter' || !event.metaKey
                                || event.ctrlKey || event.altKey || event.shiftKey
                                || event.isComposing) {
                                return false;
                            }
                            view.dispatch(view.state.replaceSelection('\n'));
                            return true;
                        },
                    })
                    : [],
                ariaLabel ? EditorView.contentAttributes.of({
                    'aria-label': ariaLabel,
                }) : [],
                EditorView.updateListener.of(e => {
                    if (onChangeRef.current) {
                        onChangeRef.current(e.state.doc.toString());
                    }
                }),
                EditorView.theme(
                    {
                        '&': {
                            color: '#000',
                            'min-height': minHeight ? `${minHeight}px` : undefined,
                        },
                        '.cm-scroller': {
                            'min-height': minHeight ? `${minHeight}px` : undefined,
                        },
                        '&.cm-focused': {
                            outline: '0',
                        },
                        '.cm-activeLine': {
                            'background-color': 'transparent',
                        },
                    }
                ),
                cmplaceholder(resolvedPlaceholder),
            ],
            parent: editor.current,
        });

        // onChange && EditorView.updateListener.of(e => onChange(e.state.doc.toString()));

        return () => {
            cm.current.destroy();
        };
    }, [ariaLabel, lang, metaEnterNewline, minHeight, readOnly,
        resolvedPlaceholder]);

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
