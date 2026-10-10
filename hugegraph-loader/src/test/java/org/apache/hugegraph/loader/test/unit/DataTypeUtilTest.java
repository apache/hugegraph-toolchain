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

package org.apache.hugegraph.loader.test.unit;

import java.util.Arrays;
import java.util.Collection;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import org.apache.hugegraph.loader.source.file.FileSource;
import org.apache.hugegraph.loader.source.file.ListFormat;
import org.apache.hugegraph.loader.source.jdbc.JDBCSource;
import org.apache.hugegraph.loader.util.DataTypeUtil;
import org.apache.hugegraph.structure.constant.Cardinality;
import org.apache.hugegraph.structure.constant.DataType;
import org.apache.hugegraph.structure.schema.PropertyKey;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;

import com.google.common.collect.ImmutableList;
import com.google.common.collect.ImmutableSet;

public class DataTypeUtilTest {

    @Test
    public void testConvertNumbers() {
        FileSource source = new FileSource();

        Assert.assertEquals((byte) 7, convert(" 7 ", DataType.BYTE, source));
        Assert.assertEquals(18, convert("18", DataType.INT, source));
        Assert.assertEquals(-1L, convert("-1", DataType.LONG, source));
        Assert.assertEquals(Long.MAX_VALUE,
                            convert(String.valueOf(Long.MAX_VALUE), DataType.LONG, source));
        Assert.assertEquals(1.5F, convert("1.5", DataType.FLOAT, source));
        Assert.assertEquals(2.25D, convert("2.25", DataType.DOUBLE, source));
        // Values with the target type are kept
        Assert.assertEquals(3, convert(3, DataType.INT, source));
        // Numbers of another type are converted through their string
        Assert.assertEquals(3L, convert(3, DataType.LONG, source));
    }

