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

package org.apache.hugegraph.controller.algorithm;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.controller.BaseController;
import org.apache.hugegraph.exception.ServerCapabilityUnavailableException;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping(Constant.API_VERSION + "graphspaces/{graphspace}/graphs" +
        "/{graph}/algorithms/vermeer")
public class VermeerAlgoController extends BaseController {

    @PostMapping
    public Map<String, Object> olapView(@PathVariable("graphspace") String graphspace,
                                        @PathVariable("graph") String graph,
                                        @RequestBody VParams body) {
        throw new ServerCapabilityUnavailableException(
                "server.capability.vermeer-compute-token-auth.unavailable",
                null);
    }

    private static class VParams {
        @JsonProperty("params")
        public Map<String, Object> params;
    }
}
