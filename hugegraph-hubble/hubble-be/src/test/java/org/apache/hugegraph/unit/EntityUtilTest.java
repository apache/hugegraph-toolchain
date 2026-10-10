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
package org.apache.hugegraph.unit;

import org.apache.hugegraph.annotation.MergeProperty;
import org.apache.hugegraph.common.Mergeable;
import org.apache.hugegraph.exception.InternalException;
import org.apache.hugegraph.testutil.Assert;
import org.apache.hugegraph.util.EntityUtil;
import org.junit.Test;

public class EntityUtilTest {

    @Test
    public void testMergeUsesNewValuesAndKeepsOldForNull() {
        Entity oldEntity = new Entity("1", "old-name", "old-desc", "old-note", "old-hidden");
        Entity newEntity = new Entity("2", null, null, "new-note", "new-hidden");

        Entity merged = EntityUtil.merge(oldEntity, newEntity);

        Assert.assertNotSame(oldEntity, merged);
        Assert.assertNotSame(newEntity, merged);
        // useNew = false keeps the old value
        Assert.assertEquals("1", merged.id);
        // ignoreNull = true keeps the old value when the new one is null
        Assert.assertEquals("old-name", merged.name);
        // ignoreNull = false accepts a null new value
        Assert.assertNull(merged.desc);
        Assert.assertEquals("new-note", merged.note);
        // Fields without @MergeProperty are not copied
        Assert.assertNull(merged.hidden);
    }

    @Test
    public void testMergeLeavesInputsUnchanged() {
        Entity oldEntity = new Entity("1", "old-name", "old-desc", "old-note", null);
        Entity newEntity = new Entity("2", "new-name", "new-desc", null, null);

        Entity merged = EntityUtil.merge(oldEntity, newEntity);

        Assert.assertEquals("new-name", merged.name);
        Assert.assertEquals("new-desc", merged.desc);
        Assert.assertEquals("old-note", merged.note);
        Assert.assertEquals("old-name", oldEntity.name);
        Assert.assertEquals("new-name", newEntity.name);
    }

    @Test
    public void testMergeWithoutNoArgConstructor() {
        NoDefaultConstructor oldEntity = new NoDefaultConstructor("old");
        NoDefaultConstructor newEntity = new NoDefaultConstructor("new");

        Assert.assertThrows(InternalException.class, () -> {
            EntityUtil.merge(oldEntity, newEntity);
        });
    }

    public static class Entity implements Mergeable {

        @MergeProperty(useNew = false)
        private String id;
        @MergeProperty
        private String name;
        @MergeProperty(ignoreNull = false)
        private String desc;
        @MergeProperty
        private String note;
        private String hidden;

        public Entity() {
        }

        Entity(String id, String name, String desc, String note, String hidden) {
            this.id = id;
            this.name = name;
            this.desc = desc;
            this.note = note;
            this.hidden = hidden;
        }
    }

    public static class NoDefaultConstructor implements Mergeable {

        @MergeProperty
        private String name;

        public NoDefaultConstructor(String name) {
            this.name = name;
        }
    }
}
