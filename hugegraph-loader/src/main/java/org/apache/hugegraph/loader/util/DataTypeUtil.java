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

package org.apache.hugegraph.loader.util;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.apache.hugegraph.util.E;
import org.apache.hugegraph.util.InsertionOrderUtil;
import org.apache.hugegraph.util.ReflectionUtil;

import org.apache.hugegraph.loader.constant.Constants;
import org.apache.hugegraph.loader.source.AbstractSource;
import org.apache.hugegraph.loader.source.InputSource;
import org.apache.hugegraph.loader.source.file.FileSource;
import org.apache.hugegraph.loader.source.file.ListFormat;
import org.apache.hugegraph.loader.source.jdbc.JDBCSource;
import org.apache.hugegraph.loader.source.kafka.KafkaSource;
import org.apache.hugegraph.structure.constant.Cardinality;
import org.apache.hugegraph.structure.constant.DataType;
import org.apache.hugegraph.structure.schema.PropertyKey;
//import org.apache.hugegraph.util.StringEncoding;
import com.google.common.base.Splitter;
import com.google.common.collect.ImmutableSet;

public final class DataTypeUtil {

    private static final Set<String> ACCEPTABLE_TRUE = ImmutableSet.of(
            "true", "1", "yes", "y"
    );
    private static final Set<String> ACCEPTABLE_FALSE = ImmutableSet.of(
            "false", "0", "no", "n"
    );

    public static boolean isSimpleValue(Object value) {
        if (value == null) {
            return false;
        }
        return ReflectionUtil.isSimpleType(value.getClass());
    }

    public static Object convert(Object value, PropertyKey propertyKey,
                                 InputSource source) {
        E.checkArgumentNotNull(value, "The value of Property(%s) to be " +
                                      "converted can't be null", propertyKey.name());

        String key = propertyKey.name();
        DataType dataType = propertyKey.dataType();
        Cardinality cardinality = propertyKey.cardinality();
        switch (cardinality) {
            case SINGLE:
                return parseSingleValue(key, value, dataType, source);
            case SET:
            case LIST:
                return parseMultiValues(key, value, dataType,
                                        cardinality, source);
            default:
                throw new AssertionError(String.format(
                        "Unsupported cardinality: '%s'", cardinality));
        }
    }

    @SuppressWarnings("unchecked")
    public static List<Object> splitField(String key, Object rawColumnValue,
                                          InputSource source) {
        E.checkArgument(rawColumnValue != null,
                        "The value to be split can't be null");
        if (rawColumnValue instanceof List) {
            return (List<Object>) rawColumnValue;
        }
        if (rawColumnValue instanceof Collection) {
            return new ArrayList<>((Collection<?>) rawColumnValue);
        }
        // TODO: Seems a bit violent
        String rawValue = rawColumnValue.toString();
        return split(key, rawValue, source);
    }

    public static long parseNumber(String key, Object rawValue) {
        if (rawValue instanceof Number number) {
            return number.longValue();
        } else if (rawValue instanceof String str) {
            // trim() is a little time-consuming
            return parseLong(str.trim());
        }
        throw new IllegalArgumentException(String.format(
                "The value(key='%s') must can be casted to Long, " +
                "but got '%s'(%s)",
                key, rawValue, rawValue.getClass().getName()));
    }

    public static UUID parseUUID(String key, Object rawValue) {
        if (rawValue instanceof UUID uuid) {
            return uuid;
        } else if (rawValue instanceof String str) {
            String value = str.trim();
            if (value.contains("-")) {
                return UUID.fromString(value);
            }
            // UUID represented by hex string
            E.checkArgument(value.length() == 32,
                            "Invalid UUID value(key='%s') '%s'", key, value);
            String high = value.substring(0, 16);
            String low = value.substring(16);
            return new UUID(Long.parseUnsignedLong(high, 16),
                            Long.parseUnsignedLong(low, 16));
        }
        throw new IllegalArgumentException(String.format(
                "Failed to convert value(key='%s') '%s'(%s) to UUID",
                key, rawValue, rawValue.getClass()));
    }

