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

package org.apache.hugegraph.spark.connector.utils;

import java.util.Date;
import java.util.UUID;

import org.apache.hugegraph.spark.connector.exception.LoadException;
import org.apache.hugegraph.structure.constant.Cardinality;
import org.apache.hugegraph.structure.constant.DataType;
import org.apache.hugegraph.structure.schema.PropertyKey;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;

public class DataTypeUtilsTest {

    @Test
    public void testParseNumber() {
        Assert.assertEquals(12345,
                            DataTypeUtils.parseNumber("valid-int-value", 12345L));
        Assert.assertEquals(123456789987654L,
                            DataTypeUtils.parseNumber("valid-long-value", 123456789987654L));
        Assert.assertEquals(123456789987654L,
                            DataTypeUtils.parseNumber("valid-long-value", "123456789987654"));
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            DataTypeUtils.parseNumber("in-valid-long-value", "abc123456789");
        });
    }

    @Test
    public void testParseUUID() {
        UUID uuid = UUID.randomUUID();
        Assert.assertEquals(uuid, DataTypeUtils.parseUUID("uuid", uuid));
        Assert.assertEquals(uuid, DataTypeUtils.parseUUID("string-uuid", uuid.toString()));
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            DataTypeUtils.parseUUID("invalid-uuid", "hugegraph");
        });
    }

    @Test
    public void convertSingleString() {
        PropertyKey propertyKey = new PropertyKey("name");
        Assert.assertEquals("josh", DataTypeUtils.convert("josh", propertyKey));
    }

    @Test
    public void convertSingleNumber() {
        PropertyKey.Builder builder = new PropertyKey.BuilderImpl("number", null);
        PropertyKey bytePropertyKey = builder.dataType(DataType.BYTE)
                                   .cardinality(Cardinality.SINGLE)
                                   .build();
        Assert.assertEquals((byte) 25, DataTypeUtils.convert("25", bytePropertyKey));
        Assert.assertEquals((byte) 25, DataTypeUtils.convert(25, bytePropertyKey));

        PropertyKey intPropertyKey = builder.dataType(DataType.INT)
                                             .cardinality(Cardinality.SINGLE)
                                             .build();
        Assert.assertEquals(20230920, DataTypeUtils.convert("20230920", intPropertyKey));
        Assert.assertEquals(20230920, DataTypeUtils.convert(20230920, intPropertyKey));

        PropertyKey longPropertyKey = builder.dataType(DataType.LONG)
                                            .cardinality(Cardinality.SINGLE)
                                            .build();
        Assert.assertEquals(202309205435343242L, DataTypeUtils.convert("202309205435343242",
                                                                       longPropertyKey));
        Assert.assertEquals(202309205435343242L, DataTypeUtils.convert(202309205435343242L,
                                                                       longPropertyKey));

        PropertyKey floatPropertyKey = builder.dataType(DataType.FLOAT)
                                             .cardinality(Cardinality.SINGLE)
                                             .build();
        Assert.assertEquals(123.45f, DataTypeUtils.convert("123.45", floatPropertyKey));
        Assert.assertEquals(123.45f, DataTypeUtils.convert(123.45, floatPropertyKey));

        PropertyKey doublePropertyKey = builder.dataType(DataType.DOUBLE)
                                              .cardinality(Cardinality.SINGLE)
                                              .build();
        Assert.assertEquals(1235443.48956783, DataTypeUtils.convert("1235443.48956783",
                                                                 doublePropertyKey));
        Assert.assertEquals(1235443.48956783, DataTypeUtils.convert(1235443.48956783, doublePropertyKey));
    }

    @Test
    public void testConvertSingleBoolean() {
        PropertyKey.Builder builder = new PropertyKey.BuilderImpl("boolean", null);
        PropertyKey booleanPropertyKey = builder.dataType(DataType.BOOLEAN)
                                               .cardinality(Cardinality.SINGLE)
                                               .build();

        Assert.assertEquals(true, DataTypeUtils.convert(true, booleanPropertyKey));
        Assert.assertEquals(true, DataTypeUtils.convert("true", booleanPropertyKey));
        Assert.assertEquals(true, DataTypeUtils.convert("True", booleanPropertyKey));
        Assert.assertEquals(true, DataTypeUtils.convert("TRUE", booleanPropertyKey));
        Assert.assertEquals(true, DataTypeUtils.convert("yes", booleanPropertyKey));
        Assert.assertEquals(true, DataTypeUtils.convert("y", booleanPropertyKey));
        Assert.assertEquals(true, DataTypeUtils.convert("1", booleanPropertyKey));

        Assert.assertEquals(false, DataTypeUtils.convert(false, booleanPropertyKey));
        Assert.assertEquals(false, DataTypeUtils.convert("false", booleanPropertyKey));
        Assert.assertEquals(false, DataTypeUtils.convert("False", booleanPropertyKey));
        Assert.assertEquals(false, DataTypeUtils.convert("FALSE", booleanPropertyKey));
        Assert.assertEquals(false, DataTypeUtils.convert("no", booleanPropertyKey));
        Assert.assertEquals(false, DataTypeUtils.convert("n", booleanPropertyKey));
        Assert.assertEquals(false, DataTypeUtils.convert("0", booleanPropertyKey));

        Assert.assertThrows(IllegalArgumentException.class, () -> {
            DataTypeUtils.convert("right", booleanPropertyKey);
        });

        Assert.assertThrows(IllegalArgumentException.class, () -> {
            DataTypeUtils.convert(123, booleanPropertyKey);
        });
    }

    @Test
    public void testConvertSingleUUID() {
        PropertyKey.Builder builder = new PropertyKey.BuilderImpl("uuid", null);
        PropertyKey uuidPropertyKey = builder.dataType(DataType.UUID)
                                                .cardinality(Cardinality.SINGLE)
                                                .build();
        UUID uuid = UUID.randomUUID();
        Assert.assertEquals(uuid, DataTypeUtils.convert(uuid, uuidPropertyKey));
        Assert.assertEquals(uuid, DataTypeUtils.convert(uuid.toString(), uuidPropertyKey));
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            DataTypeUtils.convert("hugegraph", uuidPropertyKey);
        });
    }

    @Test
    public void testConvertSingleDate() {
        PropertyKey.Builder builder = new PropertyKey.BuilderImpl("date", null);
        PropertyKey datePropertyKey = builder.dataType(DataType.DATE)
                                             .cardinality(Cardinality.SINGLE)
                                             .build();

        Date date = new Date(1695233374320L);
        Assert.assertEquals(date, DataTypeUtils.convert(date, datePropertyKey));
        Assert.assertEquals(date, DataTypeUtils.convert(1695233374320L, datePropertyKey));
        // TODO check
        // Assert.assertEquals(date, DataTypeUtils.convert("2023-09-21 02:09:34", datePropertyKey));
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            DataTypeUtils.convert(date.toString(), datePropertyKey);
        });
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            DataTypeUtils.convert("abc", datePropertyKey);
        });
    }

    @Test
    public void testConvertInvalidNumber() {
        PropertyKey intPropertyKey = propertyKey("age", DataType.INT);

        Assert.assertThrows(IllegalArgumentException.class, () -> {
            DataTypeUtils.convert("abc", intPropertyKey);
        }, e -> {
            Assert.assertContains("to Number", e.getMessage());
            Assert.assertTrue(e.getCause() instanceof NumberFormatException);
        });
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            DataTypeUtils.convert("1.5", intPropertyKey);
        });
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            DataTypeUtils.convert("128", propertyKey("flag", DataType.BYTE));
        });
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            DataTypeUtils.convert(true, intPropertyKey);
        });
    }

    @Test
    public void testConvertText() {
        PropertyKey textPropertyKey = propertyKey("name", DataType.TEXT);

        Assert.assertEquals("josh", DataTypeUtils.convert("  josh ", textPropertyKey));
        Assert.assertEquals("12", DataTypeUtils.convert(12, textPropertyKey));
        Assert.assertEquals("true", DataTypeUtils.convert(true, textPropertyKey));
    }

    @Test
    public void testConvertStringDate() {
        PropertyKey datePropertyKey = propertyKey("date", DataType.DATE);

        // Strings use the default format "yyyy-MM-dd HH:mm:ss" in GMT+8
        Assert.assertEquals(new Date(1695233374000L),
                            DataTypeUtils.convert("2023-09-21 02:09:34", datePropertyKey));
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            DataTypeUtils.convert("2023-09-21", datePropertyKey);
        });
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            DataTypeUtils.convert(true, datePropertyKey);
        });
    }

    @Test
    public void testConvertNullValue() {
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            DataTypeUtils.convert(null, new PropertyKey("name"));
        });
    }

    @Test
    public void testConvertCollectionIsNotSupported() {
        for (Cardinality cardinality : new Cardinality[]{Cardinality.LIST, Cardinality.SET}) {
            PropertyKey.Builder builder = new PropertyKey.BuilderImpl("tags", null);
            PropertyKey propertyKey = builder.dataType(DataType.TEXT)
                                             .cardinality(cardinality)
                                             .build();
            Assert.assertThrows(LoadException.class, () -> {
                DataTypeUtils.convert("[a,b]", propertyKey);
            }, e -> {
                Assert.assertContains("Not support yet", e.getMessage());
            });
        }
    }

    private static PropertyKey propertyKey(String name, DataType dataType) {
        PropertyKey.Builder builder = new PropertyKey.BuilderImpl(name, null);
        return builder.dataType(dataType).cardinality(Cardinality.SINGLE).build();
    }
}
