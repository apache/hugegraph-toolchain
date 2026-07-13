/*
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
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const isMissing = value => value === undefined || value === null || value === '';

export const completeRowsRule = (t, fields, messageKey) => ({
    validator(_, rows) {
        if (!rows || rows.length === 0) {
            return Promise.resolve();
        }

        const incomplete = rows.some(row => !row
            || fields.some(field => isMissing(row[field])));
        return incomplete
            ? Promise.reject(new Error(t(messageKey)))
            : Promise.resolve();
    },
});

export const duplicateSourceRule = t => ({
    validator(_, rows) {
        const sourceFields = (rows ?? [])
            .map(row => row?.key)
            .filter(key => !isMissing(key));
        return new Set(sourceFields).size !== sourceFields.length
            ? Promise.reject(new Error(t('task.edit.duplicate_property')))
            : Promise.resolve();
    },
});
