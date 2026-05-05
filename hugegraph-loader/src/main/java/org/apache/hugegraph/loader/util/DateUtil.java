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

import java.util.Date;
import java.util.HashMap;
import java.util.TimeZone;

import org.apache.hugegraph.date.SafeDateFormat;
import org.apache.hugegraph.loader.constant.Constants;

public final class DateUtil {

    private static final ThreadLocal<HashMap<String, SafeDateFormat>> DATE_FORMATS =
            ThreadLocal.withInitial(HashMap::new);

    public static Date parse(String source, String df) {
        return parse(source, df, Constants.TIME_ZONE);
    }

    public static Date parse(String source, String df, String timeZone) {
        SafeDateFormat dateFormat = getDateFormat(df);
        dateFormat.setTimeZone(timeZone);
        return dateFormat.parse(source);
    }

    private static SafeDateFormat getDateFormat(String df) {
        HashMap<String, SafeDateFormat> formats = DATE_FORMATS.get();
        SafeDateFormat dateFormat = formats.get(df);
        if (dateFormat == null) {
            dateFormat = new SafeDateFormat(df);
            formats.put(df, dateFormat);
        }
        return dateFormat;
    }

    public static Object toPattern(String df) {
        SafeDateFormat dateFormat = getDateFormat(df);
        return dateFormat.toPattern();
    }

    public static String now(String df) {
        SafeDateFormat dateFormat = getDateFormat(df);
        dateFormat.setTimeZone(Constants.TIME_ZONE);
        return dateFormat.format(new Date());
    }

    public static boolean checkTimeZone(String timeZone) {
        final String DEFAULT_GMT_TIMEZONE = "GMT";
        if (timeZone.equals(DEFAULT_GMT_TIMEZONE)) {
            return true;
        } else {
            /*
             * Time zone id returned is always "GMT" by default
             * if custom time zone is invalid
             */
            String id = TimeZone.getTimeZone(timeZone).getID();
            return !id.equals(DEFAULT_GMT_TIMEZONE);
        }
    }
}
