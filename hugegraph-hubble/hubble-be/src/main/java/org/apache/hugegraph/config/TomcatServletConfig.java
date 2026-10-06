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

package org.apache.hugegraph.config;

import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.options.HubbleOptions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.net.UnknownHostException;

@Component
public class TomcatServletConfig
       implements WebServerFactoryCustomizer<TomcatServletWebServerFactory> {

    @Autowired
    private HugeConfig config;

    @Override
    public void customize(TomcatServletWebServerFactory factory) {
        // Use customized server port
        String host = this.config.get(HubbleOptions.SERVER_HOST);
        try {
            factory.setAddress(InetAddress.getByName(host));
        } catch (UnknownHostException e) {
            throw new ExternalException("service.unknown-host", e, host);
        }
        factory.setPort(this.config.get(HubbleOptions.SERVER_PORT));
    }
}
