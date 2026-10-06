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

package org.apache.hugegraph.handler;

import lombok.extern.log4j.Log4j2;
import org.apache.commons.lang3.LocaleUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.entity.UserInfo;
import org.apache.hugegraph.service.UserInfoService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.MessageSource;
import org.springframework.context.NoSuchMessageException;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.servlet.support.RequestContextUtils;
import org.springframework.web.util.WebUtils;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Locale;

@Log4j2
@Component
public class MessageSourceHandler {

    private static final Locale DEFAULT_LOCALE = Locale.SIMPLIFIED_CHINESE;

    @Autowired
    private MessageSource messageSource;
    @Autowired
    private HttpServletRequest request;
    @Autowired
    private UserInfoService service;

    public String getMessage(String message, Object... args) {
        Locale locale = this.getLocale();
        try {
            return this.messageSource.getMessage(message, args, locale);
        } catch (NoSuchMessageException e) {
            log.error("There is no message for key '{}'", message);
            return message;
        }
    }

    private Locale getLocale() {
        try {
            RequestContextHolder.currentRequestAttributes();
        } catch (IllegalStateException e) {
            return DEFAULT_LOCALE;
        }

        if (StringUtils.isNotBlank(this.request.getHeader("Accept-Language"))) {
            return this.request.getLocale();
        }

        UserInfo userInfo = this.getUserInfo();
        if (userInfo != null && userInfo.getLocale() != null) {
            return LocaleUtils.toLocale(userInfo.getLocale());
        } else if (this.request.getLocale() != null) {
            return RequestContextUtils.getLocale(this.request);
        } else {
            return LocaleContextHolder.getLocale();
        }
    }

    private UserInfo getUserInfo() {
        Cookie cookie = WebUtils.getCookie(this.request, Constant.COOKIE_USER);
        if (cookie == null || cookie.getValue() == null) {
            return null;
        }
        String username = cookie.getValue();
        return this.service.getByName(username);
    }
}
