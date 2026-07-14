/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the
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

const mockRequest = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
};

jest.mock('./request', () => mockRequest);

const auth = require('./auth');

describe('auth API contract', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('updates the current profile with PUT and a JSON body', () => {
        const profile = {nickname: 'Alice', description: 'owner'};

        auth.updatePersonal(profile);

        expect(mockRequest.put).toHaveBeenCalledWith('/auth/users/personal', profile);
    });

    it('requests the no-store server authorization context', () => {
        auth.context();

        expect(mockRequest.get).toHaveBeenCalledWith('/auth/context', {
            suppressBusinessErrorToast: true,
            headers: {
                'Cache-Control': 'no-store',
                Pragma: 'no-cache',
            },
        });
    });

    it.each([
        ['getAllUserList', [{page_no: 1}], 'get', '/auth/users'],
        ['getUserInfo', ['user'], 'get', '/auth/users/user'],
        ['addUser', [{user_name: 'user'}], 'post', '/auth/users'],
        ['updateUser', ['user', {user_nickname: 'User'}], 'put',
            '/auth/users/user'],
        ['updateAdminspace', ['user', ['SPACE']], 'post',
            '/auth/users/updateadminspace/user'],
        ['delUser', ['user'], 'delete', '/auth/users/user'],
    ])('%s forwards page-owned error controls', (method, args, verb, route) => {
        const config = {suppressBusinessErrorToast: true};
        auth[method](...args, config);

        if (verb === 'get' && method === 'getAllUserList') {
            expect(mockRequest.get).toHaveBeenCalledWith(
                route, {params: args[0], ...config}
            );
            return;
        }
        if (verb === 'delete') {
            expect(mockRequest[verb]).toHaveBeenCalledWith(
                route, undefined, config
            );
            return;
        }
        if (verb === 'get') {
            expect(mockRequest[verb]).toHaveBeenCalledWith(route, config);
            return;
        }
        expect(mockRequest[verb]).toHaveBeenCalledWith(
            route, args.at(-1), config
        );
    });

    it('does not expose retired Super or UUAP facades', () => {
        expect(auth.getSuperUser).toBeUndefined();
        expect(auth.addSuperUser).toBeUndefined();
        expect(auth.removeSuperUser).toBeUndefined();
        expect(auth.addUuapUser).toBeUndefined();
        expect(auth.getUUapList).toBeUndefined();
    });
});
