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
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

package org.apache.hugegraph.unit;

import java.io.StringReader;
import java.io.StringWriter;
import java.util.Collections;

import jakarta.xml.bind.JAXBContext;
import jakarta.xml.bind.annotation.XmlRootElement;

import org.junit.Assert;
import org.junit.Test;

public class JaxbRuntimeTest {

    @Test
    public void testOneProviderCanRoundTripXml() throws Exception {
        JAXBContext context = JAXBContext.newInstance(Record.class);
        ClassLoader loader = context.getClass().getClassLoader();
        String providerClass = context.getClass().getName().replace('.', '/') + ".class";
        Assert.assertEquals(1, Collections.list(loader.getResources(providerClass)).size());
        Assert.assertEquals(1, Collections.list(loader.getResources(
                "org/glassfish/jaxb/core/api/impl/NameConverter.class")).size());

        Record source = new Record();
        source.name = "测试 & JAXB";
        source.value = 9007199254740993L;
        StringWriter xml = new StringWriter();
        context.createMarshaller().marshal(source, xml);
        Record restored = (Record) context.createUnmarshaller()
                                         .unmarshal(new StringReader(xml.toString()));
        Assert.assertEquals(source.name, restored.name);
        Assert.assertEquals(source.value, restored.value);
    }

    @XmlRootElement(name = "record")
    public static class Record {

        public String name;
        public long value;
    }
}