    private static Object parseSingleValue(String key, Object rawValue,
                                           DataType dataType,
                                           InputSource source) {
        // Trim space if raw value is string
        Object value = rawValue;
        if (rawValue instanceof String str) {
            value = str.trim();
        }
        if (dataType.isNumber()) {
            return parseNumber(key, value, dataType);
        } else if (dataType.isBoolean()) {
            return parseBoolean(key, value);
        } else if (dataType.isDate()) {
            // HDFSSource extends FileSource
            if (source instanceof FileSource fileSource) {
                List<String> extraDateFormats = fileSource.extraDateFormats();
                String dateFormat = fileSource.dateFormat();
                String timeZone = fileSource.timeZone();
                if (extraDateFormats == null || extraDateFormats.isEmpty()) {
                    return parseDate(key, value, dateFormat, timeZone);
                } else {
                    HashSet<String> allDateFormats = new HashSet<>();
                    allDateFormats.add(dateFormat);
                    allDateFormats.addAll(extraDateFormats);
                    int size =  allDateFormats.size();
                    for (String df :  allDateFormats) {
                        try {
                            return parseDate(key, value, df, timeZone);
                        } catch (Exception e) {
                            if (--size <= 0) {
                                throw e;
                            }
                        }
                    }
                }
            }

            if (source instanceof KafkaSource) {
                List<String> extraDateFormats =
                        ((KafkaSource) source).getExtraDateFormats();
                String dateFormat = ((KafkaSource) source).getDateFormat();
                String timeZone = ((KafkaSource) source).getTimeZone();
                if (extraDateFormats == null || extraDateFormats.isEmpty()) {
                    return parseDate(key, value, dateFormat, timeZone);
                } else {
                    HashSet<String> allDateFormats = new HashSet<>();
                    allDateFormats.add(dateFormat);
                    allDateFormats.addAll(extraDateFormats);
                    int size = allDateFormats.size();
                    for (String df : allDateFormats) {
                        try {
                            return parseDate(key, value, df, timeZone);
                        } catch (Exception e) {
                            if (--size <= 0) {
                                throw e;
                            }
                        }
                    }
                }
            }

            if (source instanceof JDBCSource) {
                if (value instanceof java.sql.Date sqlDate) {
                    return new Date(sqlDate.getTime());
                } else if (value instanceof java.sql.Timestamp timestamp) {
                    return new Date(timestamp.getTime());
                }
            }
        } else if (dataType.isUUID()) {
            return parseUUID(key, value);
        } else if (dataType.isText()) {
            if (value instanceof Number) {
                return value.toString();
            }
        } else if (dataType == DataType.BLOB) {
            return parseBlob(key, value);
        }
        E.checkArgument(checkDataType(key, value, dataType),
                        "The value(key='%s') '%s'(%s) is not match with " +
                        "data type %s and can't convert to it",
                        key, value, value.getClass(), dataType);
        return value;
    }

    /**
     * collection format: "obj1,obj2,...,objn" or "[obj1,obj2,...,objn]" ..etc
     * TODO: After parsing to json, the order of the collection changed
     * in some cases (such as list<date>)
     **/
    private static Object parseMultiValues(String key, Object values,
                                           DataType dataType,
                                           Cardinality cardinality,
                                           InputSource source) {
        // JSON file should not parse again
        if (values instanceof Collection &&
            checkCollectionDataType(key, (Collection<?>) values, dataType)) {
            return values;
        }

        E.checkState(values instanceof String,
                     "The value(key='%s') must be String type, " +
                     "but got '%s'(%s)", key, values);
        String rawValue = (String) values;
        List<Object> valueColl = split(key, rawValue, source);
        Collection<Object> results = cardinality == Cardinality.LIST ?
                                     InsertionOrderUtil.newList() :
                                     InsertionOrderUtil.newSet();
        valueColl.forEach(value -> {
            results.add(parseSingleValue(key, value, dataType, source));
        });
        E.checkArgument(checkCollectionDataType(key, results, dataType),
                        "Not all collection elems %s match with data type %s",
                        results, dataType);
        return results;
    }

    private static Boolean parseBoolean(String key, Object rawValue) {
        if (rawValue instanceof Boolean bool) {
            return bool;
        }
        if (rawValue instanceof String str) {
            String value = str.toLowerCase();
            if (ACCEPTABLE_TRUE.contains(value)) {
                return true;
            } else if (ACCEPTABLE_FALSE.contains(value)) {
                return false;
            } else {
                throw new IllegalArgumentException(String.format(
                        "Failed to convert '%s'(key='%s') to Boolean, " +
                        "the acceptable boolean strings are %s or %s",
                        rawValue, key, ACCEPTABLE_TRUE, ACCEPTABLE_FALSE));
            }
        }
        throw new IllegalArgumentException(String.format(
                "Failed to convert value(key='%s') '%s'(%s) to Boolean",
                key, rawValue, rawValue.getClass()));
    }