    @Test
    public void testConvertInvalidNumbers() {
        FileSource source = new FileSource();

        Assert.assertThrows(IllegalArgumentException.class, () -> {
            convert("abc", DataType.INT, source);
        }, e -> {
            Assert.assertContains("Failed to convert value(key=key) 'abc'", e.getMessage());
            Assert.assertTrue(e.getCause() instanceof NumberFormatException);
        });
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            convert("1.5", DataType.INT, source);
        });
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            convert("128", DataType.BYTE, source);
        });
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            convert(String.valueOf(Integer.MAX_VALUE + 1L), DataType.INT, source);
        });
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            convert("", DataType.LONG, source);
        });
    }

    @Test
    public void testConvertBoolean() {
        FileSource source = new FileSource();

        for (String value : ImmutableList.of("true", "TRUE", "1", "yes", "Y")) {
            Assert.assertEquals(true, convert(value, DataType.BOOLEAN, source));
        }
        for (String value : ImmutableList.of("false", "False", "0", "no", "n")) {
            Assert.assertEquals(false, convert(value, DataType.BOOLEAN, source));
        }
        Assert.assertEquals(true, convert(true, DataType.BOOLEAN, source));

        Assert.assertThrows(IllegalArgumentException.class, () -> {
            convert("maybe", DataType.BOOLEAN, source);
        }, e -> {
            Assert.assertContains("the acceptable boolean strings are", e.getMessage());
        });
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            convert(1, DataType.BOOLEAN, source);
        });
    }

    @Test
    public void testConvertUUID() {
        FileSource source = new FileSource();
        UUID uuid = UUID.fromString("3b0f2a1e-53a8-4c4e-9f39-0bd7d0d4a3c5");

        Assert.assertEquals(uuid, convert(uuid.toString(), DataType.UUID, source));
        Assert.assertEquals(uuid, convert("3b0f2a1e53a84c4e9f390bd7d0d4a3c5",
                                          DataType.UUID, source));
        Assert.assertEquals(uuid, convert(uuid, DataType.UUID, source));

        Assert.assertThrows(IllegalArgumentException.class, () -> {
            convert("3b0f2a1e53a84c4e9f390bd7d0d4a3c", DataType.UUID, source);
        }, e -> {
            Assert.assertContains("Invalid UUID value(key='key')", e.getMessage());
        });
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            convert(12L, DataType.UUID, source);
        });
    }

    @Test
    public void testConvertText() {
        FileSource source = new FileSource();

        Assert.assertEquals("marko", convert("  marko ", DataType.TEXT, source));
        Assert.assertEquals("12", convert(12, DataType.TEXT, source));
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            convert(true, DataType.TEXT, source);
        }, e -> {
            Assert.assertContains("is not match with data type TEXT", e.getMessage());
        });
    }

    @Test
    public void testConvertDateWithFileSource() {
        FileSource source = new FileSource();
        source.dateFormat("yyyy-MM-dd");
        source.timeZone("GMT+0");

        Date date = (Date) convert("1970-01-02", DataType.DATE, source);
        Assert.assertEquals(86400000L, date.getTime());
        Assert.assertEquals(new Date(5L), convert(5L, DataType.DATE, source));

        Assert.assertThrows(IllegalArgumentException.class, () -> {
            convert("01/02/1970", DataType.DATE, source);
        });

        source.extraDateFormats(ImmutableList.of("MM/dd/yyyy"));
        date = (Date) convert("01/02/1970", DataType.DATE, source);
        Assert.assertEquals(86400000L, date.getTime());
        date = (Date) convert("1970-01-02", DataType.DATE, source);
        Assert.assertEquals(86400000L, date.getTime());
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            convert("1970.01.02", DataType.DATE, source);
        });
    }

    @Test
    public void testConvertTimestampDate() {
        FileSource source = new FileSource();
        source.dateFormat("timestamp");

        Assert.assertEquals(new Date(1000L), convert("1000", DataType.DATE, source));
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            convert("1970-01-01", DataType.DATE, source);
        }, e -> {
            Assert.assertContains("Invalid timestamp value '1970-01-01'", e.getMessage());
        });
    }

    @Test
    public void testConvertDateWithJDBCSource() {
        JDBCSource source = new JDBCSource();

        Assert.assertEquals(new Date(1000L),
                            convert(new java.sql.Date(1000L), DataType.DATE, source));
        Assert.assertEquals(new Date(2000L),
                            convert(new java.sql.Timestamp(2000L), DataType.DATE, source));
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            convert("1970-01-01", DataType.DATE, source);
        });
    }

    @Test
    public void testConvertListAndSet() {
        FileSource source = new FileSource();
        source.listFormat(new ListFormat("[", "]", ","));

        Object list = convert("[1,2,2]", DataType.INT, Cardinality.LIST, source);
        Assert.assertEquals(ImmutableList.of(1, 2, 2), ImmutableList.copyOf((Collection<?>) list));

        Object set = convert("[1,2,2]", DataType.INT, Cardinality.SET, source);
        Assert.assertEquals(ImmutableSet.of(1, 2), ImmutableSet.copyOf((Collection<?>) set));

        // Empty elements are ignored by default
        list = convert("[a,,b]", DataType.TEXT, Cardinality.LIST, source);
        Assert.assertEquals(ImmutableList.of("a", "b"), ImmutableList.copyOf((Collection<?>) list));

        Assert.assertEquals(0, ((Collection<?>) convert("", DataType.TEXT,
                                                        Cardinality.LIST, source)).size());
        // Collections with matched element type are kept as they are
        List<Integer> parsed = Arrays.asList(3, 4);
        Assert.assertSame(parsed, convert(parsed, DataType.INT, Cardinality.LIST, source));
    }

    @Test
    public void testConvertInvalidListAndSet() {
        FileSource source = new FileSource();
        source.listFormat(new ListFormat("[", "]", ","));

        Assert.assertThrows(IllegalArgumentException.class, () -> {
            convert("1,2", DataType.INT, Cardinality.LIST, source);
        }, e -> {
            Assert.assertContains("must start with '[' and end with ']'", e.getMessage());
        });
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            convert("[", DataType.INT, Cardinality.LIST, source);
        });
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            convert("[1,x]", DataType.INT, Cardinality.SET, source);
        });
        Assert.assertThrows(IllegalStateException.class, () -> {
            convert(10, DataType.INT, Cardinality.LIST, source);
        });

        source.listFormat(null);
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            convert("[1]", DataType.INT, Cardinality.LIST, source);
        }, e -> {
            Assert.assertContains("The list_format must be set", e.getMessage());
        });
    }

    @Test
    public void testConvertNullValue() {
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            convert(null, DataType.TEXT, new FileSource());
        }, e -> {
            Assert.assertContains("The value of Property(key)", e.getMessage());
        });
    }

    @Test
    public void testParseNumberAndUUIDHelpers() {
        Assert.assertEquals(12L, DataTypeUtil.parseNumber("id", " 12 "));
        Assert.assertEquals(12L, DataTypeUtil.parseNumber("id", 12));
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            DataTypeUtil.parseNumber("id", new Date());
        }, e -> {
            Assert.assertContains("must can be casted to Long", e.getMessage());
        });
        Assert.assertThrows(NumberFormatException.class, () -> {
            DataTypeUtil.parseNumber("id", "1x");
        });

        Assert.assertThrows(IllegalArgumentException.class, () -> {
            DataTypeUtil.parseUUID("id", 1);
        });
        Assert.assertTrue(DataTypeUtil.isSimpleValue(1));
        Assert.assertTrue(DataTypeUtil.isSimpleValue("a"));
        Assert.assertFalse(DataTypeUtil.isSimpleValue(null));
        Assert.assertFalse(DataTypeUtil.isSimpleValue(new Object()));
    }

    @Test
    public void testSplitField() {
        FileSource source = new FileSource();
        source.listFormat(new ListFormat("", "", "|"));

        Assert.assertEquals(ImmutableList.of("a", "b"),
                            DataTypeUtil.splitField("key", "a|b", source));
        List<Object> list = ImmutableList.of("x");
        Assert.assertSame(list, DataTypeUtil.splitField("key", list, source));
        Assert.assertThrows(IllegalArgumentException.class, () -> {
            DataTypeUtil.splitField("key", null, source);
        });
    }

    private static Object convert(Object value, DataType dataType,
                                  org.apache.hugegraph.loader.source.InputSource source) {
        return convert(value, dataType, Cardinality.SINGLE, source);
    }

    private static Object convert(Object value, DataType dataType, Cardinality cardinality,
                                  org.apache.hugegraph.loader.source.InputSource source) {
        PropertyKey key = new PropertyKey("key") {
            @Override
            public DataType dataType() {
                return dataType;
            }

            @Override
            public Cardinality cardinality() {
                return cardinality;
            }
        };
        return DataTypeUtil.convert(value, key, source);
    }
}
