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
import java.util.Set;
import java.util.UUID;

import org.apache.hugegraph.spark.connector.constant.Constants;
import org.apache.hugegraph.spark.connector.exception.LoadException;
import org.apache.hugegraph.structure.constant.Cardinality;
import org.apache.hugegraph.structure.constant.DataType;
import org.apache.hugegraph.structure.schema.PropertyKey;
import org.apache.hugegraph.util.E;

import com.google.common.collect.ImmutableSet;

public final class DataTypeUtils {

    private static final Set<String> ACCEPTABLE_TRUE = ImmutableSet.of(
            "true", "1", "yes", "y"
    );

    private static final Set<String> ACCEPTABLE_FALSE = ImmutableSet.of(
            "false", "0", "no", "n"
    );

    public static Object convert(Object value, PropertyKey propertyKey) {
        E.checkArgumentNotNull(value, "The value to be converted can't be null");

        String key = propertyKey.name();
        DataType dataType = propertyKey.dataType();
        Cardinality cardinality = propertyKey.cardinality();
        switch (cardinality) {
            case SINGLE:
                return parseSingleValue(key, value, dataType);
            case SET:
            case LIST:
                throw new LoadException("Not support yet.");
            default:
                throw new AssertionError(String.format("Unsupported cardinality: '%s'",
                                                       cardinality));
        }
    }

    private static Object parseSingleValue(String key, Object rawValue, DataType dataType) {
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
            String dateFormat = Constants.DATE_FORMAT;
            String timeZone = Constants.TIME_ZONE;
            return parseDate(key, value, dateFormat, timeZone);
        } else if (dataType.isUUID()) {
            return parseUUID(key, value);
        } else if (dataType.isText()) {
            if (!(rawValue instanceof String)) {
                value = rawValue.toString();
            }
        }
        E.checkArgument(checkDataType(key, value, dataType),
                        "The value(key='%s') '%s'(%s) is not match with " +
                        "data type %s and can't convert to it",
                        key, value, value.getClass(), dataType);
        return value;
    }

    public static long parseNumber(String key, Object rawValue) {
        if (rawValue instanceof Number number) {
            return number.longValue();
        } else if (rawValue instanceof String str) {
            // trim() is a little time-consuming
            return parseLong(str.trim());
        }
        throw new IllegalArgumentException(String.format("The value(key='%s') must can be casted" +
                                                         " to Long, but got '%s'(%s)", key,
                                                         rawValue, rawValue.getClass().getName()));
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
        throw new IllegalArgumentException(String.format("Failed to convert value(key='%s') " +
                                                         "'%s'(%s) to UUID", key, rawValue,
                                                         rawValue.getClass()));
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
        throw new IllegalArgumentException(String.format("Failed to convert value(key='%s') " +
                                                         "'%s'(%s) to Boolean", key, rawValue,
                                                         rawValue.getClass()));
    }

    private static Number parseNumber(String key, Object value, DataType dataType) {
        E.checkState(dataType.isNumber(), "The target data type must be number");

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
                    return Double.valueOf(value.toString());
                default:
                    throw new AssertionError(String.format("Number type only contains Byte, " +
                                                           "Integer, Long, Float, Double, " +
                                                           "but got %s", dataType.clazz()));
            }
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(String.format("Failed to convert value(key=%s) " +
                                                             "'%s'(%s) to Number", key, value,
                                                             value.getClass()), e);
        }
    }

    private static long parseLong(String rawValue) {
        if (rawValue.startsWith("-")) {
            return Long.parseLong(rawValue);
        } else {
            return Long.parseUnsignedLong(rawValue);
        }
    }

    private static Date parseDate(String key, Object value, String dateFormat, String timeZone) {
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
                    throw new IllegalArgumentException(String.format("Invalid timestamp value " +
                                                                     "'%s'", value));
                }
            } else {
                return DateUtils.parse(str, dateFormat, timeZone);
            }
        }
        throw new IllegalArgumentException(String.format("Failed to convert value(key='%s') " +
                                                         "'%s'(%s) to Date", key, value,
                                                         value.getClass()));
    }

    /**
     * Check type of the value valid
     */
    private static boolean checkDataType(String key, Object value, DataType dataType) {
        if (value instanceof Number && dataType.isNumber()) {
            return parseNumber(key, value, dataType) != null;
        }
        return dataType.clazz().isInstance(value);
    }
}
