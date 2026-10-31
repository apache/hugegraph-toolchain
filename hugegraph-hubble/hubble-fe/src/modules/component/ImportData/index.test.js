/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {render} from '@testing-library/react';
import {Modal, Upload, message} from 'antd';
import GraphAnalysisContext from '../../Context';
import {USER_CHANGE_EVENT} from '../../../utils/user';
import ImportData from './index';

let mockBeforeUpload;
let mockOnChange;
let mockAction;
jest.mock('antd', () => {
    const Upload = ({action, beforeUpload, onChange, children}) => {
        mockBeforeUpload = beforeUpload;
        mockOnChange = onChange;
        mockAction = action;
        return children;
    };
    Upload.LIST_IGNORE = 'LIST_IGNORE';
    return {Upload, Modal: {confirm: jest.fn()}, message: {warning: jest.fn(), success: jest.fn(), error: jest.fn()},
        Button: ({children}) => <button>{children}</button>, Tooltip: ({children}) => children};
});
jest.mock('react-i18next', () => ({useTranslation: () => ({t: key => key})}));
jest.mock('../../../api', () => ({analysis: {getUploadList: jest.fn((space, graph) => `/${space}/${graph}/import`)}}));

afterEach(() => jest.clearAllMocks());

test('requires confirmation and cancels upload if the graph changes', async () => {
    const view = render(<GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'one'}}>
        <ImportData buttonEnable onUploadChange={jest.fn()} />
    </GraphAnalysisContext.Provider>);

    const cancelled = mockBeforeUpload({uid: 'cancelled'});
    Modal.confirm.mock.calls.at(-1)[0].onCancel();
    expect(await cancelled).toBe(Upload.LIST_IGNORE);

    const accepted = mockBeforeUpload({uid: 'accepted'});
    Modal.confirm.mock.calls.at(-1)[0].onOk();
    expect(await accepted).toBe(true);

    const stale = mockBeforeUpload({uid: 'stale'});
    view.rerender(<GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'two'}}>
        <ImportData buttonEnable onUploadChange={jest.fn()} />
    </GraphAnalysisContext.Provider>);
    Modal.confirm.mock.calls.at(-1)[0].onOk();
    expect(await stale).toBe(Upload.LIST_IGNORE);
    expect(message.warning).toHaveBeenCalledWith('analysis.canvas.import_scope_changed');

    const abandoned = mockBeforeUpload({uid: 'abandoned'});
    view.unmount();
    Modal.confirm.mock.calls.at(-1)[0].onOk();
    expect(await abandoned).toBe(Upload.LIST_IGNORE);
});

test('ignores deferred upload events after changing graph, including returning to the original graph', async () => {
    const onUploadChange = jest.fn();
    const renderScope = graph => <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph}}>
        <ImportData buttonEnable onUploadChange={onUploadChange} />
    </GraphAnalysisContext.Provider>;
    const view = render(renderScope('A'));
    const fileA = {uid: 'file-A'};
    const startA = mockBeforeUpload(fileA);
    Modal.confirm.mock.calls.at(-1)[0].onOk();
    expect(await startA).toBe(true);
    mockOnChange({file: {uid: 'file-A', status: 'uploading'}});
    expect(onUploadChange).toHaveBeenCalledTimes(1);

    view.rerender(renderScope('B'));
    expect(mockAction(fileA)).toBe('/DEFAULT/A/import');
    onUploadChange.mockClear();
    mockOnChange({file: {uid: 'file-A', status: 'uploading'}});
    mockOnChange({file: {uid: 'file-A', status: 'done', response: {status: 200, data: {vertices: ['A']}}}});
    mockOnChange({file: {uid: 'file-A', status: 'done', response: {status: 400, message: 'A failed'}}});
    mockOnChange({file: {uid: 'file-A', status: 'error', response: {message: 'A failed'}}});
    expect(onUploadChange).not.toHaveBeenCalled();
    expect(message.success).not.toHaveBeenCalled();
    expect(message.error).not.toHaveBeenCalled();

    const startB = mockBeforeUpload({uid: 'file-B'});
    Modal.confirm.mock.calls.at(-1)[0].onOk();
    expect(await startB).toBe(true);
    mockOnChange({file: {uid: 'file-B', status: 'uploading'}});
    mockOnChange({file: {uid: 'file-B', status: 'done', response: {status: 200, data: {vertices: ['B']}}}});
    expect(onUploadChange).toHaveBeenCalledTimes(2);
    expect(onUploadChange.mock.calls[1][2]).toEqual({vertices: ['B']});

    view.rerender(renderScope('A'));
    onUploadChange.mockClear();
    mockOnChange({file: {uid: 'file-A', status: 'done', response: {status: 200, data: {vertices: ['A']}}}});
    expect(onUploadChange).not.toHaveBeenCalled();
});

test('a pending confirmation is invalidated even if the original graph is selected again', async () => {
    const renderScope = graph => <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph}}>
        <ImportData buttonEnable onUploadChange={jest.fn()} />
    </GraphAnalysisContext.Provider>;
    const view = render(renderScope('A'));
    const pending = mockBeforeUpload({uid: 'file-A'});
    view.rerender(renderScope('B'));
    view.rerender(renderScope('A'));
    Modal.confirm.mock.calls.at(-1)[0].onOk();
    expect(await pending).toBe(Upload.LIST_IGNORE);
});

test('an earlier upload in the same graph cannot replace the latest confirmed upload', async () => {
    const onUploadChange = jest.fn();
    render(<GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'A'}}>
        <ImportData buttonEnable onUploadChange={onUploadChange} />
    </GraphAnalysisContext.Provider>);
    for (const uid of ['older', 'newer']) {
        const pending = mockBeforeUpload({uid});
        Modal.confirm.mock.calls.at(-1)[0].onOk();
        expect(await pending).toBe(true);
    }
    mockOnChange({file: {uid: 'older', status: 'done', response: {status: 200, data: {vertices: ['old']}}}});
    expect(onUploadChange).not.toHaveBeenCalled();
    mockOnChange({file: {uid: 'newer', status: 'done', response: {status: 200, data: {vertices: ['new']}}}});
    expect(onUploadChange.mock.calls[0][2]).toEqual({vertices: ['new']});
});

test('account changes invalidate pending confirmation and in-flight upload results', async () => {
    const onUploadChange = jest.fn();
    render(<GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'A'}}>
        <ImportData buttonEnable onUploadChange={onUploadChange} />
    </GraphAnalysisContext.Provider>);
    const first = mockBeforeUpload({uid: 'first'});
    Modal.confirm.mock.calls.at(-1)[0].onOk();
    expect(await first).toBe(true);
    const pending = mockBeforeUpload({uid: 'pending'});
    window.dispatchEvent(new Event(USER_CHANGE_EVENT));
    mockOnChange({file: {uid: 'first', status: 'uploading'}});
    mockOnChange({file: {uid: 'first', status: 'done', response: {status: 200, data: {vertices: ['old']}}}});
    expect(onUploadChange).not.toHaveBeenCalled();
    Modal.confirm.mock.calls.at(-1)[0].onOk();
    expect(await pending).toBe(Upload.LIST_IGNORE);
});
