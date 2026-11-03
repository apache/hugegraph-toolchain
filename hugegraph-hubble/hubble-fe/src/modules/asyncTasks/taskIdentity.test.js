/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {displayTaskIdentity} from './taskIdentity';

it.each([
    ['0', 'Server #0'], [' 80001 ', 'Server #80001'], ['-7', 'Vermeer #7'],
    ['-07', '-07'], ['-0', '-0'], ['abc', 'abc'], [' Server #7 ', 'Server #7'],
    ['9007199254740993', 'Server #9007199254740993'],
])('formats canonical task ID %s without changing other searches', (input, expected) => {
    expect(displayTaskIdentity(input)).toBe(expected);
});
