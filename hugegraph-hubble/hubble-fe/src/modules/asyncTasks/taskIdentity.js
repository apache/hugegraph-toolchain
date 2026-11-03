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

// The negative ID is an internal routing key; preserve its digits as a string.
export const displayTaskId = id => {
    const value = String(id ?? '');
    return /^-[1-9]\d*$/.test(value) ? value.slice(1) : value;
};

export const displayTaskIdentity = id => {
    const value = String(id ?? '').trim();
    if (!/^(?:0|-?[1-9]\d*)$/.test(value)) {
        return value;
    }
    return `${value.startsWith('-') ? 'Vermeer' : 'Server'} #${displayTaskId(value)}`;
};
