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
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hugegraph.unit;

import java.lang.reflect.Field;
import java.io.InputStream;
import java.util.Locale;
import java.util.Properties;

import jakarta.servlet.http.Cookie;

import org.junit.After;
import org.junit.Assert;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.context.support.StaticMessageSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.entity.UserInfo;
import org.apache.hugegraph.handler.MessageSourceHandler;
import org.apache.hugegraph.service.UserInfoService;

public class MessageSourceHandlerTest {

    @After
    public void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    public void testRequestLanguageOverridesStoredUserLocale()
           throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(
                                            "POST", "/api/v1.3/gremlin-query");
        request.addHeader("Accept-Language", "en-US");
        request.setCookies(new Cookie(Constant.COOKIE_USER, "admin"));
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(request));

        StaticMessageSource messageSource = new StaticMessageSource();
        messageSource.addMessage("gremlin.execute.failed", Locale.US,
                                 "Gremlin execute failed");
        messageSource.addMessage("gremlin.execute.failed",
                                 Locale.SIMPLIFIED_CHINESE,
                                 "Gremlin 执行失败");

        UserInfoService service = Mockito.mock(UserInfoService.class);
        Mockito.when(service.getByName("admin"))
               .thenReturn(UserInfo.builder()
                                   .username("admin")
                                   .locale("zh_CN")
                                   .build());

        MessageSourceHandler handler = new MessageSourceHandler();
        this.setField(handler, "messageSource", messageSource);
        this.setField(handler, "request", request);
        this.setField(handler, "service", service);

        Assert.assertEquals("Gremlin execute failed",
                            handler.getMessage("gremlin.execute.failed"));
    }

    @Test
    public void testEnglishMessagesDoNotFallbackToSystemLocale()
           throws Exception {
        Locale previousDefault = Locale.getDefault();
        Locale.setDefault(Locale.SIMPLIFIED_CHINESE);
        try {
            Properties properties = new Properties();
            InputStream stream = this.getClass().getClassLoader()
                                     .getResourceAsStream(
                                             "application.properties");
            Assert.assertNotNull(stream);
            properties.load(stream);

            Assert.assertEquals("false",
                                properties.getProperty(
                                        "spring.messages." +
                                        "fallback-to-system-locale"));

            ResourceBundleMessageSource messageSource =
                    new ResourceBundleMessageSource();
            messageSource.setBasename(properties.getProperty(
                    "spring.messages.basename"));
            messageSource.setDefaultEncoding(properties.getProperty(
                    "spring.messages.encoding"));
            messageSource.setFallbackToSystemLocale(Boolean.parseBoolean(
                    properties.getProperty("spring.messages." +
                                           "fallback-to-system-locale")));

            String message = messageSource.getMessage("gremlin.execute.failed",
                                                      new Object[]{"bad"},
                                                      Locale.US);

            Assert.assertEquals("Gremlin execute failed, the details: bad",
                                message);
        } finally {
            Locale.setDefault(previousDefault);
        }
    }

    private void setField(Object object, String name, Object value)
                          throws Exception {
        Field field = object.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(object, value);
    }
}
