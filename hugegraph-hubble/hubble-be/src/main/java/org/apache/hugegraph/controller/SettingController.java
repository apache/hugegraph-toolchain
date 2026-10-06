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

package org.apache.hugegraph.controller;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.entity.UserInfo;
import org.apache.hugegraph.service.UserInfoService;
import org.apache.hugegraph.util.E;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping(Constant.API_VERSION + "setting")
public class SettingController {

    @Autowired
    private UserInfoService service;

    @GetMapping("config")
    public UserInfo config(@RequestParam(value = "locale",
                                         defaultValue = "zh_CN")
                           String locale,
                           HttpServletRequest request,
                           HttpServletResponse response) {
        E.checkArgument(locale != null, "The param lang can't be null");
        E.checkArgument(Constant.LANGUAGES.contains(locale),
                        "The acceptable languages are %s, but got %s",
                        Constant.LANGUAGES, locale);

        String username = "anonymous";
        UserInfo userInfo = this.service.getByName(username);
        if (userInfo == null) {
            userInfo = UserInfo.builder()
                               .username(username)
                               .locale(locale)
                               .build();
            this.service.save(userInfo);
        } else {
            userInfo.setLocale(locale);
            this.service.update(userInfo);
        }

        Cookie cookie = new Cookie(Constant.COOKIE_USER, userInfo.getUsername());
        cookie.setPath(request.getContextPath());
        cookie.setMaxAge((int) TimeUnit.SECONDS.convert(3, TimeUnit.DAYS));
        response.addCookie(cookie);
        return userInfo;
    }
}
