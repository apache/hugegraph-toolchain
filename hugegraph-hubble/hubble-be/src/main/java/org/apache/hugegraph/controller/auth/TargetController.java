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

package org.apache.hugegraph.controller.auth;

import java.util.List;

import com.baomidou.mybatisplus.core.metadata.IPage;
import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.service.auth.TargetService;
import org.apache.hugegraph.structure.auth.Target;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(Constant.API_VERSION + "graphspaces/{graphspace}/auth/targets")
public class TargetController extends AuthController {

    @Autowired
    private TargetService targetService;

    @GetMapping("list")
    public List<Target> list(@PathVariable("graphspace") String graphSpace) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        return this.targetService.list(client, graphSpace);
    }

    @GetMapping
    public IPage<Target> queryPage(
            @PathVariable("graphspace") String graphSpace,
            @RequestParam(name = "query", required = false,
                          defaultValue = "") String query,
            @RequestParam(name = "page_no", required = false,
                          defaultValue = "1") int pageNo,
            @RequestParam(name = "page_size", required = false,
                          defaultValue = "10") int pageSize) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        return this.targetService.queryPage(client, graphSpace, query, pageNo,
                                            pageSize);
    }

    @GetMapping("{id}")
    public Target get(@PathVariable("graphspace") String graphSpace,
                      @PathVariable("id") String targetId) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        return this.targetService.get(client, graphSpace, targetId);
    }

    @PostMapping
    public Target add(@PathVariable("graphspace") String graphSpace,
                      @RequestBody Target target) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        return this.targetService.add(client, graphSpace, target);
    }

    @PutMapping("{id}")
    public Target update(@PathVariable("graphspace") String graphSpace,
                         @PathVariable("id") String targetId,
                         @RequestBody Target target) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        Target current = this.targetService.get(client, graphSpace, targetId);
        current.resources(target.resources());
        current.description(target.description());
        return this.targetService.update(client, graphSpace, current);
    }

    @DeleteMapping("{id}")
    public void delete(@PathVariable("graphspace") String graphSpace,
                       @PathVariable("id") String targetId) {
        HugeClient client = this.requireGraphSpaceManager(graphSpace);
        this.targetService.delete(client, graphSpace, targetId);
    }
}
