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

package org.apache.hugegraph.controller.query;

import java.util.Map;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.controller.BaseController;
import org.apache.hugegraph.entity.query.Text2GqlRequest;
import org.apache.hugegraph.entity.query.Text2GqlSettingsRequest;
import org.apache.hugegraph.service.query.Text2GqlSettingsService;
import org.apache.hugegraph.service.query.Text2GqlService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(Constant.API_VERSION + "settings/text2gql")
public class Text2GqlSettingsController extends BaseController {

    @Autowired
    private Text2GqlSettingsService settings;

    @Autowired
    private Text2GqlService service;

    @GetMapping
    public Map<String, Object> get() {
        this.requireModelSettingsManager();
        return this.settings.settings();
    }

    @PostMapping("test")
    public Map<String, Long> test() {
        this.requireModelSettingsManager();
        Text2GqlRequest request = new Text2GqlRequest();
        request.setSource("shared");
        return Map.of("duration_ms", this.service.testConnection(this.settings.sharedRequest(request)));
    }

    @PutMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> update(@RequestBody Text2GqlSettingsRequest request) {
        this.requireModelSettingsManager();
        return this.settings.save(request);
    }
}
