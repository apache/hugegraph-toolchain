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

import {TextDecoder, TextEncoder} from 'util';
import {waitFor} from '@testing-library/react';
import {streamText2Gql} from './text2gqlStream';
import {handleRequestAuthStatus} from './request';

jest.mock('./request', () => ({handleRequestAuthStatus: jest.fn()}));
jest.mock('../i18n', () => ({t: key => key}));
const encoder = new TextEncoder();
const resultEvent = {type: 'result', query: 'g.V()', language: 'gremlin', valid: true};
const event = data => 'data: ' + JSON.stringify(data) + '\n\n';
const response = chunks => {
    const reader = {
        read: jest.fn(async () => (chunks.length ? {value: chunks.shift(), done: false} : {done: true})),
        cancel: jest.fn().mockResolvedValue(), releaseLock: jest.fn(),
    };
    return {ok: true, status: 200, headers: {get: () => 'text/event-stream;charset=UTF-8'},
        body: {getReader: () => reader}, reader};
};
const originalFetch = global.fetch;
const originalDecoder = global.TextDecoder;
beforeAll(() => {
    global.TextDecoder = TextDecoder;
});
beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
});
afterEach(() => jest.useRealTimers());
afterAll(() => {
    global.fetch = originalFetch;
    global.TextDecoder = originalDecoder;
});

test('handles split UTF-8, CRLF, multiple data lines, comments and a terminal event without a newline', async () => {
    const text = ': heartbeat\r\ndata: {"type":"delta",\r\ndata: "text":"图"}\r\n\r\n'
        + 'data: ' + JSON.stringify(resultEvent);
    const bytes = encoder.encode(text);
    const res = response([...bytes].map(value => Uint8Array.of(value)));
    fetch.mockResolvedValue(res);
    const onDelta = jest.fn();
    await expect(streamText2Gql('space a', 'g/one', {question: '图'}, {onDelta}))
        .resolves.toEqual({status: 200, data: resultEvent});
    expect(onDelta).toHaveBeenCalledWith('图');
    expect(res.reader.cancel).toHaveBeenCalledTimes(1);
    expect(res.reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/v1.3/graphspaces/space%20a/graphs/g%2Fone/text2gql/stream',
        expect.objectContaining({method: 'POST', credentials: 'same-origin', body: '{"question":"图"}',
            headers: expect.objectContaining({
                Accept: 'text/event-stream, application/json', 'Accept-Language': expect.any(String),
            })}));
});

test('delivers incremental text before the terminal result, ignoring reasoning fields', async () => {
    let finish;
    const res = response([]);
    res.reader.read.mockImplementationOnce(async () => ({value: encoder.encode(event({type: 'waiting'})), done: false}))
        .mockImplementationOnce(async () => ({
            value: encoder.encode(event({type: 'delta', text: 'g.V()', reasoning: 'private'})), done: false,
        }))
        .mockImplementationOnce(() => new Promise(resolve => {
            finish = resolve;
        }));
    fetch.mockResolvedValue(res);
    const onDelta = jest.fn();
    const onWaiting = jest.fn();
    let completed = false;
    const pending = streamText2Gql('DEFAULT', 'g', {}, {onDelta, onWaiting}).then(value => {
        completed = true;
        return value;
    });
    await waitFor(() => expect(onDelta).toHaveBeenCalledWith('g.V()'));
    expect(completed).toBe(false);
    expect(onWaiting).toHaveBeenCalledTimes(1);
    expect(onWaiting.mock.invocationCallOrder[0]).toBeLessThan(onDelta.mock.invocationCallOrder[0]);
    finish({value: encoder.encode(event(resultEvent)), done: false});
    await pending;
    expect(onDelta).toHaveBeenCalledTimes(1);
});

test.each([
    event({type: 'delta', text: 'partial only'}),
    'data: malformed\n\n',
    event({...resultEvent, valid: undefined}),
    event({type: 'delta', text: 'x'.repeat(10001)}),
    'data: ' + 'x'.repeat(1000001),
])('rejects missing completion, malformed or excessive streams (%#)', async text => {
    const res = response([encoder.encode(text)]);
    fetch.mockResolvedValue(res);
    await expect(streamText2Gql('DEFAULT', 'g', {})).rejects.toThrow();
    expect(res.reader.cancel).toHaveBeenCalled();
});

