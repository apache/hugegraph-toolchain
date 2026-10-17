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

import i18n from '../i18n';
import {withLanguageHeader} from './languageHeader';
import {handleRequestAuthStatus} from './request';
import {sanitizePublicError} from '../utils/publicError';

const MAX_STREAM_BYTES = 1000000;
const MAX_QUERY_LENGTH = 10000;

const streamError = (message, status, durationMs) => {
    handleRequestAuthStatus(status);
    const error = new Error(sanitizePublicError(message, i18n.t('analysis.query.stream_incomplete')));
    error.response = {status, data: {status, message: error.message}};
    if (Number.isFinite(durationMs) && durationMs >= 0) {
        error.response.data.duration_ms = durationMs;
    }
    return error;
};

// Parse SSE incrementally. Neither an unvalidated delta nor EOF is a result.
const readQueryStream = async (body, {onDelta, onWaiting}) => {
    if (!body?.getReader) {
        throw streamError();
    }
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8', {fatal: true});
    let buffer = '';
    let data = [];
    let received = 0;
    let draftLength = 0;
    let result;
    const dispatch = () => {
        if (!data.length) {
            return;
        }
        let event;
        try {
            event = JSON.parse(data.join('\n'));
        }
        catch {
            throw streamError();
        }
        data = [];
        if (event.type === 'error') {
            throw streamError(event.message, event.status, event.duration_ms);
        }
        if (event.type === 'waiting') {
            onWaiting?.();
        }
        else if (event.type === 'delta') {
            if (typeof event.text !== 'string' || (draftLength += event.text.length) > MAX_QUERY_LENGTH) {
                throw streamError();
            }
            if (event.text) {
                onDelta?.(event.text);
            }
        }
        else if (event.type === 'result') {
            if (typeof event.query !== 'string' || event.query.length > MAX_QUERY_LENGTH
                || typeof event.valid !== 'boolean') {
                throw streamError();
            }
            result = {status: 200, data: event};
        }
    };
    const line = value => {
        if (!value) {
            dispatch();
        }
        else if (value.startsWith('data:')) {
            data.push(value.slice(5).replace(/^ /, ''));
        }
    };
    const consume = final => {
        let index;
        while ((index = buffer.search(/[\r\n]/)) !== -1) {
            if (!final && buffer[index] === '\r' && index === buffer.length - 1) {
                break;
            }
            const separator = buffer[index] === '\r' && buffer[index + 1] === '\n' ? 2 : 1;
            line(buffer.slice(0, index));
            buffer = buffer.slice(index + separator);
            if (result) {
                return;
            }
        }
        if (final && !result) {
            line(buffer);
            buffer = '';
            dispatch();
        }
    };
    try {
        while (!result) {
            const {done, value} = await reader.read();
            if (done) {
                buffer += decoder.decode();
                consume(true);
                break;
            }
            received += value.byteLength;
            if (received > MAX_STREAM_BYTES) {
                throw streamError();
            }
            buffer += decoder.decode(value, {stream: true});
            consume(false);
        }
        if (!result) {
            throw streamError();
        }
        return result;
    }
    finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
};

const readErrorBody = async body => {
    if (!body?.getReader) {
        return undefined;
    }
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let bytes = 0;
    try {
        while (bytes <= 32000) {
            const {done, value} = await reader.read();
            if (done) {
                return JSON.parse(text + decoder.decode());
            }
            bytes += value.byteLength;
            if (bytes > 32000) {
                return undefined;
            }
            text += decoder.decode(value, {stream: true});
        }
    }
    catch {
        return undefined;
    }
    finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
};

export const streamText2Gql = async (graphspace, graph, params, {signal, onDelta, onWaiting} = {}) => {
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) {
        abort();
    }
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, 65000);
    try {
        const response = await fetch(`/api/v1.3/graphspaces/${encodeURIComponent(graphspace)}`
            + `/graphs/${encodeURIComponent(graph)}/text2gql/stream`, {
            method: 'POST', credentials: 'same-origin', signal: controller.signal,
            headers: withLanguageHeader({
                'Content-Type': 'application/json', Accept: 'text/event-stream, application/json',
            }),
            body: JSON.stringify(params),
        });
        if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
            const data = await readErrorBody(response.body);
            const status = [401, 403].includes(response.status) ? response.status : data?.status || response.status;
            throw streamError(data?.message, status);
        }
        return await readQueryStream(response.body, {onDelta, onWaiting});
    }
    catch (error) {
        if (timedOut) {
            const failure = streamError(i18n.t('analysis.query.stream_timeout'));
            failure.code = 'ECONNABORTED';
            throw failure;
        }
        throw error;
    }
    finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
    }
};
