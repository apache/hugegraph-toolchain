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
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

package org.apache.hugegraph.unit;

import org.apache.hugegraph.structure.schema.EdgeLabel;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;

public class EdgeLabelTest {

    @Test
    public void testToStringWithSingleLink() {
        EdgeLabel edgeLabel = new EdgeLabel.BuilderImpl("knows", null)
                                           .link("person", "software")
                                           .build();
        String str = edgeLabel.toString();
        Assert.assertContains("name=knows", str);
        Assert.assertContains("sourceLabel=person", str);
        Assert.assertContains("targetLabel=software", str);
    }

    @Test
    public void testToStringWithoutLink() {
        EdgeLabel parent = new EdgeLabel.BuilderImpl("father", null)
                                        .asBase()
                                        .build();
        String str = parent.toString();
        Assert.assertContains("name=father", str);
        Assert.assertContains("sourceLabel=null", str);
        Assert.assertContains("targetLabel=null", str);
        Assert.assertContains("links=[]", str);

        Assert.assertContains("name=created", new EdgeLabel("created").toString());
    }

    @Test
    public void testToStringWithMultipleLinks() {
        EdgeLabel edgeLabel = new EdgeLabel.BuilderImpl("write", null)
                                           .link("person", "book")
                                           .link("person", "paper")
                                           .build();
        String str = edgeLabel.toString();
        Assert.assertContains("name=write", str);
        Assert.assertContains("sourceLabel=null", str);
        Assert.assertContains("targetLabel=null", str);
        Assert.assertContains("person=book", str);
        Assert.assertContains("person=paper", str);
    }
}