test('returns invalid terminal drafts without pretending that they are executable', async () => {
    fetch.mockResolvedValue(response([encoder.encode(event({...resultEvent, query: 'draft', valid: false}))]));
    await expect(streamText2Gql('DEFAULT', 'g', {})).resolves.toMatchObject({data: {valid: false, query: 'draft'}});
});

test.each(['http', 'event'])('uses existing auth handling and safe errors for %s failures', async kind => {
    const rejected = response([encoder.encode(JSON.stringify({message: 'Authorization: Bearer secret'}))]);
    rejected.ok = false;
    rejected.status = 401;
    fetch.mockResolvedValue(kind === 'http' ? rejected
        : response([encoder.encode(event({type: 'error', status: 403, message: 'Authorization: Bearer secret'}))]));
    await expect(streamText2Gql('DEFAULT', 'g', {})).rejects.toMatchObject({
        message: expect.not.stringContaining('secret'),
    });
    expect(handleRequestAuthStatus).toHaveBeenCalledWith(kind === 'http' ? 401 : 403);
});

test.each(['cancel', 'deadline'])('aborts a waiting stream on %s and clears its deadline', async mode => {
    jest.useFakeTimers();
    const caller = new AbortController();
    let activeSignal;
    fetch.mockImplementation(async (_, config) => {
        activeSignal = config.signal;
        const res = response([]);
        res.reader.read.mockImplementation(() => new Promise((resolve, reject) => {
            const fail = () => reject(new Error('aborted'));
            config.signal.addEventListener('abort', fail, {once: true});
        }));
        return res;
    });
    const pending = streamText2Gql('DEFAULT', 'g', {}, {signal: caller.signal});
    const rejected = expect(pending).rejects.toMatchObject(mode === 'deadline' ? {code: 'ECONNABORTED'} : {});
    await Promise.resolve();
    if (mode === 'cancel') {
        caller.abort();
    }
    else {
        jest.advanceTimersByTime(65000);
    }
    await rejected;
    expect(activeSignal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
});


test('expires a business 401 returned as JSON before the stream is established', async () => {
    const res = response([encoder.encode(JSON.stringify({status: 401, message: 'Session expired'}))]);
    res.headers.get = () => 'application/json';
    fetch.mockResolvedValue(res);
    await expect(streamText2Gql('DEFAULT', 'g', {})).rejects.toMatchObject({response: {status: 401}});
    expect(handleRequestAuthStatus).toHaveBeenCalledWith(401);
});


test.each(['preparation error', 'older server'])(
    'does not announce model waiting before an explicit event (%s)', async mode => {
        const onWaiting = jest.fn();
        fetch.mockResolvedValue(response([encoder.encode(event(mode === 'preparation error'
            ? {type: 'error', status: 500, message: 'Schema unavailable'} : resultEvent))]));
        const pending = streamText2Gql('DEFAULT', 'g', {}, {onWaiting});
        if (mode === 'preparation error') {
            await expect(pending).rejects.toThrow('Schema unavailable');
        }
        else {
            await expect(pending).resolves.toMatchObject({status: 200});
        }
        expect(onWaiting).not.toHaveBeenCalled();
    }
);


test('preserves authoritative server duration when waiting and result are buffered together', async () => {
    const terminal = {...resultEvent, duration_ms: 150};
    fetch.mockResolvedValue(response([encoder.encode(event({type: 'waiting'})
        + event({type: 'delta', text: 'g.V()'}) + event(terminal))]));
    const onWaiting = jest.fn();
    await expect(streamText2Gql('DEFAULT', 'g', {}, {onWaiting}))
        .resolves.toMatchObject({data: {duration_ms: 150}});
    expect(onWaiting).toHaveBeenCalledTimes(1);
});

test.each([150, 0, -1, NaN, Infinity, '150', null, undefined])(
    'only preserves a safe nonnegative numeric duration on stream errors (%s)', async duration => {
        fetch.mockResolvedValue(response([encoder.encode(event({type: 'error', status: 500,
            message: 'Authorization: Bearer secret', duration_ms: duration}))]));
        let failure;
        try {
            await streamText2Gql('DEFAULT', 'g', {});
        }
        catch (error) {
            failure = error;
        }
        expect(failure.message).not.toContain('secret');
        if (Number.isFinite(duration) && duration >= 0) {
            expect(failure.response.data.duration_ms).toBe(duration);
        }
        else {
            expect(failure.response.data).not.toHaveProperty('duration_ms');
        }
    }
);