    public static byte[] parseBlob(String key, Object rawValue) {
        //if (rawValue instanceof byte[]) {
        //    return (byte[]) rawValue;
        //} else if (rawValue instanceof String) {
        //    // Only base64 string or hex string accepted
        //    String str = ((String) rawValue);
        //    if (str.startsWith("0x")) {
        //        return Bytes.fromHex(str.substring(2));
        //    }
        //    return StringEncoding.decodeBase64(str);
        //} else if (rawValue instanceof List) {
        //    List<?> values = (List<?>) rawValue;
        //    byte[] bytes = new byte[values.size()];
        //    for (int i = 0; i < bytes.length; i++) {
        //        Object v = values.get(i);
        //        if (v instanceof Byte || v instanceof Integer) {
        //            bytes[i] = ((Number) v).byteValue();
        //        } else {
        //            throw new IllegalArgumentException(String.format(
        //                    "expect byte or int value, but got '%s'", v));
        //        }
        //    }
        //    return bytes;
        //}
        return null;
    }

    private static Number parseNumber(String key, Object value,
                                      DataType dataType) {
        E.checkState(dataType.isNumber(),
                     "The target data type must be number");

        if (dataType.clazz().isInstance(value)) {
            return (Number) value;
        }
        try {
            switch (dataType) {
                case BYTE:
                    return Byte.valueOf(value.toString());
                case INT:
                    return Integer.valueOf(value.toString());
                case LONG:
                    return parseLong(value.toString());
                case FLOAT:
                    return Float.valueOf(value.toString());
                case DOUBLE:
                    return Double.parseDouble(value.toString());
                default:
                    throw new AssertionError(String.format(
                            "Number type only contains Byte, Integer, " +
                            "Long, Float, Double, but got %s",
                            dataType.clazz()));
            }
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(String.format(
                    "Failed to convert value(key=%s) '%s'(%s) to Number",
                    key, value, value.getClass()), e);
        }
    }

    private static long parseLong(String rawValue) {
        if (rawValue.startsWith("-")) {
            return Long.parseLong(rawValue);
        } else {
            return Long.parseUnsignedLong(rawValue);
        }
    }

    private static Date parseDate(String key, Object value,
                                  String dateFormat, String timeZone) {
        if (value instanceof Date date) {
            return date;
        }
        if (value instanceof Number number) {
            return new Date(number.longValue());
        } else if (value instanceof String str) {
            if (Constants.TIMESTAMP.equals(dateFormat)) {
                try {
                    long timestamp = Long.parseLong(str);
                    return new Date(timestamp);
                } catch (NumberFormatException e) {
                    throw new IllegalArgumentException(String.format(
                            "Invalid timestamp value '%s'", value));
                }
            } else {
                return DateUtil.parse(str, dateFormat, timeZone);
            }
        }
        throw new IllegalArgumentException(String.format(
                "Failed to convert value(key='%s') '%s'(%s) to Date",
                key, value, value.getClass()));
    }

    private static List<Object> split(String key, String rawValue,
                                      InputSource source) {
        List<Object> valueColl = new ArrayList<>();
        if (rawValue.isEmpty()) {
            return valueColl;
        }
        E.checkState(AbstractSource.class.isAssignableFrom(source.getClass()),
                     "Only accept AbstractSource when parse multi values, " +
                     "but got '%s'", source.getClass().getName());
        ListFormat listFormat = ((AbstractSource) source).listFormat();
        E.checkArgumentNotNull(listFormat, "The list_format must be set when " +
                                           "parse list or set values");

        String startSymbol = listFormat.startSymbol();
        String endSymbol = listFormat.endSymbol();
        E.checkArgument(rawValue.length() >=
                        startSymbol.length() + endSymbol.length(),
                        "The value(key='%s') '%s' length(%s) must be >= " +
                        "start symbol '%s' + end symbol '%s' length",
                        key, rawValue, rawValue.length(),
                        startSymbol, endSymbol);
        E.checkArgument(rawValue.startsWith(startSymbol) &&
                        rawValue.endsWith(endSymbol),
                        "The value(key='%s') must start with '%s' and " +
                        "end with '%s', but got '%s'",
                        key, startSymbol, endSymbol, rawValue);
        rawValue = rawValue.substring(startSymbol.length(),
                                      rawValue.length() - endSymbol.length());
        String elemDelimiter = listFormat.elemDelimiter();
        Splitter.on(elemDelimiter).split(rawValue).forEach(value -> {
            if (!listFormat.ignoredElems().contains(value)) {
                valueColl.add(value);
            }
        });
        return valueColl;
    }

    /**
     * Check type of the value valid
     */
    private static boolean checkDataType(String key, Object value,
                                         DataType dataType) {
        if (value instanceof Number) {
            return parseNumber(key, value, dataType) != null;
        }
        return dataType.clazz().isInstance(value);
    }

    /**
     * Check type of all the values(may be some of list properties) valid
     */
    private static boolean checkCollectionDataType(String key,
                                                   Collection<?> values,
                                                   DataType dataType) {
        for (Object value : values) {
            if (!checkDataType(key, value, dataType)) {
                return false;
            }
        }
        return true;
    }
}
